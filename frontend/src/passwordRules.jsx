import { useId, useState } from 'react'

export function passwordChecks(password, { username = '', email = '', confirm } = {}) {
  const value = password || ''
  const lowered = value.trim().toLowerCase()
  const checks = [
    {
      label: '8 to 128 characters',
      ok: value.length >= 8 && value.length <= 128,
    },
    { label: 'One uppercase letter', ok: /[A-Z]/.test(value) },
    { label: 'One lowercase letter', ok: /[a-z]/.test(value) },
    { label: 'One digit', ok: /\d/.test(value) },
    { label: 'One symbol', ok: /[^A-Za-z0-9]/.test(value) },
    {
      label: 'Not your username or email',
      ok:
        value.length > 0 &&
        lowered !== (username || '').trim().toLowerCase() &&
        (!(email || '').trim() || lowered !== (email || '').trim().toLowerCase()),
    },
  ]
  if (confirm !== undefined) {
    checks.push({
      label: 'Passwords match',
      ok: value.length > 0 && value === confirm,
    })
  }
  return checks
}

export function passwordReady(password, extra) {
  return passwordChecks(password, extra).every((item) => item.ok)
}

function RuleMark({ ok }) {
  return (
    <svg className="rule-mark" viewBox="0 0 16 16" aria-hidden="true">
      {ok ? (
        <path
          d="M3.2 8.4 6.4 11.6 12.8 4.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

export function PasswordRules({ password, username, email, confirm }) {
  const checks = passwordChecks(password, { username, email, confirm })
  return (
    <ul className="rules">
      {checks.map((item) => (
        <li
          key={item.label}
          className={item.ok ? 'met' : ''}
          aria-label={`${item.ok ? 'Passed' : 'Not yet'}: ${item.label}`}
        >
          <RuleMark ok={item.ok} />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  required = true,
}) {
  const [visible, setVisible] = useState(false)
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-row">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="ghost"
          aria-pressed={visible}
          onClick={() => setVisible((on) => !on)}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}
