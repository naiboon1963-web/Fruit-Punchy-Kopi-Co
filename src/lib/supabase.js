import { createClient } from '@supabase/supabase-js'

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const authConfigured = Boolean(projectUrl && publicKey && /^https:\/\//.test(projectUrl))

// Only the public publishable key belongs in Vite. Never use a service-role key here.
export const supabase = authConfigured
  ? createClient(projectUrl, publicKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export function accountUrl(view = 'callback') {
  const url = new URL('/', window.location.origin)
  url.searchParams.set('account', view)
  return url.toString()
}
