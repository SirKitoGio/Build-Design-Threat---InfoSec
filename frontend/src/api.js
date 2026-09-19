const API = ''

function authHeaders() {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers || {}),
    },
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { detail: text }
  }
  if (!res.ok) {
    const detail = data?.detail
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
          : 'Request failed'
    throw new Error(message)
  }
  return data
}

export const api = {
  register: (body) =>
    request('/api/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) =>
    request('/api/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/api/me'),
  listEvents: () => request('/api/events'),
  createEvent: (body) =>
    request('/api/events', { method: 'POST', body: JSON.stringify(body) }),
  getEvent: (id) => request(`/api/events/${id}`),
  closeEvent: (id) =>
    request(`/api/events/${id}/close`, { method: 'POST', body: '{}' }),
  attendance: (id) => request(`/api/events/${id}/attendance`),
  previewCheckin: (token) => request(`/api/checkin/${token}`),
  checkIn: (token) =>
    request(`/api/checkin/${token}`, { method: 'POST', body: '{}' }),
  myCheckins: () => request('/api/me/checkins'),
}
