import { useMemo, useState } from 'react'
import FormModal from '@/shared/ui/FormModal'
import Pagination from '@/shared/ui/Pagination'
import PageHeader from '@/shared/ui/PageHeader'
import FilterToolbar from '@/shared/ui/FilterToolbar'
import ResponsiveDataView from '@/shared/ui/ResponsiveDataView'
import { useDatePreset } from '@/shared/hooks/useDatePreset'
import { useRowSelection } from '@/shared/hooks/useRowSelection'
import { BulkActionBar } from '@/shared/ui/BulkActionBar'
import { useAuth } from '@/features/auth/useAuth'
import { useSettings } from '@/features/settings/useSettings'
import { printGenericDocument, printSupplierPaymentReceipt } from '@/features/reporting/printableDocuments'
import { toSearchableOptions } from '@/shared/ui/searchableSelectUtils'
import { formatMoney, getTodayISO } from '@/shared/lib/format'
import { SUPPLIER_PAYMENT_METHODS, paymentMethodBadgeClass, paymentMethodLabel } from '@/shared/lib/paymentMethods'
import {
  useAddSupplierPayment,
  useDeleteSupplierPayment,
  useSupplierPayments,
  useSupplierPurchases,
  useSuppliers,
  useUpdateSupplierPayment,
} from '@/features/suppliers/useSuppliers'

interface Props { showToast: (msg: string) => void }

const EMPTY_LIST: never[] = []

const emptyPayment = () => ({
  supplier_id: '',
  payment_date: getTodayISO(),
  amount: '',
  method: 'نقدي',
  reference: '',
  notes: '',
})

