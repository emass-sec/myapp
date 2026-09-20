import { useEffect, useState } from 'react'
import { getAuthConfig } from '@/api'
import type { SignupMode } from '@/api'

/** The server's signup mode, or null while loading. Falls back to 'invite' if it can't be read. */
export function useSignupMode(): SignupMode | null {
  const [mode, setMode] = useState<SignupMode | null>(null)
  useEffect(() => {
    getAuthConfig()
      .then((c) => setMode(c.signup_mode))
      .catch(() => setMode('invite'))
  }, [])
  return mode
}
