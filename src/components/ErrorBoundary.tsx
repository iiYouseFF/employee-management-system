import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.warn('Unhandled render error', error, info.componentStack)
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-page-bg" dir="rtl">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-8 shadow-card">
          <h1 className="text-xl font-bold text-ink mb-2">حدث خطأ غير متوقع</h1>
          <p className="text-sm text-muted mb-6">
            تعذّر عرض الصفحة. جرّب إعادة التحميل، وإذا استمرت المشكلة فأبلغ مدير النظام.
          </p>
          {import.meta.env.DEV && (
            <pre className="mb-6 max-h-40 overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-danger whitespace-pre-wrap">
              {error.message}
            </pre>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-600"
            >
              إعادة تحميل الصفحة
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/'
              }}
              className="rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-slate-50"
            >
              العودة للرئيسية
            </button>
          </div>
        </div>
      </div>
    )
  }
}
