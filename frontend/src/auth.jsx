import { createContext, useContext, useMemo, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  })

  const value = useMemo(
    () => ({
      token,
      user,
      passwordStorage: localStorage.getItem('password_storage'),
      loginSuccess(data) {
        localStorage.setItem('token', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        localStorage.setItem('password_storage', data.password_storage)
        setToken(data.token)
        setUser(data.user)
      },
      logout() {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        localStorage.removeItem('password_storage')
        setToken(null)
        setUser(null)
      },
    }),
    [token, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
