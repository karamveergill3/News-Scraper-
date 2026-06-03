import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://xglnoorboeuiozwhdhde.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnbG5vb3Jib2V1aW96d2hkaGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MTAwNjIsImV4cCI6MjA5NjA4NjA2Mn0.TdK2R3wjp9mfmbE593uXJ6MJ0VvWyuzrAEFOQSlAUCI'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  return data
}

export async function requireAuth() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { window.location.href = '/mit/login.html'; return null }
  return user
}

export async function requireApproved() {
  const user = await requireAuth()
  if (!user) return null
  const profile = await getProfile()
  if (!profile) { window.location.href = '/mit/login.html'; return null }
  if (profile.status === 'pending') { window.location.href = '/mit/pending.html'; return null }
  if (profile.status === 'rejected') { window.location.href = '/mit/login.html?rejected=1'; return null }
  return profile
}

export async function requireAdmin() {
  const profile = await requireApproved()
  if (!profile) return null
  if (!profile.is_admin) { window.location.href = '/mit/index.html'; return null }
  return profile
}
