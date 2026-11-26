import { useState, useMemo, useEffect } from 'react'
import {
  useProductStock,
  useStockMovements,
  useStockValuation,
  useReceiveStock,
  useAdjustStock,
  type ProductStockRow,
  type StockMovementRow,
} from '@/features/inventory/useInventory'
import { useProducts } from '@/features/products/useProducts'
import { formatNumber, getTodayISO } from '@/shared/lib/format'
import { useDatePreset } from '@/shared/hooks/useDatePreset'
import Modal from '@/shared/ui/Modal'
import Pagination from '@/shared/ui/Pagination'
import PageHeader from '@/shared/ui/PageHeader'
import FilterToolbar from '@/shared/ui/FilterToolbar'
import ResponsiveDataView from '@/shared/ui/ResponsiveDataView'
import SearchableSelect from '@/shared/ui/SearchableSelect'
import { toSearchableOptions } from '@/shared/ui/searchableSelectUtils'
import BulkProductMatrixModal from '@/features/sales/BulkProductMatrixModal'
import ProductConsumptionModal from '@/features/products/ProductConsumptionModal'

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
    expiry_date: '',
    batch_number: '',
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
        expiryDate: form.expiry_date || undefined,
        batchNumber: form.batch_number || undefined,
      })
      onSuccess()
    } catch (e: unknown) {
      setErr((e as Error).message)
    }
  }

  return (
    <Modal
      title="استلام بضاعة يدوي (بدون فاتورة مورد)"
      subtitle="للبضاعة غير المرتبطة بفاتورة مورد. المشتريات من مورد تُسجّل من تبويب الموردين ← مشتريات الموردين."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">المنتج *</label>
          <SearchableSelect
            options={toSearchableOptions(products)}
            value={form.product_id}
            onChange={(id) => setForm((f) => ({ ...f, product_id: id }))}
            placeholder="— اختر منتجاً —"
            searchPlaceholder="ابحث باسم المنتج أو SKU..."
          />
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

        <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ انتهاء الصلاحية</label>
            <input
              type="date"
              value={form.expiry_date}
              onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))}
              className="app-input text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">رقم التشغيلة (Batch/Lot)</label>
            <input
              type="text"
              value={form.batch_number}
              onChange={(e) => setForm((f) => ({ ...f, batch_number: e.target.value }))}
              className="app-input font-mono text-xs"
              dir="ltr"
              placeholder="LOT-1234"
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
          <SearchableSelect
            options={toSearchableOptions(products)}
            value={form.product_id}
            onChange={(id) => setForm((f) => ({ ...f, product_id: id }))}
            placeholder="— اختر منتجاً —"
            searchPlaceholder="ابحث باسم المنتج أو SKU..."
          />
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

function movementReferenceLabel(type: string) {
  if (type === 'cash_invoice') return 'فاتورة كاش'
  if (type === 'credit_invoice') return 'فاتورة آجل'
  if (type === 'manual') return 'استلام يدوي'
  if (type === 'adjustment') return 'تسوية'
  if (type === 'supplier_purchase') return 'فاتورة مشتريات'
  if (type === 'supplier_purchase_history') return 'فاتورة مشتريات (معدّلة)'
  if (type === 'reversal') return 'عكس قيد'
  return type
}

