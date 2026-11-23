import { useState, useMemo } from 'react'
import { getTodayISO, formatNumber } from '@/shared/lib/format'
import Modal from '@/shared/ui/Modal'
import SearchableCustomer from '@/features/sales/SearchableCustomer'
import InvoiceLineEditor, { type LineItem } from '@/features/sales/InvoiceLineEditor'
import { createEmptyInvoiceLine, isMeaningfulInvoiceLine } from '@/features/sales/invoiceLineUtils'
import BulkProductMatrixModal, { type BulkMatrixLine } from '@/features/sales/BulkProductMatrixModal'
import Pagination from '@/shared/ui/Pagination'
import {
  useCashInvoices,
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
  onSaved: (msg: string) => void
}) {
  const isEdit = !!invoice.id
  const { data: existingLines = [], isLoading: linesLoading } = useInvoiceLines(
    'cash',
    isEdit ? (invoice.id as string) : null
  )

  const save = useSaveCashInvoice()

  const [form, setForm] = useState({
    date: (invoice.date as string) || getTodayISO(),
    invoice_no: (invoice.invoice_no as string) || `CASH-${Date.now().toString().slice(-6)}`,
    customer_id: (invoice.customer_id as string) || '',
    rep_id: (invoice.rep_id as string) || '',
    item: (invoice.item as string) || '',
    notes: (invoice.notes as string) || '',
    status: (invoice.status as 'draft' | 'confirmed' | 'cancelled') || 'confirmed',
  })
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
      await save.mutateAsync({ invoice: payload, lines: validLines })
      onSaved(
        finalStatus === 'draft'
          ? 'تم حفظ الفاتورة كمسودة وحجز الكميات (Draft)'
          : isEdit
          ? 'تم تحديث الفاتورة وتعديل المخزون'
          : 'تمت إضافة الفاتورة وتأكيد صرف المخزون'
      )
    } catch (e: unknown) {
      setErr((e as Error).message)
    }
  }

  const grandTotal = lines.filter(isMeaningfulInvoiceLine).reduce((s, l) => s + (l.line_total || 0), 0)

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
            <SearchableCustomer
              customers={customers as { id: string; name: string }[]}
              value={form.customer_id || null}
              onChange={(id) => setField('customer_id', id ?? '')}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">المندوب *</label>
            <select value={form.rep_id} onChange={(e) => setField('rep_id', e.target.value)}
              className="app-select text-xs" required>
              <option value="">اختر المندوب</option>
              {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
            <input type="text" value={form.notes} onChange={(e) => setField('notes', e.target.value)}
              className="app-input text-xs" placeholder="ملاحظات إضافية..." />
          </div>
          </div>
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
            <span className="font-mono font-extrabold text-emerald-800 text-base">
              {formatNumber(grandTotal)} ج.م
            </span>
          </div>
        )}

        {err && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 font-medium">
            {err}
          </div>
        )}

        <div className="flex gap-2 pt-1 flex-wrap">
          <button
            type="button"
            onClick={(e) => handleSubmit(e, 'confirmed')}
            disabled={save.isPending}
            className="app-btn app-btn-primary flex-1 py-2 text-xs font-bold"
          >
            {save.isPending ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                جاري الحفظ...
              </span>
            ) : isEdit ? 'تحديث وتأكيد الصرف' : 'تأكيد وصرف (Confirmed)'}
          </button>

          <button
            type="button"
            onClick={(e) => handleSubmit(e, 'draft')}
            disabled={save.isPending}
            className="app-btn app-btn-ghost border-amber-300 text-amber-800 hover:bg-amber-50 py-2 text-xs font-bold"
          >
            حفظ كمسودة (حجز فقط)
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={save.isPending}
            className="app-btn app-btn-ghost px-5 py-2 text-xs"
          >
            إلغاء
          </button>
        </div>
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
export default function CashTab({ repFilter, reps, showToast, isReadOnly = false }: {
  repFilter: string
  reps: { id: string; name: string }[]
  showToast: (msg: string) => void
  isReadOnly?: boolean
}) {
  const { data: invoices = [] } = useCashInvoices(repFilter)
  const { data: customers = [] } = useCustomers()
  const { data: products = [] } = useProducts()
  const { data: stockRows = [] } = useProductStock()
  const deleteInvoice = useDeleteCashInvoiceWithStock()

  // Build stockMap: product_id → on_hand
  const stockMap: Record<string, number> = {}
  for (const r of stockRows) stockMap[r.product_id] = Number(r.on_hand)

  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)

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

  const customerName = (id?: string | null) =>
    (customers as { id: string; name: string }[]).find((c) => c.id === id)?.name || '-'

  const repName = (id?: string | null) =>
    reps.find((r) => r.id === id)?.name || '-'

  const total = invoices.reduce((sum: number, inv: Record<string, unknown>) => sum + parseFloat(String(inv.amount || 0)), 0)

  const [searchTerm, setSearchTerm] = useState('')

  const filteredInvoices = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return invoices as Record<string, unknown>[]
    return (invoices as Record<string, unknown>[]).filter((inv) =>
      String(inv.invoice_no || '').toLowerCase().includes(term)
    )
  }, [invoices, searchTerm])

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

  return (
    <div>
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-800">سجل فواتير البيع النقدي</h2>
          <span className="badge badge-primary">{filteredInvoices.length} فاتورة</span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200/80 rounded-xl px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-emerald-800 shadow-sm">
            <span>{searchTerm.trim() ? 'إجمالي نتائج البحث:' : 'إجمالي المبيعات النقدية:'}</span>
            <span className="font-extrabold text-emerald-950 font-mono text-sm sm:text-base tabular-nums">
              {formatNumber(searchTerm.trim() ? filteredTotal : total)} ج.م
            </span>
          </div>

          {!isReadOnly && (
            <button onClick={openNew} className="app-btn app-btn-primary py-2 text-xs sm:text-sm shadow-sm">
              <span>+</span>
              <span>فاتورة نقدية جديدة</span>
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            placeholder="بحث برقم الفاتورة..."
            className="app-input text-sm pe-9 font-mono"
            dir="ltr"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('')
                setCurrentPage(1)
              }}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="مسح البحث"
            >
              ×
            </button>
          )}
        </div>
        {searchTerm.trim() && (
          <span className="text-xs text-slate-500">
            عرض {filteredInvoices.length} من {invoices.length}
          </span>
        )}
      </div>

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
              {!isReadOnly && <th className="text-center w-28">الإجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {(paginatedInvoices as Record<string, unknown>[]).map((invoice, idx) => (
              <tr key={invoice.id as string}>
                <td className="text-center text-xs text-slate-400 font-mono">
                  {invoices.length - ((currentPage - 1) * pageSize + idx)}
                </td>
                <td className="text-center text-xs text-slate-600 font-medium whitespace-nowrap">
                  {formatDate(invoice.date as string)}
                </td>
                <td className="text-center text-xs font-mono font-semibold text-slate-700" dir="ltr">
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200">
                    {invoice.invoice_no as string}
                  </span>
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
                <td className="text-center font-bold text-slate-900 font-mono text-sm whitespace-nowrap">
                  {formatNumber(invoice.amount as number || 0)}
                </td>
                {!isReadOnly && (
                  <td>
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => setEditing({ ...invoice })}
                        className="app-btn app-btn-sm app-btn-ghost text-xs hover:border-blue-400 hover:text-blue-700"
                      >
                        تعديل
                      </button>
                      <button
                        onClick={() => handleDelete(invoice)}
                        className="app-btn app-btn-sm app-btn-ghost text-xs text-rose-600 hover:bg-rose-50 hover:border-rose-300"
                      >
                        حذف
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {filteredInvoices.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-200">
                <td className="px-3.5 py-3 text-center text-slate-700 font-extrabold" colSpan={6}>
                  {searchTerm.trim() ? 'إجمالي نتائج البحث' : 'الإجمالي الكلي للنقدي'}
                </td>
                <td className="px-3.5 py-3 text-center text-emerald-800 font-mono text-base font-extrabold whitespace-nowrap tabular-nums">
                  {formatNumber(searchTerm.trim() ? filteredTotal : total)} ج.م
                </td>
                {!isReadOnly && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Mobile Card View (Optimized for field reps on phones) */}
      <div className="md:hidden space-y-3">
        {(paginatedInvoices as Record<string, unknown>[]).map((invoice) => (
          <div key={invoice.id as string} className="app-card p-3.5 shadow-sm space-y-2.5">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <span className="font-extrabold text-slate-800 text-sm block">
                  {customerName(invoice.customer_id as string)}
                </span>
                <span className="text-[11px] text-slate-400 font-mono" dir="ltr">
                  {invoice.invoice_no as string} • {formatDate(invoice.date as string)}
                </span>
              </div>
              <div className="text-end">
                <span className="font-mono font-black text-emerald-700 text-base block">
                  {formatNumber(invoice.amount as number || 0)}
                </span>
                <span className="text-[10px] text-slate-400">ج.م نقدي</span>
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

            {!isReadOnly && (
              <div className="flex gap-2 pt-1 border-t border-slate-100">
                <button
                  onClick={() => setEditing({ ...invoice })}
                  className="app-btn app-btn-ghost app-btn-sm flex-1 py-1.5 text-xs font-semibold text-blue-700 border-blue-200 hover:bg-blue-50"
                >
                  تعديل الفاتورة
                </button>
                <button
                  onClick={() => handleDelete(invoice)}
                  className="app-btn app-btn-ghost app-btn-sm px-3 py-1.5 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                >
                  حذف
                </button>
              </div>
            )}
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

      {filteredInvoices.length === 0 && (
        <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 mt-4">
          <h3 className="text-slate-700 font-bold text-base mb-1">
            {searchTerm.trim() ? 'لا توجد نتائج مطابقة لرقم الفاتورة' : 'لا توجد فواتير نقدية مسجلة'}
          </h3>
          <p className="text-slate-500 text-xs max-w-sm mx-auto">
            {searchTerm.trim()
              ? 'تأكد من رقم الفاتورة أو امسح البحث لعرض كل الفواتير.'
              : 'لم يتم إنشاء أي فواتير نقدية لهذا العرض حتى الآن. يمكنك إضافة فاتورة جديدة بالضغط على الزر أعلاه.'}
          </p>
        </div>
      )}

      {editing && (
        <CashInvoiceModal
          invoice={editing}
          reps={reps}
          customers={customers as { id: string; name: string; representative_id?: string | null }[]}
          products={products}
          stockMap={stockMap}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            showToast(msg)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
