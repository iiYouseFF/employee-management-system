import { useState, useMemo, useEffect } from 'react'
import { getTodayISO, formatMoney } from '@/shared/lib/format'
import { useAuth } from '@/features/auth/useAuth'
import { useSettings } from '@/features/settings/useSettings'
import {
  printCustomerPaymentReceipt,
  printGenericDocument,
} from '@/features/reporting/printableDocuments'
import { CUSTOMER_PAYMENT_METHODS, paymentMethodBadgeClass, paymentMethodLabel } from '@/shared/lib/paymentMethods'
import FormModal from '@/shared/ui/FormModal'
import Pagination from '@/shared/ui/Pagination'
import PageHeader from '@/shared/ui/PageHeader'
import FilterToolbar from '@/shared/ui/FilterToolbar'
import ResponsiveDataView from '@/shared/ui/ResponsiveDataView'
import { useDatePreset } from '@/shared/hooks/useDatePreset'
import { useRowSelection } from '@/shared/hooks/useRowSelection'
import { BulkActionBar } from '@/shared/ui/BulkActionBar'
import {
  useAddPayment,
  useUpdatePayment,
  useDeletePayment,
  useCustomers,
  usePayments,
  useCreditInvoices,
} from '@/features/sales/useInvoices'

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString('ar-EG') : '-'

