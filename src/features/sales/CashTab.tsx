import { useState, useMemo, useEffect } from 'react'
import { formatMoney, formatNumber, getTodayISO } from '@/shared/lib/format'
import Modal from '@/shared/ui/Modal'
import SearchableSelect from '@/shared/ui/SearchableSelect'
import { toSearchableOptions } from '@/shared/ui/searchableSelectUtils'
import InvoiceLineEditor, { type LineItem } from '@/features/sales/InvoiceLineEditor'
import { createEmptyInvoiceLine, isMeaningfulInvoiceLine } from '@/features/sales/invoiceLineUtils'
import BulkProductMatrixModal, { type BulkMatrixLine } from '@/features/sales/BulkProductMatrixModal'
import InvoiceDetailsModal from '@/features/sales/InvoiceDetailsModal'
import PostSaveInvoicePrintPrompt from '@/features/sales/PostSaveInvoicePrintPrompt'
import Pagination from '@/shared/ui/Pagination'
import PageHeader from '@/shared/ui/PageHeader'
import FilterToolbar from '@/shared/ui/FilterToolbar'
import ResponsiveDataView from '@/shared/ui/ResponsiveDataView'
import { useDatePreset } from '@/shared/hooks/useDatePreset'
import {
  useCashInvoices,
  useCreditInvoices,
  useCustomers,
} from '@/features/sales/useInvoices'
import { useProducts } from '@/features/products/useProducts'
import {
  useSaveCashInvoice,
  useDeleteCashInvoiceWithStock,
  useProductStock,
  useInvoiceLines,
  type InvoiceLine,
} from '@/features/inventory/useInventory'
import { useAuth } from '@/features/auth/useAuth'

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString('ar-EG') : '-'

