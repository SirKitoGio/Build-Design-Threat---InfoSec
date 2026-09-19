import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '../api'
import { useAuth } from '../auth'

export default function OrganizerPage() {
  const { user, logout, passwordStorage } = useAuth()
  const [events, setEvents] = useState([])
  const [selected, setSelected] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refresh() {
    const list = await api.listEvents()
    setEvents(list)
    setSelected((current) => {
      if (!current) return current
      return list.find((e) => e.id === current.id) || current
    })
  }

  useEffect(() => {
    if (!user || user.role !== 'organizer') return
    refresh().catch((err) => setError(err.message))
  }, [user])

  if (!user) return <Navigate to="/auth" replace />
  if (user.role !== 'organizer') return <Navigate to="/attendee" replace />

  async function createEvent(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      const body = {
        title,
        description,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      }
      const created = await api.createEvent(body)
      setTitle('')
      setDescription('')
      setEndsAt('')
      setMessage(`Created “${created.title}”`)
      setSelected(created)
      await refresh()
      const rows = await api.attendance(created.id)
      setAttendance(rows)
    } catch (err) {
      setError(err.message)
    }
  }

  async function openEvent(event) {
    setSelected(event)
    setError('')
    setMessage('')
    try {
      const rows = await api.attendance(event.id)
      setAttendance(rows)
    } catch (err) {
      setError(err.message)
    }
  }

  async function closeSelected() {
    if (!selected) return
    try {
      const updated = await api.closeEvent(selected.id)
      setSelected(updated)
      setMessage('Check-in is closed for this event.')
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const checkinUrl = selected
    ? `${window.location.origin}/checkin/${selected.checkin_token}`
    : ''

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="org-mark">TaranTech</p>
          <p className="eyebrow">Organizer</p>
          <h1>Event desk</h1>
        </div>
        <div className="topbar-actions">
          <span className="pill">{user.username}</span>
          <span className="pill ok">pw · {passwordStorage || 'bcrypt+salt'}</span>
          <button type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <div className="grid-2">
        <section className="panel panel-delay-1">
          <h2>New event</h2>
          <form onSubmit={createEvent} className="stack">
            <label>
              Title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Club Night"
              />
            </label>
            <label>
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional notes for attendees"
              />
            </label>
            <label>
              Ends at (optional)
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </label>
            <button className="primary" type="submit">
              Create and show QR
            </button>
          </form>

          <h2 className="mt">Your events</h2>
          <ul className="event-list">
            {events.map((event, i) => (
              <li key={event.id} style={{ '--i': i }}>
                <button type="button" onClick={() => openEvent(event)}>
                  {event.title}
                  {event.is_closed ? (
                    <span className="pill danger" style={{ marginLeft: 8 }}>
                      Closed
                    </span>
                  ) : (
                    <span className="pill ok" style={{ marginLeft: 8 }}>
                      Open
                    </span>
                  )}
                </button>
              </li>
            ))}
            {events.length === 0 && (
              <li className="muted">No events yet. Create one to get a QR code.</li>
            )}
          </ul>
        </section>

        <section className="panel panel-delay-2">
          {!selected ? (
            <p className="muted">
              Create an event. The QR encodes a random token, not a sequential
              id.
            </p>
          ) : (
            <>
              <p className="eyebrow">Live QR</p>
              <h2>{selected.title}</h2>
              <p className="muted">
                {selected.description || 'No description'}
              </p>
              <p className="meta">
                <span
                  className={`pill ${selected.is_closed ? 'danger' : 'ok'}`}
                >
                  {selected.is_closed ? 'Closed' : 'Open'}
                </span>
                {selected.ends_at
                  ? `  ends ${new Date(selected.ends_at).toLocaleString()}`
                  : ''}
              </p>

              <div className="qr-wrap">
                <QRCodeSVG
                  value={checkinUrl}
                  size={220}
                  level="M"
                  includeMargin
                  bgColor="#FFFFFF"
                  fgColor="#111111"
                />
              </div>
              <p className="mono">
                Check-in link
                <br />
                <a href={checkinUrl}>{checkinUrl}</a>
              </p>
              <div className="row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(checkinUrl)
                      setMessage('Link copied. An attendee can paste it on desktop.')
                    } catch {
                      setError('Could not copy. Select the link instead.')
                    }
                  }}
                >
                  Copy link
                </button>
              </div>

              <div className="row">
                <button
                  type="button"
                  onClick={closeSelected}
                  disabled={selected.is_closed}
                >
                  Close check-in
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const rows = await api.attendance(selected.id)
                    setAttendance(rows)
                  }}
                >
                  Refresh list
                </button>
              </div>

              <h3 className="mt">Attendance ({attendance.length})</h3>
              <ul className="event-list">
                {attendance.map((row, i) => (
                  <li key={row.id} style={{ '--i': i }}>
                    {row.attendee_username}{' '}
                    <span className="muted">
                      {new Date(row.checked_in_at).toLocaleString()}
                    </span>
                  </li>
                ))}
                {attendance.length === 0 && (
                  <li className="muted">Waiting for the first scan.</li>
                )}
              </ul>
            </>
          )}
          {message && <p className="ok">{message}</p>}
          {error && <p className="error">{error}</p>}
        </section>
      </div>
    </main>
  )
}
