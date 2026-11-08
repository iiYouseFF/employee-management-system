import { useState, useCallback } from 'react'
import type { Product } from '../hooks/useProducts'
import { formatNumber } from '../lib/format'
import SearchableProductCombobox from './SearchableProductCombobox'

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
}

function makeKey() {
  return Math.random().toString(36).slice(2)
}

function emptyLine(): LineItem {
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

export default function InvoiceLineEditor({
  products,
  stockMap,
  initialLines,
  onChange,
  disabled = false,
}: InvoiceLineEditorProps) {
  const [lines, setLines] = useState<LineItem[]>(() =>
    initialLines && initialLines.length > 0 ? initialLines : [emptyLine()]
  )

  const notify = useCallback(
    (next: LineItem[]) => {
      setLines(next)
      onChange(next)
    },
    [onChange]
  )

  const setField = (key: string, field: keyof LineItem, value: unknown) => {
    const next = lines.map((line) => {
      if (line._key !== key) return line
      const updated = { ...line, [field]: value }

      // When product changes, fill price and unit from product list
      if (field === 'product_id') {
        const prod = products.find((p) => p.id === value)
        if (prod) {
          updated.product_name = prod.name_ar
          updated.unit = prod.unit ?? ''
          updated.unit_price = prod.price
          updated.on_hand = stockMap[prod.id] ?? 0
        } else {
          updated.product_name = ''
          updated.unit = ''
          updated.unit_price = 0
          updated.on_hand = 0
        }
      }

      updated.line_total =
        (Number(updated.qty) || 0) * (Number(updated.unit_price) || 0)
      return updated
    })
    notify(next)
  }

  const addLine = () => notify([...lines, emptyLine()])

  const removeLine = (key: string) => {
    const next = lines.filter((l) => l._key !== key)
    notify(next.length ? next : [emptyLine()])
  }

  const grandTotal = lines.reduce((s, l) => s + (l.line_total || 0), 0)

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
          أصناف الفاتورة
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={addLine}
            className="app-btn app-btn-ghost text-xs py-1 px-3 text-primary-700 hover:text-primary-900 border-primary-200 hover:border-primary-400"
          >
            + إضافة صنف
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-border">
            <tr>
              <th className="px-3 py-2.5 text-start font-bold text-slate-700 min-w-[160px]">
                المنتج
              </th>
              <th className="px-3 py-2.5 text-center font-bold text-slate-700 w-20">
                الكمية
              </th>
              <th className="px-3 py-2.5 text-center font-bold text-slate-700 w-24">
                سعر الوحدة
              </th>
              <th className="px-3 py-2.5 text-center font-bold text-slate-700 w-24">
                الإجمالي
              </th>
              {!disabled && (
                <th className="px-3 py-2.5 text-center w-10" />
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((line) => {
              const onHand = line.on_hand ?? stockMap[line.product_id] ?? 0
              const lowStock = line.product_id && onHand < line.qty
              return (
                <tr key={line._key} className={`group ${lowStock ? 'bg-amber-50' : 'bg-white'}`}>
                  {/* Product selector */}
                  <td className="px-2 py-1.5 min-w-[200px]">
                    <SearchableProductCombobox
                      products={products}
                      stockMap={stockMap}
                      value={line.product_id}
                      onChange={(id) => setField(line._key, 'product_id', id)}
                      disabled={disabled}
                    />
                  </td>

                  {/* Qty */}
                  <td className="px-2 py-1.5">
                    {disabled ? (
                      <span className="font-mono text-slate-800 block text-center">
                        {line.qty} {line.unit}
                      </span>
                    ) : (
                      <input
                        type="number"
                        min={0.001}
                        step="any"
                        value={line.qty}
                        onChange={(e) => setField(line._key, 'qty', parseFloat(e.target.value) || 0)}
                        className="app-input py-1.5 text-center font-mono text-xs w-full"
                        dir="ltr"
                      />
                    )}
                  </td>

                  {/* Unit price */}
                  <td className="px-2 py-1.5">
                    {disabled ? (
                      <span className="font-mono text-slate-800 block text-center">
                        {formatNumber(line.unit_price)}
                      </span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={line.unit_price}
                        onChange={(e) => setField(line._key, 'unit_price', parseFloat(e.target.value) || 0)}
                        className="app-input py-1.5 text-center font-mono text-xs w-full"
                        dir="ltr"
                      />
                    )}
                  </td>

                  {/* Line total */}
                  <td className="px-3 py-1.5 text-center font-mono font-bold text-slate-900">
                    {formatNumber(line.line_total)}
                  </td>

                  {/* Remove */}
                  {!disabled && (
                    <td className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(line._key)}
                        className="text-slate-300 hover:text-rose-500 transition-colors p-1 rounded"
                        title="حذف السطر"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-slate-50 border-t-2 border-slate-200">
            <tr>
              <td
                colSpan={disabled ? 3 : 3}
                className="px-3 py-2.5 text-end font-bold text-slate-700"
              >
                الإجمالي الكلي للفاتورة
              </td>
              <td className="px-3 py-2.5 text-center font-mono font-extrabold text-emerald-800 text-sm">
                {formatNumber(grandTotal)} ج.م
              </td>
              {!disabled && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {!disabled && lines.some((l) => !l.product_id) && (
        <p className="text-[11px] text-amber-700 font-medium">
          ⚠ بعض الأسطر لم يُختر لها منتج — سيتم تجاهلها عند الحفظ
        </p>
      )}
    </div>
  )
}
