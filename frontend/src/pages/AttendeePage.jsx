import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import AppNav from '../AppNav'
import { api } from '../api'
import { useAuth } from '../auth'
import QrScanner, { tokenFromScan } from '../QrScanner'

export default function AttendeePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [paste, setPaste] = useState('')
  const [showPaste, setShowPaste] = useState(false)

  useEffect(() => {
    if (!user || user.role !== 'attendee') return
    api
      .myCheckins()
      .then(setRows)
      .catch((err) => setError(err.message))
  }, [user])

  if (!user) return <Navigate to="/auth" replace />
  if (user.role !== 'attendee') return <Navigate to="/organizer" replace />

  function goToToken(token) {
    if (!token) {
      setError('That is not a valid check-in QR or link.')
      return
    }
    navigate(`/checkin/${token}`)
  }

  function submitPaste(e) {
    e.preventDefault()
    goToToken(tokenFromScan(paste))
  }

  return (
    <main className="shell">
      <AppNav
        role="Attendee"
        title="Check in"
        onLogout={logout}
      />

      <div className="grid-2">
        <section className="panel panel-delay-1">
          <h2>Scan to check in</h2>
          <QrScanner onToken={goToToken} onError={setError} />
          {!showPaste ? (
            <button
              type="button"
              className="text-link"
              onClick={() => setShowPaste(true)}
            >
              Have a link instead?
            </button>
          ) : (
            <form className="stack mt" onSubmit={submitPaste}>
              <label>
                Check-in link
                <input
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder="Paste a check-in link"
                />
              </label>
              <button className="primary" type="submit">
                Open link
              </button>
            </form>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>

        <section className="panel panel-delay-2">
          <h2>Your check-ins</h2>
          <ul className="event-list">
            {rows.map((row, i) => (
              <li key={row.id} style={{ '--i': i }}>
                {row.event_title || `Event #${row.event_id}`}{' '}
                <span className="muted">
                  {new Date(row.checked_in_at).toLocaleString()}
                </span>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="muted">None yet.</li>
            )}
          </ul>
        </section>
      </div>
    </main>
  )
}
