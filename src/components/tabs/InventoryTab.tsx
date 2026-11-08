import { useState, useMemo } from 'react'
import {
  useProductStock,
  useStockMovements,
  useStockValuation,
  useReceiveStock,
  useAdjustStock,
  type ProductStockRow,
  type StockMovementRow,
} from '../../hooks/useInventory'
import { useProducts } from '../../hooks/useProducts'
import { formatNumber, getTodayISO } from '../../lib/format'
import Modal from '../Modal'

// ─── Stock-in form modal ──────────────────────────────────────────────────────
function StockInModal({
  products,
  onClose,
  onSuccess,
}: {
  products: { id: string; name_ar: string; sku: string | null; unit: string | null }[]
  onClose: () => void
  onSuccess: () => void
}) {
  const receive = useReceiveStock()
  const [form, setForm] = useState({
    product_id: '',
    qty: '',
    unit_cost: '',
    notes: '',
  })
  const [err, setErr] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (!form.product_id) { setErr('اختر المنتج'); return }
    const qty = parseFloat(form.qty)
    const cost = parseFloat(form.unit_cost)
    if (!qty || qty <= 0) { setErr('الكمية يجب أن تكون أكبر من صفر'); return }
    if (isNaN(cost) || cost < 0) { setErr('تكلفة الوحدة غير صحيحة'); return }

    try {
      await receive.mutateAsync({
        productId: form.product_id,
        qty,
        unitCost: cost,
        notes: form.notes || undefined,
      })
      onSuccess()
    } catch (e: unknown) {
      setErr((e as Error).message)
    }
  }

  return (
    <Modal title="استلام بضاعة (Stock In)" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">المنتج *</label>
          <select
            value={form.product_id}
            onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
            className="app-select"
          >
            <option value="">— اختر منتجاً —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name_ar} {p.sku ? `(${p.sku})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">الكمية *</label>
            <input
              type="number" min={0.001} step="any"
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
              className="app-input font-mono" dir="ltr" placeholder="0"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">تكلفة الوحدة (ج.م) *</label>
            <input
              type="number" min={0} step="any"
              value={form.unit_cost}
              onChange={(e) => setForm((f) => ({ ...f, unit_cost: e.target.value }))}
              className="app-input font-mono" dir="ltr" placeholder="0.00"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">ملاحظات / مرجع</label>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="app-input" placeholder="رقم فاتورة المورد أو ملاحظة"
          />
        </div>

        {err && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 font-medium">
            {err}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={receive.isPending} className="app-btn app-btn-primary flex-1">
            {receive.isPending ? 'جاري الحفظ...' : 'تسجيل الاستلام'}
          </button>
          <button type="button" onClick={onClose} className="app-btn app-btn-ghost px-5">
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Adjustment form modal ────────────────────────────────────────────────────
function AdjustStockModal({
  products,
  defaultProductId,
  onClose,
  onSuccess,
}: {
  products: { id: string; name_ar: string; sku: string | null }[]
  defaultProductId?: string
  onClose: () => void
  onSuccess: () => void
}) {
  const adjust = useAdjustStock()
  const [form, setForm] = useState({
    product_id: defaultProductId ?? '',
    qty_delta: '',
    notes: '',
  })
  const [err, setErr] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (!form.product_id) { setErr('اختر المنتج'); return }
    const delta = parseFloat(form.qty_delta)
    if (isNaN(delta) || delta === 0) { setErr('الكمية يجب أن تكون مختلفة عن صفر'); return }

    try {
      await adjust.mutateAsync({
        productId: form.product_id,
        qtyDelta: delta,
        notes: form.notes || undefined,
      })
      onSuccess()
    } catch (e: unknown) {
      setErr((e as Error).message)
    }
  }

  return (
    <Modal title="تسوية مخزون (Adjustment)" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">المنتج *</label>
          <select
            value={form.product_id}
            onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
            className="app-select"
          >
            <option value="">— اختر منتجاً —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name_ar} {p.sku ? `(${p.sku})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            كمية التعديل * <span className="text-slate-400 font-normal">(موجب = إضافة، سالب = خصم)</span>
          </label>
          <input
            type="number" step="any"
            value={form.qty_delta}
            onChange={(e) => setForm((f) => ({ ...f, qty_delta: e.target.value }))}
            className="app-input font-mono" dir="ltr" placeholder="+5 أو -3"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">سبب التسوية *</label>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="app-input" placeholder="تلف / فرق جرد / تصحيح..."
            required
          />
        </div>

        {err && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 font-medium">
            {err}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={adjust.isPending} className="app-btn app-btn-primary flex-1">
            {adjust.isPending ? 'جاري الحفظ...' : 'تطبيق التسوية'}
          </button>
          <button type="button" onClick={onClose} className="app-btn app-btn-ghost px-5">
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Movement history panel ───────────────────────────────────────────────────
function MovementTypeLabel({ type }: { type: string }) {
  if (type === 'in') return <span className="badge badge-success text-[10px]">وارد</span>
  if (type === 'out') return <span className="badge badge-primary text-[10px]">صادر</span>
  return <span className="badge text-[10px] bg-amber-50 text-amber-800 border-amber-200">تسوية</span>
}

// ─── Main InventoryTab ────────────────────────────────────────────────────────
export default function InventoryTab() {
  const { data: products = [], isLoading: loadingProducts } = useProducts()
  const { data: stock = [], isLoading: loadingStock } = useProductStock()
  const [activeSection, setActiveSection] = useState<'onhand' | 'movements' | 'valuation'>('onhand')
  const [stockInOpen, setStockInOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustDefaultId, setAdjustDefaultId] = useState<string | undefined>()
  const [toast, setToast] = useState('')
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')

  // Movement filter
  const [movFilter, setMovFilter] = useState({
    productId: '',
    from: '',
    to: getTodayISO(),
  })
  const { data: movements = [], isLoading: loadingMovements } = useStockMovements({
    productId: movFilter.productId || undefined,
    from: movFilter.from || undefined,
    to: movFilter.to || undefined,
  })
  const { data: valuation = [], isLoading: loadingValuation } = useStockValuation()

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  const categories = useMemo(() => {
    const s = new Set<string>()
    stock.forEach((r: ProductStockRow) => { if (r.category) s.add(r.category) })
    return Array.from(s).sort()
  }, [stock])

  const filteredStock = useMemo(() => {
    return stock.filter((r: ProductStockRow) => {
      const matchSearch =
        r.name_ar.toLowerCase().includes(search.toLowerCase()) ||
        (r.name_en?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
        (r.sku?.toLowerCase().includes(search.toLowerCase()) ?? false)
      const matchCat = filterCategory === 'all' || r.category === filterCategory
      return matchSearch && matchCat
    })
  }, [stock, search, filterCategory])

  const totalStockValue = useMemo(
    () => (valuation as ProductStockRow[]).reduce((s, r) => s + (Number(r.stock_value) || 0), 0),
    [valuation]
  )

  const lowStockCount = stock.filter((r: ProductStockRow) => Number(r.on_hand) <= 0).length

  if (loadingProducts || loadingStock) {
    return (
      <div className="flex justify-center items-center py-16 text-slate-500 gap-3">
        <div className="h-6 w-6 border-3 border-slate-200 border-t-primary-700 rounded-full animate-spin" />
        <span className="font-semibold text-sm">جاري تحميل بيانات المخزون...</span>
      </div>
    )
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 end-5 z-50 animate-slide-in bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">إدارة المخزون</h2>
          <p className="text-xs text-slate-500 mt-0.5">تتبع الكميات والتكاليف وتاريخ الحركات</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setStockInOpen(true)} className="app-btn app-btn-primary text-xs py-2">
            <span>+</span> استلام بضاعة
          </button>
          <button
            onClick={() => { setAdjustDefaultId(undefined); setAdjustOpen(true) }}
            className="app-btn app-btn-ghost text-xs py-2 border-amber-300 text-amber-800 hover:bg-amber-50"
          >
            تسوية مخزون
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="app-card p-4">
          <p className="text-xs text-slate-500 font-medium">إجمالي المنتجات</p>
          <p className="text-2xl font-extrabold text-slate-800 mt-1">{stock.length}</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs text-slate-500 font-medium">قيمة المخزون</p>
          <p className="text-2xl font-extrabold text-emerald-700 mt-1 font-mono">
            {formatNumber(totalStockValue)} <span className="text-sm font-bold text-slate-500">ج.م</span>
          </p>
        </div>
        <div className={`app-card p-4 ${lowStockCount > 0 ? 'border-amber-300 bg-amber-50/50' : ''}`}>
          <p className="text-xs text-slate-500 font-medium">منتجات نفد مخزونها</p>
          <p className={`text-2xl font-extrabold mt-1 ${lowStockCount > 0 ? 'text-amber-700' : 'text-slate-800'}`}>
            {lowStockCount}
          </p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs text-slate-500 font-medium">حركات اليوم</p>
          <p className="text-2xl font-extrabold text-slate-800 mt-1">
            {movements.filter((m: StockMovementRow) => m.created_at.startsWith(getTodayISO())).length}
          </p>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 border-b border-border pb-0">
        {[
          { key: 'onhand', label: 'الأرصدة الحالية' },
          { key: 'movements', label: 'تاريخ الحركات' },
          { key: 'valuation', label: 'تقييم المخزون' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveSection(key as typeof activeSection)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${
              activeSection === key
                ? 'border-primary-600 text-primary-700 bg-primary-50/60'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── On-hand ── */}
      {activeSection === 'onhand' && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث باسم المنتج أو SKU..."
              className="app-input text-sm flex-1"
            />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="app-select text-sm"
            >
              <option value="all">جميع الفئات</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
            <table className="app-table">
              <thead>
                <tr>
                  <th className="text-start">المنتج</th>
                  <th className="text-center">الفئة</th>
                  <th className="text-center">الوحدة</th>
                  <th className="text-center">الكمية المتاحة</th>
                  <th className="text-center">متوسط التكلفة</th>
                  <th className="text-center">قيمة المخزون</th>
                  <th className="text-center">سعر البيع</th>
                  <th className="text-center w-24">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.map((row: ProductStockRow) => {
                  const onHand = Number(row.on_hand)
                  const isLow = onHand <= 0
                  return (
                    <tr key={row.product_id} className={isLow ? 'bg-amber-50/60' : ''}>
                      <td>
                        <div className="font-semibold text-slate-800 text-sm">{row.name_ar}</div>
                        {row.name_en && <div className="text-xs text-slate-400">{row.name_en}</div>}
                        {row.sku && (
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {row.sku}
                          </span>
                        )}
                      </td>
                      <td className="text-center text-xs text-slate-600">{row.category || '-'}</td>
                      <td className="text-center text-xs text-slate-600">{row.unit || '-'}</td>
                      <td className="text-center">
                        <span
                          className={`font-mono font-bold text-sm ${
                            isLow ? 'text-rose-600' : onHand < 10 ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatNumber(onHand)}
                        </span>
                        {isLow && (
                          <span className="block text-[10px] text-rose-500 font-semibold">نفد المخزون</span>
                        )}
                      </td>
                      <td className="text-center font-mono text-xs text-slate-700">
                        {formatNumber(row.avg_cost)}
                      </td>
                      <td className="text-center font-mono font-semibold text-slate-800 text-sm">
                        {formatNumber(row.stock_value)}
                      </td>
                      <td className="text-center font-mono text-xs text-slate-700">
                        {formatNumber(row.price)}
                      </td>
                      <td>
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => { setStockInOpen(true) }}
                            className="app-btn app-btn-sm app-btn-ghost text-[10px] text-emerald-700 hover:border-emerald-400"
                            title="استلام بضاعة"
                          >
                            وارد
                          </button>
                          <button
                            onClick={() => {
                              setAdjustDefaultId(row.product_id)
                              setAdjustOpen(true)
                            }}
                            className="app-btn app-btn-sm app-btn-ghost text-[10px] text-amber-700 hover:border-amber-400"
                            title="تسوية"
                          >
                            تسوية
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filteredStock.length === 0 && (
              <div className="text-center py-10 text-slate-500 text-sm">
                لا توجد منتجات مطابقة للبحث
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Movements ── */}
      {activeSection === 'movements' && (
        <div className="space-y-3">
          {/* Filter bar */}
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">المنتج</label>
              <select
                value={movFilter.productId}
                onChange={(e) => setMovFilter((f) => ({ ...f, productId: e.target.value }))}
                className="app-select text-xs"
              >
                <option value="">جميع المنتجات</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name_ar}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">من</label>
              <input
                type="date" value={movFilter.from}
                onChange={(e) => setMovFilter((f) => ({ ...f, from: e.target.value }))}
                className="app-input py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">إلى</label>
              <input
                type="date" value={movFilter.to}
                onChange={(e) => setMovFilter((f) => ({ ...f, to: e.target.value }))}
                className="app-input py-1.5 text-xs font-mono"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
            <table className="app-table">
              <thead>
                <tr>
                  <th className="text-center w-32">التاريخ والوقت</th>
                  <th className="text-start">المنتج</th>
                  <th className="text-center w-24">النوع</th>
                  <th className="text-center w-24">الكمية</th>
                  <th className="text-center w-28">التكلفة/الوحدة</th>
                  <th className="text-start">المرجع / الملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {loadingMovements ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400 text-sm">
                      جاري التحميل...
                    </td>
                  </tr>
                ) : movements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400 text-sm">
                      لا توجد حركات مطابقة
                    </td>
                  </tr>
                ) : (
                  movements.map((m: StockMovementRow) => (
                    <tr key={m.id}>
                      <td className="text-center text-xs font-mono text-slate-500 whitespace-nowrap">
                        {new Date(m.created_at).toLocaleDateString('ar-EG')}
                        <br />
                        <span className="text-slate-400">
                          {new Date(m.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="font-semibold text-slate-800 text-sm">{m.product_name}</td>
                      <td className="text-center">
                        <MovementTypeLabel type={m.movement_type} />
                      </td>
                      <td className="text-center font-mono font-bold text-slate-900">
                        <span className={m.qty > 0 ? 'text-emerald-700' : 'text-rose-600'}>
                          {m.qty > 0 ? '+' : ''}{formatNumber(m.qty)}
                        </span>
                      </td>
                      <td className="text-center font-mono text-xs text-slate-700">
                        {formatNumber(m.unit_cost)}
                      </td>
                      <td className="text-xs text-slate-500 max-w-xs truncate">
                        {m.reference_type && (
                          <span className="font-semibold text-slate-600 me-1">
                            {m.reference_type === 'cash_invoice' ? 'نقدي' :
                             m.reference_type === 'credit_invoice' ? 'آجل' :
                             m.reference_type === 'manual' ? 'استلام يدوي' :
                             m.reference_type === 'adjustment' ? 'تسوية' :
                             m.reference_type}:
                          </span>
                        )}
                        {m.notes || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Valuation ── */}
      {activeSection === 'valuation' && (
        <div className="space-y-3">
          <div className="app-card p-4 bg-gradient-to-r from-emerald-50 to-white flex items-center gap-4">
            <div>
              <p className="text-xs text-slate-500 font-medium">إجمالي قيمة المخزون (بالتكلفة)</p>
              <p className="text-2xl font-extrabold text-emerald-700 font-mono mt-0.5">
                {formatNumber(totalStockValue)} ج.م
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
            <table className="app-table">
              <thead>
                <tr>
                  <th className="text-start">المنتج</th>
                  <th className="text-center">الفئة</th>
                  <th className="text-center">الوحدة</th>
                  <th className="text-center">الكمية المتاحة</th>
                  <th className="text-center">متوسط التكلفة</th>
                  <th className="text-center">قيمة المخزون (ج.م)</th>
                </tr>
              </thead>
              <tbody>
                {loadingValuation ? (
                  <tr><td colSpan={6} className="text-center py-8 text-slate-400 text-sm">جاري التحميل...</td></tr>
                ) : (valuation as ProductStockRow[]).map((r) => (
                  <tr key={r.product_id}>
                    <td>
                      <div className="font-semibold text-slate-800">{r.name_ar}</div>
                      {r.sku && <span className="text-[10px] font-mono text-slate-400">{r.sku}</span>}
                    </td>
                    <td className="text-center text-xs text-slate-600">{r.category || '-'}</td>
                    <td className="text-center text-xs text-slate-600">{r.unit || '-'}</td>
                    <td className="text-center font-mono font-bold text-slate-900">
                      {formatNumber(r.on_hand)}
                    </td>
                    <td className="text-center font-mono text-xs text-slate-700">
                      {formatNumber(r.avg_cost)}
                    </td>
                    <td className="text-center font-mono font-bold text-emerald-800 text-sm">
                      {formatNumber(r.stock_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td colSpan={5} className="px-3.5 py-3 text-end font-bold text-slate-700">
                    الإجمالي الكلي
                  </td>
                  <td className="px-3.5 py-3 text-center font-mono font-extrabold text-emerald-800 text-base">
                    {formatNumber(totalStockValue)} ج.م
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {stockInOpen && (
        <StockInModal
          products={products}
          onClose={() => setStockInOpen(false)}
          onSuccess={() => {
            setStockInOpen(false)
            showToast('تم تسجيل استلام البضاعة بنجاح')
          }}
        />
      )}
      {adjustOpen && (
        <AdjustStockModal
          products={products}
          defaultProductId={adjustDefaultId}
          onClose={() => { setAdjustOpen(false); setAdjustDefaultId(undefined) }}
          onSuccess={() => {
            setAdjustOpen(false)
            setAdjustDefaultId(undefined)
            showToast('تمت التسوية بنجاح')
          }}
        />
      )}
    </div>
  )
}
