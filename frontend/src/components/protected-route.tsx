import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/auth-context'
import { Skeleton } from '@/components/ui/skeleton'

/** Renders child routes only when signed in; otherwise redirects to /login and remembers where. */
export function ProtectedRoute() {
  const { user } = useAuth()
  const location = useLocation()

  if (user === undefined) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-16">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }
  if (user === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}
