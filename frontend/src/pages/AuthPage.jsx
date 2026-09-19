import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'

export default function AuthPage() {
  const { user, loginSuccess } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('attendee')
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

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data =
        mode === 'login'
          ? await api.login({ username, password })
          : await api.register({ username, password, role })
      loginSuccess(data)
      navigate(
        redirectTo ||
          (data.user.role === 'organizer' ? '/organizer' : '/attendee'),
      )
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
        <div className="tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => setMode('login')}
          >
            Log in
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => setMode('register')}
          >
            Register
          </button>
        </div>

        <div className="stack">
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={2}
              autoComplete="username"
              placeholder="keith"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : 1}
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              placeholder={mode === 'register' ? 'At least 8 characters' : ''}
            />
          </label>

          {mode === 'register' && (
            <label>
              Role
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="attendee">Attendee</option>
                <option value="organizer">Organizer</option>
              </select>
            </label>
          )}

          {error && <p className="error">{error}</p>}

          <button className="primary" disabled={busy} type="submit">
            {busy ? 'Working…' : mode === 'login' ? 'Continue' : 'Create account'}
          </button>
        </div>

        <p className="hint">
          Passwords are stored with bcrypt. Sessions are random tokens. Role
          comes from the database, not from the client.
        </p>
      </form>
    </main>
  )
}
