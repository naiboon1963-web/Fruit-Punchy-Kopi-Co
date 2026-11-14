import { useEffect, useState } from 'react'
import { accountUrl, authConfigured, emailDeliveryReady, supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import './accounts.css'

const validViews = ['signin', 'join', 'staff', 'staff-create', 'forgot', 'resend', 'callback', 'set-password', 'reset', 'dashboard']
const accountPages = [['join', 'Create member account'], ['signin', 'Member login'], ['staff-create', 'Create staff account'], ['staff', 'Staff sign-in']]

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

  useEffect(() => { document.title = `${accountPages.find(([key]) => key === view)?.[1] || 'Your account'} | Fruit Punchy Kopi and Art` }, [view])
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
    if (!supabase || busy || (['join', 'forgot', 'resend'].includes(view) && !emailDeliveryReady)) return
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
        if (view === 'staff') {
          const { data: staffProfile, error: staffError } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
          if (staffError || !['staff', 'admin'].includes(staffProfile?.role)) {
            await supabase.auth.signOut({ scope: 'local' })
            setError(staffError ? 'Staff access could not be verified. Please contact the café owner.' : 'This is a member account. Use member login, or ask the café owner about a staff invitation.')
            return
          }
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
    <aside className="account-welcome"><p className="eyebrow">A LITTLE MORE FRUIT PUNCHY</p><h1>Your corner.<br /><em>Your community.</em></h1><p>A warm welcome for our members and the people who make it all happen.</p><div className="account-page-links" aria-label="Member and staff pages">{accountPages.map(([key, label]) => <a key={key} href={accountUrl(key)} aria-current={view === key ? 'page' : undefined}><span>{label}</span><span aria-hidden="true">↗</span></a>)}</div><img src="/images/fruit-punchy-logo.webp" alt="Fruit Punchy fruit-character artwork" width="818" height="392" /><a className="text-link" href="/">← Back to the café</a></aside>
    <section className="account-panel" aria-labelledby="account-heading">
      {!authConfigured && <Notice>Account activation is pending. You can view the forms below; registration, sign-in and invitation emails will be available once Supabase setup is complete.</Notice>}
      {authConfigured && !emailDeliveryReady && <Notice>Supabase is connected. New registrations, verification emails and staff invitations will open once our email sender is ready. Existing verified accounts can sign in.</Notice>}
      {loading ? <><h2 id="account-heading">One moment…</h2><p role="status">Checking your account securely.</p></>
      : view === 'staff-create' ? <StaffCreation user={user} />
      : user && verified && !settingPassword ? <Dashboard user={user} requireStaff={view === 'staff'} />
      : <>
        <p className="eyebrow">{view === 'staff' ? 'FOR OUR CAFÉ TEAM' : 'WELCOME TO THE NEIGHBOURHOOD'}</p>
        <h2 id="account-heading">{settingPassword ? 'Choose a password.' : view === 'join' ? 'Create a member account.' : view === 'staff' ? 'Staff sign-in.' : view === 'forgot' ? 'Forgot your password?' : view === 'resend' ? 'Check your inbox.' : 'Member login.'}</h2>
        <p>{settingPassword ? 'Your verified account deserves a strong password. Use at least 12 characters.' : view === 'join' ? 'Join our little community. Create your account, then verify your email to get started.' : view === 'staff' ? 'Welcome back to the café team. Sign in with your verified staff account. New team members receive an invitation from the owner.' : view === 'forgot' ? 'We’ll email you a link to choose a new password.' : view === 'resend' ? 'Request a fresh member verification email. Staff invitations are reissued by the café owner.' : 'Good to see you again. Enter your verified member email and password.'}</p>
        <Notice error>{error || authError}</Notice><Notice>{message}</Notice>
        {settingPassword && !verified ? <><Notice error>Open the link in your verification, invitation, or password-reset email to continue.</Notice><button type="button" className="account-text-button" onClick={() => navigate('forgot')}>Request a password-reset email</button></> : <form onSubmit={submit} className="account-form">
          {view === 'join' && <label>Your name<input name="name" autoComplete="name" maxLength={100} required /></label>}
          {!settingPassword && <label>Email address<input key={`email-${view}`} name="email" type="email" autoComplete="email" defaultValue={confirmationEmail} maxLength={254} required /></label>}
          {(settingPassword || !['forgot', 'resend'].includes(view)) && <label>{settingPassword ? 'New password' : 'Password'}<input key={`password-${view}`} name="password" type="password" autoComplete={view === 'join' || settingPassword ? 'new-password' : 'current-password'} minLength={view === 'join' || settingPassword ? 12 : undefined} maxLength={128} required /></label>}
          {view === 'join' && <p className="account-field-hint">At least 12 characters. Verify your email before signing in.</p>}
          {settingPassword && <label>Confirm new password<input name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>}
          <button className="button" type="submit" disabled={busy || !authConfigured || (['join', 'forgot', 'resend'].includes(view) && !emailDeliveryReady)}>{busy ? 'Please wait…' : settingPassword ? 'Save password' : view === 'join' ? 'Create member account' : view === 'forgot' ? 'Send reset email' : view === 'resend' ? 'Resend verification email' : view === 'staff' ? 'Sign in as staff' : 'Sign in'}</button>
        </form>}
        <div className="account-links">
          <button type="button" onClick={() => navigate(view === 'join' ? 'signin' : 'join')}>{view === 'join' ? 'Already a member? Sign in' : 'New here? Join as a member'}</button>
          <button type="button" onClick={() => navigate('forgot')}>Forgot password?</button>
          <button type="button" onClick={() => navigate('resend')}>Resend verification email</button>
          <button type="button" onClick={() => navigate('staff')}>Staff sign-in</button>
          <button type="button" onClick={() => navigate('staff-create')}>Owner? Create a staff account</button>
        </div>
      </>}
    </section>
  </main>
}

function Dashboard({ user, requireStaff = false }) {
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

  if (!loading && profile && requireStaff && !['staff', 'admin'].includes(profile.role)) {
    return <><p className="eyebrow">FOR OUR CAFÉ TEAM</p><h2 id="account-heading">Staff access required.</h2><Notice error>This is a member account. Staff access must be approved by the café owner.</Notice><a className="button" href={accountUrl('dashboard')}>Go to member account</a><button className="account-text-button" type="button" onClick={signOut} disabled={busy}>Sign out and use a staff account</button></>
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

function StaffCreation({ user }) {
  const [authorized, setAuthorized] = useState(false)
  const [checking, setChecking] = useState(Boolean(user?.email_confirmed_at))
  useEffect(() => {
    let active = true
    if (!supabase || !user?.email_confirmed_at) { setAuthorized(false); setChecking(false); return }
    setChecking(true)
    supabase.from('profiles').select('role').eq('id', user.id).single().then(({ data, error }) => {
      if (active) { setAuthorized(!error && data?.role === 'admin'); setChecking(false) }
    }).catch(() => { if (active) { setAuthorized(false); setChecking(false) } })
    return () => { active = false }
  }, [user?.id, user?.email_confirmed_at])
  return <><p className="eyebrow">OWNER-ONLY STAFF CREATION</p><h2 id="account-heading">Create a staff account.</h2><p>Invite someone to the Fruit Punchy team. They’ll verify their email and choose their own password using a personal invitation link.</p><ol className="staff-steps"><li>Owner enters the staff name and email.</li><li>Staff member opens the verification email.</li><li>Staff member sets a password and signs in.</li></ol>{checking ? <p role="status">Checking owner access…</p> : !authorized && <Notice>{user ? 'Only the verified café owner can create staff accounts.' : 'Sign in with the verified owner account to send staff invitations.'} <a href={accountUrl('staff')}>Owner sign-in →</a></Notice>}<StaffInvitations disabled={!authConfigured || !authorized || checking} /></>
}

function StaffInvitations({ disabled = false }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function invite(event) {
    event.preventDefault()
    if (disabled || !supabase || busy || !emailDeliveryReady) return
    setBusy(true); setError(''); setMessage('')
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

  return <section className="staff-invitations" aria-labelledby="staff-invite-title"><h3 id="staff-invite-title">Staff details</h3><p>We’ll send a personal invitation. New staff verify their email and choose a password before getting access.</p><Notice error>{error}</Notice><Notice>{message}</Notice><form className="account-form" onSubmit={invite}><label>Staff name<input name="name" autoComplete="off" maxLength={100} required /></label><label>Staff email<input name="email" type="email" autoComplete="off" maxLength={254} required /></label><button className="button" disabled={busy || disabled || !emailDeliveryReady}>{busy ? 'Sending…' : 'Send staff invitation'}</button></form></section>
}
