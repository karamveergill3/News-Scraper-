module.exports = async function handler(req, res) {
  if(req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'})

  const TOKEN = process.env.AIRTABLE_TOKEN
  const BASE  = process.env.AIRTABLE_BASE_ID
  const TABLE = process.env.AIRTABLE_TABLE_ID

  if(!TOKEN || !BASE || !TABLE) return res.status(500).json({error: 'Missing Airtable config'})

  const { pair, dir, entry, closePrice, sl, tp, pnl, outcome, openedAt, closedAt, date } = req.body

  try {
    const r = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {
        'Pair': pair,
        'Direction': dir,
        'Entry': entry,
        'Close price': closePrice,
        'SL': sl,
        'TP': tp,
        'PnL': pnl,
        'Outcome': outcome,
        'Opened At': openedAt,
        'Closed At': closedAt,
        'Date': date
      }})
    })
    if(!r.ok){ const e=await r.json(); throw new Error(e.error?.message||'Airtable error '+r.status) }
    const data = await r.json()
    return res.status(200).json({ success: true, id: data.id })
  } catch(err) {
    console.error('[Trade] Airtable error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
