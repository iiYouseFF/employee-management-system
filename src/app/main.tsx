import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/shared/lib/query'
import App from '@/app/App'
import ErrorBoundary from '@/app/ErrorBoundary'
import { QuickActionProvider } from '@/app/QuickActionContext'

import '@/styles/index.css'

// Lightweight QA override: ?dir=ltr renders the entire RTL UI in LTR for visual checks.
const qaDir = new URLSearchParams(window.location.search).get('dir')
if (qaDir === 'ltr' || qaDir === 'rtl') document.documentElement.dir = qaDir

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <QuickActionProvider>
            <App />
          </QuickActionProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
