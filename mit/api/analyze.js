module.exports = async function handler(req, res) {
  if(req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'})

  const { apiKey, body } = req.body
  if(!body) return res.status(400).json({error: 'Missing request body'})

  // Prefer the server-side key (set in Vercel project settings) so the
  // browser never needs to hold or send an Anthropic API key. Falls back
  // to a client-supplied key only if the server key isn't configured.
  const key = process.env.ANTHROPIC_API_KEY || apiKey
  if(!key) return res.status(400).json({error: 'No API key configured — set ANTHROPIC_API_KEY in Vercel project settings'})

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    })
    const data = await r.json()
    if(!r.ok) return res.status(r.status).json(data)
    return res.status(200).json(data)
  } catch(err) {
    console.error('[Analyze] error:', err.message)
    return res.status(500).json({ error: { message: err.message } })
  }
}
