import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'
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
  theme: Theme
  onToggleTheme: () => void
  onSubmit: (c: Credentials) => Promise<void>
}

export function AuthForm({ mode, theme, onToggleTheme, onSubmit }: Props) {
  const isSignup = mode === 'signup'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
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
      await onSubmit({ username, password })
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
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{isSignup ? 'Create an account' : 'Log in'}</CardTitle>
          <CardDescription>
            {isSignup ? 'Pick a username and password. No email needed.' : 'Welcome back to Notes.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                maxLength={50}
                autoFocus
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
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={submitting || !username.trim() || !password}>
              {isSignup ? 'Sign up' : 'Log in'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">{footer}</p>
        </CardContent>
      </Card>
    </div>
  )
}
