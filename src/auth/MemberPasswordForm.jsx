import React, { useState } from 'react'
import PasswordField from './PasswordField'

export default function MemberPasswordForm({ disabled, onSave }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    if (values.get('password') !== values.get('confirm')) { setError('The passwords do not match.'); return }
    setError('')
    if (await onSave(String(values.get('password')))) { form.reset(); setOpen(false) }
  }
  return <div className="admin-password-manager">
    <button className="account-text-button" disabled={disabled} onClick={() => { setOpen(!open); setError('') }}>{open ? 'Cancel password change' : 'Set new password'}</button>
    {open && <form className="account-form" onSubmit={submit}>
      <p>Existing passwords cannot be viewed. Set a new password for this account.</p>
      {error && <p role="alert" className="account-error account-notice">{error}</p>}
      <PasswordField label="New account password" name="password" autoComplete="new-password" minLength={12} maxLength={128} disabled={disabled} required />
      <PasswordField label="Confirm account password" name="confirm" autoComplete="new-password" minLength={12} maxLength={128} disabled={disabled} required />
      <button className="button" disabled={disabled}>{disabled ? 'Saving…' : 'Save new password'}</button>
    </form>}
  </div>
}
