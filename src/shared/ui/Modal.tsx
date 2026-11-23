import { useEffect, useId, type ReactNode } from 'react'

const modalStack: string[] = []

interface ModalProps {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  /** Use wide/full for data-heavy modals (tables, invoice editors, statements). */
  wide?: boolean
  size?: 'default' | 'full'
  overlayClassName?: string
}

export default function Modal({
  title,
  subtitle,
  children,
  footer,
  onClose,
  wide = false,
  size = 'default',
  overlayClassName,
}: ModalProps) {
  const isFull = wide || size === 'full'
  const id = useId()

  useEffect(() => {
    modalStack.push(id)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === id) {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      const idx = modalStack.lastIndexOf(id)
      if (idx >= 0) modalStack.splice(idx, 1)
      document.removeEventListener('keydown', onKey)
      if (modalStack.length === 0) document.body.style.overflow = prev
    }
  }, [id, onClose])

  const panelClass = isFull
    ? 'bg-white rounded-2xl border border-slate-200/80 shadow-modal w-full max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)] md:w-[95vw] md:max-w-[1600px] h-auto max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] md:h-[92vh] md:max-h-[92vh] my-auto overflow-hidden animate-scale-in flex flex-col'
    : 'bg-white rounded-2xl border border-slate-200/80 shadow-modal w-full max-w-[calc(100vw-1rem)] sm:max-w-xl md:max-w-2xl h-auto max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] my-auto overflow-hidden animate-scale-in flex flex-col'

  return (
    <div
      className={overlayClassName || "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 md:p-6 animate-fade-in"}
      dir="rtl"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={panelClass} role="dialog" aria-modal="true">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/95 px-4 sm:px-6 py-4 backdrop-blur-sm">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-800 leading-6">{title}</h2>
            {subtitle && <p className="mt-1 text-xs text-slate-500 leading-5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            aria-label="إغلاق"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2.5 border-t border-slate-100 px-4 sm:px-6 py-4 bg-slate-50/95 backdrop-blur-sm">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
