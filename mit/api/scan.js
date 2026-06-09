const { createClient } = require('@supabase/supabase-js')

const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const CRON_SECRET = process.env.CRON_SECRET

module.exports = async function handler(req, res) {
  // Security — only allow Vercel cron or requests with the secret
  const auth = req.headers['authorization']
  if(auth !== `Bearer ${CRON_SECRET}`){
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if(!ANTHROPIC_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' })
  if(!SB_URL || !SB_KEY) return res.status(500).json({ error: 'Missing Supabase env vars' })

  const sb = createClient(SB_URL, SB_KEY)

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
  const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })

  const prompt = `You are a senior multi-asset macro analyst. Today is ${dateStr} at ${timeStr} UK time. Use maximum 3 web searches total — make them count. Search for breaking financial news. Cover: Trump posts on tariffs/trade/Fed, Forex Factory red events, geopolitical risks, central bank news, major equity/commodity/crypto moves. Return ONLY valid compact JSON, no markdown, no HTML tags, no citation tags, max 8 events, max 3 pairs per event: {"scan_time":"${timeStr}","scan_date":"${dateStr}","events":[{"id":"e1","type":"trump|geopolitical|central-bank|economic|equities|commodities|crypto","urgent":false,"impact":"HIGH|MEDIUM|LOW","source":"string","headline":"max 12 words","context":"one sentence only","time":"HH:MM","pairs":[{"pair":"EUR/USD","direction":"bullish|bearish|neutral","strength":75,"analysis":"brief with one price level"}],"overall":"bullish|bearish|neutral|mixed","signal":"entry zone, target, stop"}],"urgent_alerts":["string"],"sentiment":{"USD":0,"EUR":0,"GBP":0,"JPY":0,"CHF":0,"AUD":0,"CAD":0,"Gold":0,"Oil":0,"BTC":0},"setups":[{"pair":"EUR/USD","direction":"long|short","entry":"1.0820","sl":"1.0815","tp":"1.0835","rr":"2.0","reason":"one sentence"}]. Setups must be SCALP trades only: tight stops 8-20 pips (or $8-20 for gold), targets 1.5:1 to 2.5:1 RR max, entry at or very near current price, no wide swing setups,"market_summary":"2 sentence brief"}`

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if(!anthropicRes.ok) {
      const err = await anthropicRes.json().catch(() => ({}))
      throw new Error(err.error?.message || 'Anthropic API error ' + anthropicRes.status)
    }

    const data = await anthropicRes.json()
    let raw = data.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
    raw = raw.replace(/```json|```/g, '').trim()

    const s = raw.indexOf('{'), e = raw.lastIndexOf('}')
    if(s === -1) throw new Error('No JSON in response')

    const result = JSON.parse(raw.slice(s, e + 1))
    result.event_count = (result.events || []).length
    result.scan_date = dateStr
    result.scan_time = timeStr
    result.source = 'cron'

    const { error: dbError } = await sb.from('scans').insert([result])
    if(dbError) throw new Error('Supabase insert failed: ' + dbError.message)

    return res.status(200).json({
      success: true,
      scan_time: timeStr,
      scan_date: dateStr,
      event_count: result.event_count
    })

  } catch(err) {
    console.error('[AutoScan Error]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
