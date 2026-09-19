import { Component } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import AttendeePage from './pages/AttendeePage'
import AuthPage from './pages/AuthPage'
import CheckInPage from './pages/CheckInPage'
import OrganizerPage from './pages/OrganizerPage'

class RouteGuard extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="shell">
          <section className="panel">
            <p className="org-mark">TaranTech</p>
            <h1>Check-in</h1>
            <p className="muted">Reload to continue.</p>
            <div className="row">
              <button
                className="primary"
                type="button"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </div>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}

function Home() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/auth" replace />
  return (
    <Navigate
      to={user.role === 'organizer' ? '/organizer' : '/attendee'}
      replace
    />
  )
}

export default function App() {
  return (
    <RouteGuard>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/organizer" element={<OrganizerPage />} />
        <Route path="/attendee" element={<AttendeePage />} />
        <Route path="/checkin/:token" element={<CheckInPage />} />
      </Routes>
    </RouteGuard>
  )
}
