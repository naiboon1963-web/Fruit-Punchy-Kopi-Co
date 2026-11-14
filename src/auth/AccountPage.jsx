import { useEffect, useState } from 'react'
import { accountUrl, authConfigured, supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import './accounts.css'

const validViews = ['signin', 'join', 'staff', 'forgot', 'resend', 'callback', 'set-password', 'reset', 'dashboard']

function authMessage(error) {
  if (error?.code === 'email_not_confirmed') return 'Please verify your email before signing in. You can request a new verification email below.'
  if (error?.code === 'invalid_credentials') return 'The email or password is incorrect. Please try again.'
  if (error?.status === 429 || error?.code?.includes('rate_limit')) return 'Too many requests. Please wait a few minutes before trying again.'
  if (error?.code === 'over_email_send_rate_limit') return 'Please wait before requesting another email.'
  if (error?.code === 'weak_password') return 'Choose a stronger password with at least 12 characters.'
  if (error?.message?.toLowerCase().includes('fetch')) return 'Unable to connect. Check your connection and try again.'
  return 'We could not complete that request. Please try again, or ask the café team for help.'
}

function Notice({ children, error = false }) {
  return children ? <p className={`account-notice ${error ? 'account-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p> : null
}

export default function AccountPage() {
  const initial = new URLSearchParams(window.location.search).get('account')
  const [view, setView] = useState(validViews.includes(initial) ? initial : 'signin')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const { user, loading, authError, recovery, clearRecovery, refreshUser } = useAuth()

  function navigate(next) {
    setError(''); setMessage(''); setView(next)
    window.history.replaceState(null, '', accountUrl(next))
  }

  useEffect(() => { document.title = 'Your account | Fruit Punchy Kopi and Art' }, [])
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    if (params.has('error') || new URLSearchParams(window.location.search).has('error')) {
      setError('This email link has expired or is invalid. Please request a new verification or password-reset email.')
      window.history.replaceState(null, '', accountUrl('resend'))
      setView('resend')
    }
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (!supabase || busy) return
    const values = new FormData(event.currentTarget)
    const email = String(values.get('email') || '').trim().toLowerCase()
    const password = String(values.get('password') || '')
    setBusy(true); setError(''); setMessage('')
    try {
      if (view === 'join') {
        const { error: signupError } = await supabase.auth.signUp({
          email, password,
          options: { data: { display_name: String(values.get('name') || '').trim() }, emailRedirectTo: accountUrl('callback') },
        })
        if (signupError) throw signupError
        // New registrations continue through the confirmation-email journey.
        // Confirm email must also remain enabled in the Supabase project.
        await supabase.auth.signOut({ scope: 'local' })
        setConfirmationEmail(email)
        setMessage('Check your inbox to verify your email. If this address is eligible, you’ll receive a confirmation link. Already registered? Sign in or reset your password.')
      } else if (view === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: accountUrl('reset') })
        if (resetError) throw resetError
        setMessage('If an account exists for this address, you’ll receive a password-reset email shortly.')
      } else if (view === 'resend') {
        const { error: resendError } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: accountUrl('callback') } })
        if (resendError) throw resendError
        setMessage('If this account is awaiting verification, a new email is on its way. For an expired staff invitation, ask the café owner for a new one.')
      } else if (view === 'set-password' || view === 'reset' || recovery) {
        if (password !== String(values.get('confirm') || '')) { setError('The passwords do not match.'); return }
        const { error: passwordError } = await supabase.auth.updateUser({ password })
        if (passwordError) throw passwordError
        clearRecovery()
        await refreshUser()
        navigate('dashboard')
      } else {
        const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password })
        if (loginError) throw loginError
        if (!data.user.email_confirmed_at) {
          await supabase.auth.signOut({ scope: 'local' })
          setError('Verify your email before accessing your account. Request another verification email below.')
          return
        }
        await refreshUser()
        navigate('dashboard')
      }
    } catch (requestError) { setError(authMessage(requestError)) }
    finally { setBusy(false) }
  }

  const settingPassword = recovery || view === 'set-password' || view === 'reset'
  const verified = Boolean(user?.email_confirmed_at)

  return <main id="main" className="account-page shell">
    <aside className="account-welcome"><p className="eyebrow">A LITTLE MORE FRUIT PUNCHY</p><h1>Your corner.<br /><em>Your community.</em></h1><p>A warm welcome for our members and the people who make it all happen.</p><img src="/images/fruit-punchy-logo.webp" alt="Fruit Punchy fruit-character artwork" width="818" height="392" /><a className="text-link" href="/">← Back to the café</a></aside>
    <section className="account-panel" aria-labelledby="account-heading">
      {!authConfigured ? <><p className="eyebrow">MEMBERS & STAFF</p><h2 id="account-heading">A new corner,<br /><em>coming soon.</em></h2><p>We’re getting member and staff accounts ready. Registration will open once email verification is connected.</p><a className="button" href="/">Explore the café</a></>
      : loading ? <><h2 id="account-heading">One moment…</h2><p role="status">Checking your account securely.</p></>
      : user && verified && !settingPassword ? <Dashboard user={user} />
      : <>
        <p className="eyebrow">{view === 'staff' ? 'FOR OUR CAFÉ TEAM' : 'WELCOME TO THE NEIGHBOURHOOD'}</p>
        <h2 id="account-heading">{settingPassword ? 'Choose a password.' : view === 'join' ? 'Make yourself at home.' : view === 'forgot' ? 'Forgot your password?' : view === 'resend' ? 'Check your inbox.' : 'Good to see you.'}</h2>
        <p>{settingPassword ? 'Your verified account deserves a strong password. Use at least 12 characters.' : view === 'join' ? 'Create your member account, then verify your email to get started.' : view === 'staff' ? 'Sign in with your staff account. New team members join through an invitation from the café owner.' : view === 'forgot' ? 'We’ll email you a link to choose a new password.' : view === 'resend' ? 'Request a fresh member verification email. Staff invitations are reissued by the café owner.' : 'Sign in to your member or staff account.'}</p>
        <Notice error>{error || authError}</Notice><Notice>{message}</Notice>
        {settingPassword && !verified ? <><Notice error>Open the link in your verification, invitation, or password-reset email to continue.</Notice><button type="button" className="account-text-button" onClick={() => navigate('forgot')}>Request a password-reset email</button></> : <form onSubmit={submit} className="account-form">
          {view === 'join' && <label>Your name<input name="name" autoComplete="name" maxLength={100} required /></label>}
          {!settingPassword && <label>Email address<input key={`email-${view}`} name="email" type="email" autoComplete="email" defaultValue={confirmationEmail} maxLength={254} required /></label>}
          {(settingPassword || !['forgot', 'resend'].includes(view)) && <label>{settingPassword ? 'New password' : 'Password'}<input key={`password-${view}`} name="password" type="password" autoComplete={view === 'join' || settingPassword ? 'new-password' : 'current-password'} minLength={view === 'join' || settingPassword ? 12 : undefined} maxLength={128} required /></label>}
          {view === 'join' && <p className="account-field-hint">At least 12 characters. Verify your email before signing in.</p>}
          {settingPassword && <label>Confirm new password<input name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>}
          <button className="button" type="submit" disabled={busy}>{busy ? 'Please wait…' : settingPassword ? 'Save password' : view === 'join' ? 'Create member account' : view === 'forgot' ? 'Send reset email' : view === 'resend' ? 'Resend verification email' : 'Sign in'}</button>
        </form>}
        <div className="account-links">
          <button type="button" onClick={() => navigate(view === 'join' ? 'signin' : 'join')}>{view === 'join' ? 'Already a member? Sign in' : 'New here? Join as a member'}</button>
          <button type="button" onClick={() => navigate('forgot')}>Forgot password?</button>
          <button type="button" onClick={() => navigate('resend')}>Resend verification email</button>
          <button type="button" onClick={() => navigate('staff')}>Staff sign-in</button>
        </div>
      </>}
    </section>
  </main>
}

function Dashboard({ user }) {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    supabase.from('profiles').select('id, display_name, role, email, created_at').eq('id', user.id).single()
      .then(({ data, error: profileError }) => {
        if (!active) return
        setProfile(data)
        if (profileError) setError('Your account is verified, but your profile could not be loaded. Please retry or contact the café owner.')
        setLoading(false)
      }).catch(() => { if (active) { setError('Unable to load your profile. Please try again.'); setLoading(false) } })
    return () => { active = false }
  }, [user.id])

  async function saveProfile(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    const name = String(new FormData(event.currentTarget).get('name') || '').trim()
    try {
      const { error: updateError } = await supabase.from('profiles').update({ display_name: name }).eq('id', user.id)
      if (updateError) throw updateError
      setProfile({ ...profile, display_name: name }); setMessage('Your name has been updated.')
    } catch { setError('Unable to update your profile. Please try again.') }
    finally { setBusy(false) }
  }

  async function signOut() {
    setBusy(true); setError('')
    try {
      const { error: signoutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signoutError) throw signoutError
      window.location.assign(accountUrl('signin'))
    } catch { setError('Unable to sign out. Please try again.'); setBusy(false) }
  }

  return <>
    <p className="eyebrow">{profile?.role === 'admin' ? 'OWNER DASHBOARD' : profile?.role === 'staff' ? 'STAFF CORNER' : 'YOUR MEMBER CORNER'}</p>
    <h2 id="account-heading">Hello{profile?.display_name ? `, ${profile.display_name}` : ''}.</h2>
    <p className="verified-badge">✓ Email verified</p>
    <p className="account-email">{user.email}</p>
    <Notice error>{error}</Notice><Notice>{message}</Notice>
    {loading ? <p role="status">Loading your profile…</p> : profile && <>
      <p>{profile.role === 'staff' || profile.role === 'admin' ? 'Welcome to the café team. Your staff access is confirmed.' : 'Welcome to your neighbourhood café community. Your member account is ready.'}</p>
      <form className="account-form" onSubmit={saveProfile}><label>Your name<input name="name" defaultValue={profile.display_name} maxLength={100} required /></label><button className="button" disabled={busy}>Save profile</button></form>
      {profile.role === 'admin' && <StaffInvitations />}
    </>}
    <button type="button" className="account-text-button" onClick={signOut} disabled={busy}>Sign out</button>
  </>
}

function StaffInvitations() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function invite(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    const form = event.currentTarget
    const values = new FormData(form)
    try {
      const { data, error: inviteError } = await supabase.functions.invoke('invite-staff', { body: { email: String(values.get('email')).trim().toLowerCase(), display_name: String(values.get('name')).trim() } })
      if (inviteError) {
        const details = await inviteError.context?.json?.().catch(() => null)
        throw new Error(details?.error || 'The invitation could not be sent. Check the email address and try again.')
      }
      if (data?.error) throw new Error(data.error)
      setMessage(data.message || 'Invitation sent. Staff access starts after email verification.'); form.reset()
    } catch (inviteError) { setError(inviteError.message || 'Unable to invite staff. Please try again.') }
    finally { setBusy(false) }
  }

  return <section className="staff-invitations" aria-labelledby="staff-invite-title"><h3 id="staff-invite-title">Invite a team member</h3><p>We’ll send a personal invitation. New staff verify their email and choose a password before getting access.</p><Notice error>{error}</Notice><Notice>{message}</Notice><form className="account-form" onSubmit={invite}><label>Staff name<input name="name" autoComplete="off" maxLength={100} required /></label><label>Staff email<input name="email" type="email" autoComplete="off" maxLength={254} required /></label><button className="button" disabled={busy}>{busy ? 'Sending…' : 'Send staff invitation'}</button></form></section>
}
