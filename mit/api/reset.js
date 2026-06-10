const { createClient } = require('@supabase/supabase-js')

const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_KEY
const CRON_SECRET = process.env.CRON_SECRET

module.exports = async function handler(req, res) {
  const auth = req.headers['authorization']
  if(auth !== `Bearer ${CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' })
  if(!SB_URL || !SB_KEY) return res.status(500).json({ error: 'Missing Supabase env vars' })

  const sb = createClient(SB_URL, SB_KEY)

  try {
    // Get all users with trades this week
    const { data: trades, error: fetchErr } = await sb
      .from('trade_history')
      .select('*')
    if(fetchErr) throw fetchErr

    if(!trades || !trades.length) {
      return res.status(200).json({ success: true, message: 'No trades to archive' })
    }

    // Group trades by user
    const byUser = {}
    trades.forEach(t => {
      if(!byUser[t.user_id]) byUser[t.user_id] = []
      byUser[t.user_id].push(t)
    })

    const now = new Date()
    const weekEnd = now.toISOString()
    // Week started last Saturday 4pm UTC
    const weekStart = new Date(now)
    weekStart.setUTCDate(weekStart.getUTCDate() - 7)
    weekStart.setUTCHours(16,0,0,0)

    const weekLabel = weekStart.toLocaleDateString('en-GB', {day:'numeric',month:'short'}) +
      ' – ' + now.toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'})

    // Archive each user's trades
    const archives = Object.entries(byUser).map(([userId, userTrades]) => {
      const wins = userTrades.filter(t => t.outcome === 'win').length
      const losses = userTrades.filter(t => t.outcome === 'loss').length
      const total = wins + losses
      const totalPnl = userTrades.reduce((s,t) => s + (t.pnl||0), 0)
      return {
        user_id: userId,
        week_label: weekLabel,
        week_start: weekStart.toISOString(),
        week_end: weekEnd,
        trades: userTrades.map(t => ({
          pair: t.pair, dir: t.dir, entry: t.entry,
          close_price: t.close_price, pnl: t.pnl,
          outcome: t.outcome, closed_at: t.closed_at
        })),
        total_pnl: totalPnl,
        wins, losses,
        win_rate: total > 0 ? (wins/total)*100 : 0,
        trade_count: total
      }
    })

    // Insert archives
    const { error: archErr } = await sb.from('trade_archives').insert(archives)
    if(archErr) throw archErr

    // Delete all trade_history
    const { error: delErr } = await sb.from('trade_history').delete().neq('id','__never__')
    if(delErr) throw delErr

    console.log('[Reset] Archived', trades.length, 'trades for', Object.keys(byUser).length, 'users')
    return res.status(200).json({
      success: true,
      archived_trades: trades.length,
      users: Object.keys(byUser).length,
      week: weekLabel
    })

  } catch(err) {
    console.error('[Reset Error]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
