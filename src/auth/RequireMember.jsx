import React, { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'
import { memberSignInUrl } from './routes.js'

export default function RequireMember({ children }) {
  const { user, loading, recovery, authError } = useAuth()
  const [access, setAccess] = useState(null)
  useEffect(() => {
    let active = true
    setAccess(null)
    if (!user || recovery) return
    supabase.from('profiles').select('id, status').eq('id', user.id).single()
      .then(({ data, error }) => {
        if (active) setAccess({ user, allowed: !error && data?.status === 'Active' && Boolean(user.email_confirmed_at) })
      }).catch(() => { if (active) setAccess({ user, allowed: false }) })
    return () => { active = false }
  }, [user, recovery])
  const checking = loading || (user && !recovery && access?.user !== user)
  useEffect(() => {
    if (!checking && (!user || recovery)) window.location.replace(recovery ? '/?account=reset' : memberSignInUrl(window.location))
  }, [checking, user, recovery])
  if (checking) return <main id="main" className="shell section-space"><p role="status">Checking your membership…</p></main>
  if (!user || recovery) return <main id="main" className="shell section-space"><p role="status">{authError || 'Taking you to member login…'}</p><a href={memberSignInUrl(window.location)}>Member login</a></main>
  if (!access?.allowed) return <main id="main" className="shell section-space"><h1>Member access unavailable</h1><p role="alert">Your membership must be active and your email verified. Please contact the café team.</p><a href="/?account=signin">My account</a></main>
  return children
}


