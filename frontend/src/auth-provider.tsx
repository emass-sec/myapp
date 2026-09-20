import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import * as api from '@/api'
import type { Credentials, User } from '@/api'
import { AuthContext } from '@/auth-context'
import type { AuthState } from '@/auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    api
      .getMe()
      .then(setUser)
      .catch(() => setUser(null))
  }, [])

  const login = useCallback(async (c: Credentials) => setUser(await api.login(c)), [])
  const signup = useCallback(async (c: Credentials) => setUser(await api.signup(c)), [])
  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }, [])
  const clear = useCallback(() => setUser(null), [])

  const value = useMemo<AuthState>(
    () => ({ user, login, signup, logout, clear }),
    [user, login, signup, logout, clear],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
