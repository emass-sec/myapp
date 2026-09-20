import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from '@/auth-provider'
import { ProtectedRoute } from '@/components/protected-route'
import { Toaster } from '@/components/ui/sonner'
import { useTheme } from '@/hooks/use-theme'
import { LoginPage, SignupPage } from '@/pages/auth-pages'
import NotesPage from '@/pages/notes-page'

export default function App() {
  const { theme, toggle } = useTheme()

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage theme={theme} onToggleTheme={toggle} />} />
          <Route path="/signup" element={<SignupPage theme={theme} onToggleTheme={toggle} />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<NotesPage theme={theme} onToggleTheme={toggle} />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster theme={theme} position="bottom-right" />
      </AuthProvider>
    </BrowserRouter>
  )
}
