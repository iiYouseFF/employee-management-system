import { useState } from 'react'
import { getTodayISO, formatNumber } from '../../lib/format'
import FormModal from '../FormModal'
import {
  useAddPayment,
  useUpdatePayment,
  useDeletePayment,
  useCustomers,
  usePayments,
  useCreditInvoices,
} from '../../hooks/useInvoices'

const paymentMethods = ['نقدي', 'تحويل بنكي', 'شيك', 'محفظة إلكترونية', 'آجل']

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString('ar-EG') : '-'

export default function PaymentsTab({ repFilter, reps, showToast, isReadOnly = false }: any) {
  const { data: payments = [] } = usePayments(repFilter)
  const { data: creditInvoices = [] } = useCreditInvoices()
  const addPayment = useAddPayment()
  const updatePayment = useUpdatePayment()
  const deletePayment = useDeletePayment()
  const { data: customers = [] } = useCustomers()
  const [editing, setEditing] = useState<any | null>(null)

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

  const total = payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount || 0), 0)

  const getMethodBadge = (method?: string) => {
    switch (method) {
      case 'نقدي':
        return <span className="badge badge-success">نقدي</span>
      case 'تحويل بنكي':
        return <span className="badge badge-primary">تحويل بنكي</span>
      case 'شيك':
        return <span className="badge badge-warning">شيك</span>
      case 'محفظة إلكترونية':
        return <span className="badge badge-info">محفظة</span>
      default:
        return <span className="badge badge-neutral">{method || '-'}</span>
    }
  }

  return (
    <div>
      {/* Tab Top Controls & Summary Chips */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-800">سجل دفعات وتحصيلات العملاء</h2>
          <span className="badge badge-primary">{payments.length} دفعة</span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200/80 rounded-xl px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-emerald-800 shadow-sm">
            <span>إجمالي التحصيلات:</span>
            <span className="font-extrabold text-emerald-950 font-mono text-sm sm:text-base">
              {formatNumber(total)} ج.م
            </span>
          </div>

          {!isReadOnly && (
            <button
              onClick={openNew}
              className="app-btn app-btn-primary py-2 text-xs sm:text-sm shadow-sm"
            >
              <span>+</span>
              <span>تسجيل دفعة جديدة</span>
            </button>
          )}
        </div>
      </div>

      {/* Modern Payments Table */}
      <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
        <table className="app-table">
          <thead>
            <tr>
              <th className="w-12 text-center">#</th>
              <th className="text-center w-28">تاريخ الدفع</th>
              <th>العميل</th>
              <th className="text-center">المندوب</th>
              <th className="text-center w-32">الفاتورة المربوطة</th>
              <th className="text-center w-36 font-bold">المبلغ المحصل (ج.م)</th>
              <th className="text-center w-32">طريقة الدفع</th>
              {!isReadOnly && <th className="text-center w-28">الإجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {payments.map((payment: any, idx: number) => (
              <tr key={payment.id}>
                <td className="text-center text-xs text-slate-400 font-mono">
                  {payments.length - idx}
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
                <td className="text-center font-bold text-emerald-700 font-mono text-sm whitespace-nowrap">
                  {formatNumber(payment.amount || 0)}
                </td>
                <td className="text-center whitespace-nowrap">{getMethodBadge(payment.method)}</td>
                {!isReadOnly && (
                  <td>
                    <div className="flex gap-1 justify-center">
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
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {payments.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-200">
                <td className="px-3.5 py-3 text-center text-slate-700 font-extrabold" colSpan={5}>
                  إجمالي المبالغ المحصلة
                </td>
                <td className="px-3.5 py-3 text-center text-emerald-800 font-mono text-base font-extrabold whitespace-nowrap">
                  {formatNumber(total)} ج.م
                </td>
                <td colSpan={!isReadOnly ? 2 : 1}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {payments.length === 0 && (
        <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 mt-4">
          <h3 className="text-slate-700 font-bold text-base mb-1">لا توجد دفعات مسجلة</h3>
          <p className="text-slate-500 text-xs max-w-sm mx-auto">
            لم يتم تسجيل أي دفعات سداد لهذا العرض حتى الآن. يمكنك تسجيل دفعة نقدية جديدة من الزر أعلاه.
          </p>
        </div>
      )}

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
                        ? `${inv.invoice_no} (متبقي ${formatNumber(inv.remaining)} ج.م)`
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
              options: paymentMethods.map((method) => ({ value: method, label: method })),
            },
          ]}
        />
      )}
    </div>
  )
}
