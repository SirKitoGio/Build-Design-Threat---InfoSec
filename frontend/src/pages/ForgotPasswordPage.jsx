import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { PasswordField, PasswordRules, passwordReady } from '../passwordRules'

export default function ForgotPasswordPage() {
  const { user, loginSuccess } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [step, setStep] = useState('request')
  const [demoCode, setDemoCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) {
    return (
      <Navigate
        to={user.role === 'organizer' ? '/organizer' : '/attendee'}
        replace
      />
    )
  }

  async function sendCode() {
    const data = await api.forgotPassword({ email })
    setDemoCode(data.demo_code || '')
    setMessage(data.message)
    setCode('')
    setStep('code')
  }

  async function requestCode(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await sendCode()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setError('')
    setBusy(true)
    try {
      await sendCode()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function goToPassword(e) {
    e.preventDefault()
    setError('')
    if (code.length !== 6) {
      setError('Enter the 6-digit code from your email.')
      return
    }
    setStep('password')
  }

  async function submitReset(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const data = await api.resetPassword({ email, code, password })
      loginSuccess(data)
      navigate(data.user.role === 'organizer' ? '/organizer' : '/attendee')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const onSubmit =
    step === 'request' ? requestCode : step === 'code' ? goToPassword : submitReset

  return (
    <main className="shell auth-shell">
      <header className="brand-block">
        <p className="org-mark">TaranTech</p>
        <p className="eyebrow">Account</p>
        <h1>Reset password</h1>
        <p className="tagline">We email a 6-digit code, then you set a new password.</p>
      </header>

      <form className="panel" onSubmit={onSubmit}>
        <div className="stack">
          {step === 'request' && (
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="keith@tarantech.club"
              />
            </label>
          )}
          {step === 'code' && (
            <>
              <h2>Check your email</h2>
              <p className="inbox-line">
                Enter the 6-digit code sent to {email}.
              </p>
            </>
          )}
          {step === 'password' && (
            <>
              <h2>Choose a new password</h2>
              <p className="inbox-line">Code sent to {email}.</p>
            </>
          )}
          {step === 'code' && (
            <label>
              Code
              <input
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                required
                minLength={6}
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
              />
            </label>
          )}
          {step === 'password' && (
            <>
              <div className="form-pair">
                <PasswordField
                  label="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                />
                <PasswordField
                  label="Confirm password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              {password.length > 0 && (
                <PasswordRules
                  password={password}
                  email={email}
                  confirm={confirm}
                />
              )}
            </>
          )}
          {demoCode && (
            <p className="lab-note">
              Classroom demo — use this code: {demoCode}
            </p>
          )}
          {message && !demoCode && step === 'code' && (
            <p className="muted">{message}</p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {step === 'password' &&
            !passwordReady(password, { email, confirm }) && (
              <p className="need-rules">Meet the password rules to continue.</p>
            )}
          <button
            className="primary"
            disabled={
              busy ||
              (step === 'password' &&
                !passwordReady(password, { email, confirm }))
            }
            type="submit"
          >
            {busy
              ? 'Working…'
              : step === 'request'
                ? 'Send code'
                : step === 'code'
                  ? 'Continue'
                  : 'Save new password'}
          </button>
        </div>
        {step !== 'request' && (
          <div className="hint row-links">
            {step === 'code' && (
              <button
                type="button"
                className="text-link"
                disabled={busy}
                onClick={resend}
              >
                Resend code
              </button>
            )}
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setStep('request')
                setCode('')
                setPassword('')
                setConfirm('')
                setDemoCode('')
                setMessage('')
                setError('')
              }}
            >
              Use a different email
            </button>
          </div>
        )}
        <p className="hint">
          <Link to="/auth">Back to log in</Link>
        </p>
      </form>
    </main>
  )
}
