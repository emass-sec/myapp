import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import { Callout } from '@/components/callout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ThemeToggle } from '@/components/theme-toggle'
import type { Theme } from '@/hooks/use-theme'
import type { Credentials } from '@/api'

export const PASSWORD_MIN = 6
export const PASSWORD_MAX = 128

interface Props {
  mode: 'login' | 'signup'
  /** Signup only: show a required invite code field, pre-filled with `initialInvite`. */
  showInvite?: boolean
  initialInvite?: string
  /** Login only: hide the "create an account" link (signups are closed). */
  hideSignupLink?: boolean
  theme: Theme
  onToggleTheme: () => void
  onSubmit: (c: Credentials) => Promise<void>
}

export function AuthForm({
  mode,
  showInvite = false,
  initialInvite = '',
  hideSignupLink = false,
  theme,
  onToggleTheme,
  onSubmit,
}: Props) {
  const isSignup = mode === 'signup'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [invite, setInvite] = useState(initialInvite)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (isSignup && (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)) {
      setError(`Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters`)
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({
        username,
        password,
        ...(isSignup && showInvite ? { invite_code: invite.trim() } : {}),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  let footer: ReactNode
  if (isSignup) {
    footer = (
      <>
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
          Log in
        </Link>
      </>
    )
  } else if (hideSignupLink) {
    footer = <>Signups are currently closed.</>
  } else {
    footer = (
      <>
        New here?{' '}
        <Link to="/signup" className="font-medium text-foreground underline underline-offset-4">
          Create an account
        </Link>
      </>
    )
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <Card className="w-full max-w-sm shadow-lg shadow-black/20">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">{isSignup ? 'Create an account' : 'Log in'}</CardTitle>
          <CardDescription>
            {isSignup ? 'Pick a username and password. No email needed.' : 'Welcome back to Notes.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-4" noValidate>
            {isSignup && showInvite && (
              <div className="grid gap-2">
                <Label htmlFor="invite">Invite code</Label>
                <Input
                  id="invite"
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                  maxLength={64}
                  placeholder="XXXX-XXXX"
                  className="font-mono uppercase"
                />
                <p className="text-xs text-muted-foreground">
                  Signups are invite-only. Ask an admin for a code.
                </p>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                maxLength={50}
                autoFocus={!(isSignup && showInvite)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                required
                maxLength={PASSWORD_MAX}
                aria-describedby={isSignup ? 'password-hint' : undefined}
              />
              {isSignup && (
                <p id="password-hint" className="text-xs text-muted-foreground">
                  At least {PASSWORD_MIN} characters (max {PASSWORD_MAX}).
                </p>
              )}
            </div>
            {error && (
              <Callout variant="danger" title="Error">
                {error}
              </Callout>
            )}
            <Button
              type="submit"
              disabled={submitting || !username.trim() || !password || (isSignup && showInvite && !invite.trim())}
            >
              {isSignup ? 'Sign up' : 'Log in'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">{footer}</p>
        </CardContent>
      </Card>
    </div>
  )
}
