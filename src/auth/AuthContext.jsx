import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase, authConfigured } from '../lib/supabase'
import { watchVerifiedSession } from './session.js'
const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, loading: authConfigured, authError: '' })
  const [recovery, setRecovery] = useState(false)
  const watcher = useRef(null)
  const refreshUser = useCallback(() => watcher.current?.refresh(), [])
  useEffect(() => {
    if (!supabase) return
    const subscription = watchVerifiedSession(supabase, setState, setRecovery)
    watcher.current = subscription
    return () => { watcher.current = null; subscription.dispose() }
  }, [])
  return <AuthContext.Provider value={{ ...state, recovery, clearRecovery: () => setRecovery(false), refreshUser }}>{children}</AuthContext.Provider>
}
export function useAuth() { return useContext(AuthContext) }

