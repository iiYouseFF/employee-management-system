import { useMemo, useState } from 'react'
import FormModal from '@/shared/ui/FormModal'
import Pagination from '@/shared/ui/Pagination'
import { formatNumber, getTodayISO } from '@/shared/lib/format'
import { useAddSupplierPurchase, useSupplierPurchases, useSuppliers } from '@/features/suppliers/useSuppliers'

interface Props { showToast: (msg: string) => void }

const emptyPurchase = () => ({
  supplier_id: '',
  purchase_date: getTodayISO(),
  invoice_no: '',
  payment_type: 'credit',
  total_amount: '',
  notes: '',
})

export default function SupplierPurchasesTab({ showToast }: Props) {
  const { data: suppliers = [] } = useSuppliers()
  const { data: purchases = [] } = useSupplierPurchases()
  const addPurchase = useAddSupplierPurchase()
  const [purchaseForm, setPurchaseForm] = useState<Record<string, unknown> | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  const supplierOptions = useMemo(() => suppliers.map((s) => ({ value: s.id, label: s.name })), [suppliers])
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name || '-'

  const totalPages = Math.ceil(purchases.length / pageSize) || 1
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return purchases.slice(start, start + pageSize)
  }, [purchases, currentPage, pageSize])

  const handleSubmitPurchase = async (values: Record<string, unknown>) => {
    await addPurchase.mutateAsync({
      supplier_id: String(values.supplier_id),
      purchase_date: String(values.purchase_date || getTodayISO()),
      invoice_no: String(values.invoice_no || '').trim() || null,
      payment_type: String(values.payment_type),
      total_amount: Number(values.total_amount),
      notes: String(values.notes || '').trim() || null,
    })
    showToast('تم تسجيل فاتورة المشتريات بنجاح')
    setPurchaseForm(null)
  }

  return (
    <div>
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-base sm:text-lg font-bold text-slate-800">مشتريات الموردين</h3>
          <span className="badge badge-primary">{purchases.length} عملية</span>
        </div>
        <button onClick={() => setPurchaseForm(emptyPurchase())} className="app-btn app-btn-primary py-2 text-xs sm:text-sm">+ تسجيل فاتورة مشتريات</button>
      </div>

      <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
        <table className="app-table">
          <thead>
            <tr>
              <th className="w-12 text-center">#</th>
              <th className="text-center">التاريخ</th>
              <th>المورد</th>
              <th className="text-center">رقم الفاتورة</th>
              <th className="text-center">النوع</th>
              <th className="text-center">الإجمالي</th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((p, idx) => (
              <tr key={p.id}>
                <td className="text-center text-xs text-slate-400 font-mono">{purchases.length - ((currentPage - 1) * pageSize + idx)}</td>
                <td className="text-center text-xs font-mono text-slate-600">{new Date(p.purchase_date).toLocaleDateString('ar-EG')}</td>
                <td className="font-semibold text-slate-800">{supplierName(p.supplier_id)}</td>
                <td className="text-center font-mono text-xs" dir="ltr">{p.invoice_no || '-'}</td>
                <td className="text-center">
                  <span className={`badge ${p.payment_type === 'cash' ? 'badge-success' : 'badge-warning'}`}>
                    {p.payment_type === 'cash' ? 'نقدي' : 'آجل'}
                  </span>
                </td>
                <td className="text-center font-mono font-bold tabular-nums">{formatNumber(Number(p.total_amount || 0))} <span className="text-[11px] font-normal text-slate-400">ج.م</span></td>
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
                <div className="text-[11px] text-slate-400 font-mono">{new Date(p.purchase_date).toLocaleDateString('ar-EG')}</div>
              </div>
              <div className="text-end">
                <div className="font-mono font-extrabold text-slate-900 tabular-nums">{formatNumber(Number(p.total_amount || 0))} ج.م</div>
                <span className={`badge mt-1 ${p.payment_type === 'cash' ? 'badge-success' : 'badge-warning'}`}>{p.payment_type === 'cash' ? 'نقدي' : 'آجل'}</span>
              </div>
            </div>
            {p.invoice_no && <div className="text-xs text-slate-500">رقم الفاتورة: <span className="font-mono" dir="ltr">{p.invoice_no}</span></div>}
          </div>
        ))}
      </div>

      <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={purchases.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1) }} />

      {purchases.length === 0 && (
        <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 mt-4">
          <h3 className="text-slate-700 font-bold text-base mb-1">لا توجد مشتريات مسجلة</h3>
          <p className="text-slate-500 text-xs max-w-sm mx-auto">سجل فواتير مشتريات الموردين النقدية والآجلة من هنا.</p>
        </div>
      )}

      {purchaseForm && (
        <FormModal
          title="تسجيل فاتورة مشتريات"
          initialValues={purchaseForm}
          onClose={() => setPurchaseForm(null)}
          onSubmit={handleSubmitPurchase}
          submitLabel="تسجيل الفاتورة"
          validate={(values) => {
            if (!values.supplier_id) return 'اختر المورد'
            if (!values.total_amount || Number(values.total_amount) <= 0) return 'قيمة الفاتورة يجب أن تكون أكبر من صفر'
            return null
          }}
          fields={[
            { name: 'supplier_id', label: 'المورد', type: 'select', required: true, placeholder: 'اختر المورد', options: supplierOptions, full: true },
            { name: 'purchase_date', label: 'تاريخ الفاتورة', type: 'date', required: true },
            {
              name: 'payment_type', label: 'نوع الدفع', type: 'select', required: true,
              options: [{ value: 'credit', label: 'آجل (على الحساب)' }, { value: 'cash', label: 'نقدي (مدفوع فورًا)' }],
            },
            { name: 'invoice_no', label: 'رقم الفاتورة', dir: 'ltr' },
            { name: 'total_amount', label: 'قيمة الفاتورة (ج.م)', type: 'number', required: true, min: 0, step: '0.01' },
            { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true },
          ]}
        />
      )}
    </div>
  )
}