export default function SupplierPaymentsTab({ showToast }: Props) {
  const suppliersQuery = useSuppliers()
  const paymentsQuery = useSupplierPayments()
  const purchasesQuery = useSupplierPurchases()
  const suppliers = suppliersQuery.data ?? EMPTY_LIST
  const payments = paymentsQuery.data ?? EMPTY_LIST
  const purchases = purchasesQuery.data ?? EMPTY_LIST
  const addPayment = useAddSupplierPayment()
  const updatePayment = useUpdateSupplierPayment()
  const deletePayment = useDeleteSupplierPayment()
  const { data: settings } = useSettings()
  const { can } = useAuth()
  const canPrint = can('export_print')
  const companyName = settings?.title || 'المؤسسة المصرية لتوزيع المواد الغذائية'
  const [paymentForm, setPaymentForm] = useState<Record<string, unknown> | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const { preset, from, to, setPreset, setFrom, setTo, reset } = useDatePreset('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  const supplierOptions = useMemo(() => toSearchableOptions(suppliers), [suppliers])
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name || '-'
  const methodOptions = useMemo(() => {
    const current = String(paymentForm?.method || '')
    const options: { value: string; label: string }[] = SUPPLIER_PAYMENT_METHODS.map((m) => ({ value: m, label: m }))
    if (current && !(SUPPLIER_PAYMENT_METHODS as readonly string[]).includes(current)) {
      options.push({ value: current, label: paymentMethodLabel(current) })
    }
    return options
  }, [paymentForm?.method])

  const supplierBalance = (supplierId?: string | null, excludePaymentId?: string) => {
    if (!supplierId) return 0
    let balance = Number(suppliers.find((s) => s.id === supplierId)?.opening_balance || 0)
    for (const purchase of purchases) {
      if (purchase.supplier_id !== supplierId || purchase.payment_type !== 'credit') continue
      balance += Number(purchase.total_amount || 0)
    }
    for (const payment of payments) {
      if (payment.supplier_id !== supplierId || payment.id === excludePaymentId) continue
      balance -= Number(payment.amount || 0)
    }
    return balance
  }

  const filteredPayments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return payments.filter((p) => {
      const date = String(p.payment_date || '')
      if (from && date < from) return false
      if (to && date > to) return false
      if (!term) return true
      const supplier = suppliers.find((s) => s.id === p.supplier_id)
      return [supplier?.name || '-', paymentMethodLabel(p.method), p.reference, p.notes]
        .some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [payments, suppliers, searchTerm, from, to])

  const notifyPrintBlocked = (printed: boolean) => {
    if (!printed) showToast('يرجى السماح بالنوافذ المنبثقة للطباعة')
  }

  const handlePrintReceipt = (payment: (typeof payments)[number]) => {
    void printSupplierPaymentReceipt({
      companyName,
      date: payment.payment_date || '',
      supplierName: supplierName(payment.supplier_id),
      amount: Number(payment.amount || 0),
      method: paymentMethodLabel(payment.method),
      reference: payment.reference,
      notes: payment.notes,
    }).then(notifyPrintBlocked)
  }

  const handlePrintList = () => {
    void printGenericDocument({
      companyName,
      title: 'سجل مدفوعات الموردين',
      subtitle: from || to ? `من ${from || 'البداية'} إلى ${to || 'اليوم'}` : undefined,
      columns: [
        { label: '#', numeric: true },
        { label: 'التاريخ' },
        { label: 'المورد' },
        { label: 'المبلغ', numeric: true },
        { label: 'الطريقة' },
        { label: 'المرجع' },
        { label: 'ملاحظات' },
      ],
      rows: filteredPayments.map((payment, index) => [
        filteredPayments.length - index,
        new Date(payment.payment_date).toLocaleDateString('ar-EG'),
        supplierName(payment.supplier_id),
        formatMoney(Number(payment.amount || 0), { withCurrency: false }),
        paymentMethodLabel(payment.method),
        payment.reference || '-',
        payment.notes || '-',
      ]),
    }).then(notifyPrintBlocked)
  }

  const hasActiveFilters = !!searchTerm.trim() || !!from || !!to
  const resetFilters = () => {
    setSearchTerm('')
    reset()
    setCurrentPage(1)
  }

  const totalPages = Math.ceil(filteredPayments.length / pageSize) || 1
  const safePage = Math.min(currentPage, totalPages)
  const paginated = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredPayments.slice(start, start + pageSize)
  }, [filteredPayments, safePage, pageSize])

  const openEdit = (payment: (typeof payments)[number]) => setPaymentForm({
    id: payment.id,
    supplier_id: payment.supplier_id,
    payment_date: payment.payment_date,
    amount: payment.amount,
    method: payment.method || 'نقدي',
    reference: payment.reference || '',
    notes: payment.notes || '',
  })

  const handleSubmitPayment = async (values: Record<string, unknown>) => {
    const payload = {
      supplier_id: String(values.supplier_id),
      payment_date: String(values.payment_date || getTodayISO()),
      amount: Number(values.amount),
      method: String(values.method || 'نقدي'),
      reference: String(values.reference || '').trim() || null,
      notes: String(values.notes || '').trim() || null,
    }
    try {
      if (paymentForm?.id) {
        await updatePayment.mutateAsync({ id: String(paymentForm.id), ...payload })
        showToast('تم تحديث دفعة المورد بنجاح')
      } else {
        await addPayment.mutateAsync(payload)
        showToast('تم تسجيل الدفعة للمورد بنجاح')
      }
      setPaymentForm(null)
    } catch (err) {
      showToast(`تعذر حفظ دفعة المورد: ${(err as Error)?.message || 'خطأ غير معروف'}`)
      throw err
    }
  }

  // ── Bulk selection (print/delete the checked rows on this page) ─────────────
  const selection = useRowSelection(paginated, (payment) => String(payment.id))

  const handleBulkPrint = async () => {
    const printed = await printGenericDocument({
      companyName,
      title: 'مدفوعات الموردين المحددة',
      columns: [
        { label: '#', numeric: true },
        { label: 'التاريخ' },
        { label: 'المورد' },
        { label: 'المبلغ', numeric: true },
        { label: 'الطريقة' },
        { label: 'المرجع' },
        { label: 'ملاحظات' },
      ],
      rows: selection.selectedRows.map((payment, index) => [
        String(selection.selectedRows.length - index),
        new Date(payment.payment_date).toLocaleDateString('ar-EG'),
        supplierName(payment.supplier_id),
        formatMoney(Number(payment.amount || 0), { withCurrency: false }),
        paymentMethodLabel(payment.method),
        payment.reference || '-',
        payment.notes || '-',
      ]),
    })
    if (printed) selection.clear()
    else notifyPrintBlocked(printed)
  }

  const handleBulkDelete = async () => {
    if (!confirm(`هل أنت متأكد من حذف ${selection.count} دفعة مورد؟`)) return
    let failed = 0
    for (const payment of selection.selectedRows) {
      try {
        await deletePayment.mutateAsync(payment.id)
      } catch {
        failed += 1
      }
    }
    showToast(failed ? `تم حذف ${selection.count - failed} دفعة وفشل ${failed}` : `تم حذف ${selection.count} دفعة`)
    selection.clear()
  }

  const handleDelete = async (payment: (typeof payments)[number]) => {
    if (!confirm('هل أنت متأكد من حذف دفعة المورد هذه؟')) return
    try {
      await deletePayment.mutateAsync(payment.id)
      showToast('تم حذف دفعة المورد بنجاح')
    } catch (err) {
      showToast(`تعذر حذف دفعة المورد: ${(err as Error)?.message || 'خطأ غير معروف'}`)
    }
  }

  return (
    <div className="app-page space-y-5">
      <PageHeader
        title="مدفوعات الموردين"
        count={`${filteredPayments.length} دفعة`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canPrint && (
              <button type="button" onClick={handlePrintList} className="app-btn app-btn-secondary py-2 text-xs sm:text-sm">
                طباعة القائمة
              </button>
            )}
            <button type="button" onClick={() => setPaymentForm(emptyPayment())} className="app-btn app-btn-primary py-2 text-xs sm:text-sm">+ تسجيل دفعة مورد</button>
          </div>
        }
      />

      <FilterToolbar
        search={searchTerm}
        onSearchChange={(v) => { setSearchTerm(v); setCurrentPage(1) }}
        searchPlaceholder="بحث بالمورد أو المرجع..."
        preset={preset}
        onPresetChange={(p) => { setPreset(p); setCurrentPage(1) }}
        from={from}
        to={to}
        onFromChange={(v) => { setFrom(v); setCurrentPage(1) }}
        onToChange={(v) => { setTo(v); setCurrentPage(1) }}
        onReset={resetFilters}
        hasActiveFilters={hasActiveFilters}
      />

      <BulkActionBar
        count={selection.count}
        onPrint={canPrint ? () => void handleBulkPrint() : undefined}
        onDelete={() => void handleBulkDelete()}
        onClear={selection.clear}
        printLabel="طباعة المدفوعات المحددة"
        deleteLabel="حذف المدفوعات المحددة"
      />

      <ResponsiveDataView
        loading={paymentsQuery.isPending || suppliersQuery.isPending || purchasesQuery.isPending}
        error={paymentsQuery.isError ? (
          <div>
            <p className="text-sm font-bold text-rose-700">تعذر تحميل مدفوعات الموردين</p>
            <button type="button" onClick={() => paymentsQuery.refetch()} className="app-btn app-btn-sm app-btn-ghost mt-3">
              إعادة المحاولة
            </button>
          </div>
        ) : undefined}
        hasData={filteredPayments.length > 0}
        empty={
          <div>
            <h3 className="text-slate-700 font-bold text-base mb-1">لا توجد مدفوعات مسجلة</h3>
            <p className="text-slate-500 text-xs max-w-sm mx-auto">سجل دفعات الموردين وطرق الدفع من هنا.</p>
          </div>
        }
        table={
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
            <table className="app-table">
              <thead>
                <tr>
                  <th className="w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selection.allCurrentPageSelected}
                      onChange={selection.toggleCurrentPage}
                      aria-label="تحديد كل مدفوعات الصفحة"
                      className="h-4 w-4 accent-[var(--primary)] cursor-pointer"
                    />
                  </th>
                  <th className="w-12 text-center">#</th>
                  <th className="text-center">التاريخ</th>
                  <th>المورد</th>
                  <th className="text-center">المبلغ</th>
                  <th className="text-center">طريقة الدفع</th>
                  <th className="text-center">المرجع</th>
                  <th>ملاحظات</th>
                  <th className="text-center w-36">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((p, idx) => (
                  <tr key={p.id}>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={selection.isSelected(String(p.id))}
                        onChange={() => selection.toggle(String(p.id))}
                        aria-label="تحديد دفعة المورد"
                        className="h-4 w-4 accent-[var(--primary)] cursor-pointer"
                      />
                    </td>
                    <td className="text-center text-xs text-slate-400 font-mono">{filteredPayments.length - ((safePage - 1) * pageSize + idx)}</td>
                    <td className="text-center text-xs font-mono text-slate-600">{new Date(p.payment_date).toLocaleDateString('ar-EG')}</td>
                    <td className="font-semibold text-slate-800">{supplierName(p.supplier_id)}</td>
                    <td className="text-center font-num font-extrabold tabular-nums text-emerald-700" dir="ltr">{formatMoney(Number(p.amount || 0))}</td>
                    <td className="text-center"><span className={paymentMethodBadgeClass(p.method)}>{paymentMethodLabel(p.method)}</span></td>
                    <td className="text-center font-mono text-xs" dir="ltr">{p.reference || '-'}</td>
                    <td className="text-xs text-slate-500">{p.notes || '-'}</td>
                    <td>
                      <div className="flex gap-1.5 justify-center">
                        {canPrint && (
                          <button type="button" onClick={() => handlePrintReceipt(p)} className="app-btn app-btn-sm app-btn-ghost text-xs">إيصال</button>
                        )}
                        <button type="button" onClick={() => openEdit(p)} className="app-btn app-btn-sm app-btn-ghost text-xs">تعديل</button>
                        <button type="button" onClick={() => handleDelete(p)} disabled={deletePayment.isPending} className="app-btn app-btn-sm app-btn-danger text-xs">حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
        cards={paginated.map((p) => (
          <div key={p.id} className="app-card p-3.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <input
                type="checkbox"
                checked={selection.isSelected(String(p.id))}
                onChange={() => selection.toggle(String(p.id))}
                aria-label="تحديد دفعة المورد"
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)] cursor-pointer"
              />
              <div>
                <div className="font-bold text-slate-800 text-sm">{supplierName(p.supplier_id)}</div>
                <div className="text-[11px] text-slate-400 font-mono">{new Date(p.payment_date).toLocaleDateString('ar-EG')}</div>
              </div>
              <div className="text-end">
                <div className="font-num font-extrabold text-emerald-700 tabular-nums" dir="ltr">{formatMoney(Number(p.amount || 0))}</div>
                <span className={`${paymentMethodBadgeClass(p.method)} mt-1 inline-flex`}>{paymentMethodLabel(p.method)}</span>
              </div>
            </div>
            {p.reference && <div className="text-xs text-slate-500">المرجع: <span className="font-mono" dir="ltr">{p.reference}</span></div>}
            {p.notes && <div className="text-xs text-slate-500">{p.notes}</div>}
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              {canPrint && (
                <button type="button" onClick={() => handlePrintReceipt(p)} className="app-btn app-btn-ghost app-btn-sm flex-1 py-1.5 text-xs">إيصال</button>
              )}
              <button type="button" onClick={() => openEdit(p)} className="app-btn app-btn-ghost app-btn-sm flex-1 py-1.5 text-xs">تعديل</button>
              <button type="button" onClick={() => handleDelete(p)} disabled={deletePayment.isPending} className="app-btn app-btn-danger app-btn-sm flex-1 py-1.5 text-xs">حذف</button>
            </div>
          </div>
        ))}
        footer={<Pagination currentPage={safePage} totalPages={totalPages} totalItems={filteredPayments.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1) }} />}
      />

      {paymentForm && (
        <FormModal
          title={paymentForm?.id ? 'تعديل دفعة مورد' : 'سداد دفعة لمورد'}
          initialValues={paymentForm}
          onClose={() => setPaymentForm(null)}
          onSubmit={handleSubmitPayment}
          submitLabel={paymentForm?.id ? 'حفظ التعديلات' : 'تسجيل الدفعة'}
          validate={(values) => {
            if (!values.supplier_id) return 'اختر المورد'
            if (!values.amount || Number(values.amount) <= 0) return 'قيمة الدفعة يجب أن تكون أكبر من صفر'
            return null
          }}
          renderExtras={(values, setField) => {
            const balance = supplierBalance(String(values.supplier_id || ''), paymentForm?.id ? String(paymentForm.id) : undefined)
            return (
              <div className="mt-5 rounded-xl border border-primary-100 bg-primary-50/70 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-primary-900">رصيد المورد الحالي (الآجل غير المسدد)</span>
                  <span className="num font-extrabold text-[13px] text-primary-900">{formatMoney(balance)}</span>
                </div>
                {values.supplier_id && balance > 0 && (
                  <button
                    type="button"
                    onClick={() => setField('amount', String(Math.max(0, balance).toFixed(2)))}
                    className="app-btn app-btn-secondary app-btn-sm mt-2 text-xs font-bold"
                  >
                    سداد كامل المتبقي
                  </button>
                )}
              </div>
            )
          }}
          fields={[
            { name: 'supplier_id', label: 'المورد', type: 'searchable', required: true, placeholder: 'اختر المورد', searchPlaceholder: 'ابحث عن مورد بالاسم أو الهاتف...', options: supplierOptions, full: true },
            { name: 'payment_date', label: 'تاريخ الدفعة', type: 'date', required: true },
            {
              name: 'method', label: 'طريقة الدفع', type: 'select', required: true,
              options: methodOptions,
            },
            { name: 'amount', label: 'قيمة الدفعة (ج.م)', type: 'number', required: true, min: 0, step: '0.01' },
            { name: 'reference', label: 'المرجع / رقم العملية', dir: 'ltr' },
            { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true },
          ]}
        />
      )}
    </div>
  )
}
