const API_BASE = import.meta.env.VITE_API_URL || ''
const FETCH_TIMEOUT_MS = 45000
const AUTH_TIMEOUT_MS = 15000

let authErrorHandler = null
export function setAuthErrorHandler(fn) {
  authErrorHandler = fn
}

async function fetchWithTimeout(url, options, timeout = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal })
    return res
  } finally {
    clearTimeout(id)
  }
}

async function tryRefreshToken() {
  const refresh = localStorage.getItem('olyvia_refresh')
  if (!refresh) return false
  try {
    const res = await fetch(`${API_BASE}/api/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    })
    if (!res.ok) return false
    const data = await res.json()
    if (data.access) {
      localStorage.setItem('olyvia_access', data.access)
      if (data.refresh) localStorage.setItem('olyvia_refresh', data.refresh)
      return true
    }
  } catch (_) {}
  return false
}

function clearTokens() {
  localStorage.removeItem('olyvia_access')
  localStorage.removeItem('olyvia_refresh')
}

async function fetchWithAuth(url, options, timeout) {
  const headers = { ...getAuthHeaders(), ...options.headers }
  let res = await fetchWithTimeout(url, { ...options, headers }, timeout)
  if (res.status !== 401) return res
  const refreshed = await tryRefreshToken()
  if (!refreshed) {
    clearTokens()
    authErrorHandler?.()
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Session expired. Please log in again.')
  }
  const canRetry = !options.body || typeof options.body === 'string'
  if (canRetry) {
    const retryHeaders = { ...getAuthHeaders(), ...options.headers }
    res = await fetchWithTimeout(url, { ...options, headers: retryHeaders }, timeout)
  } else {
    throw new Error('Session expired. Please try again.')
  }
  return res
}

/**
 * Send transcript to voice pipeline. Returns { transcript, foods, nutrition }.
 */
export async function analyzeVoiceText(text) {
  const res = await fetchWithAuth(`${API_BASE}/api/voice-analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

/**
 * Analyze food image. Accepts File or Blob. Returns { labels, nutrition }.
 */
export async function analyzeImage(imageFile) {
  const form = new FormData()
  form.append('image', imageFile)
  const res = await fetchWithAuth(`${API_BASE}/api/analyze-image`, {
    method: 'POST',
    headers: {},
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

/**
 * Look up product by barcode. Returns Product (fat, salt, sugars, etc.).
 */
export async function scanBarcode(barcode) {
  const res = await fetchWithAuth(`${API_BASE}/api/scan-barcode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ barcode: String(barcode).trim() }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

function getAuthHeaders() {
  const token = localStorage.getItem('olyvia_access')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function register({ email, password, password_confirm, full_name = '' }) {
  const res = await fetchWithTimeout(`${API_BASE}/api/auth/register/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password, password_confirm, full_name: full_name.trim() }),
  }, 15000)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err.email?.[0] || err.password?.[0] || err.password_confirm?.[0] || err.detail || res.statusText
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return res.json()
}

export async function login({ email, password }) {
  const res = await fetchWithTimeout(`${API_BASE}/api/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  }, 15000)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export async function logout() {
  const refresh = localStorage.getItem('olyvia_refresh')
  if (refresh) {
    try {
      await fetch(`${API_BASE}/api/auth/logout/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ refresh }),
      })
    } catch (_) {}
  }
  localStorage.removeItem('olyvia_access')
  localStorage.removeItem('olyvia_refresh')
}

/**
 * Fetch aggregated nutrition from FoodLog for today (or ?date=YYYY-MM-DD).
 * Returns { fats, sodium, sugars, carbs }. Requires auth.
 */
export async function fetchNutritionSummary(dateStr = null) {
  const url = dateStr
    ? `${API_BASE}/api/auth/nutrition-summary/?date=${dateStr}`
    : `${API_BASE}/api/auth/nutrition-summary/`
  const res = await fetchWithAuth(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  }, AUTH_TIMEOUT_MS)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

/**
 * Fetch food log history. Returns { items: [{ id, food_name, source, logged_at, image_url, nutrients }] }.
 */
export async function fetchFoodLog(limit = 50, dateStr = null) {
  let url = `${API_BASE}/api/auth/food-log/?limit=${limit}`
  if (dateStr) url += `&date=${dateStr}`
  const res = await fetchWithAuth(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  }, AUTH_TIMEOUT_MS)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

/**
 * Fetch full stats dashboard: today summary, health risk, trends, insights.
 */
export async function fetchStatsDashboard(dateStr = null) {
  const url = dateStr
    ? `${API_BASE}/api/auth/stats-dashboard/?date=${dateStr}`
    : `${API_BASE}/api/auth/stats-dashboard/`
  const res = await fetchWithAuth(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  }, AUTH_TIMEOUT_MS)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

/**
 * Fix food results: send title, nutrients, and user correction.
 * Optional food_log_id: when provided, backend updates the FoodLog entry.
 * Returns updated item with new title, nutrients, and verdict.
 */
export async function fixFoodResults(title, nutrients, userFix, foodLogId = null) {
  const body = { title, nutrients, user_fix: userFix }
  if (foodLogId != null) body.food_log_id = foodLogId
  const res = await fetchWithAuth(`${API_BASE}/api/auth/fix-food-results/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export async function fetchMe() {
  const res = await fetchWithAuth(`${API_BASE}/api/auth/me/`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  }, 15000)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export async function updateProfile(data) {
  const res = await fetchWithAuth(`${API_BASE}/api/auth/me/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, 15000)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

/**
 * Upload profile picture. Accepts File (image). Returns { profile_has_avatar: true }.
 */
export async function uploadProfilePicture(file) {
  const form = new FormData()
  form.append('avatar', file)
  const res = await fetchWithAuth(`${API_BASE}/api/auth/me/avatar/upload/`, {
    method: 'POST',
    headers: {},
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

/**
 * Fetch profile avatar as blob URL (for img src). Returns blob URL or null.
 */
export async function fetchProfileAvatarUrl() {
  const res = await fetchWithAuth(`${API_BASE}/api/auth/me/avatar/`, {
    method: 'GET',
    headers: {},
  })
  if (!res.ok) return null
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export function storeTokens(tokens) {
  if (tokens?.access) localStorage.setItem('olyvia_access', tokens.access)
  if (tokens?.refresh) localStorage.setItem('olyvia_refresh', tokens.refresh)
}
