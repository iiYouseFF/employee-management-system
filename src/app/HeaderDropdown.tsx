import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface HeaderDropdownItem {
  id: string
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
}

interface HeaderDropdownProps {
  label: string
  icon: ReactNode
  items: HeaderDropdownItem[]
  className?: string
}

export default function HeaderDropdown({ label, icon, items, className = '' }: HeaderDropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (items.length === 0) return null

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="app-btn-header inline-flex items-center gap-1.5"
      >
        {icon}
        <span>{label}</span>
        <svg
          className={`h-3.5 w-3.5 opacity-80 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 mt-2 w-48 origin-top-end rounded-xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-xl ring-1 ring-black/5 z-50"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors text-start ${
                item.danger
                  ? 'text-rose-600 hover:bg-rose-50'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {item.icon && <span className="shrink-0 opacity-80">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
