import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: ReactNode
  count?: ReactNode
  actions?: ReactNode
}

export default function PageHeader({ title, subtitle, count, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="app-page-title">{title}</h2>
          {count !== undefined && count !== null && count !== '' && (
            <span className="inline-flex items-center rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--primary)] border border-[var(--primary)]/10 tabular-nums">
              {count}
            </span>
          )}
        </div>
        {subtitle && <p className="app-page-subtitle mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
