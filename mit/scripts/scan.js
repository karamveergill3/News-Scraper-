import { createClient } from '@supabase/supabase-js'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing environment variables. Check ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const now = new Date()
const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

console.log(`[${timeStr}] Starting scheduled market scan...`)

const prompt = `You are a senior multi-asset macro analyst and FX strategist. Today is ${dateStr} at ${timeStr} UK time.

Search the web NOW for genuinely current breaking news. Search multiple times across different sources. Cover: Trump Truth Social posts about markets/tariffs/trade/China/Fed, Forex Factory red events today and next 48h, active geopolitical conflicts and escalations, central bank decisions and speeches, major equity moves, commodity shifts, crypto news.

For every event provide detailed FX impact analysis with specific price levels.

Return ONLY valid JSON (no markdown):
{
  "scan_time": "${timeStr}",
  "scan_date": "${dateStr}",
  "triggered_by": "scheduled",
  "events": [{
    "id": "unique_string",
    "type": "trump|geopolitical|central-bank|economic|equities|commodities|crypto",
    "urgent": boolean,
    "impact": "HIGH|MEDIUM|LOW",
    "source": "string",
    "headline": "max 15 words",
    "context": "2-3 sentences with specific numbers",
    "time": "HH:MM or relative",
    "pairs": [{"pair": "EUR/USD", "direction": "bullish|bearish|neutral", "strength": 0-100, "analysis": "one sentence with price levels"}],
    "overall": "bullish|bearish|neutral|mixed",
    "signal": "actionable trader signal with entry/target/stop levels"
  }],
  "urgent_alerts": ["string"],
  "sentiment": {"USD": 0, "EUR": 0, "GBP": 0, "JPY": 0, "CHF": 0, "AUD": 0, "CAD": 0, "Gold": 0, "Oil": 0, "BTC": 0},
  "setups": ["Setup with pair, direction, entry, target, stop, R:R"],
  "market_summary": "4-5 paragraph comprehensive market brief"
}`

try {
  console.log('Calling Anthropic API with web search...')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `API error ${response.status}`)
  }

  const data = await response.json()
  let raw = data.content.filter(b => b.type === 'text').map(b => b.text).join('').trim().replace(/```json|```/g, '').trim()
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}')
  if (s === -1 || e === -1) throw new Error('No JSON in response')

  const result = JSON.parse(raw.slice(s, e + 1))
  result.event_count = (result.events || []).length

  console.log(`Parsed ${result.event_count} events`)

  const { error: insertError } = await supabase.from('scans').insert([result])
  if (insertError) throw new Error('Supabase insert failed: ' + insertError.message)

  console.log(`✓ Scan saved to Supabase — ${result.event_count} events, ${(result.urgent_alerts || []).length} urgent`)

} catch (err) {
  console.error('✗ Scan failed:', err.message)
  process.exit(1)
}