export default function PaymentsTab({ repFilter, reps, showToast, isReadOnly = false, createSignal, onSignalHandled }: any) {
  const { data: payments = [], isLoading: paymentsLoading, error: paymentsError } = usePayments(repFilter)
  const { data: creditInvoices = [] } = useCreditInvoices()
  const addPayment = useAddPayment()
  const updatePayment = useUpdatePayment()
  const deletePayment = useDeletePayment()
  const { data: customers = [] } = useCustomers()
  const { data: settings } = useSettings()
  const { can } = useAuth()
  const canPrint = can('export_print')
  const companyName = settings?.title || 'المؤسسة المصرية لتوزيع المواد الغذائية'
  const [editing, setEditing] = useState<any | null>(null)

  useEffect(() => { if (createSignal) { openNew(); onSignalHandled?.() } }, [createSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => {
    const defaultRep = repFilter !== 'all' ? repFilter : reps[0]?.id || ''
    setEditing({
      date: getTodayISO(),
      customer_id: '',
      rep_id: defaultRep,
      credit_invoice_id: '',
      amount: '',
      method: 'نقدي',
    })
  }

  const openEdit = (payment: any) => {
    setEditing({
      id: payment.id,
      date: payment.date || '',
      customer_id: payment.customer_id || '',
      rep_id: payment.rep_id || '',
      credit_invoice_id: payment.credit_invoice_id || '',
      amount: payment.amount ?? '',
      method: payment.method || 'نقدي',
    })
  }

  const handleSubmit = async (values: Record<string, any>) => {
    const payload = {
      date: values.date,
      customer_id: values.customer_id || null,
      rep_id: values.rep_id || null,
      credit_invoice_id: values.credit_invoice_id || null,
      amount: parseFloat(values.amount) || 0,
      method: values.method || 'نقدي',
    }

    if (editing?.id) {
      await updatePayment.mutateAsync({ id: editing.id, ...payload })
      showToast('تم تحديث الدفعة')
    } else {
      await addPayment.mutateAsync(payload)
      showToast('تم إضافة دفعة جديدة')
    }
    setEditing(null)
  }

  const handleDelete = (payment: any) => {
    if (!confirm('هل أنت متأكد من حذف هذه الدفعة؟')) return
    deletePayment.mutate(payment.id)
    showToast('تم الحذف')
  }

  const customerName = (id?: string | null) =>
    customers.find((c: any) => c.id === id)?.name || '-'

  const repName = (id?: string | null) => reps.find((r: any) => r.id === id)?.name || '-'

  const invoiceNo = (id?: string | null) =>
    creditInvoices.find((inv: any) => inv.id === id)?.invoice_no || '-'

  const openInvoicesFor = (customerId?: string | null) =>
    creditInvoices
      .filter(
        (inv: any) => inv.customer_id === customerId && parseFloat(inv.remaining || 0) > 0
      )
      .sort((a: any, b: any) => String(a.date || '').localeCompare(String(b.date || '')))

  const balanceFor = (customerId?: string | null) =>
    creditInvoices
      .filter((inv: any) => inv.customer_id === customerId && inv.status !== 'cancelled')
      .reduce((sum: number, inv: any) => sum + parseFloat(inv.remaining || 0), 0)

  /** One-click settlement: fill the full remaining of the linked (or oldest open) invoice. */
  const settleFullRemaining = (values: Record<string, any>, setField: (name: string, value: any) => void) => {
    const customerId = values.customer_id
    if (!customerId) return
    const linked = creditInvoices.find(
      (inv: any) => inv.id === values.credit_invoice_id && inv.customer_id === customerId
    )
    const target = linked || openInvoicesFor(customerId)[0]
    if (!target) return
    if (!linked) setField('credit_invoice_id', target.id)
    setField('amount', String(Math.max(0, parseFloat(String(target.remaining || 0))).toFixed(2)))
  }

  const [searchTerm, setSearchTerm] = useState('')
  const { preset, from, to, setPreset, setFrom, setTo, reset } = useDatePreset('all')

  const filteredPayments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return (payments as any[]).filter((payment: any) => {
      const date = String(payment.date || '')
      if (from && date < from) return false
      if (to && date > to) return false
      if (!term) return true
      const customerLabel = (customers as any[]).find((c: any) => c.id === payment.customer_id)?.name || ''
      const invoiceLabel = creditInvoices.find((inv: any) => inv.id === payment.credit_invoice_id)?.invoice_no || ''
      return [customerLabel, invoiceLabel, payment.method]
        .some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [payments, searchTerm, from, to, customers, creditInvoices])

  const filteredTotal = filteredPayments.reduce(
    (sum: number, payment: any) => sum + parseFloat(payment.amount || 0),
    0
  )

  const handlePrintReceipt = (payment: any) => {
    void printCustomerPaymentReceipt({
      companyName,
      date: payment.date || '',
      customerName: customerName(payment.customer_id),
      repName: repName(payment.rep_id),
      invoiceNo: invoiceNo(payment.credit_invoice_id),
      amount: Number(payment.amount || 0),
      method: payment.method || 'نقدي',
    }).then((printed) => {
      if (!printed) showToast('يرجى السماح بالنوافذ المنبثقة للطباعة')
    })
  }

  const handlePrintList = () => {
    void printGenericDocument({
      companyName,
      title: 'سجل دفعات وتحصيلات العملاء',
      subtitle: from || to ? `من ${from || 'البداية'} إلى ${to || 'اليوم'}` : undefined,
      columns: [
        { label: '#', numeric: true },
        { label: 'التاريخ' },
        { label: 'العميل' },
        { label: 'المندوب' },
        { label: 'الفاتورة' },
        { label: 'المبلغ', numeric: true },
        { label: 'الطريقة' },
      ],
      rows: filteredPayments.map((payment: any, index: number) => [
        filteredPayments.length - index,
        formatDate(payment.date),
        customerName(payment.customer_id),
        repName(payment.rep_id),
        invoiceNo(payment.credit_invoice_id),
        formatMoney(payment.amount || 0, { withCurrency: false }),
        payment.method || '-',
      ]),
    }).then((printed) => {
      if (!printed) showToast('يرجى السماح بالنوافذ المنبثقة للطباعة')
    })
  }

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  const totalPages = Math.ceil(filteredPayments.length / pageSize) || 1
  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredPayments.slice(start, start + pageSize)
  }, [filteredPayments, currentPage, pageSize])

  const hasActiveFilters = !!searchTerm.trim() || !!from || !!to
  const resetFilters = () => {
    setSearchTerm('')
    reset()
    setCurrentPage(1)
  }

  // ── Bulk selection (print/delete the checked rows on this page) ─────────────
  const canSelect = canPrint || !isReadOnly
  const selection = useRowSelection(
    paginatedPayments as Record<string, unknown>[],
    (payment) => String(payment.id)
  )

  const handleBulkPrint = async () => {
    const printed = await printGenericDocument({
      companyName,
      title: 'الدفعات المحددة',
      columns: [
        { label: '#', numeric: true },
        { label: 'التاريخ' },
        { label: 'العميل' },
        { label: 'المندوب' },
        { label: 'الفاتورة' },
        { label: 'المبلغ', numeric: true },
        { label: 'الطريقة' },
      ],
      rows: selection.selectedRows.map((payment, index) => [
        String(selection.selectedRows.length - index),
        formatDate(String(payment.date || '')),
        customerName(String(payment.customer_id || '')),
        repName(String(payment.rep_id || '')),
        invoiceNo(String(payment.credit_invoice_id || '')),
        formatMoney(Number(payment.amount || 0), { withCurrency: false }),
        String(payment.method || '-'),
      ]),
    })
    if (printed) selection.clear()
    else showToast('يرجى السماح بالنوافذ المنبثقة للطباعة')
  }

  const handleBulkDelete = async () => {
    if (!confirm(`هل أنت متأكد من حذف ${selection.count} دفعة؟`)) return
    let failed = 0
    for (const payment of selection.selectedRows) {
      try {
        await deletePayment.mutateAsync(String(payment.id))
      } catch {
        failed += 1
      }
    }
    showToast(failed ? `تم حذف ${selection.count - failed} دفعة وفشل ${failed}` : `تم حذف ${selection.count} دفعة`)
    selection.clear()
  }

  const getMethodBadge = (method?: string) => {
    return <span className={paymentMethodBadgeClass(method)}>{paymentMethodLabel(method)}</span>
  }

  return (
    <div className="app-page space-y-5">
      <PageHeader
        title="سجل دفعات وتحصيلات العملاء"
        subtitle="سجّل وتابع دفعات العملاء وتحصيلات الذمم المدينة."
        count={`${filteredPayments.length} دفعة`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
              <span>إجمالي التحصيلات:</span>
              <span className="num font-extrabold text-sm">{formatMoney(filteredTotal)}</span>
            </div>
            {canPrint && (
              <button type="button" onClick={handlePrintList} className="app-btn app-btn-secondary">
                طباعة القائمة
              </button>
            )}
            {!isReadOnly && (
              <button type="button" onClick={openNew} className="app-btn app-btn-primary">+ تسجيل دفعة جديدة</button>
            )}
          </div>
        }
      />

      <FilterToolbar
        search={searchTerm}
        onSearchChange={(v) => { setSearchTerm(v); setCurrentPage(1) }}
        searchPlaceholder="بحث بالعميل أو رقم الفاتورة..."
        preset={preset}
        onPresetChange={(p) => { setPreset(p); setCurrentPage(1) }}
        from={from}
        to={to}
        onFromChange={(v) => { setFrom(v); setCurrentPage(1) }}
        onToChange={(v) => { setTo(v); setCurrentPage(1) }}
        onReset={resetFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {canSelect && (
        <BulkActionBar
          count={selection.count}
          onPrint={canPrint ? () => void handleBulkPrint() : undefined}
          onDelete={!isReadOnly ? () => void handleBulkDelete() : undefined}
          onClear={selection.clear}
          printLabel="طباعة الدفعات المحددة"
          deleteLabel="حذف الدفعات المحددة"
        />
      )}

      <ResponsiveDataView
        loading={paymentsLoading}
        error={paymentsError ? 'تعذّر تحميل الدفعات. أعد المحاولة لاحقاً.' : undefined}
        hasData={filteredPayments.length > 0}
        empty="لا توجد دفعات مطابقة للفلاتر الحالية."
        table={(
      <>
      {/* Desktop Payments Table */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
        <table className="app-table">
          <thead>
            <tr>
              {canSelect && (
                <th className="w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selection.allCurrentPageSelected}
                    onChange={selection.toggleCurrentPage}
                    aria-label="تحديد كل دفعات الصفحة"
                    className="h-4 w-4 accent-[var(--primary)] cursor-pointer"
                  />
                </th>
              )}
              <th className="w-12 text-center">#</th>
              <th className="text-center w-28">تاريخ الدفع</th>
              <th>العميل</th>
              <th className="text-center">المندوب</th>
              <th className="text-center w-32">الفاتورة المربوطة</th>
              <th className="text-center w-36 font-bold">المبلغ المحصل (ج.م)</th>
              <th className="text-center w-32">طريقة الدفع</th>
              {(!isReadOnly || canPrint) && <th className="text-center w-36">الإجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {(paginatedPayments as any[]).map((payment: any, idx: number) => (
              <tr key={payment.id}>
                {canSelect && (
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={selection.isSelected(String(payment.id))}
                      onChange={() => selection.toggle(String(payment.id))}
                      aria-label="تحديد الدفعة"
                      className="h-4 w-4 accent-[var(--primary)] cursor-pointer"
                    />
                  </td>
                )}
                <td className="text-center text-xs text-slate-400 font-mono">
                  {filteredPayments.length - ((currentPage - 1) * pageSize + idx)}
                </td>
                <td className="text-center text-xs text-slate-600 font-medium whitespace-nowrap">
                  {formatDate(payment.date)}
                </td>
                <td className="font-semibold text-slate-800">
                  {customerName(payment.customer_id)}
                </td>
                <td className="text-center text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    <span>{repName(payment.rep_id)}</span>
                  </span>
                </td>
                <td className="text-center text-xs font-mono font-semibold" dir="ltr">
                  {payment.credit_invoice_id ? (
                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                      {invoiceNo(payment.credit_invoice_id)}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-xs">-</span>
                  )}
                </td>
                <td className="text-center font-extrabold text-emerald-700 font-num text-sm whitespace-nowrap" dir="ltr">
                  {formatMoney(payment.amount || 0, { withCurrency: false })}
                </td>
                <td className="text-center whitespace-nowrap">{getMethodBadge(payment.method)}</td>
                {(!isReadOnly || canPrint) && (
                  <td>
                    <div className="flex gap-1 justify-center">
                      {canPrint && (
                        <button
                          onClick={() => handlePrintReceipt(payment)}
                          className="app-btn app-btn-sm app-btn-ghost text-xs hover:border-blue-400 hover:text-blue-700"
                          title="طباعة إيصال التحصيل"
                        >
                          إيصال
                        </button>
                      )}
                      {!isReadOnly && (
                        <>
                        <button
                          onClick={() => openEdit(payment)}
                          className="app-btn app-btn-sm app-btn-ghost text-xs hover:border-blue-400 hover:text-blue-700"
                          title="تعديل الدفعة"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => handleDelete(payment)}
                          className="app-btn app-btn-sm app-btn-ghost text-xs text-rose-600 hover:bg-rose-50 hover:border-rose-300"
                          title="حذف الدفعة"
                        >
                          حذف
                        </button>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {filteredPayments.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-200">
                <td className="px-3.5 py-3 text-center text-slate-700 font-extrabold" colSpan={canSelect ? 6 : 5}>
                  إجمالي المبالغ المحصلة
                </td>
                <td className="px-3.5 py-3 text-center text-emerald-800 font-num text-base font-extrabold whitespace-nowrap" dir="ltr">
                  {formatMoney(filteredTotal)}
                </td>
                <td colSpan={!isReadOnly || canPrint ? 2 : 1}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Mobile Card View (Optimized for field reps on phones) */}
      <div className="md:hidden space-y-3">
        {(paginatedPayments as any[]).map((payment: any) => (
          <div key={payment.id} className="app-card p-3.5 shadow-sm space-y-2.5">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
              {canSelect && (
                <input
                  type="checkbox"
                  checked={selection.isSelected(String(payment.id))}
                  onChange={() => selection.toggle(String(payment.id))}
                  aria-label="تحديد الدفعة"
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)] cursor-pointer"
                />
              )}
              <div>
                <span className="font-extrabold text-slate-800 text-sm block">
                  {customerName(payment.customer_id)}
                </span>
                <span className="text-[11px] text-slate-400">
                  {formatDate(payment.date)}
                </span>
              </div>
              <div className="text-end">
                <span className="font-num font-extrabold text-emerald-700 text-base block" dir="ltr">
                  {formatMoney(payment.amount || 0)}
                </span>
                <span className="text-[10px] font-bold text-slate-500">محصل</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px]">
                المندوب: {repName(payment.rep_id)}
              </span>
              <div>
                {getMethodBadge(payment.method)}
              </div>
            </div>

            {payment.credit_invoice_id && (
              <div className="text-xs bg-blue-50/60 p-2 rounded-xl flex items-center justify-between">
                <span className="text-slate-500 text-[11px]">الفاتورة الآجلة المربوطة:</span>
                <span className="font-mono font-bold text-blue-800" dir="ltr">
                  {invoiceNo(payment.credit_invoice_id)}
                </span>
              </div>
            )}

            {(!isReadOnly || canPrint) && (
              <div className="flex gap-2 pt-1 border-t border-slate-100">
                {canPrint && (
                  <button
                    onClick={() => handlePrintReceipt(payment)}
                    className="app-btn app-btn-ghost app-btn-sm flex-1 py-1.5 text-xs font-semibold text-blue-700 border-blue-200 hover:bg-blue-50"
                  >
                    طباعة الإيصال
                  </button>
                )}
                {!isReadOnly && (
                  <>
                    <button
                      onClick={() => openEdit(payment)}
                      className="app-btn app-btn-ghost app-btn-sm flex-1 py-1.5 text-xs font-semibold text-blue-700 border-blue-200 hover:bg-blue-50"
                    >
                      تعديل الدفعة
                    </button>
                    <button
                      onClick={() => handleDelete(payment)}
                      className="app-btn app-btn-ghost app-btn-sm px-3 py-1.5 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                    >
                      حذف
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination Component */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredPayments.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />
      </>
        )}
      />

      {editing && (
        <FormModal
          title={editing.id ? 'تعديل دفعة محصلة' : 'تسجيل دفعة محصلة جديدة'}
          initialValues={editing}
          customers={customers}
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
          onFieldChange={(name, value, values) => {
            if (name !== 'customer_id') return
            const customer = customers.find((c: any) => c.id === value)
            const patch: Record<string, any> = {}
            if (customer?.representative_id) patch.rep_id = customer.representative_id
            const linked = creditInvoices.find((inv: any) => inv.id === values.credit_invoice_id)
            if (!value) {
              patch.credit_invoice_id = ''
            } else if (!linked || linked.customer_id !== value) {
              patch.credit_invoice_id = openInvoicesFor(value)[0]?.id || ''
            }
            return patch
          }}
          renderExtras={(values, setField) => {
            const balance = balanceFor(values.customer_id)
            return (
              <div className="rounded-xl border border-primary-100 bg-primary-50/70 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-primary-900">رصيد العميل الحالي (الآجل غير المسدد)</span>
                  <span className="num font-extrabold text-[13px] text-primary-900">{formatMoney(balance)}</span>
                </div>
                {values.customer_id && balance > 0 && (
                  <button
                    type="button"
                    onClick={() => settleFullRemaining(values, setField)}
                    className="app-btn app-btn-secondary app-btn-sm mt-2 text-xs font-bold"
                  >
                    سداد كامل المتبقي
                  </button>
                )}
              </div>
            )
          }}
          fields={[
            { name: 'date', label: 'تاريخ الدفع والتحصيل', type: 'date', required: true },
            { name: 'customer_id', label: 'العميل', type: 'customer' },
            {
              name: 'rep_id',
              label: 'المندوب المحصل',
              type: 'select',
              required: true,
              placeholder: 'اختر المندوب',
              options: reps.map((rep: any) => ({ value: rep.id, label: rep.name })),
            },
            {
              name: 'credit_invoice_id',
              label: 'ربط بفاتورة آجل (اختياري)',
              type: 'select',
              placeholder: 'بدون ربط بفاتورة محددة (على الحساب)',
              options: (values) =>
                creditInvoices
                  .filter(
                    (inv: any) => !values.customer_id || inv.customer_id === values.customer_id
                  )
                  .sort((a: any, b: any) =>
                    String(a.date || '').localeCompare(String(b.date || ''))
                  )
                  .map((inv: any) => ({
                    value: inv.id,
                    label:
                      parseFloat(inv.remaining || 0) > 0
                        ? `${inv.invoice_no} (متبقي ${formatMoney(inv.remaining)})`
                        : `${inv.invoice_no} (مسدد بالكامل)`,
                  })),
            },
            {
              name: 'amount',
              label: 'المبلغ المحصل (ج.م)',
              type: 'number',
              required: true,
              min: 0,
              step: '0.01',
            },
            {
              name: 'method',
              label: 'طريقة التحصيل والدفع',
              type: 'select',
              options: CUSTOMER_PAYMENT_METHODS.map((method) => ({ value: method, label: method })),
            },
          ]}
        />
      )}
    </div>
  )
}
