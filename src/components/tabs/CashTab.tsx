import { useState } from 'react'
import { getTodayISO, formatNumber } from '../../lib/format'
import FormModal from '../FormModal'
import {
  useCashInvoices,
  useAddCashInvoice,
  useUpdateCashInvoice,
  useDeleteCashInvoice,
  useCustomers,
} from '../../hooks/useInvoices'

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString('ar-EG') : '-'

export default function CashTab({ repFilter, reps, showToast, isReadOnly = false }: any) {
  const { data: invoices = [] } = useCashInvoices(repFilter)
  const { data: customers = [] } = useCustomers()
  const addInvoice = useAddCashInvoice()
  const updateInvoice = useUpdateCashInvoice()
  const deleteInvoice = useDeleteCashInvoice()
  const [editing, setEditing] = useState<any | null>(null)

  const openNew = () => {
    const defaultRep = repFilter !== 'all' ? repFilter : reps[0]?.id || ''
    setEditing({
      date: getTodayISO(),
      invoice_no: `CASH-${Date.now().toString().slice(-6)}`,
      customer_id: '',
      rep_id: defaultRep,
      item: 'مواد غذائية',
      amount: '',
      notes: '',
    })
  }

  const openEdit = (invoice: any) => {
    setEditing({
      id: invoice.id,
      date: invoice.date || '',
      invoice_no: invoice.invoice_no || '',
      customer_id: invoice.customer_id || '',
      rep_id: invoice.rep_id || '',
      item: invoice.item || '',
      amount: invoice.amount ?? '',
      notes: invoice.notes || '',
    })
  }

  const handleSubmit = async (values: Record<string, any>) => {
    const payload = {
      date: values.date,
      invoice_no: String(values.invoice_no).trim(),
      customer_id: values.customer_id || null,
      rep_id: values.rep_id || null,
      item: values.item || '',
      amount: parseFloat(values.amount) || 0,
      notes: values.notes || null,
    }

    if (editing?.id) {
      await updateInvoice.mutateAsync({ id: editing.id, ...payload })
      showToast('تم تحديث الفاتورة')
    } else {
      await addInvoice.mutateAsync(payload)
      showToast('تم إضافة فاتورة نقدية جديدة')
    }
    setEditing(null)
  }

  const handleDelete = (invoice: any) => {
    if (!confirm(`هل أنت متأكد من حذف الفاتورة ${invoice.invoice_no}؟`)) return
    deleteInvoice.mutate(invoice.id)
    showToast('تم الحذف')
  }

  const customerName = (id?: string | null) =>
    customers.find((c: any) => c.id === id)?.name || '-'

  const repName = (id?: string | null) => reps.find((r: any) => r.id === id)?.name || '-'

  const total = invoices.reduce(
    (sum: number, inv: any) => sum + parseFloat(inv.amount || 0),
    0
  )

  return (
    <div>
      {/* Tab Top Controls & Summary Chips */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-800">سجل فواتير البيع النقدي</h2>
          <span className="badge badge-primary">{invoices.length} فاتورة</span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200/80 rounded-xl px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-emerald-800 shadow-sm">
            <span>إجمالي المبيعات النقدية:</span>
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
              <span>فاتورة نقدية جديدة</span>
            </button>
          )}
        </div>
      </div>

      {/* Modern Invoices Table */}
      <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
        <table className="app-table">
          <thead>
            <tr>
              <th className="w-12 text-center">#</th>
              <th className="text-center w-28">التاريخ</th>
              <th className="text-center w-32">رقم الفاتورة</th>
              <th>العميل</th>
              <th className="text-center">المندوب</th>
              <th>بيان الأصناف</th>
              <th>ملاحظات</th>
              <th className="text-center w-32 font-bold">المبلغ (ج.م)</th>
              {!isReadOnly && <th className="text-center w-28">الإجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice: any, idx: number) => (
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
                    <span>{repName(invoice.rep_id)}</span>
                  </span>
                </td>
                <td className="text-xs text-slate-600">{invoice.item || '-'}</td>
                <td className="text-xs text-slate-400">{invoice.notes || '-'}</td>
                <td className="text-center font-bold text-slate-900 font-mono text-sm whitespace-nowrap">
                  {formatNumber(invoice.amount || 0)}
                </td>
                {!isReadOnly && (
                  <td>
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => openEdit(invoice)}
                        className="app-btn app-btn-sm app-btn-ghost text-xs hover:border-blue-400 hover:text-blue-700"
                        title="تعديل الفاتورة"
                      >
                        تعديل
                      </button>
                      <button
                        onClick={() => handleDelete(invoice)}
                        className="app-btn app-btn-sm app-btn-ghost text-xs text-rose-600 hover:bg-rose-50 hover:border-rose-300"
                        title="حذف الفاتورة"
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
                <td className="px-3.5 py-3 text-center text-slate-700 font-extrabold" colSpan={7}>
                  الإجمالي الكلي للنقدي
                </td>
                <td className="px-3.5 py-3 text-center text-emerald-800 font-mono text-base font-extrabold whitespace-nowrap">
                  {formatNumber(total)} ج.م
                </td>
                {!isReadOnly && <td></td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {invoices.length === 0 && (
        <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 mt-4">
          <h3 className="text-slate-700 font-bold text-base mb-1">لا توجد فواتير نقدية مسجلة</h3>
          <p className="text-slate-500 text-xs max-w-sm mx-auto">
            لم يتم إنشاء أي فواتير نقدية لهذا العرض حتى الآن. يمكنك إضافة فاتورة جديدة بالضغط على الزر أعلاه.
          </p>
        </div>
      )}

      {editing && (
        <FormModal
          title={editing.id ? 'تعديل فاتورة نقدية' : 'إضافة فاتورة نقدية جديدة'}
          initialValues={editing}
          customers={customers}
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
          onFieldChange={(name, value) => {
            if (name !== 'customer_id') return
            const customer = customers.find((c: any) => c.id === value)
            return customer?.representative_id ? { rep_id: customer.representative_id } : {}
          }}
          fields={[
            { name: 'date', label: 'تاريخ الفاتورة', type: 'date', required: true },
            { name: 'invoice_no', label: 'رقم الفاتورة', required: true, dir: 'ltr' },
            { name: 'customer_id', label: 'العميل', type: 'customer' },
            {
              name: 'rep_id',
              label: 'المندوب المسجل',
              type: 'select',
              required: true,
              placeholder: 'اختر المندوب',
              options: reps.map((rep: any) => ({ value: rep.id, label: rep.name })),
            },
            { name: 'item', label: 'بيان الأصناف والملاحظات العامة', full: true },
            { name: 'amount', label: 'إجمالي مبلغ الفاتورة (ج.م)', type: 'number', required: true, min: 0, step: '0.01' },
            { name: 'notes', label: 'ملاحظات إضافية', type: 'textarea', full: true },
          ]}
        />
      )}
    </div>
  )
}
