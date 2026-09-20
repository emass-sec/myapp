import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/auth-context'

/**
 * UX guard only: sends non-admins home. It is not a security boundary; every /admin API call
 * is authorized by the server, which returns 403 to non-admins.
 */
export function AdminRoute() {
  const { user } = useAuth()
  if (!user?.is_admin) return <Navigate to="/" replace />
  return <Outlet />
}
