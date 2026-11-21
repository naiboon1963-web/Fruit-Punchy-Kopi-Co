import React, { useEffect, useState } from 'react'
import { accountUrl, authConfigured, supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import './accounts.css'
import PasswordField from './PasswordField'
import { accountDestination, memberDestination } from './routes.js'

const pendingMessage = 'Your account is pending approval. Please contact the café team.'
const usernamePattern = '[A-Za-z0-9_]{3,30}'

export default function AccountPage() {
  const { user, loading, recovery, clearRecovery, authError } = useAuth()
  const initial = new URLSearchParams(window.location.search).get('account')
  const [view, setView] = useState(['join', 'reset', 'forgot'].includes(initial) ? initial : 'signin')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [profile, setProfile] = useState(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => { document.title = `${view === 'join' ? 'Join as a member' : 'Member login'} | Fruit Punchy Kopi and Art` }, [view])
  useEffect(() => {
    let active = true
    setProfile(null)
    if (!user || recovery) { setChecking(false); return }
    setChecking(true)
    supabase.from('profiles').select('username, full_name, status, role').eq('id', user.id).single()
      .then(async ({ data, error: profileError }) => {
        if (!active) return
        if (profileError || data?.status !== 'Active') {
          setError(data?.status === 'Pending' ? pendingMessage : 'Member access is unavailable. Your account may be pending approval. Please contact the café team.')
          await supabase.auth.signOut({ scope: 'local' })
        } else {
          setProfile({ ...data, userId: user.id })
          const next = accountDestination(window.location)
          if (next) window.location.replace(next)
        }
      }).catch(() => { if (active) setError('Unable to verify member access. Please try again.') })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [user?.id, recovery])

  function navigate(next) {
    setView(next); setError(''); setMessage('')
    const url = new URL(accountUrl(next))
    const destination = new URLSearchParams(window.location.search).get('next')
    if (destination) url.searchParams.set('next', memberDestination(destination))
    window.history.replaceState(null, '', url)
  }

  async function submit(event) {
    event.preventDefault()
    if (!supabase || busy) return
    const values = new FormData(event.currentTarget)
    setBusy(true); setError(''); setMessage('')
    try {
      if (view === 'reset' || recovery) {
        if (!user) throw new Error('Open your password-reset email link first.')
        if (values.get('password') !== values.get('confirm')) throw new Error('The passwords do not match.')
        const { error: resetError } = await supabase.auth.updateUser({ password: String(values.get('password')) })
        if (resetError) throw new Error('Unable to update your password. Request a fresh reset link and try again.')
        await supabase.auth.signOut({ scope: 'local' })
        clearRecovery(); navigate('signin'); setMessage('Password updated. You can now sign in if your membership is active.')
        return
      }
      const body = { action: view === 'join' ? 'register' : view === 'forgot' ? 'reset' : 'login', username: String(values.get('username') || '').trim().toLowerCase(), password: String(values.get('password') || '') }
      if (view === 'join') Object.assign(body, { email: String(values.get('email')).trim().toLowerCase(), full_name: String(values.get('full_name')).trim(), telephone: String(values.get('telephone')).trim() })
      if (view === 'forgot') body.email = String(values.get('email')).trim().toLowerCase()
      const { data, error: requestError } = await supabase.functions.invoke('member-auth', { body })
      if (requestError) {
        const detail = await requestError.context?.json?.().catch(() => null)
        if (requestError.context?.status === 404) throw new Error('Member services are not deployed yet. Please contact the café team.')
        throw new Error(detail?.error || 'Unable to connect to member services. Please try again.')
      }
      if (data?.error) throw new Error(data.error)
      if (view === 'join') {
        navigate('signin')
        setMessage('Registration received. Your status is Pending. Check your inbox to verify your email, then contact the café team for approval.')
      } else if (view === 'forgot') setMessage('If the email is eligible, a password-reset link will arrive shortly.')
      else {
        if (!data?.session?.access_token || !data?.session?.refresh_token) throw new Error('Unable to establish your member session.')
        const { error: sessionError } = await supabase.auth.setSession(data.session)
        if (sessionError) throw new Error('Unable to establish your member session. Please try again.')
      }
    } catch (failure) { setError(failure.message || 'Please try again.') }
    finally { setBusy(false) }
  }

  async function logout() {
    setBusy(true); setError('')
    try {
      const { error: logoutError } = await supabase.auth.signOut({ scope: 'local' })
      if (logoutError) throw logoutError
      setProfile(null); navigate('signin'); setMessage('You have logged out.')
    } catch { setError('Unable to log out. Please try again.') }
    finally { setBusy(false) }
  }

  const settingPassword = view === 'reset' || recovery
  return <main id="main" className="account-layout shell"><aside className="account-intro"><p className="eyebrow">YOUR NEIGHBOURHOOD CORNER</p><h1>A little kopi.<br /><em>A warm welcome.</em></h1><p>Join our café community and make yourself at home.</p><img src="/images/fruit-punchy-logo.webp" alt="Fruit Punchy fruit characters" width="818" height="392" /><a className="text-link" href="/">Back to the café</a></aside><section className="account-panel" aria-labelledby="account-heading">
    {!authConfigured && <p className="account-notice" role="status">Member services are not configured yet.</p>}
    {(error || authError) && <p className="account-notice account-error" role="alert">{error || authError}</p>}
    {message && <p className="account-notice" role="status">{message}</p>}
    {loading || checking ? <h2 id="account-heading">Checking your account…</h2> : profile && profile.userId === user?.id && !settingPassword ? <><p className="eyebrow">YOUR MEMBER CORNER</p><h2 id="account-heading">Welcome, {profile.full_name}.</h2><dl><dt>Login username</dt><dd>{profile.username}</dd><dt>Full name</dt><dd>{profile.full_name}</dd><dt>Role</dt><dd>{profile.role}</dd></dl><a className="text-link" href="/members">Member corner</a><button className="button" onClick={logout} disabled={busy}>Log out</button></> : <>
      <h2 id="account-heading">{settingPassword ? 'Choose a new password.' : view === 'join' ? 'Create your membership.' : view === 'forgot' ? 'Reset your password.' : 'Member login.'}</h2>
      {view === 'join' && <p>New memberships start as Pending. The café team must activate your membership before you can sign in.</p>}
      <form className="account-form" onSubmit={submit}>
        {!settingPassword && view !== 'forgot' && <label>Login username<input name="username" autoComplete="username" pattern={usernamePattern} minLength={3} maxLength={30} title="3–30 letters, numbers or underscores" required /><span className="account-field-hint">3–30 letters, numbers or underscores. Usernames are not case-sensitive.</span></label>}
        {(view === 'join' || view === 'forgot') && !settingPassword && <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>}
        {view === 'join' && !settingPassword && <><label>Full name<input name="full_name" autoComplete="name" maxLength={100} required /></label><label>Telephone number<input name="telephone" type="tel" autoComplete="tel" minLength={6} maxLength={30} required /></label></>}
        {(view !== 'forgot' || settingPassword) && <PasswordField key={`${view}-${settingPassword}`} label={settingPassword ? 'New password' : 'Password'} name="password" autoComplete={view === 'join' || settingPassword ? 'new-password' : 'current-password'} minLength={view === 'join' || settingPassword ? 12 : undefined} maxLength={128} required />}
        {settingPassword && <PasswordField label="Confirm password" name="confirm" autoComplete="new-password" minLength={12} maxLength={128} required />}
        <button className="button" disabled={busy || !authConfigured || (settingPassword && !user)}>{busy ? 'Please wait…' : settingPassword ? 'Save password' : view === 'join' ? 'Create member account' : view === 'forgot' ? 'Send reset email' : 'Sign in'}</button>
      </form><div className="account-links"><button onClick={() => navigate(view === 'join' ? 'signin' : 'join')}>{view === 'join' ? 'Already a member? Sign in' : 'Create a member account'}</button><button onClick={() => navigate('signin')}>Member login</button><button onClick={() => navigate('forgot')}>Forgot password?</button></div>
    </>}
  </section></main>
}