// ─── Invoice edit modal with line items ───────────────────────────────────────
function CashInvoiceModal({
  invoice,
  reps,
  customers,
  products,
  stockMap,
  onClose,
  onSaved,
}: {
  invoice: Record<string, unknown>
  reps: { id: string; name: string }[]
  customers: { id: string; name: string; representative_id?: string | null }[]
  products: { id: string; name_ar: string; name_en: string | null; sku: string | null; unit: string | null; price: number; is_active: boolean }[]
  stockMap: Record<string, number>
  onClose: () => void
  onSaved: (msg: string, savedInvoiceId?: string, status?: 'draft' | 'confirmed' | 'cancelled', isNew?: boolean) => void
}) {
  const isEdit = !!invoice.id
  const { data: existingLines = [], isLoading: linesLoading } = useInvoiceLines(
    'cash',
    isEdit ? (invoice.id as string) : null
  )

  const save = useSaveCashInvoice()
  const { data: creditInvoices = [] } = useCreditInvoices()

  // Live outstanding balance per customer (credit invoices only).
  const balanceById: Record<string, number> = {}
  for (const inv of creditInvoices as Record<string, unknown>[]) {
    const id = String(inv.customer_id || '')
    if (!id || inv.status === 'cancelled') continue
    balanceById[id] = (balanceById[id] || 0) + Number(inv.remaining || 0)
  }
  const [form, setForm] = useState({
    date: (invoice.date as string) || getTodayISO(),
    invoice_no: (invoice.invoice_no as string) || `CASH-${Date.now().toString().slice(-6)}`,
    customer_id: (invoice.customer_id as string) || '',
    rep_id: (invoice.rep_id as string) || '',
    item: (invoice.item as string) || '',
    notes: (invoice.notes as string) || '',
    status: (invoice.status as 'draft' | 'confirmed' | 'cancelled') || 'confirmed',
  })
  const liveBalance = Number(balanceById[form.customer_id] || 0)
  const [lines, setLines] = useState<LineItem[]>([createEmptyInvoiceLine()])
  const [linesReady, setLinesReady] = useState(!isEdit)
  const [bulkMatrixOpen, setBulkMatrixOpen] = useState(false)
  const [err, setErr] = useState('')

  // Once existing lines load for edit mode, initialise the editor
  if (isEdit && !linesLoading && !linesReady) {
    const mapped: LineItem[] = existingLines.map((l: Record<string, unknown>) => ({
      _key: l.id as string,
      product_id: l.product_id as string,
      product_name: ((l.products as Record<string, unknown>)?.name_ar as string) || '',
      unit: ((l.products as Record<string, unknown>)?.unit as string) || '',
      unit_price: Number(l.unit_price),
      qty: Number(l.qty),
      line_total: Number(l.line_total),
      on_hand: stockMap[l.product_id as string] ?? 0,
    }))
    setLines(mapped.length ? mapped : [])
    setLinesReady(true)
  }

  const setField = (name: string, value: string) =>
    setForm((f) => {
      const next = { ...f, [name]: value }
      if (name === 'customer_id') {
        const cust = customers.find((c) => c.id === value)
        if (cust?.representative_id) next.rep_id = cust.representative_id
      }
      return next
    })

  const handleCommitMatrix = (matrixLines: BulkMatrixLine[]) => {
    const newItems: LineItem[] = matrixLines.map((ml) => ({
      _key: Math.random().toString(36).slice(2),
      product_id: ml.product_id,
      product_name: ml.product_name,
      unit: ml.unit || '',
      unit_price: ml.unit_price,
      qty: ml.qty,
      line_total: ml.line_total,
      on_hand: ml.available_qty ?? stockMap[ml.product_id] ?? 0,
    }))
    setLines((prev) => {
      const filtered = prev.filter((p) => p.product_id && p.qty > 0)
      return [...filtered, ...newItems]
    })
    setBulkMatrixOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent, submitStatus?: 'draft' | 'confirmed') => {
    if (e && e.preventDefault) e.preventDefault()
    setErr('')

    const meaningfulLines = lines.filter(isMeaningfulInvoiceLine)
    const hasInvalidQty = lines.some((l) => l.product_id && Number(l.qty) <= 0)
    if (hasInvalidQty) {
      setErr('يوجد صنف بكمية غير صالحة. الكمية يجب أن تكون أكبر من صفر')
      return
    }

    const validLines: InvoiceLine[] = meaningfulLines
      .map((l) => ({ product_id: l.product_id, qty: l.qty, unit_price: l.unit_price }))

    if (validLines.length === 0) {
      setErr('أضف صنفاً واحداً على الأقل للفاتورة')
      return
    }
    if (!form.rep_id) {
      setErr('اختر المندوب')
      return
    }

    const finalStatus = submitStatus || form.status

    try {
      const payload: Record<string, unknown> = { ...form, status: finalStatus }
      if (isEdit) payload.id = invoice.id
      const savedId = await save.mutateAsync({ invoice: payload, lines: validLines })
      onSaved(
        finalStatus === 'draft'
          ? 'تم حفظ الفاتورة كمسودة وحجز الكميات (Draft)'
          : isEdit
          ? 'تم تحديث الفاتورة وتعديل المخزون'
          : 'تمت إضافة الفاتورة وتأكيد صرف المخزون',
        (savedId as string) || (invoice.id as string) || '',
        finalStatus,
        !isEdit
      )
    } catch (e: unknown) {
      setErr((e as Error).message)
    }
  }

  const meaningfulLines = lines.filter(isMeaningfulInvoiceLine)
  const grandTotal = meaningfulLines.reduce((s, l) => s + (l.line_total || 0), 0)
  const itemCount = meaningfulLines.length
  const totalQty = meaningfulLines.reduce((s, l) => s + (Number(l.qty) || 0), 0)
  const customerOptions = toSearchableOptions(customers).map((option) => ({
    ...option,
    meta: balanceById[option.value]
      ? <span className="font-bold font-num tabular-nums text-primary-700">المتبقي: <span dir="ltr">{formatMoney(balanceById[option.value])}</span></span>
      : undefined,
  }))

  if (isEdit && linesLoading) {
    return (
      <Modal title="تعديل فاتورة نقدية" onClose={onClose}>
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 border-3 border-slate-200 border-t-primary-700 rounded-full animate-spin" />
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title={isEdit ? 'تعديل فاتورة نقدية' : 'فاتورة نقدية جديدة'}
      subtitle="نظّم بيانات الفاتورة والأصناف في أقسام واضحة قبل التأكيد أو الحفظ كمسودة."
      size="full"
      onClose={save.isPending ? () => {} : onClose}
      footer={
        <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-semibold text-slate-600">
            <span>عدد الأصناف: <span className="num text-slate-900">{itemCount}</span></span>
            <span>إجمالي الكمية: <span className="num text-slate-900">{formatNumber(totalQty)}</span></span>
            <span className="flex items-center gap-1.5">الإجمالي الكلي:
              <span className="num font-extrabold text-[18px] text-primary-700">{formatMoney(grandTotal)}</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onClose} disabled={save.isPending} className="app-btn app-btn-ghost px-4 text-xs">إلغاء</button>
            <button type="button" onClick={(e) => handleSubmit(e, 'draft')} disabled={save.isPending} className="app-btn app-btn-ghost border-amber-300 text-amber-800 hover:bg-amber-50 px-4 text-xs font-bold">حفظ كمسودة</button>
            <button
              type="button"
              onClick={(e) => handleSubmit(e, 'confirmed')}
              disabled={save.isPending}
              className="app-btn app-btn-primary px-5 text-xs font-bold"
            >
              {save.isPending ? 'جارٍ الحفظ...' : isEdit ? 'تحديث وتأكيد الصرف' : 'تأكيد وصرف'}
            </button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-800">بيانات الفاتورة</h3>
            <span className="text-[11px] text-slate-500">المعلومات الأساسية</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الفاتورة *</label>
            <input type="date" value={form.date} onChange={(e) => setField('date', e.target.value)}
              className="app-input text-xs" required />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">رقم الفاتورة *</label>
            <input type="text" value={form.invoice_no} onChange={(e) => setField('invoice_no', e.target.value)}
              className="app-input text-xs font-mono" dir="ltr" required />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">العميل</label>
            <SearchableSelect
              options={customerOptions}
              value={form.customer_id || ''}
              onChange={(id) => setField('customer_id', id)}
              placeholder="ابحث عن عميل بالاسم أو الهاتف..."
              searchPlaceholder="ابحث عن عميل بالاسم أو الهاتف..."
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">المندوب *</label>
            <SearchableSelect
              options={toSearchableOptions(reps)}
              value={form.rep_id || ''}
              onChange={(id) => setField('rep_id', id)}
              placeholder="اختر المندوب"
              searchPlaceholder="ابحث عن مندوب..."
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
            <input type="text" value={form.notes} onChange={(e) => setField('notes', e.target.value)}
              className="app-input text-xs" placeholder="ملاحظات إضافية..." />
          </div>
          </div>
          {form.customer_id && (
            <div className="rounded-xl border border-primary-100 bg-primary-50 px-3 py-2 text-xs font-bold text-primary-800 flex flex-wrap items-center justify-between gap-2">
              <span>رصيد العميل الحالي (الآجل غير المسدد)</span>
              <span className="num font-extrabold text-[13px]">{formatMoney(liveBalance)}</span>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-800">أصناف الفاتورة</h3>
            <span className="text-[11px] text-slate-500">أضف المنتجات والكميات والأسعار</span>
          </div>
          {linesReady ? (
            <InvoiceLineEditor
              products={products as Parameters<typeof InvoiceLineEditor>[0]['products']}
              stockMap={stockMap}
              initialLines={lines.length ? lines : undefined}
              onChange={setLines}
              disabled={save.isPending}
              onOpenBulkMatrix={() => setBulkMatrixOpen(true)}
            />
          ) : (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 border-3 border-slate-200 border-t-primary-700 rounded-full animate-spin" />
            </div>
          )}
        </section>

        {/* Grand total */}
        {grandTotal > 0 && (
          <div className="text-end">
            <span className="text-xs text-slate-500 font-medium">إجمالي الفاتورة: </span>
            <span className="font-num font-extrabold text-emerald-800 text-base" dir="ltr">
              {formatMoney(grandTotal)}
            </span>
          </div>
        )}

        {err && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 font-medium">
            {err}
          </div>
        )}

      </form>

      {bulkMatrixOpen && (
        <BulkProductMatrixModal
          isOpen={bulkMatrixOpen}
          mode="sale"
          onClose={() => setBulkMatrixOpen(false)}
          onCommit={handleCommitMatrix}
        />
      )}
    </Modal>
  )
}

// ─── Main CashTab ─────────────────────────────────────────────────────────────
export default function CashTab({ repFilter, reps, showToast, isReadOnly = false, createSignal, onSignalHandled }: {
  repFilter: string
  reps: { id: string; name: string }[]
  showToast: (msg: string) => void
  isReadOnly?: boolean
  createSignal?: number
  onSignalHandled?: () => void
}) {
  const { data: invoices = [], isLoading: invoicesLoading, error: invoicesError } = useCashInvoices(repFilter)
  const { data: customers = [] } = useCustomers()
  const { data: products = [] } = useProducts()
  const { data: stockRows = [] } = useProductStock()
  const deleteInvoice = useDeleteCashInvoiceWithStock()
  const { can } = useAuth()
  const canExportPrint = can('export_print')

  // Build stockMap: product_id → on_hand
  const stockMap: Record<string, number> = {}
  for (const r of stockRows) stockMap[r.product_id] = Number(r.on_hand)

  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [printPrompt, setPrintPrompt] = useState<{ id: string; invoiceNo?: string } | null>(null)
  useEffect(() => { if (createSignal) { openNew(); onSignalHandled?.() } }, [createSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => {
    const defaultRep = repFilter !== 'all' ? repFilter : reps[0]?.id || ''
    setEditing({
      date: getTodayISO(),
      invoice_no: `CASH-${Date.now().toString().slice(-6)}`,
      customer_id: '',
      rep_id: defaultRep,
      item: '',
      notes: '',
    })
  }

  const handleDelete = (invoice: Record<string, unknown>) => {
    if (!confirm(`هل أنت متأكد من حذف الفاتورة ${invoice.invoice_no}؟`)) return
    deleteInvoice.mutate(invoice.id as string, {
      onSuccess: () => showToast('تم الحذف وعُكس تأثيره على المخزون'),
      onError: (e) => showToast((e as Error).message),
    })
  }

  const openDetails = (invoice: Record<string, unknown>) => setViewingId(String(invoice.id))

  const customerName = (id?: string | null) =>
    (customers as { id: string; name: string }[]).find((c) => c.id === id)?.name || '-'

  const repName = (id?: string | null) =>
    reps.find((r) => r.id === id)?.name || '-'

  const [searchTerm, setSearchTerm] = useState('')
  const { preset, from, to, setPreset, setFrom, setTo, reset } = useDatePreset('all')

  const filteredInvoices = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return (invoices as Record<string, unknown>[]).filter((inv) => {
      const date = String(inv.date || '')
      if (from && date < from) return false
      if (to && date > to) return false
      if (!term) return true
      return String(inv.invoice_no || '').toLowerCase().includes(term)
    })
  }, [invoices, searchTerm, from, to])

  const filteredTotal = filteredInvoices.reduce(
    (sum: number, inv: Record<string, unknown>) => sum + parseFloat(String(inv.amount || 0)),
    0
  )

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  const totalPages = Math.ceil(filteredInvoices.length / pageSize) || 1
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredInvoices.slice(start, start + pageSize)
  }, [filteredInvoices, currentPage, pageSize])

  const hasActiveFilters = !!searchTerm.trim() || !!from || !!to
  const resetFilters = () => {
    setSearchTerm('')
    reset()
    setCurrentPage(1)
  }

  return (
    <div className="app-page space-y-5">
      <PageHeader
        title="سجل فواتير البيع النقدي"
        subtitle="عرض وإدارة فواتير البيع النقدي وأصنافها ومخزونها."
        count={`${filteredInvoices.length} فاتورة`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
              <span>إجمالي المبيعات:</span>
              <span className="num font-extrabold text-sm">{formatMoney(filteredTotal)}</span>
            </div>
            {!isReadOnly && (
              <button type="button" onClick={openNew} className="app-btn app-btn-primary">+ فاتورة نقدية جديدة</button>
            )}
          </div>
        }
      />

      <FilterToolbar
        search={searchTerm}
        onSearchChange={(v) => { setSearchTerm(v); setCurrentPage(1) }}
        searchPlaceholder="بحث برقم الفاتورة..."
        preset={preset}
        onPresetChange={(p) => { setPreset(p); setCurrentPage(1) }}
        from={from}
        to={to}
        onFromChange={(v) => { setFrom(v); setCurrentPage(1) }}
        onToChange={(v) => { setTo(v); setCurrentPage(1) }}
        onReset={resetFilters}
        hasActiveFilters={hasActiveFilters}
      />

      <ResponsiveDataView
        loading={invoicesLoading}
        error={invoicesError ? 'تعذّر تحميل الفواتير النقدية. أعد المحاولة لاحقاً.' : undefined}
        hasData={filteredInvoices.length > 0}
        empty="لا توجد فواتير نقدية مطابقة للفلاتر الحالية."
        table={(
      <>
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
        <table className="app-table">
          <thead>
            <tr>
              <th className="w-12 text-center">#</th>
              <th className="text-center w-28">التاريخ</th>
              <th className="text-center w-32">رقم الفاتورة</th>
              <th className="text-center w-24">الحالة</th>
              <th>العميل</th>
              <th className="text-center">المندوب</th>
              <th>بيان / ملاحظات</th>
              <th className="text-center w-32 font-bold">الإجمالي (ج.م)</th>
              <th className="text-center w-36">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {(paginatedInvoices as Record<string, unknown>[]).map((invoice, idx) => (
              <tr
                key={invoice.id as string}
                className="cursor-pointer hover:bg-slate-50/80"
                onClick={() => openDetails(invoice)}
              >
                <td className="text-center text-xs text-slate-400 font-mono">
                  {invoices.length - ((currentPage - 1) * pageSize + idx)}
                </td>
                <td className="text-center text-xs text-slate-600 font-medium whitespace-nowrap">
                  {formatDate(invoice.date as string)}
                </td>
                <td className="text-center text-xs" dir="ltr">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openDetails(invoice) }}
                    className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono font-bold text-[var(--primary)] underline-offset-4 hover:underline cursor-pointer"
                  >
                    {invoice.invoice_no as string}
                  </button>
                </td>
                <td className="text-center text-xs whitespace-nowrap">
                  {invoice.status === 'draft' ? (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-bold text-[10px]">
                      مسودة (محجوز)
                    </span>
                  ) : invoice.status === 'cancelled' ? (
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[10px]">
                      ملغاة
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[10px]">
                      مؤكدة
                    </span>
                  )}
                </td>
                <td className="font-semibold text-slate-800">{customerName(invoice.customer_id as string)}</td>
                <td className="text-center text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {repName(invoice.rep_id as string)}
                  </span>
                </td>
                <td className="text-xs text-slate-500">
                  {(invoice.item as string) || (invoice.notes as string) || '-'}
                </td>
                <td className="text-center font-extrabold text-slate-950 font-num text-sm whitespace-nowrap" dir="ltr">
                  {formatMoney(invoice.amount as number || 0, { withCurrency: false })}
                </td>
                <td>
                  <div className="flex flex-nowrap justify-center gap-1">
                    <button
                      type="button"
                      title={canExportPrint ? 'عرض / طباعة' : 'عرض'}
                      aria-label={`${canExportPrint ? 'عرض / طباعة' : 'عرض'} الفاتورة ${invoice.invoice_no as string}`}
                      onClick={(e) => { e.stopPropagation(); openDetails(invoice) }}
                      className="app-btn app-btn-sm app-btn-ghost px-2 text-xs text-[var(--primary)] hover:border-blue-400"
                    >
                      {canExportPrint ? 'عرض / طباعة' : 'عرض'}
                    </button>
                    {!isReadOnly && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditing({ ...invoice }) }}
                          className="app-btn app-btn-sm app-btn-ghost text-xs hover:border-blue-400 hover:text-blue-700"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDelete(invoice) }}
                          className="app-btn app-btn-sm app-btn-ghost text-xs text-rose-600 hover:bg-rose-50 hover:border-rose-300"
                        >
                          حذف
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {filteredInvoices.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-200">
                <td className="px-3.5 py-3 text-center text-slate-700 font-extrabold" colSpan={6}>
                  {hasActiveFilters ? 'إجمالي نتائج البحث' : 'الإجمالي الكلي للنقدي'}
                </td>
                <td className="px-3.5 py-3 text-center text-emerald-800 font-num text-base font-extrabold whitespace-nowrap tabular-nums" dir="ltr">
                  {formatMoney(filteredTotal)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Mobile Card View (Optimized for field reps on phones) */}
      <div className="md:hidden space-y-3">
        {(paginatedInvoices as Record<string, unknown>[]).map((invoice) => (
          <div
            key={invoice.id as string}
            className="app-card cursor-pointer p-3.5 shadow-sm space-y-2.5 hover:border-[var(--primary)]/40"
            role="group"
            aria-label={`فاتورة ${invoice.invoice_no as string}`}
            onClick={() => openDetails(invoice)}
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <span className="font-extrabold text-slate-800 text-sm block">
                  {customerName(invoice.customer_id as string)}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openDetails(invoice) }}
                    className="font-mono text-[11px] font-bold text-[var(--primary)] underline-offset-4 hover:underline cursor-pointer"
                    dir="ltr"
                  >
                    {invoice.invoice_no as string}
                  </button>
                  <span className="text-[11px] text-slate-400 font-mono" dir="ltr">
                    • {formatDate(invoice.date as string)}
                  </span>
                </div>
              </div>
              <div className="text-end">
                <span className="font-num font-extrabold text-emerald-700 text-base block" dir="ltr">
                  {formatMoney(invoice.amount as number || 0)}
                </span>
                <span className="text-[10px] font-bold text-slate-500">نقدي</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px]">
                المندوب: {repName(invoice.rep_id as string)}
              </span>
              {((invoice.item as string) || (invoice.notes as string)) && (
                <span className="text-[11px] text-slate-500 truncate max-w-[150px]">
                  {(invoice.item as string) || (invoice.notes as string)}
                </span>
              )}
            </div>

            <div className="flex gap-2 border-t border-slate-100 pt-1">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openDetails(invoice) }}
                className="app-btn app-btn-ghost app-btn-sm flex-1 py-1.5 text-xs font-bold text-[var(--primary)] border-blue-200 hover:bg-blue-50"
              >
                {canExportPrint ? 'عرض / طباعة' : 'عرض'}
              </button>
              {!isReadOnly && (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setEditing({ ...invoice }) }}
                    className="app-btn app-btn-ghost app-btn-sm flex-1 py-1.5 text-xs font-semibold text-blue-700 border-blue-200 hover:bg-blue-50"
                  >
                    تعديل الفاتورة
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(invoice) }}
                    className="app-btn app-btn-ghost app-btn-sm px-3 py-1.5 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                  >
                    حذف
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination Component */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredInvoices.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />
      </>
        )}
      />

      {viewingId && (
        <InvoiceDetailsModal
          invoiceId={viewingId}
          invoiceType="cash"
          onClose={() => setViewingId(null)}
        />
      )}

      {editing && (
        <CashInvoiceModal
          invoice={editing}
          reps={reps}
          customers={customers as { id: string; name: string; representative_id?: string | null }[]}
          products={products}
          stockMap={stockMap}
          onClose={() => setEditing(null)}
          onSaved={(msg, savedInvoiceId, status, isNew) => {
            showToast(msg)
            const invoiceNo = String(editing.invoice_no || '')
            setEditing(null)
            if (isNew && status === 'confirmed' && savedInvoiceId) {
              setPrintPrompt({ id: savedInvoiceId, invoiceNo })
            }
          }}
        />
      )}

      {printPrompt && (
        <PostSaveInvoicePrintPrompt
          invoiceId={printPrompt.id}
          invoiceType="cash"
          invoiceNo={printPrompt.invoiceNo}
          onClose={() => setPrintPrompt(null)}
        />
      )}
    </div>
  )
}



