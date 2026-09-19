import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'

export default function CheckInPage() {
  const { token } = useParams()
  const { user } = useAuth()
  const [event, setEvent] = useState(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    api
      .previewCheckin(token)
      .then(setEvent)
      .catch((err) => setError(err.message))
  }, [token, user])

  if (!user) {
    return (
      <Navigate to="/auth" replace state={{ from: `/checkin/${token}` }} />
    )
  }

  async function doCheckIn() {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const row = await api.checkIn(token)
      setStatus(
        `Checked in as ${row.attendee_username} at ${new Date(row.checked_in_at).toLocaleString()}`,
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (user.role !== 'attendee') {
    return (
      <main className="shell">
        <section className="panel">
          <p className="error">Log in as an attendee to check in.</p>
          <p className="hint">
            <Link to="/organizer">Back to organizer desk</Link>
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="shell auth-shell">
      <section className="panel">
        <p className="org-mark">TaranTech</p>
        <p className="eyebrow">Check-in</p>
        {event ? (
          <>
            <h1>{event.title}</h1>
            <p className="muted">{event.description || 'No description'}</p>
            <p className="meta">
              <span className={`pill ${event.is_closed ? 'danger' : 'ok'}`}>
                {event.is_closed ? 'Closed' : 'Open'}
              </span>
              {event.ends_at
                ? `  ends ${new Date(event.ends_at).toLocaleString()}`
                : ''}
            </p>
          </>
        ) : (
          <h1>Event</h1>
        )}

        <div className="row">
          <button
            className="primary"
            type="button"
            disabled={busy || event?.is_closed}
            onClick={doCheckIn}
          >
            Check in
          </button>
        </div>

        {status && <p className="ok">{status}</p>}
        {error && <p className="error">{error}</p>}

        <p className="hint">
          One check-in per account. Closed events stay closed.
        </p>
        <p className="hint">
          <Link to="/attendee">Your check-ins</Link>
        </p>
      </section>
    </main>
  )
}
