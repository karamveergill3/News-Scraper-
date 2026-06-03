import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  return data
}

export async function requireAuth() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { window.location.href = '/login.html'; return null }
  return user
}

export async function requireApproved() {
  const user = await requireAuth()
  if (!user) return null
  const profile = await getProfile()
  if (!profile) { window.location.href = '/login.html'; return null }
  if (profile.status === 'pending') { window.location.href = '/pending.html'; return null }
  if (profile.status === 'rejected') { window.location.href = '/login.html?rejected=1'; return null }
  return profile
}

export async function requireAdmin() {
  const profile = await requireApproved()
  if (!profile) return null
  if (!profile.is_admin) { window.location.href = '/index.html'; return null }
  return profile
}
