import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, authConfigured } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(authConfigured)
  const [authError, setAuthError] = useState('')
  const [recovery, setRecovery] = useState(false)

  const refreshUser = useCallback(async () => {
    if (!supabase) return
    const { data, error } = await supabase.auth.getUser()
    setUser(error ? null : data.user)
    if (error && error.name !== 'AuthSessionMissingError') setAuthError('Your session could not be verified. Please sign in again.')
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true
    // Never await Supabase operations inside its auth-event callback.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      setUser(session?.user ?? null)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
      setLoading(false)
    })
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return
      if (error) setAuthError('The email link could not be opened. Request a fresh link below.')
      if (data.session) await refreshUser()
      else setLoading(false)
    }).catch(() => { if (active) { setAuthError('Unable to connect. Please try again.'); setLoading(false) } })
    return () => { active = false; subscription.unsubscribe() }
  }, [refreshUser])

  return <AuthContext.Provider value={{ user, loading, authError, recovery, clearRecovery: () => setRecovery(false), refreshUser }}>{children}</AuthContext.Provider>
}

export function useAuth() { return useContext(AuthContext) }
