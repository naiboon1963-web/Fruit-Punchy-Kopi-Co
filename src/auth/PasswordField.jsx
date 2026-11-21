import React, { useId, useState } from 'react'

export default function PasswordField({ label, ...props }) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  return <div className="password-field">
    <label htmlFor={id}>{label}</label>
    <div className="password-input">
      <input {...props} id={id} type={visible ? 'text' : 'password'} />
      <button type="button" className="password-toggle" aria-controls={id}
        aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        onClick={() => setVisible(value => !value)}>{visible ? 'Hide' : 'Show'}</button>
    </div>
  </div>
}
