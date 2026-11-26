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
      <div className="app-card p-5 space-y-3" aria-busy="true" aria-label="جاري التحميل">
        <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
          <div className="h-5 w-36 skeleton" />
          <div className="h-5 w-24 skeleton" />
          <div className="h-5 w-28 skeleton ms-auto" />
        </div>
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="grid grid-cols-4 gap-3 py-2">
            <div className="h-4 skeleton" />
            <div className="h-4 skeleton" />
            <div className="h-4 skeleton" />
            <div className="h-4 skeleton" />
          </div>
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <div role="alert" className="app-card p-6 text-center text-rose-800 bg-rose-50/60 border-rose-200 text-sm font-bold flex flex-col items-center gap-2">
        <svg aria-hidden="true" className="w-7 h-7 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        <span>{error}</span>
      </div>
    )
  }
  if (!hasData) {
    return (
      <div className="app-card p-10 text-center text-slate-600 text-sm font-semibold flex flex-col items-center gap-2 border-dashed bg-slate-50/40">
        {empty || (
          <>
            <svg aria-hidden="true" className="w-9 h-9 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
            <span>لا توجد بيانات للعرض</span>
          </>
        )}
      </div>
    )
  }
  return (
    <>
      {cards ? <div className="md:hidden space-y-3">{cards}</div> : null}
      <div className={cards ? 'hidden md:block' : 'block'}>{table}</div>
      {footer}
    </>
  )
}
