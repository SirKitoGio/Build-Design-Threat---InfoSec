export default function AppNav({ role, title, onLogout }) {
  return (
    <>
      <header className="float-nav">
        <div className="float-nav-brand">
          <p className="float-nav-mark">TaranTech</p>
          <p className="float-nav-role">{role}</p>
        </div>
        <button type="button" className="nav-logout" onClick={onLogout}>
          Log out
        </button>
      </header>
      <div className="page-head">
        <h1>{title}</h1>
      </div>
    </>
  )
}