// ─── Main InventoryTab ────────────────────────────────────────────────────────
export default function InventoryTab({ isReadOnly = false }: { isReadOnly?: boolean }) {
  const { data: products = [], isLoading: loadingProducts } = useProducts()
  const { data: stock = [], isLoading: loadingStock, error: stockError } = useProductStock()
  const receiveStockMutation = useReceiveStock()
  const [activeSection, setActiveSection] = useState<'onhand' | 'movements' | 'valuation' | 'alerts'>('onhand')
  const [stockInOpen, setStockInOpen] = useState(false)
  const [bulkReceiveOpen, setBulkReceiveOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustDefaultId, setAdjustDefaultId] = useState<string | undefined>()
  const [analyticsRow, setAnalyticsRow] = useState<ProductStockRow | null>(null)
  const [toast, setToast] = useState('')
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [alertFilter, setAlertFilter] = useState<'all' | 'out_of_stock' | 'low_stock' | 'expired' | 'expiring_soon'>('all')

  // Movement filter
  const [movFilter, setMovFilter] = useState({ productId: '' })
  const { preset, from, to, setPreset, setFrom, setTo, reset } = useDatePreset('all')
  const { data: movements = [], isLoading: loadingMovements, error: movementsError } = useStockMovements({
    productId: movFilter.productId || undefined,
    from: from || undefined,
    to: to || undefined,
  })
  const { data: valuation = [], isLoading: loadingValuation, error: valuationError } = useStockValuation()

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

  const lowStockCount = stock.filter((r: ProductStockRow) => r.alert_status === 'out_of_stock' || r.alert_status === 'low_stock').length
  const expiredCount = stock.filter((r: ProductStockRow) => r.alert_status === 'expired').length
  const expiringSoonCount = stock.filter((r: ProductStockRow) => r.alert_status === 'expiring_soon').length
  const totalAlertsCount = stock.filter((r: ProductStockRow) => r.alert_status && r.alert_status !== 'ok').length

  const alertProducts = useMemo(() => {
    return stock.filter((r: ProductStockRow) => {
      if (alertFilter === 'all') return r.alert_status && r.alert_status !== 'ok'
      return r.alert_status === alertFilter
    })
  }, [stock, alertFilter])

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  useEffect(() => {
    setCurrentPage(1)
  }, [activeSection, search, filterCategory, alertFilter, movFilter.productId, from, to])

  const totalStockPages = Math.ceil(filteredStock.length / pageSize) || 1
  const paginatedStock = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredStock.slice(start, start + pageSize)
  }, [filteredStock, currentPage, pageSize])

  const totalMovementPages = Math.ceil(movements.length / pageSize) || 1
  const paginatedMovements = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return movements.slice(start, start + pageSize)
  }, [movements, currentPage, pageSize])

  const totalValuationPages = Math.ceil((valuation as ProductStockRow[]).length / pageSize) || 1
  const paginatedValuation = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return (valuation as ProductStockRow[]).slice(start, start + pageSize)
  }, [valuation, currentPage, pageSize])

  const totalAlertPages = Math.ceil(alertProducts.length / pageSize) || 1
  const paginatedAlerts = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return alertProducts.slice(start, start + pageSize)
  }, [alertProducts, currentPage, pageSize])

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
      <PageHeader
        title="إدارة المخزون"
        subtitle="تتبع الكميات والتكاليف وتاريخ الحركات — الاستلام هنا للبضاعة بدون فاتورة مورد؛ المشتريات من مورد تُسجّل من تبويب الموردين."
        count={stock.length}
        actions={
          <>
            <button onClick={() => setStockInOpen(true)} disabled={isReadOnly} className="app-btn app-btn-primary text-xs py-2">
              <span>+</span> استلام فردي (بدون فاتورة)
            </button>
            <button
              onClick={() => setBulkReceiveOpen(true)}
              disabled={isReadOnly}
              className="app-btn app-btn-primary bg-indigo-700 hover:bg-indigo-800 text-xs py-2"
            >
              <span>+</span> استلام بضاعة متعددة (Matrix)
            </button>
            <button
              onClick={() => { setAdjustDefaultId(undefined); setAdjustOpen(true) }}
              disabled={isReadOnly}
              className="app-btn app-btn-ghost text-xs py-2 border-amber-300 text-amber-800 hover:bg-amber-50"
            >
              تسوية مخزون
            </button>
          </>
        }
      />

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
        <div
          onClick={() => { setActiveSection('alerts'); setAlertFilter('all') }}
          className={`app-card p-4 cursor-pointer transition-all hover:shadow-md ${
            totalAlertsCount > 0 ? 'border-amber-300 bg-amber-50/50' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">تنبيهات المخزون والصلاحية</p>
            {totalAlertsCount > 0 && (
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            )}
          </div>
          <p className={`text-2xl font-extrabold mt-1 ${totalAlertsCount > 0 ? 'text-amber-700' : 'text-slate-800'}`}>
            {totalAlertsCount}
          </p>
          <div className="text-[10px] text-slate-500 mt-1 flex gap-2">
            <span>نفد/منخفض: {lowStockCount}</span>
            <span>•</span>
            <span>صلاحية: {expiredCount + expiringSoonCount}</span>
          </div>
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
          { 
            key: 'alerts', 
            label: `التنبيهات والصلاحية ${totalAlertsCount > 0 ? `(${totalAlertsCount})` : ''}`,
            highlight: totalAlertsCount > 0
          },
          { key: 'movements', label: 'تاريخ الحركات' },
          { key: 'valuation', label: 'تقييم المخزون' },
        ].map(({ key, label, highlight }) => (
          <button
            key={key}
            onClick={() => setActiveSection(key as typeof activeSection)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 ${
              activeSection === key
                ? 'border-primary-600 text-primary-700 bg-primary-50/60'
                : highlight
                ? 'border-transparent text-rose-600 hover:text-rose-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>{label}</span>
            {highlight && activeSection !== key && (
              <span className="w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>
        ))}
      </div>

      {/* ── On-hand ── */}
      {activeSection === 'onhand' && (
        <div className="space-y-3">
          <FilterToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="بحث باسم المنتج أو SKU..."
            onReset={() => { setSearch(''); setFilterCategory('all') }}
            hasActiveFilters={!!search.trim() || filterCategory !== 'all'}
          >
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
          </FilterToolbar>

          <ResponsiveDataView
            loading={loadingStock}
            error={stockError ? 'تعذّر تحميل بيانات المخزون.' : undefined}
            hasData={filteredStock.length > 0}
            empty="لا توجد منتجات مطابقة للبحث"
            table={(
          <>
          {/* Desktop On-Hand Table */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
            <table className="app-table">
              <thead>
                <tr>
                  <th className="text-start">المنتج</th>
                  <th className="text-center">الفئة</th>
                  <th className="text-center">الوحدة</th>
                  <th className="text-center">الرصيد الفعلي</th>
                  <th className="text-center">المحجوز</th>
                  <th className="text-center">متاح للطلب (ATP)</th>
                  <th className="text-center">الصلاحية والتنبيهات</th>
                  <th className="text-center">متوسط التكلفة</th>
                  <th className="text-center">قيمة المخزون</th>
                  <th className="text-center">سعر البيع</th>
                  <th className="text-center w-40">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paginatedStock.map((row: ProductStockRow) => {
                  const onHand = Number(row.on_hand)
                  const reserved = Number(row.reserved_qty || 0)
                  const available = Number(row.available_qty ?? onHand)
                  const isLow = available <= 0
                  return (
                    <tr key={row.product_id} className={isLow ? 'bg-amber-50/60' : ''}>
                      <td>
                        <button
                          type="button"
                          onClick={() => setAnalyticsRow(row)}
                          className="font-semibold text-slate-800 text-sm text-start hover:text-primary-700"
                          title="فتح تحليل مبيعات الصنف"
                        >
                          {row.name_ar}
                        </button>
                        {row.name_en && <div className="text-xs text-slate-400">{row.name_en}</div>}
                        {row.sku && (
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {row.sku}
                          </span>
                        )}
                      </td>
                      <td className="text-center text-xs text-slate-600">{row.category || '-'}</td>
                      <td className="text-center text-xs text-slate-600">{row.unit || '-'}</td>
                      <td className="text-center font-mono text-xs text-slate-700">
                        {formatNumber(onHand)}
                      </td>
                      <td className="text-center font-mono text-xs text-amber-700 font-semibold">
                        {reserved > 0 ? formatNumber(reserved) : '-'}
                      </td>
                      <td className="text-center">
                        <span
                          className={`font-mono font-bold text-sm ${
                            isLow ? 'text-rose-600' : available < 10 ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatNumber(available)}
                        </span>
                        {isLow && (
                          <span className="block text-[10px] text-rose-500 font-semibold">غير متاح</span>
                        )}
                      </td>
                      <td className="text-center">
                        {row.alert_status === 'out_of_stock' && (
                          <span className="badge text-[10px] bg-rose-50 text-rose-700 border-rose-200">نفد المخزون</span>
                        )}
                        {row.alert_status === 'expired' && (
                          <span className="badge text-[10px] bg-rose-100 text-rose-800 border-rose-300">منتهي الصلاحية</span>
                        )}
                        {row.alert_status === 'expiring_soon' && (
                          <span className="badge text-[10px] bg-amber-50 text-amber-800 border-amber-300">
                            ينتهي خلال {row.days_to_expiry} يوم
                          </span>
                        )}
                        {row.alert_status === 'low_stock' && (
                          <span className="badge text-[10px] bg-orange-50 text-orange-800 border-orange-300">
                            مخزون منخفض (حد: {row.min_stock_alert})
                          </span>
                        )}
                        {row.alert_status === 'ok' && row.expiry_date && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            صالح حتى {row.expiry_date}
                          </span>
                        )}
                        {row.alert_status === 'ok' && !row.expiry_date && (
                          <span className="text-[10px] text-slate-400">—</span>
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
                        <div className="flex gap-1 justify-center flex-wrap">
                          <button
                            onClick={() => setAnalyticsRow(row)}
                            className="app-btn app-btn-sm app-btn-ghost text-[10px] text-primary-700 hover:border-primary-400"
                            title="تحليل مبيعات الصنف"
                          >
                            تحليل المبيعات
                          </button>
                          <button
                            onClick={() => { setStockInOpen(true) }}
                            disabled={isReadOnly}
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
                            disabled={isReadOnly}
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

          {/* Mobile On-Hand Cards */}
          <div className="md:hidden space-y-3">
            {filteredStock.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border p-8 text-center text-slate-400 text-sm">
                لا توجد منتجات مطابقة للبحث
              </div>
            ) : (
              paginatedStock.map((row: ProductStockRow) => {
                const onHand = Number(row.on_hand)
                const isLow = onHand <= 0
                return (
                  <div
                    key={row.product_id}
                    className={`bg-card rounded-2xl p-4 border shadow-xs transition-all space-y-3 ${
                      isLow ? 'border-amber-300 bg-amber-50/40' : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <button
                          type="button"
                          onClick={() => setAnalyticsRow(row)}
                          className="font-bold text-slate-900 text-sm text-start hover:text-primary-700"
                        >
                          {row.name_ar}
                        </button>
                        {row.name_en && <p className="text-xs text-slate-400 font-sans" dir="ltr">{row.name_en}</p>}
                      </div>
                      <div className="text-end">
                        <span
                          className={`font-mono font-black text-base ${
                            isLow ? 'text-rose-600' : onHand < 10 ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatNumber(onHand)}
                        </span>
                        <span className="text-xs text-slate-500 ms-1">{row.unit || 'وحدة'}</span>
                        {isLow && <span className="block text-[10px] text-rose-500 font-semibold">نفد المخزون</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap text-xs pt-1 border-t border-border/40">
                      {row.category && <span className="badge badge-neutral text-xs">{row.category}</span>}
                      {row.sku && (
                        <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200" dir="ltr">
                          {row.sku}
                        </span>
                      )}
                      {row.alert_status === 'expired' && (
                        <span className="badge text-xs bg-rose-100 text-rose-800 border-rose-300">منتهي الصلاحية</span>
                      )}
                      {row.alert_status === 'expiring_soon' && (
                        <span className="badge text-xs bg-amber-50 text-amber-800 border-amber-300">
                          ينتهي خلال {row.days_to_expiry} يوم
                        </span>
                      )}
                      {row.alert_status === 'low_stock' && (
                        <span className="badge text-xs bg-orange-50 text-orange-800 border-orange-300">
                          مخزون منخفض (حد: {row.min_stock_alert})
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                      <div>
                        <div className="text-[10px] text-slate-500">متوسط التكلفة</div>
                        <div className="font-mono font-bold text-slate-700 mt-0.5">{formatNumber(row.avg_cost)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">قيمة المخزون</div>
                        <div className="font-mono font-bold text-slate-800 mt-0.5">{formatNumber(row.stock_value)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">سعر البيع</div>
                        <div className="font-mono font-bold text-primary-800 mt-0.5">{formatNumber(row.price)}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50 flex-wrap">
                      <button
                        onClick={() => setAnalyticsRow(row)}
                        className="app-btn app-btn-sm app-btn-ghost text-xs text-primary-700 hover:border-primary-400"
                      >
                        تحليل المبيعات
                      </button>
                      <button
                        onClick={() => setStockInOpen(true)}
                        disabled={isReadOnly}
                        className="app-btn app-btn-sm app-btn-ghost text-xs text-emerald-700 hover:border-emerald-400"
                      >
                        + وارد
                      </button>
                      <button
                        onClick={() => {
                          setAdjustDefaultId(row.product_id)
                          setAdjustOpen(true)
                        }}
                        disabled={isReadOnly}
                        className="app-btn app-btn-sm app-btn-ghost text-xs text-amber-700 hover:border-amber-400"
                      >
                        تسوية
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
          </>
            )}
            footer={(
          <Pagination
            currentPage={currentPage}
            totalPages={totalStockPages}
            totalItems={filteredStock.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
            )}
          />
        </div>
      )}

      {/* ── Alerts & Expiry Section ── */}
      {activeSection === 'alerts' && (
        <div className="space-y-4">
          <FilterToolbar
            onReset={() => setAlertFilter('all')}
            hasActiveFilters={alertFilter !== 'all'}
          >
          {/* Quick Filter Tabs for Alerts */}
          <div className="flex flex-wrap gap-2 items-center">
            {[
              { id: 'all', label: `جميع التنبيهات (${totalAlertsCount})` },
              { id: 'expired', label: `منتهي الصلاحية (${expiredCount})`, color: 'bg-rose-100 text-rose-800' },
              { id: 'expiring_soon', label: `قريب الانتهاء (30 يوم) (${expiringSoonCount})`, color: 'bg-amber-100 text-amber-800' },
              { id: 'out_of_stock', label: `نفد المخزون (${stock.filter(r => r.alert_status === 'out_of_stock').length})`, color: 'bg-red-100 text-red-800' },
              { id: 'low_stock', label: `مخزون منخفض (${stock.filter(r => r.alert_status === 'low_stock').length})`, color: 'bg-orange-100 text-orange-800' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setAlertFilter(f.id as typeof alertFilter)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  alertFilter === f.id
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          </FilterToolbar>

          <ResponsiveDataView
            loading={loadingStock}
            error={stockError ? 'تعذّر تحميل بيانات المخزون.' : undefined}
            hasData={alertProducts.length > 0}
            empty="لا توجد أي تنبيهات حالياً في هذا القسم. جميع المنتجات بحالة ممتازة!"
            table={(
          <>
          {/* Alert Table Desktop */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
            <table className="app-table">
              <thead>
                <tr>
                  <th className="text-start">المنتج</th>
                  <th className="text-center">الفئة</th>
                  <th className="text-center">الكمية الحالية</th>
                  <th className="text-center">حد الأمان</th>
                  <th className="text-center">تاريخ الصلاحية</th>
                  <th className="text-center">التشغيلة (Batch)</th>
                  <th className="text-center">حالة التنبيه</th>
                  <th className="text-center w-28">إجراء سريع</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAlerts.map((row: ProductStockRow) => {
                  const onHand = Number(row.on_hand)
                  return (
                    <tr key={row.product_id} className="hover:bg-slate-50/70">
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
                      <td className="text-center font-mono font-bold text-sm">
                        <span className={onHand <= 0 ? 'text-rose-600' : 'text-slate-800'}>
                          {formatNumber(onHand)} {row.unit || ''}
                        </span>
                      </td>
                      <td className="text-center font-mono text-xs text-slate-600">
                        {row.min_stock_alert > 0 ? formatNumber(row.min_stock_alert) : 'غير محدد'}
                      </td>
                      <td className="text-center text-xs font-mono">
                        {row.expiry_date ? (
                          <div className={row.alert_status === 'expired' ? 'text-rose-600 font-bold' : ''}>
                            {row.expiry_date}
                            {row.days_to_expiry !== null && (
                              <span className="block text-[10px] text-slate-400">
                                {row.days_to_expiry < 0
                                  ? `(انتهى منذ ${Math.abs(row.days_to_expiry)} يوم)`
                                  : `(متبقي ${row.days_to_expiry} يوم)`}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="text-center font-mono text-xs text-slate-600">
                        {row.batch_number || '—'}
                      </td>
                      <td className="text-center">
                        {row.alert_status === 'expired' && (
                          <span className="badge badge-error text-[10px] bg-rose-100 text-rose-800 border-rose-300">
                            منتهي الصلاحية
                          </span>
                        )}
                        {row.alert_status === 'expiring_soon' && (
                          <span className="badge text-[10px] bg-amber-100 text-amber-900 border-amber-300">
                            ينتهي قريباً
                          </span>
                        )}
                        {row.alert_status === 'out_of_stock' && (
                          <span className="badge text-[10px] bg-red-50 text-red-700 border-red-200">
                            نفد المخزون
                          </span>
                        )}
                        {row.alert_status === 'low_stock' && (
                          <span className="badge text-[10px] bg-orange-50 text-orange-800 border-orange-300">
                            مخزون منخفض
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => setStockInOpen(true)}
                            className="app-btn app-btn-sm app-btn-ghost text-[10px] text-emerald-700 hover:border-emerald-400"
                            disabled={isReadOnly}
                          >
                            + توريد
                          </button>
                          <button
                            onClick={() => {
                              setAdjustDefaultId(row.product_id)
                              setAdjustOpen(true)
                            }}
                            className="app-btn app-btn-sm app-btn-ghost text-[10px] text-amber-700 hover:border-amber-400"
                            disabled={isReadOnly}
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
            {alertProducts.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-sm">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2 font-bold text-lg">
                  ✓
                </div>
                لا توجد أي تنبيهات حالياً في هذا القسم. جميع المنتجات بحالة ممتازة!
              </div>
            )}
          </div>

          {/* Alert Cards Mobile */}
          <div className="md:hidden space-y-3">
            {alertProducts.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border p-8 text-center text-slate-500 text-sm">
                لا توجد أي تنبيهات حالياً
              </div>
            ) : (
              paginatedAlerts.map((row: ProductStockRow) => (
                <div key={row.product_id} className="bg-card rounded-2xl p-4 border border-border space-y-3 shadow-xs">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{row.name_ar}</h4>
                      {row.sku && <span className="text-[10px] font-mono text-slate-400">{row.sku}</span>}
                    </div>
                    <div>
                      {row.alert_status === 'expired' && (
                        <span className="badge text-xs bg-rose-100 text-rose-800 border-rose-300">منتهي</span>
                      )}
                      {row.alert_status === 'expiring_soon' && (
                        <span className="badge text-xs bg-amber-100 text-amber-900 border-amber-300">قريب الانتهاء</span>
                      )}
                      {row.alert_status === 'out_of_stock' && (
                        <span className="badge text-xs bg-red-100 text-red-800 border-red-300">نفد</span>
                      )}
                      {row.alert_status === 'low_stock' && (
                        <span className="badge text-xs bg-orange-100 text-orange-800 border-orange-300">منخفض</span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px]">الكمية المتاحة</span>
                      <span className="font-mono font-bold text-slate-800">{formatNumber(row.on_hand)} {row.unit}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">تاريخ الصلاحية</span>
                      <span className="font-mono text-slate-800">{row.expiry_date || 'غير محدد'}</span>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
                    <button
                      onClick={() => setStockInOpen(true)}
                      disabled={isReadOnly}
                      className="app-btn app-btn-sm app-btn-ghost text-xs text-emerald-700"
                    >
                      + توريد
                    </button>
                    <button
                      onClick={() => {
                        setAdjustDefaultId(row.product_id)
                        setAdjustOpen(true)
                      }}
                      disabled={isReadOnly}
                      className="app-btn app-btn-sm app-btn-ghost text-xs text-amber-700"
                    >
                      تسوية
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          </>
            )}
            footer={(
          <Pagination
            currentPage={currentPage}
            totalPages={totalAlertPages}
            totalItems={alertProducts.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
            )}
          />
        </div>
      )}

      {/* ── Movements ── */}
      {activeSection === 'movements' && (
        <div className="space-y-3">
          <FilterToolbar
            preset={preset}
            onPresetChange={setPreset}
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            onReset={() => { reset(); setMovFilter({ productId: '' }) }}
            hasActiveFilters={preset !== 'all' || !!from || !!to || !!movFilter.productId}
          >
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">المنتج</label>
              <SearchableSelect
                options={toSearchableOptions(products)}
                value={movFilter.productId}
                onChange={(id) => setMovFilter((f) => ({ ...f, productId: id }))}
                placeholder="جميع المنتجات"
                searchPlaceholder="ابحث باسم المنتج أو SKU..."
                className="text-xs"
              />
            </div>
          </FilterToolbar>

          <ResponsiveDataView
            loading={loadingMovements}
            error={movementsError ? 'تعذّر تحميل حركات المخزون.' : undefined}
            hasData={movements.length > 0}
            empty="لا توجد حركات مطابقة"
            table={(
          <>
          {/* Desktop Movements Table */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
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
                  paginatedMovements.map((m: StockMovementRow) => (
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
                            {movementReferenceLabel(m.reference_type)}:
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

          {/* Mobile Movements Cards */}
          <div className="md:hidden space-y-3">
            {loadingMovements ? (
              <div className="bg-card rounded-2xl border border-border p-8 text-center text-slate-400 text-sm">
                جاري التحميل...
              </div>
            ) : movements.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border p-8 text-center text-slate-400 text-sm">
                لا توجد حركات مطابقة
              </div>
            ) : (
              paginatedMovements.map((m: StockMovementRow) => (
                <div key={m.id} className="bg-card rounded-2xl p-4 border border-border shadow-xs space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{m.product_name}</h3>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">
                        {new Date(m.created_at).toLocaleDateString('ar-EG')} • {new Date(m.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="font-mono font-bold text-base">
                        <span className={m.qty > 0 ? 'text-emerald-700' : 'text-rose-600'}>
                          {m.qty > 0 ? '+' : ''}{formatNumber(m.qty)}
                        </span>
                      </div>
                      <div className="mt-0.5">
                        <MovementTypeLabel type={m.movement_type} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-border/50">
                    <span className="text-slate-500">التكلفة للوحدة:</span>
                    <span className="font-mono font-bold text-slate-700">{formatNumber(m.unit_cost)} ج.م</span>
                  </div>

                  {(m.reference_type || m.notes) && (
                    <div className="text-xs text-slate-600 bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                      {m.reference_type && (
                        <span className="font-bold text-slate-700 me-1">
                          {movementReferenceLabel(m.reference_type)}:
                        </span>
                      )}
                      <span>{m.notes || '—'}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          </>
            )}
            footer={(
          <Pagination
            currentPage={currentPage}
            totalPages={totalMovementPages}
            totalItems={movements.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
            )}
          />
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

          <ResponsiveDataView
            loading={loadingValuation}
            error={valuationError ? 'تعذّر تحميل تقييم المخزون.' : undefined}
            hasData={valuation.length > 0}
            empty="لا توجد بيانات تقييم مخزون"
            table={(
          <>
          {/* Desktop Valuation Table */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
            <table className="app-table">
              <thead>
                <tr>
                  <th className="text-start">المنتج</th>
                  <th className="text-center">الفئة</th>
                  <th className="text-center">الوحدة</th>
                  <th className="text-center">الكمية المتاحة</th>
                  <th className="text-center">الصلاحية والتنبيهات</th>
                  <th className="text-center">متوسط التكلفة</th>
                  <th className="text-center">قيمة المخزون (ج.م)</th>
                </tr>
              </thead>
              <tbody>
                {loadingValuation ? (
                  <tr><td colSpan={6} className="text-center py-8 text-slate-400 text-sm">جاري التحميل...</td></tr>
                ) : (
                  paginatedValuation.map((r) => (
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
                  ))
                )}
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

          {/* Mobile Valuation Cards */}
          <div className="md:hidden space-y-3">
            {loadingValuation ? (
              <div className="bg-card rounded-2xl border border-border p-8 text-center text-slate-400 text-sm">
                جاري التحميل...
              </div>
            ) : valuation.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border p-8 text-center text-slate-400 text-sm">
                لا توجد بيانات تقييم مخزون
              </div>
            ) : (
              paginatedValuation.map((r) => (
                <div key={r.product_id} className="bg-card rounded-2xl p-4 border border-border shadow-xs space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{r.name_ar}</h3>
                      {r.sku && (
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          {r.sku}
                        </span>
                      )}
                    </div>
                    <div className="text-end">
                      <div className="font-mono font-black text-emerald-800 text-base">
                        {formatNumber(r.stock_value)} <span className="text-xs font-normal text-slate-500">ج.م</span>
                      </div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">
                        الكمية: <span className="font-mono font-bold text-slate-800">{formatNumber(r.on_hand)}</span> {r.unit || ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-border/50">
                    <span className="text-slate-500">التصنيف: {r.category || '-'}</span>
                    <span className="text-slate-600">
                      متوسط التكلفة: <strong className="font-mono">{formatNumber(r.avg_cost)}</strong> ج.م
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          </>
            )}
            footer={(
          <Pagination
            currentPage={currentPage}
            totalPages={totalValuationPages}
            totalItems={valuation.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
            )}
          />
        </div>
      )}

      {/* Modals */}
      {bulkReceiveOpen && (
        <BulkProductMatrixModal
          isOpen={bulkReceiveOpen}
          mode="receive"
          onClose={() => setBulkReceiveOpen(false)}
          onCommit={async (lines) => {
            try {
              let count = 0
              for (const l of lines) {
                await receiveStockMutation.mutateAsync({
                  productId: l.product_id,
                  qty: l.qty,
                  unitCost: l.unit_price,
                  notes: 'استلام بضاعة مجمع (Matrix)',
                  expiryDate: l.expiry_date || undefined,
                  batchNumber: l.batch_number || undefined,
                })
                count++
              }
              setBulkReceiveOpen(false)
              showToast(`تم استلام ${count} صنف بنجاح`)
            } catch (e: unknown) {
              showToast(`خطأ في الاستلام: ${(e as Error).message}`)
            }
          }}
        />
      )}
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
      {analyticsRow && (
        <ProductConsumptionModal
          product={{
            id: analyticsRow.product_id,
            name_ar: analyticsRow.name_ar,
            name_en: analyticsRow.name_en,
            sku: analyticsRow.sku,
            unit: analyticsRow.unit,
            price: analyticsRow.price ?? 0,
          }}
          stockQty={analyticsRow.on_hand}
          onClose={() => setAnalyticsRow(null)}
        />
      )}
    </div>
  )
}
