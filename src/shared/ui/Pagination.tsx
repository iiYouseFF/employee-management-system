import { useMemo } from 'react'

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 15, 25, 50],
}: PaginationProps) {
  const pages = useMemo(() => {
    const list: (number | string)[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) list.push(i)
    } else {
      list.push(1)
      if (currentPage > 3) list.push('...')
      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)
      for (let i = start; i <= end; i++) list.push(i)
      if (currentPage < totalPages - 2) list.push('...')
      list.push(totalPages)
    }
    return list
  }, [currentPage, totalPages])

  if (totalItems === 0) return null

  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  return (
    <div
      className="flex flex-col sm:flex-row items-center justify-between gap-3 py-3 px-2 border-t border-slate-200 text-xs text-slate-600 select-none"
      dir="rtl"
    >
      {/* Items count & page size selector */}
      <div className="flex items-center gap-2">
        <span>
          عرض <span className="font-bold font-mono">{startItem}</span> - <span className="font-bold font-mono">{endItem}</span> من إجمالي{' '}
          <span className="font-bold font-mono text-primary-900">{totalItems}</span>
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-1 ms-2">
            <span className="text-slate-400">لكل صفحة:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value))
                onPageChange(1)
              }}
              className="py-1 px-2 border border-slate-300 rounded-lg bg-white text-xs font-semibold focus:outline-none focus:border-primary-500"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Page navigation buttons */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-xs transition-colors"
            title="الصفحة السابقة"
          >
            السابق
          </button>

          <div className="flex items-center gap-1">
            {pages.map((p, idx) => {
              if (p === '...') {
                return (
                  <span key={`dots-${idx}`} className="px-2 py-1 text-slate-400">
                    ...
                  </span>
                )
              }
              const pageNum = Number(p)
              const isActive = pageNum === currentPage
              return (
                <button
                  key={`page-${pageNum}`}
                  type="button"
                  onClick={() => onPageChange(pageNum)}
                  className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold font-mono transition-colors ${
                    isActive
                      ? 'bg-primary-700 text-white shadow-sm'
                      : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  {pageNum}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-xs transition-colors"
            title="الصفحة التالية"
          >
            التالي
          </button>
        </div>
      )}
    </div>
  )
}
