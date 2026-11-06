import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import AppNav from '../AppNav'
import { api } from '../api'
import { useAuth } from '../auth'

function EventList({ events, selectedId, onOpen }) {
  return (
    <ul className="event-list">
      {events.map((event) => (
        <li key={event.id}>
          <button
            type="button"
            className={event.id === selectedId ? 'is-current' : ''}
            onClick={() => onOpen(event)}
          >
            {event.title}
            {event.is_closed ? (
              <span className="pill danger">Closed</span>
            ) : (
              <span className="pill ok">Open</span>
            )}
          </button>
        </li>
      ))}
      {events.length === 0 && (
        <li className="muted">No events yet. Create one to get a QR code.</li>
      )}
    </ul>
  )
}

export default function OrganizerPage() {
  const { user, logout } = useAuth()
  const [events, setEvents] = useState([])
  const [selected, setSelected] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [armClose, setArmClose] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

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
      setShowCreate(false)
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
    setArmClose(false)
    setShowCreate(false)
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
    if (!selected || selected.is_closed) return
    if (!armClose) {
      setArmClose(true)
      return
    }
    try {
      const updated = await api.closeEvent(selected.id)
      setSelected(updated)
      setArmClose(false)
      setMessage('Check-in is closed for this event.')
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const checkinUrl = selected
    ? `${window.location.origin}/checkin/${selected.checkin_token}`
    : ''

  const createForm = (
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
  )

  const notices = (
    <>
      {message && (
        <p className="ok" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  )

  const livePanel = selected && (
    <section className="panel panel-delay-1">
      <div className="event-head">
        <h2>{selected.title}</h2>
        <p className="meta">
          <span className={`pill ${selected.is_closed ? 'danger' : 'ok'}`}>
            {selected.is_closed ? 'Closed' : 'Open'}
          </span>
          <span className="muted">
            {attendance.length} checked in
          </span>
        </p>
      </div>
      {selected.description ? (
        <p className="muted">{selected.description}</p>
      ) : null}
      {selected.ends_at ? (
        <p className="muted">
          Ends {new Date(selected.ends_at).toLocaleString()}
        </p>
      ) : null}

      <div className="qr-wrap qr-wrap-live">
        <QRCodeSVG
          value={checkinUrl}
          size={320}
          level="M"
          includeMargin
          bgColor="#FFFFFF"
          fgColor="#192853"
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

      {armClose ? (
        <div className="close-confirm">
          <p>Attendees will not be able to check in.</p>
          <div className="row">
            <button className="danger" type="button" onClick={closeSelected}>
              Confirm close
            </button>
            <button type="button" onClick={() => setArmClose(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button
            type="button"
            onClick={closeSelected}
            disabled={selected.is_closed}
          >
            {selected.is_closed ? 'Check-in closed' : 'Close check-in'}
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
      )}

      {notices}

      <h3 className="mt">Attendance</h3>
      <ul className="event-list">
        {attendance.map((row) => (
          <li key={row.id}>
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
    </section>
  )

  const sidePanel = (
    <section className={`panel ${selected ? 'panel-delay-2' : 'panel-delay-1'}`}>
      {selected ? (
        <>
          <h2>Your events</h2>
          <EventList
            events={events}
            selectedId={selected.id}
            onOpen={openEvent}
          />
          {showCreate ? (
            <>
              <h2 className="mt">New event</h2>
              {createForm}
              <button
                type="button"
                className="text-link"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <div className="row">
              <button type="button" onClick={() => setShowCreate(true)}>
                New event
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <h2>New event</h2>
          {createForm}
          <h2 className="mt">Your events</h2>
          <EventList events={events} selectedId={null} onOpen={openEvent} />
        </>
      )}
      {!selected && notices}
    </section>
  )

  return (
    <main className="shell">
      <AppNav
        role="Organizer"
        title="Event desk"
        onLogout={logout}
      />

      <div className={`grid-2${selected ? ' is-live' : ''}`}>
        {selected ? livePanel : sidePanel}
        {selected ? sidePanel : (
          <section className="panel panel-delay-2">
            <p className="muted">
              Create an event to put a QR on the door.
            </p>
          </section>
        )}
      </div>
    </main>
  )
}
