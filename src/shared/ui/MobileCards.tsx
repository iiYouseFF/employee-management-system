import type { ReactNode } from 'react'
export function MobileCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`app-card p-4 space-y-3 ${className}`}>{children}</div>
}
export function MobileCardRow({ label, value, className = '' }: { label: ReactNode; value: ReactNode; className?: string }) {
  return <div className={`flex items-start justify-between gap-3 text-sm ${className}`}><span className="text-slate-500 shrink-0">{label}</span><span className="font-semibold text-slate-900 text-end">{value}</span></div>
}
export function MobileCardsGrid({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>
}
