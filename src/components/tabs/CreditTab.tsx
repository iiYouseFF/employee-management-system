import { useState } from 'react'
import { getTodayISO, addDays, formatNumber } from '../../lib/format'
import Modal from '../Modal'
import SearchableCustomer from '../SearchableCustomer'
import InvoiceLineEditor, { type LineItem } from '../InvoiceLineEditor'
import {
  useCreditInvoices,
  useCustomers,
} from '../../hooks/useInvoices'
import { useProducts } from '../../hooks/useProducts'
import {
  useSaveCreditInvoice,
  useDeleteCreditInvoiceWithStock,
  useProductStock,
  useInvoiceLines,
  type InvoiceLine,
} from '../../hooks/useInventory'

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString('ar-EG') : '-'

// ─── Credit Invoice edit modal with line items ──────────────────────────────
function CreditInvoiceModal({
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
    'credit',
    isEdit ? (invoice.id as string) : null
  )

  const save = useSaveCreditInvoice()

  const [form, setForm] = useState({
    date: (invoice.date as string) || getTodayISO(),
    invoice_no: (invoice.invoice_no as string) || '',
    customer_id: (invoice.customer_id as string) || '',
    rep_id: (invoice.rep_id as string) || '',
    item: (invoice.item as string) || '',
    due_date: (invoice.due_date as string) || addDays(getTodayISO(), 30),
    paid: (invoice.paid as number) ?? 0,
  })
  const [lines, setLines] = useState<LineItem[]>([])
  const [linesReady, setLinesReady] = useState(!isEdit)
  const [err, setErr] = useState('')

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

  const setField = (name: string, value: unknown) =>
    setForm((f) => {
      const next = { ...f, [name]: value }
      if (name === 'customer_id') {
        const cust = customers.find((c) => c.id === value)
        if (cust?.representative_id) next.rep_id = cust.representative_id
      }
      return next
    })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')

    const validLines: InvoiceLine[] = lines
      .filter((l) => l.product_id && l.qty > 0)
      .map((l) => ({ product_id: l.product_id, qty: l.qty, unit_price: l.unit_price }))

    if (validLines.length === 0) {
      setErr('أضف صنفاً واحداً على الأقل للفاتورة')
      return
    }
    if (!form.rep_id) {
      setErr('اختر المندوب')
      return
    }

    try {
      const payload: Record<string, unknown> = { ...form }
      if (isEdit) payload.id = invoice.id
      await save.mutateAsync({ invoice: payload, lines: validLines })
      onSaved(isEdit ? 'تم تحديث الفاتورة وتعديل المخزون' : 'تمت إضافة الفاتورة الآجلة وتسجيل الصرف من المخزون')
    } catch (e: unknown) {
      setErr((e as Error).message)
    }
  }

  const grandTotal = lines.reduce((s, l) => s + (l.line_total || 0), 0)

  if (isEdit && linesLoading) {
    return (
      <Modal title="تعديل فاتورة آجلة" onClose={onClose}>
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 border-3 border-slate-200 border-t-primary-700 rounded-full animate-spin" />
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title={isEdit ? 'تعديل فاتورة آجلة' : 'فاتورة آجلة جديدة'}
      onClose={save.isPending ? () => {} : onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Header fields */}
        <div className="grid grid-cols-2 gap-3">
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
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الاستحقاق</label>
            <input type="date" value={form.due_date} onChange={(e) => setField('due_date', e.target.value)}
              className="app-input text-xs" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المدفوع مقدماً (ج.م)</label>
            <input type="number" min={0} step="0.01" value={form.paid} onChange={(e) => setField('paid', parseFloat(e.target.value) || 0)}
              className="app-input text-xs font-mono" dir="ltr" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات / بيان إضافي</label>
            <input type="text" value={form.item} onChange={(e) => setField('item', e.target.value)}
              className="app-input text-xs" placeholder="بيان الأصناف أو ملاحظات..." />
          </div>
        </div>

        {/* Line editor */}
        {linesReady && (
          <InvoiceLineEditor
            products={products as Parameters<typeof InvoiceLineEditor>[0]['products']}
            stockMap={stockMap}
            initialLines={lines.length ? lines : undefined}
            onChange={setLines}
            disabled={save.isPending}
          />
        )}

        {/* Grand total & Remaining summary */}
        {grandTotal > 0 && (
          <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <span className="text-xs text-slate-500 font-medium">المتبقي الآجل: </span>
              <span className="font-mono font-bold text-rose-700 text-sm">
                {formatNumber(Math.max(0, grandTotal - Number(form.paid)))} ج.م
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 font-medium">إجمالي الفاتورة: </span>
              <span className="font-mono font-extrabold text-slate-900 text-base">
                {formatNumber(grandTotal)} ج.م
              </span>
            </div>
          </div>
        )}

        {err && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 font-medium">
            {err}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={save.isPending} className="app-btn app-btn-primary flex-1">
            {save.isPending ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                جاري الحفظ...
              </span>
            ) : isEdit ? 'حفظ التعديلات' : 'إضافة الفاتورة'}
          </button>
          <button type="button" onClick={onClose} disabled={save.isPending}
            className="app-btn app-btn-ghost px-5">
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Main CreditTab ──────────────────────────────────────────────────────────
export default function CreditTab({ repFilter, reps, showToast, isReadOnly = false }: {
  repFilter: string
  reps: { id: string; name: string }[]
  showToast: (msg: string) => void
  isReadOnly?: boolean
}) {
  const { data: invoices = [] } = useCreditInvoices(repFilter)
  const { data: allInvoices = [] } = useCreditInvoices()
  const { data: customers = [] } = useCustomers()
  const { data: products = [] } = useProducts()
  const { data: stockRows = [] } = useProductStock()
  const deleteInvoice = useDeleteCreditInvoiceWithStock()

  const stockMap: Record<string, number> = {}
  for (const r of stockRows) stockMap[r.product_id] = Number(r.on_hand)

  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)

  const nextInvoiceNo = () => {
    const used = new Set(allInvoices.map((inv: any) => inv.invoice_no))
    let n = 2000 + allInvoices.length + 1
    while (used.has(`A-${n}`)) n++
    return `A-${n}`
  }

  const openNew = () => {
    const defaultRep = repFilter !== 'all' ? repFilter : reps[0]?.id || ''
    setEditing({
      date: getTodayISO(),
      invoice_no: nextInvoiceNo(),
      customer_id: '',
      rep_id: defaultRep,
      item: '',
      due_date: addDays(getTodayISO(), 30),
      paid: 0,
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

  const repName = (id?: string | null) => reps.find((r) => r.id === id)?.name || '-'

  const getStatusBadge = (invoice: any) => {
    const remaining = parseFloat(invoice.remaining || 0)
    if (remaining <= 0) {
      return <span className="badge badge-success">مسدد بالكامل</span>
    }
    if (parseFloat(invoice.paid || 0) > 0 || parseFloat(invoice.linked_payments || 0) > 0) {
      return <span className="badge badge-warning">مسدد جزئياً</span>
    }
    return <span className="badge badge-danger">غير مسدد</span>
  }

  const totals = invoices.reduce(
    (acc: any, inv: any) => {
      acc.amount += parseFloat(inv.amount || 0)
      acc.paid += parseFloat(inv.paid || 0) + parseFloat(inv.linked_payments || 0)
      acc.remaining += parseFloat(inv.remaining || 0)
      return acc
    },
    { amount: 0, paid: 0, remaining: 0 }
  )

  return (
    <div>
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-800">سجل فواتير البيع الآجل (الذمم المدينة)</h2>
          <span className="badge badge-primary">{invoices.length} فاتورة</span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 shadow-sm">
            <span>إجمالي الآجل:</span>
            <span className="font-extrabold text-slate-900 font-mono text-sm sm:text-base">
              {formatNumber(totals.amount)} ج.م
            </span>
          </div>

          <div className="inline-flex items-center gap-2 bg-rose-50 border border-rose-200/80 rounded-xl px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-rose-800 shadow-sm">
            <span>المتبقي غير المسدد:</span>
            <span className="font-extrabold text-rose-950 font-mono text-sm sm:text-base">
              {formatNumber(totals.remaining)} ج.م
            </span>
          </div>

          {!isReadOnly && (
            <button
              onClick={openNew}
              className="app-btn app-btn-primary py-2 text-xs sm:text-sm shadow-sm"
            >
              <span>+</span>
              <span>فاتورة آجلة جديدة</span>
            </button>
          )}
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
        <table className="app-table">
          <thead>
            <tr>
              <th className="w-12 text-center">#</th>
              <th className="text-center w-28">التاريخ</th>
              <th className="text-center w-32">رقم الفاتورة</th>
              <th>العميل</th>
              <th className="text-center">المندوب</th>
              <th>بيان / أصناف</th>
              <th className="text-center w-28 font-bold">المبلغ (ج.م)</th>
              <th className="text-center w-28">الاستحقاق</th>
              <th className="text-center w-28">المسدد</th>
              <th className="text-center w-28 font-bold">المتبقي</th>
              <th className="text-center">الحالة</th>
              {!isReadOnly && <th className="text-center w-28">الإجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {(invoices as any[]).map((invoice: any, idx: number) => (
              <tr key={invoice.id}>
                <td className="text-center text-xs text-slate-400 font-mono">
                  {invoices.length - idx}
                </td>
                <td className="text-center text-xs text-slate-600 font-medium whitespace-nowrap">
                  {formatDate(invoice.date)}
                </td>
                <td className="text-center text-xs font-mono font-semibold text-slate-700" dir="ltr">
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200">
                    {invoice.invoice_no}
                  </span>
                </td>
                <td className="font-semibold text-slate-800">
                  {customerName(invoice.customer_id)}
                </td>
                <td className="text-center text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {repName(invoice.rep_id)}
                  </span>
                </td>
                <td className="text-xs text-slate-500 max-w-xs truncate">
                  {invoice.item || '-'}
                </td>
                <td className="text-center font-bold text-slate-900 font-mono text-sm whitespace-nowrap">
                  {formatNumber(invoice.amount || 0)}
                </td>
                <td className="text-center text-xs text-slate-600 font-mono whitespace-nowrap">
                  {formatDate(invoice.due_date)}
                </td>
                <td className="text-center font-mono text-xs text-emerald-700 whitespace-nowrap">
                  {formatNumber(parseFloat(invoice.paid || 0) + parseFloat(invoice.linked_payments || 0))}
                </td>
                <td className="text-center font-mono text-sm font-bold text-rose-700 whitespace-nowrap">
                  {formatNumber(invoice.remaining || 0)}
                </td>
                <td className="text-center">{getStatusBadge(invoice)}</td>
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
          {invoices.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-200">
                <td className="px-3.5 py-3 text-center text-slate-700 font-extrabold" colSpan={6}>
                  الإجمالي
                </td>
                <td className="px-3.5 py-3 text-center text-slate-900 font-mono text-sm font-extrabold whitespace-nowrap">
                  {formatNumber(totals.amount)}
                </td>
                <td className="px-3.5 py-3"></td>
                <td className="px-3.5 py-3 text-center text-emerald-800 font-mono text-sm font-extrabold whitespace-nowrap">
                  {formatNumber(totals.paid)}
                </td>
                <td className="px-3.5 py-3 text-center text-rose-800 font-mono text-sm font-extrabold whitespace-nowrap">
                  {formatNumber(totals.remaining)}
                </td>
                <td colSpan={!isReadOnly ? 2 : 1}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Mobile Card View (Optimized for field reps on phones) */}
      <div className="md:hidden space-y-3">
        {(invoices as any[]).map((invoice: any) => (
          <div key={invoice.id} className="app-card p-3.5 shadow-sm space-y-2.5">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <span className="font-extrabold text-slate-800 text-sm block">
                  {customerName(invoice.customer_id)}
                </span>
                <span className="text-[11px] text-slate-400 font-mono" dir="ltr">
                  {invoice.invoice_no} • {formatDate(invoice.date)}
                </span>
              </div>
              <div className="text-end">
                <span className="font-mono font-black text-slate-900 text-base block">
                  {formatNumber(invoice.amount || 0)}
                </span>
                <span className="text-[10px] text-slate-400">ج.م آجل</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-xl">
              <div>
                <span className="text-slate-400 block text-[10px]">المسدد:</span>
                <span className="font-mono font-bold text-emerald-700 text-xs">
                  {formatNumber(parseFloat(invoice.paid || 0) + parseFloat(invoice.linked_payments || 0))} ج.م
                </span>
              </div>
              <div className="text-center">
                <span className="text-slate-400 block text-[10px]">المتبقي:</span>
                <span className="font-mono font-extrabold text-rose-700 text-xs">
                  {formatNumber(invoice.remaining || 0)} ج.م
                </span>
              </div>
              <div className="text-end">
                {getStatusBadge(invoice)}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px]">
                المندوب: {repName(invoice.rep_id)}
              </span>
              {invoice.due_date && (
                <span className="text-[11px] text-slate-500 font-mono">
                  استحقاق: {formatDate(invoice.due_date)}
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

      {invoices.length === 0 && (
        <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 mt-4">
          <h3 className="text-slate-700 font-bold text-base mb-1">لا توجد فواتير آجلة مسجلة</h3>
          <p className="text-slate-500 text-xs max-w-sm mx-auto">
            لم يتم تسجيل أي فواتير بيع آجل حتى الآن. يمكنك إضافة فاتورة جديدة بالضغط على الزر أعلاه.
          </p>
        </div>
      )}

      {editing && (
        <CreditInvoiceModal
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
