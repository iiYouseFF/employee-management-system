import './lib/recoveryMode'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/query'
import Login from './pages/Login'
import Sheet from './pages/Sheet'
import { useAuth } from './hooks/useAuth'
import { isRecoveryPending } from './lib/recoveryMode'
import './index.css'

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">جاري التحميل...</div>
  }

  const recovering = isRecoveryPending()

  return (
    <Routes>
      <Route path="/login" element={!user || recovering ? <Login /> : <Navigate to="/" replace />} />
      <Route path="/" element={user && !recovering ? <Sheet /> : <Navigate to="/login" replace />} />
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
