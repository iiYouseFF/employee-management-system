import { useState, useMemo } from 'react'
import Modal from '@/shared/ui/Modal'
import { formatNumber } from '@/shared/lib/format'
import { useProducts, type Product } from '@/features/products/useProducts'
import { useProductStock, type ProductStockRow } from '@/features/inventory/useInventory'
import { productUnitOptions, resolveProductUnit } from '@/shared/lib/productUnits'

export interface BulkMatrixLine {
  product_id: string
  product_name: string
  sku: string | null
  unit: string
  qty: number
  unit_price: number
  line_total: number
  condition: 'salable' | 'damaged'
  available_qty: number
  reserved_qty: number
  on_hand: number
  expiry_date?: string
  batch_number?: string
}

interface BulkProductMatrixModalProps {
  isOpen?: boolean
  mode: 'sale' | 'receive' | 'return'
  products?: Product[]
  stockList?: ProductStockRow[]
  allowNegativeStock?: boolean
  initialLines?: Array<{
    product_id: string
    qty: number
    unit_price?: number
    unit?: string
    condition?: 'salable' | 'damaged'
  }>
  onClose: () => void
  onCommit: (selectedLines: BulkMatrixLine[]) => void
}

interface MatrixEntry {
  qty: string
  price: string
  condition: 'salable' | 'damaged'
  unit?: string
}

