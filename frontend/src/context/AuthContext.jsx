import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { register as apiRegister, login as apiLogin, logout as apiLogout, fetchMe, storeTokens, setAuthErrorHandler, fetchProfileAvatarUrl } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const avatarUrlRef = useRef(null)

  const clearSession = useCallback(() => {
    if (avatarUrlRef.current) {
      URL.revokeObjectURL(avatarUrlRef.current)
      avatarUrlRef.current = null
    }
    setAvatarUrl(null)
    setUser(null)
    setProfile(null)
  }, [])

  useEffect(() => {
    setAuthErrorHandler(clearSession)
    return () => setAuthErrorHandler(null)
  }, [clearSession])

  const loadAvatar = useCallback(async (hasAvatar) => {
    if (!hasAvatar) {
      if (avatarUrlRef.current) {
        URL.revokeObjectURL(avatarUrlRef.current)
        avatarUrlRef.current = null
      }
      setAvatarUrl(null)
      return
    }
    try {
      const url = await fetchProfileAvatarUrl()
      if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current)
      avatarUrlRef.current = url
      setAvatarUrl(url)
    } catch {
      setAvatarUrl(null)
    }
  }, [])

  const loadSession = useCallback(async () => {
    const token = localStorage.getItem('olyvia_access')
    if (!token) {
      setLoading(false)
      return
    }
    try {
      const { user: u, profile: p } = await fetchMe()
      setUser(u)
      setProfile(p)
      loadAvatar(p?.profile_has_avatar)
    } catch {
      localStorage.removeItem('olyvia_access')
      localStorage.removeItem('olyvia_refresh')
    } finally {
      setLoading(false)
    }
  }, [loadAvatar])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  const register = useCallback(async (data) => {
    const res = await apiRegister(data)
    storeTokens(res.tokens)
    setUser(res.user)
    setProfile(res.profile ?? null)
    return res
  }, [])

  const login = useCallback(async (data) => {
    const res = await apiLogin(data)
    storeTokens(res.tokens)
    setUser(res.user)
    setProfile(res.profile ?? null)
    loadAvatar(res.profile?.profile_has_avatar)
    return res
  }, [loadAvatar])

  const logout = useCallback(async () => {
    await apiLogout()
    if (avatarUrlRef.current) {
      URL.revokeObjectURL(avatarUrlRef.current)
      avatarUrlRef.current = null
    }
    setAvatarUrl(null)
    setUser(null)
    setProfile(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    const token = localStorage.getItem('olyvia_access')
    if (!token) return
    const { user: u, profile: p } = await fetchMe()
    setUser(u)
    setProfile(p)
    loadAvatar(p?.profile_has_avatar)
  }, [loadAvatar])

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        avatarUrl,
        loading,
        isAuthenticated: !!user,
        register,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
