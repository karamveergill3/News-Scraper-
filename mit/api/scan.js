const { createClient } = require('@supabase/supabase-js')

const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const CRON_SECRET = process.env.CRON_SECRET

module.exports = async function handler(req, res) {
  const auth = req.headers['authorization']
  if(auth !== `Bearer ${CRON_SECRET}`){
    return res.status(401).json({ error: 'Unauthorized', received: auth ? 'header present' : 'no header' })
  }

  if(!ANTHROPIC_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' })
  if(!SB_URL || !SB_KEY) return res.status(500).json({ error: 'Missing Supabase env vars' })

  const sb = createClient(SB_URL, SB_KEY)

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
  const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })

  const prompt = `You are a senior multi-asset macro analyst. Today is ${dateStr} at ${timeStr} UK time. Use maximum 3 web searches. Search for breaking financial news: Trump posts on tariffs/trade/Fed, Forex Factory red events, geopolitical risks, central bank news, major equity/commodity/crypto moves. You MUST respond with ONLY a single valid JSON object. No markdown, no backticks, no explanation before or after. Start your response with { and end with }. Format: {"scan_time":"${timeStr}","scan_date":"${dateStr}","events":[{"id":"e1","type":"trump|geopolitical|central-bank|economic|equities|commodities|crypto","urgent":false,"impact":"HIGH|MEDIUM|LOW","source":"string","headline":"max 12 words","context":"one sentence","time":"HH:MM","pairs":[{"pair":"EUR/USD","direction":"bullish|bearish|neutral","strength":75,"analysis":"brief with one price level"}],"overall":"bullish|bearish|neutral|mixed","signal":"entry zone, target, stop"}],"urgent_alerts":[],"sentiment":{"USD":0,"EUR":0,"GBP":0,"JPY":0,"CHF":0,"AUD":0,"CAD":0,"Gold":0,"Oil":0,"BTC":0},"setups":[{"pair":"EUR/USD","direction":"long|short","entry":"1.0820","sl":"1.0815","tp":"1.0835","rr":"2.0","reason":"one sentence"}],"market_summary":"2 sentence brief"}`

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

    // Log the HTTP status
    console.log('[Scan] Anthropic status:', anthropicRes.status)

    if(!anthropicRes.ok) {
      const errBody = await anthropicRes.text()
      console.log('[Scan] Anthropic error body:', errBody)
      throw new Error('Anthropic API error ' + anthropicRes.status + ': ' + errBody.slice(0, 200))
    }

    const data = await anthropicRes.json()
    console.log('[Scan] stop_reason:', data.stop_reason)
    console.log('[Scan] content blocks:', data.content?.map(b => b.type).join(', '))

    // Extract all text blocks
    const textBlocks = (data.content || []).filter(b => b.type === 'text')
    console.log('[Scan] text block count:', textBlocks.length)

    if(textBlocks.length === 0) {
      console.log('[Scan] Full content:', JSON.stringify(data.content?.slice(0,2)))
      throw new Error('No text blocks in response. stop_reason: ' + data.stop_reason)
    }

    let raw = textBlocks.map(b => b.text).join('').trim()
    raw = raw.replace(/```json|```/g, '').trim()
    console.log('[Scan] raw text preview:', raw.slice(0, 100))

    const s = raw.indexOf('{'), e = raw.lastIndexOf('}')
    if(s === -1) {
      console.log('[Scan] Full raw text:', raw.slice(0, 500))
      throw new Error('No JSON object found in response')
    }

    const result = JSON.parse(raw.slice(s, e + 1))
    result.event_count = (result.events || []).length
    result.scan_date = dateStr
    result.scan_time = timeStr
    result.source = 'cron'

    const { error: dbError } = await sb.from('scans').insert([result])
    if(dbError) throw new Error('Supabase insert failed: ' + dbError.message)

    console.log('[Scan] Success:', result.event_count, 'events')
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