export default function BulkProductMatrixModal({
  mode,
  products: propProducts,
  stockList: propStockList,
  allowNegativeStock = false,
  initialLines = [],
  onClose,
  onCommit,
}: BulkProductMatrixModalProps) {
  const { data: fetchedProducts = [] } = useProducts()
  const { data: fetchedStock = [] } = useProductStock()

  const products = propProducts || fetchedProducts
  const stockList = propStockList || fetchedStock

  // Map stock data by product_id
  const stockMap = useMemo(() => {
    const map = new Map<string, ProductStockRow>()
    for (const item of stockList) {
      map.set(item.product_id, item)
    }
    return map
  }, [stockList])

  // Initialise row entries from products
  const [entries, setEntries] = useState<Record<string, MatrixEntry>>(() => {
    const initial: Record<string, MatrixEntry> = {}
    
    // Seed with existing lines if provided
    for (const line of initialLines) {
      if (line.product_id) {
        initial[line.product_id] = {
          qty: line.qty > 0 ? String(line.qty) : '',
          price: line.unit_price !== undefined ? String(line.unit_price) : '',
          condition: line.condition || 'salable',
          unit: line.unit || resolveProductUnit(products.find((p) => p.id === line.product_id)?.unit),
        }
      }
    }
    return initial
  })

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [onlySelected, setOnlySelected] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Unique categories
  const categories = useMemo(() => {
    const set = new Set<string>()
    products.forEach((p) => {
      if (p.category) set.add(p.category)
    })
    return Array.from(set).sort()
  }, [products])

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!p.is_active && mode !== 'return') return false

      const entry = entries[p.id]
      const hasQty = entry && parseFloat(entry.qty) > 0
      if (onlySelected && !hasQty) return false

      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false

      if (search.trim()) {
        const q = search.toLowerCase()
        const matchAr = p.name_ar.toLowerCase().includes(q)
        const matchEn = (p.name_en || '').toLowerCase().includes(q)
        const matchSku = (p.sku || '').toLowerCase().includes(q)
        if (!matchAr && !matchEn && !matchSku) return false
      }

      return true
    })
  }, [products, entries, onlySelected, selectedCategory, search, mode])

  const handleQtyChange = (productId: string, val: string) => {
    setEntries((prev) => {
      const cur = prev[productId] || { qty: '', price: '', condition: 'salable' }
      return {
        ...prev,
        [productId]: { ...cur, qty: val },
      }
    })
  }

  const handlePriceChange = (productId: string, val: string) => {
    setEntries((prev) => {
      const cur = prev[productId] || { qty: '', price: '', condition: 'salable' }
      return {
        ...prev,
        [productId]: { ...cur, price: val },
      }
    })
  }

  const handleUnitChange = (productId: string, unit: string) => {
    setEntries((prev) => {
      const cur = prev[productId] || { qty: '', price: '', condition: 'salable' }
      return {
        ...prev,
        [productId]: { ...cur, unit },
      }
    })
  }

  const handleConditionChange = (productId: string, condition: 'salable' | 'damaged') => {
    setEntries((prev) => {
      const cur = prev[productId] || { qty: '', price: '', condition: 'salable' }
      return {
        ...prev,
        [productId]: { ...cur, condition },
      }
    })
  }

  // Calculate live totals and validation
  const { totalQuantity, totalAmount, selectedCount, hasInvalidRows } = useMemo(() => {
    let tQty = 0
    let tAmt = 0
    let count = 0
    let invalid = false

    for (const p of products) {
      const entry = entries[p.id]
      if (!entry) continue
      const q = parseFloat(entry.qty)
      if (q > 0) {
        count += 1
        tQty += q
        const pr = entry.price !== '' ? parseFloat(entry.price) : Number(p.price || 0)
        tAmt += q * (isNaN(pr) ? 0 : pr)

        if (mode === 'sale' && !allowNegativeStock) {
          const st = stockMap.get(p.id)
          const atp = st ? Number(st.available_qty ?? st.on_hand) : 0
          if (q > atp) {
            invalid = true
          }
        }
      }
    }

    return {
      totalQuantity: tQty,
      totalAmount: tAmt,
      selectedCount: count,
      hasInvalidRows: invalid,
    }
  }, [products, entries, mode, allowNegativeStock, stockMap])

  const handleCommit = () => {
    setErrorMsg('')
    const linesToCommit: BulkMatrixLine[] = []

    for (const p of products) {
      const entry = entries[p.id]
      if (!entry) continue
      const q = parseFloat(entry.qty)
      if (q > 0) {
        const pr = entry.price !== '' ? parseFloat(entry.price) : Number(p.price || 0)
        const st = stockMap.get(p.id)
        const onHand = st ? Number(st.on_hand) : 0
        const reserved = st ? Number(st.reserved_qty || 0) : 0
        const atp = st ? Number(st.available_qty ?? (onHand - reserved)) : 0

        if (mode === 'sale' && !allowNegativeStock && q > atp) {
          setErrorMsg(`الكمية المطلوبة للصنف "${p.name_ar}" (${q}) تتجاوز المتاح للطلب ATP (${atp})`)
          return
        }

        const unitPrice = isNaN(pr) || pr < 0 ? 0 : pr

        linesToCommit.push({
          product_id: p.id,
          product_name: p.name_ar,
          sku: p.sku,
          unit: resolveProductUnit(entry.unit ?? p.unit),
          qty: q,
          unit_price: unitPrice,
          condition: entry.condition || 'salable',
          available_qty: atp,
          reserved_qty: reserved,
          on_hand: onHand,
          line_total: q * unitPrice,
        })
      }
    }

    if (linesToCommit.length === 0) {
      setErrorMsg('يرجى إدخال كمية لصنف واحد على الأقل قبل التأكيد')
      return
    }

    onCommit(linesToCommit)
    onClose()
  }

  const modalTitle =
    mode === 'sale'
      ? 'إدخال أصناف مبيعات جماعي (Matrix)'
      : mode === 'receive'
      ? 'استلام بضاعة وتوريد متعدد (Matrix)'
      : 'تسجيل مرتجع مبيعات متعدد (Matrix)'

  return (
    <Modal title={modalTitle} onClose={onClose} wide>
      <div className="flex flex-col max-h-[80vh] -m-6" dir="rtl">
        {/* Header Filter Controls */}
        <div className="p-4 bg-slate-50 border-b border-border space-y-3 shrink-0">
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
            {/* Search */}
            <div className="relative flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث باسم الصنف، الكود SKU، أو الاسم بالإنجليزية..."
                className="app-input text-xs w-full pe-8"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute start-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Toggle show selected only */}
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-2 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors select-none shrink-0">
              <input
                type="checkbox"
                checked={onlySelected}
                onChange={(e) => setOnlySelected(e.target.checked)}
                className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
              />
              <span>عرض المحدد فقط {selectedCount > 0 && `(${selectedCount})`}</span>
            </label>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1 rounded-lg font-bold transition-colors whitespace-nowrap ${
                selectedCategory === 'all'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              جميع الفئات
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg font-bold transition-colors whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Matrix Table (Scrollable Body) */}
        <div className="overflow-y-auto flex-1 p-2 sm:p-4">
          <table className="w-full text-xs text-slate-800 border-collapse">
            <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 shadow-xs z-10 font-bold">
              <tr>
                <th className="py-2.5 px-3 text-start">الصنف</th>
                <th className="py-2.5 px-2 text-center w-20">الوحدة</th>
                {mode === 'sale' && (
                  <>
                    <th className="py-2.5 px-2 text-center w-24">المتاح (ATP)</th>
                    <th className="py-2.5 px-2 text-center w-20">محجوز</th>
                  </>
                )}
                {mode === 'receive' && (
                  <th className="py-2.5 px-2 text-center w-24">الرصيد الحالي</th>
                )}
                {mode === 'return' && (
                  <th className="py-2.5 px-2 text-center w-28">حالة البضاعة</th>
                )}
                <th className="py-2.5 px-2 text-center w-28">
                  {mode === 'return' ? 'كمية المرتجع' : 'الكمية المطلوبة'}
                </th>
                <th className="py-2.5 px-2 text-center w-28">
                  {mode === 'receive' ? 'سعر الشراء (ج.م)' : 'سعر الوحدة (ج.م)'}
                </th>
                <th className="py-2.5 px-3 text-end w-28">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((p) => {
                const entry = entries[p.id] || { qty: '', price: '', condition: 'salable' }
                const q = parseFloat(entry.qty) || 0
                const pr = entry.price !== '' ? parseFloat(entry.price) : Number(p.price || 0)
                const lineTotal = q * (isNaN(pr) ? 0 : pr)

                const st = stockMap.get(p.id)
                const onHand = st ? Number(st.on_hand) : 0
                const reserved = st ? Number(st.reserved_qty || 0) : 0
                const atp = st ? Number(st.available_qty ?? (onHand - reserved)) : 0

                const isExceedingAtp = mode === 'sale' && !allowNegativeStock && q > atp
                const isRowActive = q > 0

                return (
                  <tr
                    key={p.id}
                    className={`transition-colors hover:bg-slate-50/80 ${
                      isExceedingAtp
                        ? 'bg-rose-50/70'
                        : isRowActive
                        ? 'bg-blue-50/40'
                        : ''
                    }`}
                  >
                    {/* Product Name & SKU */}
                    <td className="py-2 px-3">
                      <div className="font-bold text-slate-900">{p.name_ar}</div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                        {p.sku && <span>{p.sku}</span>}
                        {p.category && <span className="text-slate-400">• {p.category}</span>}
                      </div>
                    </td>

                    {/* Unit */}
                    <td className="py-2 px-2 text-center text-slate-500">
                      {mode === 'sale' ? (
                        <select
                          value={resolveProductUnit(entry.unit ?? p.unit)}
                          onChange={(e) => handleUnitChange(p.id, e.target.value)}
                          className="app-input !py-1 !min-h-0 h-8 text-xs w-full"
                          aria-label={`وحدة ${p.name_ar}`}
                        >
                          {productUnitOptions(entry.unit ?? p.unit).map((unit) => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      ) : (
                        p.unit || 'وحدة'
                      )}
                    </td>

                    {/* Sale Mode Stock Info (ATP & Reserved) */}
                    {mode === 'sale' && (
                      <>
                        <td className="py-2 px-2 text-center font-mono">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold ${
                              atp <= 0
                                ? 'bg-rose-100 text-rose-800'
                                : atp < 10
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {formatNumber(atp)}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center font-mono text-slate-500">
                          {reserved > 0 ? (
                            <span className="bg-slate-200/80 text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-bold">
                              {formatNumber(reserved)}
                            </span>
                          ) : (
                            '0'
                          )}
                        </td>
                      </>
                    )}

                    {/* Receive Mode Stock Info */}
                    {mode === 'receive' && (
                      <td className="py-2 px-2 text-center font-mono font-semibold text-slate-700">
                        {formatNumber(onHand)}
                      </td>
                    )}

                    {/* Return Mode: Salable vs Damaged selector */}
                    {mode === 'return' && (
                      <td className="py-2 px-2 text-center">
                        <select
                          value={entry.condition}
                          onChange={(e) => handleConditionChange(p.id, e.target.value as 'salable' | 'damaged')}
                          className="app-select text-[11px] py-1 px-1.5"
                        >
                          <option value="salable">سليم (مخزن)</option>
                          <option value="damaged">تالف (هالك)</option>
                        </select>
                      </td>
                    )}

                    {/* Quantity Input */}
                    <td className="py-1 px-2 text-center">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={entry.qty}
                        onChange={(e) => handleQtyChange(p.id, e.target.value)}
                        placeholder="0"
                        className={`excel-input amount-input text-center text-xs font-mono font-bold ${
                          isExceedingAtp ? 'req-empty' : ''
                        }`}
                      />
                      {isExceedingAtp && (
                        <span className="block text-[10px] text-rose-600 font-bold mt-0.5">
                          تجاوز ATP
                        </span>
                      )}
                    </td>

                    {/* Unit Price Input */}
                    <td className="py-1 px-2 text-center">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={entry.price !== '' ? entry.price : p.price}
                        onChange={(e) => handlePriceChange(p.id, e.target.value)}
                        className="excel-input text-center text-xs font-mono font-semibold"
                      />
                    </td>

                    {/* Line Total */}
                    <td className="py-2 px-3 text-end font-mono font-bold text-slate-800">
                      {lineTotal > 0 ? `${formatNumber(lineTotal)} ج.م` : '—'}
                    </td>
                  </tr>
                )
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    لا توجد أصناف مطابقة للبحث أو التصنيف المحدد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div className="mx-4 mb-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl animate-fade-in">
            {errorMsg}
          </div>
        )}

        {/* Sticky Action Footer */}
        <div className="p-4 bg-slate-50 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-4 text-xs font-bold">
            <span className="text-slate-600">
              الأصناف المحددة:{' '}
              <strong className="text-primary-800 font-mono text-sm">{selectedCount}</strong>
            </span>
            <span className="text-slate-600">
              إجمالي الكميات:{' '}
              <strong className="text-slate-800 font-mono text-sm">{formatNumber(totalQuantity)}</strong>
            </span>
            <span className="text-slate-600">
              الإجمالي المالي:{' '}
              <strong className="text-emerald-700 font-mono text-base">{formatNumber(totalAmount)} ج.م</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="app-btn app-btn-ghost text-xs px-4 flex-1 sm:flex-initial"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={hasInvalidRows || selectedCount === 0}
              className="app-btn app-btn-primary text-xs px-6 font-bold flex-1 sm:flex-initial"
            >
              إدراج {selectedCount > 0 ? `(${selectedCount}) أصناف` : ''} في الفاتورة
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
