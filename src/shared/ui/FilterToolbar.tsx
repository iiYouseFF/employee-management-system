import { DATE_PRESETS, type DatePreset } from '@/shared/lib/datePresets'
import type { ReactNode } from 'react'

interface FilterToolbarProps {
  search?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  preset?: DatePreset
  onPresetChange?: (preset: DatePreset) => void
  from?: string
  to?: string
  onFromChange?: (value: string) => void
  onToChange?: (value: string) => void
  children?: ReactNode
  onReset?: () => void
  hasActiveFilters?: boolean
}

export default function FilterToolbar({
  search, onSearchChange, searchPlaceholder = 'بحث...',
  preset, onPresetChange, from, to, onFromChange, onToChange,
  children, onReset, hasActiveFilters,
}: FilterToolbarProps) {
  return (
    <div className="app-card p-3 sm:p-4 space-y-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {onSearchChange && (
            <div className="relative w-full sm:w-72">
              <input
                type="search"
                value={search || ''}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="app-input ps-9"
              />
              <svg className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z"/></svg>
            </div>
          )}
          {onPresetChange && preset && (
            <div className="flex flex-wrap items-center gap-1.5">
              {DATE_PRESETS.map((p) => (
                <button key={p.id} type="button" onClick={() => onPresetChange(p.id)}
                  className={`app-filter-chip ${preset === p.id ? 'app-filter-chip-active' : ''}`}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
          {(onFromChange || onToChange) && (
            <div className="flex items-center gap-2">
              {onFromChange && <input type="date" value={from || ''} onChange={(e) => onFromChange(e.target.value)} className="app-input w-full sm:w-40" aria-label="من تاريخ" />}
              <span className="text-slate-400 text-xs">—</span>
              {onToChange && <input type="date" value={to || ''} onChange={(e) => onToChange(e.target.value)} className="app-input w-full sm:w-40" aria-label="إلى تاريخ" />}
            </div>
          )}
          {children}
        </div>
        {hasActiveFilters && onReset && (
          <button type="button" onClick={onReset} className="app-btn app-btn-ghost app-btn-sm text-slate-600 self-start xl:self-auto">
            مسح الفلاتر
          </button>
        )}
      </div>
    </div>
  )
}
