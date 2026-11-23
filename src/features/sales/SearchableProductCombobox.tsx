import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { Product } from '@/features/products/useProducts'
import { formatNumber } from '@/shared/lib/format'

interface SearchableProductComboboxProps {
  products: Product[]
  stockMap: Record<string, number>
  value: string
  onChange: (productId: string) => void
  disabled?: boolean
}

export default function SearchableProductCombobox({
  products,
  stockMap,
  value,
  onChange,
  disabled = false,
}: SearchableProductComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === value),
    [products, value]
  )

  // Filtered products list
  const filtered = useMemo(() => {
    if (!search.trim()) return products.filter((p) => p.is_active)
    const q = search.toLowerCase()
    return products.filter(
      (p) =>
        p.is_active &&
        (p.name_ar.toLowerCase().includes(q) ||
          (p.name_en && p.name_en.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q)))
    )
  }, [products, search])

  // Close on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  useEffect(() => {
    if (!open) return

    const updatePosition = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const menuWidth = Math.min(Math.max(rect.width, 320), 420)
      const viewportPadding = 12
      const left = Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - menuWidth - viewportPadding)
      )
      setMenuStyle({
        top: rect.bottom + 6,
        left,
        width: menuWidth,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative w-full text-xs" dir="rtl">
      {/* Trigger Button or Display */}
      {disabled ? (
        <div className="py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold truncate">
          {selectedProduct?.name_ar || '—'}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setOpen((prev) => !prev)
            if (!open) {
              setSearch('')
              setTimeout(() => inputRef.current?.focus(), 50)
            }
          }}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-start transition-all ${
            open
              ? 'border-blue-500 ring-2 ring-blue-500/10 bg-white'
              : 'border-slate-300 hover:border-slate-400 bg-white'
          }`}
        >
          <span className={`truncate ${selectedProduct ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>
            {selectedProduct ? (
              <>
                <span>{selectedProduct.name_ar}</span>
                {selectedProduct.sku && (
                  <span className="text-[10px] text-slate-400 ms-1 font-mono">({selectedProduct.sku})</span>
                )}
              </>
            ) : (
              '— ابحث عن صنف أو اختر —'
            )}
          </span>
          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0 ms-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Floating Popover Search Dropdown */}
      {open && !disabled && menuStyle && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: menuStyle.top, left: menuStyle.left, width: menuStyle.width, zIndex: 1200 }}
            className="bg-white rounded-2xl shadow-modal border border-slate-200 py-2 animate-scale-in"
            dir="rtl"
          >
            {/* Search field */}
            <div className="px-2.5 pb-2 border-b border-slate-100">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="اكتب اسم الصنف أو الكود..."
                  className="app-input py-1.5 px-3 text-xs w-full"
                  dir="rtl"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Product Items List */}
            <div className="max-h-64 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="py-4 text-center text-slate-400 text-xs">
                  لا توجد نتائج مطابقة لـ "{search}"
                </div>
              ) : (
                filtered.map((prod) => {
                  const isSelected = prod.id === value
                  const onHand = stockMap[prod.id] ?? 0
                  const isLow = onHand <= 0

                  return (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => {
                        onChange(prod.id)
                        setOpen(false)
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-start transition-colors ${
                        isSelected
                          ? 'bg-blue-50 text-blue-900 font-bold'
                          : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="flex-1 truncate pe-2">
                        <div className="truncate text-xs">{prod.name_ar}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          {prod.sku && <span className="font-mono bg-slate-100 px-1 rounded">{prod.sku}</span>}
                          {prod.category && <span>{prod.category}</span>}
                        </div>
                      </div>

                      <div className="text-end shrink-0">
                        <div className="font-mono font-bold text-xs text-slate-900 tabular-nums">
                          {formatNumber(prod.price)} <span className="text-[10px] font-normal text-slate-500">ج.م</span>
                        </div>
                        <div
                          className={`text-[10px] font-bold font-mono tabular-nums ${
                            isLow ? 'text-red-700' : onHand < 10 ? 'text-amber-800' : 'text-emerald-700'
                          }`}
                        >
                          متاح: {formatNumber(onHand)} {prod.unit || ''}
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
