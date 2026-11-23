import { useMemo, useState } from 'react'
import FormModal from '@/shared/ui/FormModal'
import Pagination from '@/shared/ui/Pagination'
import { formatNumber, getTodayISO } from '@/shared/lib/format'
import { SUPPLIER_PAYMENT_METHODS, paymentMethodBadgeClass, paymentMethodLabel } from '@/shared/lib/paymentMethods'
import { useAddSupplierPayment, useSupplierPayments, useSuppliers } from '@/features/suppliers/useSuppliers'

interface Props { showToast: (msg: string) => void }

const emptyPayment = () => ({
  supplier_id: '',
  payment_date: getTodayISO(),
  amount: '',
  method: 'نقدي',
  reference: '',
  notes: '',
})

export default function SupplierPaymentsTab({ showToast }: Props) {
  const { data: suppliers = [] } = useSuppliers()
  const { data: payments = [] } = useSupplierPayments()
  const addPayment = useAddSupplierPayment()
  const [paymentForm, setPaymentForm] = useState<Record<string, unknown> | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  const supplierOptions = useMemo(() => suppliers.map((s) => ({ value: s.id, label: s.name })), [suppliers])
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name || '-'

  const totalPages = Math.ceil(payments.length / pageSize) || 1
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return payments.slice(start, start + pageSize)
  }, [payments, currentPage, pageSize])

  const handleSubmitPayment = async (values: Record<string, unknown>) => {
    await addPayment.mutateAsync({
      supplier_id: String(values.supplier_id),
      payment_date: String(values.payment_date || getTodayISO()),
      amount: Number(values.amount),
      method: String(values.method || 'نقدي'),
      reference: String(values.reference || '').trim() || null,
      notes: String(values.notes || '').trim() || null,
    })
    showToast('تم تسجيل الدفعة للمورد بنجاح')
    setPaymentForm(null)
  }

  return (
    <div>
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-base sm:text-lg font-bold text-slate-800">مدفوعات الموردين</h3>
          <span className="badge badge-primary">{payments.length} دفعة</span>
        </div>
        <button onClick={() => setPaymentForm(emptyPayment())} className="app-btn app-btn-primary py-2 text-xs sm:text-sm">+ تسجيل دفعة مورد</button>
      </div>

      <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
        <table className="app-table">
          <thead>
            <tr>
              <th className="w-12 text-center">#</th>
              <th className="text-center">التاريخ</th>
              <th>المورد</th>
              <th className="text-center">المبلغ</th>
              <th className="text-center">طريقة الدفع</th>
              <th className="text-center">المرجع</th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((p, idx) => (
              <tr key={p.id}>
                <td className="text-center text-xs text-slate-400 font-mono">{payments.length - ((currentPage - 1) * pageSize + idx)}</td>
                <td className="text-center text-xs font-mono text-slate-600">{new Date(p.payment_date).toLocaleDateString('ar-EG')}</td>
                <td className="font-semibold text-slate-800">{supplierName(p.supplier_id)}</td>
                <td className="text-center font-mono font-bold tabular-nums text-emerald-700">{formatNumber(Number(p.amount || 0))} <span className="text-[11px] font-normal text-slate-400">ج.م</span></td>
                <td className="text-center"><span className={paymentMethodBadgeClass(p.method)}>{paymentMethodLabel(p.method)}</span></td>
                <td className="text-center font-mono text-xs" dir="ltr">{p.reference || '-'}</td>
                <td className="text-xs text-slate-500">{p.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {paginated.map((p) => (
          <div key={p.id} className="app-card p-3.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-slate-800 text-sm">{supplierName(p.supplier_id)}</div>
                <div className="text-[11px] text-slate-400 font-mono">{new Date(p.payment_date).toLocaleDateString('ar-EG')}</div>
              </div>
              <div className="text-end">
                <div className="font-mono font-extrabold text-emerald-700 tabular-nums">{formatNumber(Number(p.amount || 0))} ج.م</div>
                <span className={`${paymentMethodBadgeClass(p.method)} mt-1 inline-flex`}>{paymentMethodLabel(p.method)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={payments.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1) }} />

      {payments.length === 0 && (
        <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 mt-4">
          <h3 className="text-slate-700 font-bold text-base mb-1">لا توجد مدفوعات مسجلة</h3>
          <p className="text-slate-500 text-xs max-w-sm mx-auto">سجل دفعات الموردين وطرق الدفع من هنا.</p>
        </div>
      )}

      {paymentForm && (
        <FormModal
          title="سداد دفعة لمورد"
          initialValues={paymentForm}
          onClose={() => setPaymentForm(null)}
          onSubmit={handleSubmitPayment}
          submitLabel="تسجيل الدفعة"
          validate={(values) => {
            if (!values.supplier_id) return 'اختر المورد'
            if (!values.amount || Number(values.amount) <= 0) return 'قيمة الدفعة يجب أن تكون أكبر من صفر'
            return null
          }}
          fields={[
            { name: 'supplier_id', label: 'المورد', type: 'select', required: true, placeholder: 'اختر المورد', options: supplierOptions, full: true },
            { name: 'payment_date', label: 'تاريخ الدفعة', type: 'date', required: true },
            {
              name: 'method', label: 'طريقة الدفع', type: 'select', required: true,
              options: SUPPLIER_PAYMENT_METHODS.map((m) => ({ value: m, label: m })),
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
