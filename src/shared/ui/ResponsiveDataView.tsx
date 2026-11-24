import type { ReactNode } from 'react'

interface ResponsiveDataViewProps {
  table: ReactNode
  cards?: ReactNode
  loading?: boolean
  error?: ReactNode
  empty?: ReactNode
  hasData?: boolean
  footer?: ReactNode
}

export default function ResponsiveDataView({ table, cards, loading, error, empty, hasData, footer }: ResponsiveDataViewProps) {
  if (loading) {
    return (
      <div className="app-card p-8 flex flex-col items-center justify-center gap-3 text-slate-500">
        <div className="h-9 w-9 border-4 border-slate-200 border-t-[var(--primary)] rounded-full animate-spin" />
        <span className="text-sm font-semibold">جاري التحميل...</span>
      </div>
    )
  }
  if (error) {
    return <div className="app-card p-6 text-center text-rose-700 bg-rose-50/40 border-rose-200 text-sm font-medium">{error}</div>
  }
  if (!hasData) {
    return <div className="app-card p-8 text-center text-slate-500 text-sm font-medium">{empty || 'لا توجد بيانات'}</div>
  }
  return (
    <>
      {cards ? <div className="md:hidden space-y-3">{cards}</div> : null}
      <div className={cards ? 'hidden md:block' : 'block'}>{table}</div>
      {footer}
    </>
  )
}
