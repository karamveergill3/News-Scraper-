module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const r = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MarketIntel/1.0)',
        'Accept': 'application/json'
      }
    })
    clearTimeout(timeout)

    if (!r.ok) return res.status(r.status).json({ error: 'Upstream error ' + r.status })
    const data = await r.json()
    return res.status(200).json(data)
  } catch (err) {
    console.error('[Calendar] fetch error:', err.message)
    return res.status(502).json({ error: err.message })
  }
}
