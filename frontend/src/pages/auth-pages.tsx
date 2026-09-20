import { Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '@/auth-context'
import { AuthForm } from '@/components/auth-form'
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
  if (user) return <Navigate to={returnTo} replace />
  return (
    <AuthForm
      mode="login"
      {...props}
      onSubmit={async (c) => {
        await login(c)
        void navigate(returnTo, { replace: true })
      }}
    />
  )
}

export function SignupPage(props: Props) {
  const { user, signup } = useAuth()
  const navigate = useNavigate()
  const returnTo = useReturnTo()
  if (user) return <Navigate to={returnTo} replace />
  return (
    <AuthForm
      mode="signup"
      {...props}
      onSubmit={async (c) => {
        await signup(c)
        void navigate(returnTo, { replace: true })
      }}
    />
  )
}
