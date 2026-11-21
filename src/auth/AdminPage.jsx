import React, { useCallback, useEffect, useState } from 'react'
import { supabase, authConfigured } from '../lib/supabase'
import PasswordField from './PasswordField'
import './accounts.css'
import './admin.css'

export default function AdminPage() {
  const [session, setSession] = useState(null)
  const [members, setMembers] = useState([])
  const [status, setStatus] = useState('Pending')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [usernames, setUsernames] = useState({})

  const lock = useCallback(() => { setSession(null); setMembers([]); setUsernames({}); setMessage('') }, [])
  useEffect(() => { document.title = 'Member administration | Fruit Punchy Kopi and Art' }, [])
  useEffect(() => {
    if (!session) return
    const timer = setTimeout(() => { lock(); setError('Your admin session has expired. Please unlock administration again.') }, Math.max(0, session.expires_at - Date.now()))
    return () => clearTimeout(timer)
  }, [session, lock])

  async function request(body) {
    const { data, error: failure } = await supabase.functions.invoke('admin-members', { body })
    if (failure) {
      const detail = await failure.context?.json?.().catch(() => null)
      if (failure.context?.status === 401 && body.action !== 'login') lock()
      throw new Error(detail?.error || 'Unable to connect to administration. Please try again.')
    }
    return data
  }

  useEffect(() => {
    let active = true
    if (!session) return
    setLoading(true); setError(''); setMembers([])
    request({ action: 'list', admin_token: session.token, status, page })
      .then(data => { if (active) { setMembers(data.members); setTotal(data.total) } })
      .catch(failure => { if (active) setError(failure.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session, status, page])

  async function unlock(event) {
    event.preventDefault()
    if (busy || !supabase) return
    const form = event.currentTarget
    const password = String(new FormData(form).get('admin_password'))
    setBusy('login'); setError(''); setMessage('')
    try { const data = await request({ action: 'login', password }); form.reset(); setPage(0); setSession(data) }
    catch (failure) { setError(failure.message) }
    finally { setBusy('') }
  }

  async function manage(member, action) {
    if (busy) return
    setBusy(member.id); setError(''); setMessage('')
    try {
      const data = await request({ action, member_id: member.id, admin_token: session.token, ...(!member.username ? { username: usernames[member.id] || '' } : {}) })
      setMessage(data.message)
      // Reload this page after mutations so filtered counts stay accurate.
      const listing = await request({ action: 'list', admin_token: session.token, status, page })
      if (!listing.members.length && page > 0) setPage(page - 1)
      else { setMembers(listing.members); setTotal(listing.total) }
    } catch (failure) { setError(failure.message) }
    finally { setBusy('') }
  }

  return <main id="main" className="shell admin-page">
    <div className="admin-heading"><div><p className="eyebrow">CAFÉ ADMINISTRATION</p><h1>Look after <em>our members.</em></h1><p>Approve memberships and welcome members to the staff team.</p></div>{session && <button className="button" onClick={lock}>Lock administration</button>}</div>
    {error && <p className="account-notice account-error" role="alert">{error}</p>}
    {message && <p className="account-notice" role="status">{message}</p>}
    {!session ? <section className="account-panel admin-unlock" aria-labelledby="admin-heading"><h2 id="admin-heading">Admin access</h2><p>Enter the admin password to manage memberships.</p>{!authConfigured && <p role="status">Administration is not configured yet.</p>}<form className="account-form" onSubmit={unlock}><PasswordField name="admin_password" label="Admin password" autoComplete="current-password" maxLength={128} required /><button className="button" disabled={Boolean(busy) || !authConfigured}>{busy ? 'Checking…' : 'Unlock administration'}</button></form><a className="text-link" href="/">Back to the café</a></section> : <section aria-label="Member management">
      <div className="admin-toolbar"><label>Membership status<select value={status} disabled={Boolean(busy)} onChange={event => { setStatus(event.target.value); setPage(0); setMessage('') }}><option>Pending</option><option>Active</option><option>Rejected</option><option value="All">All members</option></select></label><p aria-live="polite">{loading ? 'Loading members…' : `${total} ${total === 1 ? 'member' : 'members'}`}</p></div>
      {loading ? <p role="status">Loading members…</p> : !members.length ? <p className="account-notice">No members in this group.</p> : <div className="admin-member-grid">{members.map(member => <article className="admin-member" key={member.id} aria-label={`Member ${member.username || member.email}`}><div className="admin-member-title"><h2>{member.full_name || member.username || 'Member'}</h2><span className="admin-badge">{member.status} · {member.role}</span></div><dl><dt>Username</dt><dd>{member.username || 'Not assigned'}</dd><dt>Email</dt><dd>{member.email}</dd><dt>Telephone</dt><dd>{member.telephone || 'Not provided'}</dd></dl>{!member.username && <label className="admin-username">Assign login username<input value={usernames[member.id] || ''} pattern="[a-zA-Z0-9_]{3,30}" maxLength={30} placeholder="e.g. kopi_member" disabled={Boolean(busy)} onChange={event => setUsernames({ ...usernames, [member.id]: event.target.value })} /><small>Required for approval: 3–30 letters, numbers or underscores.</small></label>}<div className="admin-actions">{member.status !== 'Active' && member.role !== 'admin' && <button className="button" disabled={Boolean(busy) || (!member.username && !/^[a-zA-Z0-9_]{3,30}$/.test(usernames[member.id] || ''))} onClick={() => manage(member, 'approve')}>{busy === member.id ? 'Saving…' : 'Approve member'}</button>}{member.role === 'member' && <button className="button admin-secondary" disabled={Boolean(busy) || member.status !== 'Active'} onClick={() => manage(member, 'promote')}>{busy === member.id ? 'Saving…' : 'Upgrade to staff'}</button>}{member.role === 'staff' && <p>Staff access granted</p>}</div></article>)}</div>}
      <div className="admin-pagination"><button className="button admin-secondary" disabled={loading || Boolean(busy) || page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1}</span><button className="button admin-secondary" disabled={loading || Boolean(busy) || (page + 1) * 25 >= total} onClick={() => setPage(page + 1)}>Next</button></div>
    </section>}
  </main>
}
