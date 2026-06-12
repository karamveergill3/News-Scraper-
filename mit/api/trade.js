module.exports = async function handler(req, res) {
  if(req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'})

  const TOKEN = process.env.AIRTABLE_TOKEN
  const BASE  = process.env.AIRTABLE_BASE_ID
  const TABLE = process.env.AIRTABLE_TABLE_ID

  if(!TOKEN || !BASE || !TABLE) return res.status(500).json({error: 'Missing Airtable config'})

  const { pair, dir, entry, closePrice, sl, tp, pnl, outcome, openedAt, closedAt, date } = req.body

  // Sanitize numeric fields — Airtable rejects NaN/Infinity for Number fields
  const safeNum = (v) => (typeof v === 'number' && isFinite(v)) ? v : null

  try {
    const fields = {
      'Pair': pair || '',
      'Direction': dir || '',
      'Entry': safeNum(entry),
      'Close price': safeNum(closePrice),
      'SL': safeNum(sl),
      'TP': safeNum(tp),
      'PnL': safeNum(pnl),
      'Outcome': outcome || '',
      'Opened At': openedAt || '',
      'Closed At': closedAt || '',
      'Date': date || ''
    }
    // Strip null fields entirely — Airtable prefers omission over null for Number fields
    Object.keys(fields).forEach(k => { if(fields[k] === null) delete fields[k] })

    const r = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    })
    const data = await r.json()
    if(!r.ok){
      console.error('[Trade] Airtable error:', JSON.stringify(data))
      // Return 200 anyway — this is a non-critical background sync, don't surface as a hard failure
      return res.status(200).json({ success: false, error: data.error?.message || 'Airtable error '+r.status })
    }
    return res.status(200).json({ success: true, id: data.id })
  } catch(err) {
    console.error('[Trade] error:', err.message)
    return res.status(200).json({ success: false, error: err.message })
  }
}
