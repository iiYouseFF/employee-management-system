import { Routes, Route, Navigate } from 'react-router-dom'
import Login from '@/features/auth/Login'
import Sheet from '@/app/Sheet'
import { useAuth } from '@/features/auth/useAuth'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">جاري التحميل...</div>
  }

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
      <Route path="/" element={user ? <Sheet /> : <Navigate to="/login" replace />} />
    </Routes>
  )
}
