import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { PasswordField, PasswordRules, passwordReady } from '../passwordRules'

export default function AuthPage() {
  const { user, loginSuccess } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [role, setRole] = useState('attendee')
  const [mfaToken, setMfaToken] = useState('')
  const [code, setCode] = useState('')
  const [demoCode, setDemoCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) {
    return (
      <Navigate
        to={
          redirectTo ||
          (user.role === 'organizer' ? '/organizer' : '/attendee')
        }
        replace
      />
    )
  }

  function goIn(data) {
    loginSuccess(data)
    navigate(
      redirectTo ||
        (data.user.role === 'organizer' ? '/organizer' : '/attendee'),
    )
  }

  async function resend() {
    setError('')
    setBusy(true)
    try {
      const data = await api.resendMfa({ mfa_token: mfaToken })
      setMfaToken(data.mfa_token)
      setDemoCode(data.demo_code || '')
      setCode('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!mfaToken && mode === 'register' && password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      if (mfaToken) {
        goIn(await api.loginMfa({ mfa_token: mfaToken, code }))
        return
      }
      const data =
        mode === 'register'
          ? await api.register({ username, email, password, role })
          : await api.login({ username, password })
      if (data.mfa_required) {
        setMfaToken(data.mfa_token)
        setDemoCode(data.demo_code || '')
        setCode('')
        return
      }
      goIn(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="shell auth-shell">
      <header className="brand-block">
        <p className="org-mark">TaranTech</p>
        <p className="eyebrow">ITC 303 · Secure check-in</p>
        <h1>AWSSBGJRU</h1>
        <p className="tagline">QR attendance for club events</p>
      </header>

      <form className="panel" onSubmit={submit}>
        {!mfaToken && (
          <div className="tabs">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => {
                setMode('login')
                setConfirm('')
                setError('')
              }}
            >
              Log in
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => {
                setMode('register')
                setConfirm('')
                setError('')
              }}
            >
              Register
            </button>
          </div>
        )}

        <div className="stack">
          {mfaToken ? (
            <>
              <p className="eyebrow">Sign-in code</p>
              <h2>Check your email</h2>
              <p className="muted">
                {`Enter the 6-digit code sent to ${
                  email ||
                  (username.includes('@') ? username : 'your inbox')
                }.`}
              </p>
              <label>
                Code
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  minLength={6}
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                />
              </label>
              {demoCode && (
                <p className="lab-note">
                  Classroom demo — use this code: {demoCode}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="form-pair">
                <label>
                  {mode === 'login' ? 'Username or email' : 'Username'}
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    minLength={2}
                    autoComplete="username"
                    placeholder={mode === 'login' ? 'keith or keith@tarantech.club' : 'keith'}
                  />
                </label>
                {mode === 'register' && (
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
              </div>
              <div className="form-pair">
                <PasswordField
                  label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={mode === 'register' ? 8 : 1}
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                />
                {mode === 'register' && (
                  <PasswordField
                    label="Confirm password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                )}
              </div>
              {mode === 'register' && password.length > 0 && (
                <PasswordRules
                  password={password}
                  username={username}
                  email={email}
                  confirm={confirm}
                />
              )}
              {mode === 'register' && (
                <label>
                  Role
                  <select value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="attendee">Attendee</option>
                    <option value="organizer">Organizer</option>
                  </select>
                </label>
              )}
              {mode === 'register' && (
                <p className="need-rules">
                  Attendees scan in. Organizers run the door.
                </p>
              )}
            </>
          )}

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          {mode === 'register' &&
            !mfaToken &&
            !passwordReady(password, { username, email, confirm }) && (
              <p className="need-rules">Meet the password rules to continue.</p>
            )}
          <button
            className="primary"
            disabled={
              busy ||
              (mode === 'register' &&
                !mfaToken &&
                !passwordReady(password, { username, email, confirm }))
            }
            type="submit"
          >
            {busy
              ? 'Working…'
              : mfaToken
                ? 'Verify code'
                : mode === 'login'
                  ? 'Continue'
                  : 'Create account'}
          </button>
        </div>

        {mode === 'login' && !mfaToken && (
          <p className="hint">
            <Link to="/forgot">Forgot password?</Link>
          </p>
        )}
        {mfaToken && (
          <div className="hint row-links">
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={resend}
            >
              Resend code
            </button>
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setMfaToken('')
                setCode('')
                setDemoCode('')
                setError('')
              }}
            >
              Use a different account
            </button>
          </div>
        )}
        <p className="hint">
          New accounts use email plus a one-time code after the password.
        </p>
      </form>
    </main>
  )
}
