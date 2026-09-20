import { createContext, useContext } from 'react'
import type { Credentials, User } from '@/api'

export interface AuthState {
  /** undefined while the initial /auth/me check is in flight. */
  user: User | null | undefined
  login: (c: Credentials) => Promise<void>
  signup: (c: Credentials) => Promise<void>
  logout: () => Promise<void>
  /** Drop the local user, e.g. after any request comes back 401. */
  clear: () => void
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
