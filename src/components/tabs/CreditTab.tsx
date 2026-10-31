import { useState } from 'react'
import { getTodayISO, addDays, formatNumber } from '../../lib/format'
import FormModal from '../FormModal'
import {
  useAddCreditInvoice,
  useUpdateCreditInvoice,
  useDeleteCreditInvoice,
  useCustomers,
  useCreditInvoices,
} from '../../hooks/useInvoices'

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString('ar-EG') : '-'

export default function CreditTab({ repFilter, reps, showToast, isReadOnly = false }: any) {
  const { data: invoices = [] } = useCreditInvoices(repFilter)
  const { data: allInvoices = [] } = useCreditInvoices()
  const addInvoice = useAddCreditInvoice()
  const updateInvoice = useUpdateCreditInvoice()
  const deleteInvoice = useDeleteCreditInvoice()
  const { data: customers = [] } = useCustomers()
  const [editing, setEditing] = useState<any | null>(null)

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
      item: 'مواد غذائية',
      amount: '',
      due_date: addDays(getTodayISO(), 30),
      paid: 0,
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
      due_date: invoice.due_date || '',
      paid: invoice.paid ?? 0,
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
      due_date: values.due_date || null,
      paid: parseFloat(values.paid) || 0,
    }

    if (editing?.id) {
      await updateInvoice.mutateAsync({ id: editing.id, ...payload })
      showToast('تم تحديث الفاتورة')
    } else {
      await addInvoice.mutateAsync(payload)
      showToast('تم إضافة فاتورة آجلة جديدة')
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
      {/* Tab Top Controls & Summary Chips */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-800">سجل فواتير البيع الآجل (الذمم المدينة)</h2>
          <span className="badge badge-primary">{invoices.length} فاتورة</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold block mb-1">إجمالي الفواتير</span>
          <span className="text-base sm:text-lg font-extrabold text-slate-900 font-mono">
            {formatNumber(totals.amount)} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </span>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3.5 shadow-sm">
          <span className="text-xs text-emerald-700 font-semibold block mb-1">المدفوع والمحصل</span>
          <span className="text-base sm:text-lg font-extrabold text-emerald-800 font-mono">
            {formatNumber(totals.paid)} <span className="text-xs font-normal text-emerald-600">ج.م</span>
          </span>
        </div>

        <div className="bg-rose-50/70 border border-rose-200/80 rounded-2xl p-3.5 shadow-sm">
          <span className="text-xs text-rose-700 font-semibold block mb-1">المتبقي المطلوب تحصيله</span>
          <span className="text-base sm:text-lg font-extrabold text-rose-800 font-mono">
            {formatNumber(totals.remaining)} <span className="text-xs font-normal text-rose-600">ج.م</span>
          </span>
        </div>

        <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-3.5 shadow-sm">
          <span className="text-xs text-blue-700 font-semibold block mb-1">نسبة التحصيل</span>
          <span className="text-base sm:text-lg font-extrabold text-blue-800 font-mono">
            {totals.amount > 0 ? ((totals.paid / totals.amount) * 100).toFixed(1) : '0'} %
          </span>
        </div>
      </div>

      {/* Modern Invoices Table */}
      <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
        <table className="app-table">
          <thead>
            <tr>
              <th className="w-12 text-center">#</th>
              <th className="text-center w-28">التاريخ</th>
              <th className="text-center w-28">رقم الفاتورة</th>
              <th>العميل</th>
              <th className="text-center">المندوب</th>
              <th>بيان الأصناف</th>
              <th className="text-center font-bold">قيمة الفاتورة</th>
              <th className="text-center">تاريخ الاستحقاق</th>
              <th className="text-center">مدفوع مقدم</th>
              <th className="text-center font-bold">المتبقي</th>
              <th className="text-center">الحالة</th>
              {!isReadOnly && <th className="text-center w-28">الإجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice: any, idx: number) => {
              const remaining = parseFloat(invoice.remaining || 0)
              return (
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
                  <td className="text-center font-bold text-slate-900 font-mono text-sm whitespace-nowrap">
                    {formatNumber(invoice.amount || 0)}
                  </td>
                  <td className="text-center text-xs text-slate-500 whitespace-nowrap">
                    {formatDate(invoice.due_date)}
                  </td>
                  <td className="text-center text-xs font-mono text-emerald-700 font-semibold whitespace-nowrap">
                    {formatNumber(invoice.paid || 0)}
                  </td>
                  <td className="text-center font-bold font-mono text-sm whitespace-nowrap">
                    <span className={remaining > 0 ? 'text-rose-600 font-extrabold' : 'text-emerald-600'}>
                      {formatNumber(remaining)}
                    </span>
                  </td>
                  <td className="text-center whitespace-nowrap">{getStatusBadge(invoice)}</td>
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
              )
            })}
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

      {invoices.length === 0 && (
        <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 mt-4">
          <h3 className="text-slate-700 font-bold text-base mb-1">لا توجد فواتير آجلة مسجلة</h3>
          <p className="text-slate-500 text-xs max-w-sm mx-auto">
            لم يتم تسجيل أي فواتير بيع آجل حتى الآن. يمكنك إضافة فاتورة جديدة بالضغط على الزر أعلاه.
          </p>
        </div>
      )}

      {editing && (
        <FormModal
          title={editing.id ? 'تعديل فاتورة آجلة' : 'إضافة فاتورة آجلة جديدة'}
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
            { name: 'item', label: 'بيان الأصناف والملاحظات', full: true },
            {
              name: 'amount',
              label: 'إجمالي قيمة الفاتورة (ج.م)',
              type: 'number',
              required: true,
              min: 0,
              step: '0.01',
            },
            { name: 'due_date', label: 'تاريخ الاستحقاق', type: 'date' },
            { name: 'paid', label: 'المبلغ المدفوع مقدماً (ج.م)', type: 'number', min: 0, step: '0.01' },
          ]}
        />
      )}
    </div>
  )
}
