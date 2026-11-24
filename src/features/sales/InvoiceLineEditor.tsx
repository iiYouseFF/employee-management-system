import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Product } from '@/features/products/useProducts'
import { formatNumber } from '@/shared/lib/format'
import SearchableSelect from '@/shared/ui/SearchableSelect'
import { toSearchableOptions } from '@/shared/ui/searchableSelectUtils'
import { isEmptyPlaceholderInvoiceLine } from '@/features/sales/invoiceLineUtils'

export interface LineItem {
  /** temporary client-side key */
  _key: string
  product_id: string
  product_name: string
  unit: string
  unit_price: number
  qty: number
  line_total: number
  /** on-hand stock for this product — shown as hint */
  on_hand?: number
}

interface InvoiceLineEditorProps {
  products: Product[]
  /** on_hand per product_id from useProductStock */
  stockMap: Record<string, number>
  initialLines?: LineItem[]
  onChange: (lines: LineItem[]) => void
  disabled?: boolean
  onOpenBulkMatrix?: () => void
}

function makeKey() {
  return Math.random().toString(36).slice(2)
}

function createEmptyInvoiceLine(): LineItem {
  return {
    _key: makeKey(),
    product_id: '',
    product_name: '',
    unit: '',
    unit_price: 0,
    qty: 1,
    line_total: 0,
  }
}

function isMeaningfulInvoiceLine(line: LineItem): boolean {
  return Boolean(line.product_id) && Number(line.qty) > 0
}

