import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '@/auth-context'
import { AuthForm } from '@/components/auth-form'
import { Callout } from '@/components/callout'
import { ThemeToggle } from '@/components/theme-toggle'
import { Skeleton } from '@/components/ui/skeleton'
import { useSignupMode } from '@/hooks/use-signup-mode'
import type { Theme } from '@/hooks/use-theme'

interface Props {
  theme: Theme
  onToggleTheme: () => void
}

/** Where to go after authenticating: the page that bounced us to /login, or home. */
function useReturnTo(): string {
  const state = useLocation().state as { from?: string } | null
  const from = state?.from
  // Only allow same-app paths.
  return from && from.startsWith('/') && !from.startsWith('//') ? from : '/'
}

export function LoginPage(props: Props) {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const returnTo = useReturnTo()
  const mode = useSignupMode()
  if (user) return <Navigate to={returnTo} replace />
  return (
    <AuthForm
      mode="login"
      hideSignupLink={mode === 'closed'}
      {...props}
      onSubmit={async (c) => {
        await login(c)
        void navigate(returnTo, { replace: true })
      }}
    />
  )
}

export function SignupPage({ theme, onToggleTheme }: Props) {
  const { user, signup } = useAuth()
  const navigate = useNavigate()
  const returnTo = useReturnTo()
  const mode = useSignupMode()
  // Invite links look like /signup?invite=XXXX-XXXX; pre-fill the code from them.
  const [params] = useSearchParams()
  const invite = params.get('invite') ?? ''

  if (user) return <Navigate to={returnTo} replace />

  if (mode === null || mode === 'closed') {
    return (
      <div className="relative flex min-h-screen items-center justify-center px-4">
        <div className="absolute right-4 top-4">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
        <div className="w-full max-w-sm space-y-4">
          {mode === null ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <Callout variant="warning" title="Signups are closed">
              New accounts can’t be created right now.{' '}
              <Link to="/login" className="font-medium underline underline-offset-4">
                Log in
              </Link>{' '}
              if you already have one.
            </Callout>
          )}
        </div>
      </div>
    )
  }

  return (
    <AuthForm
      mode="signup"
      showInvite={mode === 'invite'}
      initialInvite={invite}
      theme={theme}
      onToggleTheme={onToggleTheme}
      onSubmit={async (c) => {
        await signup(c)
        void navigate(returnTo, { replace: true })
      }}
    />
  )
}
