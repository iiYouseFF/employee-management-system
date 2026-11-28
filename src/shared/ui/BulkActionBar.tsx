interface BulkActionBarProps {
  count: number
  onPrint?: () => void
  onDelete?: () => void
  onClear: () => void
  printLabel?: string
  deleteLabel?: string
  busy?: boolean
}

/** Shared selection toolbar; renders nothing when no rows are selected. */
export function BulkActionBar({
  count,
  onPrint,
  onDelete,
  onClear,
  printLabel = 'طباعة المحدد',
  deleteLabel = 'حذف المحدد',
  busy = false,
}: BulkActionBarProps) {
  if (count === 0) return null

  return (
    <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--primary)]/25 bg-[var(--primary)]/5 px-4 py-2.5 shadow-sm backdrop-blur">
      <span className="text-sm font-bold text-[var(--primary)]">
        تم تحديد {count} {count === 1 ? 'سجل' : 'سجلات'} (الصفحة الحالية)
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {onPrint && (
          <button type="button" onClick={onPrint} disabled={busy} className="app-btn app-btn-sm app-btn-secondary">
            {busy ? 'جارٍ تجهيز الفواتير...' : printLabel}
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="app-btn app-btn-sm app-btn-ghost text-rose-600 hover:border-rose-300 hover:bg-rose-50"
          >
            {deleteLabel}
          </button>
        )}
        <button type="button" onClick={onClear} disabled={busy} className="app-btn app-btn-sm app-btn-ghost">
          إلغاء التحديد
        </button>
      </div>
    </div>
  )
}