export default function InvoiceLineEditor({
  products,
  stockMap,
  initialLines,
  onChange,
  disabled = false,
  onOpenBulkMatrix,
}: InvoiceLineEditorProps) {
  const [lines, setLines] = useState<LineItem[]>(() =>
    initialLines && initialLines.length > 0 ? initialLines : [createEmptyInvoiceLine()]
  )
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const pendingFocusKey = useRef<string | null>(null)

  useEffect(() => {
    if (initialLines && initialLines.length > 0) {
      setLines((prev) => {
        if (prev.length !== initialLines.length) return initialLines
        const isSame = prev.every(
          (p, idx) =>
            p._key === initialLines[idx]._key &&
            p.product_id === initialLines[idx].product_id &&
            p.qty === initialLines[idx].qty &&
            p.unit_price === initialLines[idx].unit_price
        )
        return isSame ? prev : initialLines
      })
    }
  }, [initialLines])

  useEffect(() => {
    const key = pendingFocusKey.current
    if (!key) return
    const el = qtyRefs.current[key]
    if (el) {
      el.focus()
      el.select()
      pendingFocusKey.current = null
    }
  }, [lines])

  const notify = useCallback(
    (next: LineItem[]) => {
      setLines(next)
      onChange(next)
    },
    [onChange]
  )

  const setField = (key: string, field: keyof LineItem, value: unknown) => {
    const idx = lines.findIndex((line) => line._key === key)
    if (idx === -1) return

    const next = lines.map((line) => {
      if (line._key !== key) return line
      const updated = { ...line, [field]: value }

      if (field === 'product_id') {
        const prod = products.find((p) => p.id === value)
        if (prod) {
          updated.product_name = prod.name_ar
          updated.unit = prod.unit ?? ''
          updated.unit_price = Number(prod.price) || 0
          updated.on_hand = stockMap[prod.id] ?? 0
        } else {
          updated.product_name = ''
          updated.unit = ''
          updated.unit_price = 0
          updated.on_hand = 0
        }
      }

      updated.line_total = (Number(updated.qty) || 0) * (Number(updated.unit_price) || 0)
      return updated
    })

    if (field === 'product_id' && value && idx === next.length - 1) {
      next.push(createEmptyInvoiceLine())
      pendingFocusKey.current = key
    }

    notify(next)
  }

  const addLine = () => {
    const next = [...lines, createEmptyInvoiceLine()]
    notify(next)
  }

  const removeLine = (key: string) => {
    const next = lines.filter((l) => l._key !== key)
    notify(next.length ? next : [createEmptyInvoiceLine()])
  }

  const meaningfulLines = useMemo(() => lines.filter(isMeaningfulInvoiceLine), [lines])
  const grandTotal = meaningfulLines.reduce((s, l) => s + (l.line_total || 0), 0)
  const hasInvalidLine = lines.some((l) => l.product_id && Number(l.qty) <= 0)
  const hasEmptySelected = lines.some((l) => !l.product_id && !isEmptyPlaceholderInvoiceLine(l))

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">أصناف الفاتورة</span>
          <p className="text-[11px] text-slate-500 mt-0.5">اختيار المنتج في آخر سطر يضيف سطراً جديداً تلقائياً لتسريع الإدخال.</p>
        </div>
        {!disabled && (
          <div className="flex items-center gap-2 flex-wrap">
            {onOpenBulkMatrix && (
              <button
                type="button"
                onClick={onOpenBulkMatrix}
                className="app-btn app-btn-ghost text-xs py-1.5 px-3 text-emerald-700 hover:text-emerald-900 border-emerald-300 hover:border-emerald-400 bg-emerald-50/50 font-bold"
              >
                + إضافة أصناف متعددة (Matrix)
              </button>
            )}
            <button
              type="button"
              onClick={addLine}
              className="app-btn app-btn-ghost text-xs py-1.5 px-3 text-primary-700 hover:text-primary-900 border-primary-200 hover:border-primary-400"
            >
              + صنف مفرد
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {lines.map((line, index) => {
          const onHand = line.on_hand ?? stockMap[line.product_id] ?? 0
          const qty = Number(line.qty) || 0
          const selected = Boolean(line.product_id)
          const insufficient = selected && qty > onHand
          const outOfStock = selected && onHand <= 0
          const lowStock = selected && !outOfStock && (insufficient || onHand <= 5)

          const rowTone = outOfStock
            ? 'border-red-300 bg-red-50/70'
            : insufficient || lowStock
              ? 'border-amber-300 bg-amber-50/70'
              : 'border-slate-200 bg-white'

          return (
            <div key={line._key} className={`rounded-xl border px-2.5 py-2 shadow-sm ${rowTone}`}>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="w-8 shrink-0 text-center text-[11px] font-bold text-slate-500 tabular-nums pt-0.5 md:pt-0">
                  {index + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <SearchableSelect
                    options={toSearchableOptions(products.filter((p) => p.is_active))}
                    value={line.product_id}
                    onChange={(id) => setField(line._key, 'product_id', id)}
                    disabled={disabled}
                    clearable={false}
                    placeholder="— اختر منتجاً —"
                    searchPlaceholder="ابحث باسم المنتج أو SKU..."
                    renderOption={(option) => (
                      <span className="flex items-center justify-between gap-2 w-full">
                        <span className="truncate text-xs">{option.label}</span>
                        <span className="text-[10px] text-slate-500 shrink-0">
                          المتوفر: {formatNumber(stockMap[option.value] ?? 0)}
                        </span>
                      </span>
                    )}
                  />
                </div>

                <div className="w-full md:w-24 shrink-0">
                  {disabled ? (
                    <div className="app-input !py-1.5 !min-h-0 h-9 text-center font-mono text-xs tabular-nums bg-slate-50">
                      {formatNumber(line.qty)}
                    </div>
                  ) : (
                    <input
                      ref={(el) => { qtyRefs.current[line._key] = el }}
                      type="number"
                      min={0.001}
                      step="any"
                      value={line.qty}
                      onChange={(e) => setField(line._key, 'qty', parseFloat(e.target.value) || 0)}
                      className="app-input !py-1.5 !min-h-0 h-9 text-center font-mono text-xs tabular-nums w-full"
                      dir="ltr"
                      inputMode="decimal"
                      placeholder="الكمية"
                      aria-label={`الكمية للسطر ${index + 1}`}
                    />
                  )}
                </div>

                <div className="w-full md:w-28 shrink-0">
                  {disabled ? (
                    <div className="app-input !py-1.5 !min-h-0 h-9 text-center font-mono text-xs tabular-nums bg-slate-50">
                      {formatNumber(line.unit_price)}
                    </div>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={line.unit_price}
                      onChange={(e) => setField(line._key, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="app-input !py-1.5 !min-h-0 h-9 text-center font-mono text-xs tabular-nums w-full"
                      dir="ltr"
                      inputMode="decimal"
                      placeholder="السعر"
                      aria-label={`سعر الوحدة للسطر ${index + 1}`}
                    />
                  )}
                </div>

                <div className="w-full md:w-56 shrink-0">
                  {selected ? (
                    <div className="h-9 px-2 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between gap-2 overflow-hidden">
                      <span
                        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums truncate ${
                          outOfStock
                            ? 'bg-red-100 text-red-950 border-red-400'
                            : insufficient || lowStock
                              ? 'bg-amber-100 text-amber-950 border-amber-400'
                              : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        }`}
                        title={outOfStock ? 'غير متوفر بالمخزون' : insufficient ? `الكمية تتجاوز المتاح (${formatNumber(onHand)})` : `المتاح: ${formatNumber(onHand)} ${line.unit || ''}`}
                      >
                        {outOfStock
                          ? `نفد (0)`
                          : insufficient
                            ? `يتجاوز (${formatNumber(onHand)})`
                            : `متاح ${formatNumber(onHand)}`}
                      </span>
                      <span className="font-mono text-xs font-extrabold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatNumber(line.line_total)}
                      </span>
                    </div>
                  ) : (
                    <div className="h-9 px-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 flex items-center text-[11px] text-slate-400">
                      المخزون / الإجمالي
                    </div>
                  )}
                </div>

                <div className="w-9 shrink-0 flex justify-end md:justify-center">
                  {!disabled ? (
                    <button
                      type="button"
                      onClick={() => removeLine(line._key)}
                      className="h-8 w-8 text-slate-400 hover:text-rose-600 transition-colors rounded-lg hover:bg-rose-50 inline-flex items-center justify-center"
                      title="حذف السطر"
                      aria-label={`حذف السطر ${index + 1}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ) : (
                    <span className="h-8 w-8" />
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="sticky bottom-0 z-10 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-medium">
          <span>عدد الأصناف: <span className="font-bold tabular-nums text-slate-900">{meaningfulLines.length}</span></span>
          <span>إجمالي الكمية: <span className="font-bold tabular-nums text-slate-900">{formatNumber(meaningfulLines.reduce((s,l)=>s+(Number(l.qty)||0),0))}</span></span>
        </div>
        <div className="text-end">
          <span className="text-xs text-slate-500 font-medium">الإجمالي الكلي: </span>
          <span className="font-mono font-extrabold text-[var(--primary)] text-[18px] tabular-nums">
            {formatNumber(grandTotal)} ج.م
          </span>
        </div>
      </div>

      {!disabled && hasInvalidLine && (
        <p className="text-[11px] text-red-700 font-medium">
          يوجد سطر يحتوي على كمية غير صالحة. يرجى إدخال كمية أكبر من صفر.
        </p>
      )}
      {!disabled && hasEmptySelected && (
        <p className="text-[11px] text-amber-700 font-medium">
          بعض الأسطر غير مكتملة — سيتم تجاهل الأسطر الفارغة عند الحفظ.
        </p>
      )}
    </div>
  )
}

