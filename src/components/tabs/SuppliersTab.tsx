import { useState, useMemo } from 'react'
import {
  useSuppliers,
  useSupplierPurchases,
  useSupplierPayments,
  useAddSupplier,
  useUpdateSupplier,
  useDeleteSupplier,
  useAddSupplierPurchase,
  useAddSupplierPayment,
} from '../../hooks/useSuppliers'
import FormModal from '../FormModal'
import SupplierStatementModal from '../SupplierStatementModal'
import Pagination from '../Pagination'
import { formatNumber, getTodayISO } from '../../lib/format'

const emptyPurchase = () => ({
  supplier_id: '',
  purchase_date: getTodayISO(),
  invoice_no: '',
  payment_type: 'credit',
  total_amount: '',
  notes: '',
})

const emptyPayment = () => ({
  supplier_id: '',
  payment_date: getTodayISO(),
  amount: '',
  method: 'نقدي',
  reference: '',
  notes: '',
})

export default function SuppliersTab({ showToast }: any) {
  const { data: suppliers = [] } = useSuppliers()
  const { data: purchases = [] } = useSupplierPurchases()
  const { data: payments = [] } = useSupplierPayments()
  const addSupplier = useAddSupplier()
  const updateSupplier = useUpdateSupplier()
  const deleteSupplier = useDeleteSupplier()
  const addPurchase = useAddSupplierPurchase()
  const addPayment = useAddSupplierPayment()

  const [searchTerm, setSearchTerm] = useState('')
  const [editing, setEditing] = useState<any | null>(null)
  const [statementSupplier, setStatementSupplier] = useState<any | null>(null)
  const [purchaseForm, setPurchaseForm] = useState<any | null>(null)
  const [paymentForm, setPaymentForm] = useState<any | null>(null)

  const filteredSuppliers = useMemo(() => {
    if (!searchTerm.trim()) return suppliers
    const term = searchTerm.toLowerCase().trim()
    return suppliers.filter(
      (s: any) =>
        s.name.toLowerCase().includes(term) || (s.phone && s.phone.includes(term))
    )
  }, [suppliers, searchTerm])

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  const totalPages = Math.ceil(filteredSuppliers.length / pageSize) || 1
  const paginatedSuppliers = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredSuppliers.slice(start, start + pageSize)
  }, [filteredSuppliers, currentPage, pageSize])

  const balances = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of suppliers as any[]) {
      map.set(s.id, Number(s.opening_balance || 0))
    }
    for (const p of purchases as any[]) {
      if (p.payment_type !== 'credit') continue
      map.set(p.supplier_id, (map.get(p.supplier_id) ?? 0) + Number(p.total_amount || 0))
    }
    for (const p of payments as any[]) {
      map.set(p.supplier_id, (map.get(p.supplier_id) ?? 0) - Number(p.amount || 0))
    }
    return map
  }, [suppliers, purchases, payments])

  const supplierOptions = useMemo(
    () => (suppliers as any[]).map((s: any) => ({ value: s.id, label: s.name })),
    [suppliers]
  )

  const openNew = () => {
    setEditing({ name: '', phone: '', opening_balance: '', notes: '' })
  }

  const openEdit = (supplier: any) => {
    setEditing({
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone || '',
      opening_balance: supplier.opening_balance ?? 0,
      notes: supplier.notes || '',
    })
  }

  const validateSupplier = (values: Record<string, any>) => {
    const name = String(values.name).trim()
    if (!name) return 'اسم المورد مطلوب'
    if (/^\d+$/.test(name)) return 'اسم المورد لا يمكن أن يكون أرقام فقط'
    const duplicate = (suppliers as any[]).find(
      (s: any) => s.id !== editing?.id && s.name.toLowerCase() === name.toLowerCase()
    )
    if (duplicate) return 'اسم المورد موجود بالفعل'
    return null
  }

  const handleSubmitSupplier = async (values: Record<string, any>) => {
    const payload = {
      name: String(values.name).trim(),
      phone: String(values.phone || '').trim() || null,
      opening_balance: Number(values.opening_balance || 0),
      notes: String(values.notes || '').trim() || null,
    }

    if (editing?.id) {
      await updateSupplier.mutateAsync({ id: editing.id, ...payload })
      showToast('تم تحديث المورد بنجاح')
    } else {
      await addSupplier.mutateAsync(payload)
      showToast('تم إضافة المورد بنجاح')
    }
    setEditing(null)
  }

  const handleDelete = async (supplier: any) => {
    if (!confirm(`هل أنت متأكد من حذف المورد ${supplier.name}؟`)) return
    try {
      await deleteSupplier.mutateAsync(supplier.id)
      showToast('تم حذف المورد بنجاح')
    } catch {
      showToast('لا يمكن حذف المورد لوجود مشتريات أو دفعات مسجلة')
    }
  }

  const handleSubmitPurchase = async (values: Record<string, any>) => {
    await addPurchase.mutateAsync({
      supplier_id: values.supplier_id,
      purchase_date: values.purchase_date || getTodayISO(),
      invoice_no: String(values.invoice_no || '').trim() || null,
      payment_type: values.payment_type,
      total_amount: Number(values.total_amount),
      notes: String(values.notes || '').trim() || null,
    })
    showToast('تم تسجيل فاتورة المشتريات بنجاح')
    setPurchaseForm(null)
  }

  const handleSubmitPayment = async (values: Record<string, any>) => {
    await addPayment.mutateAsync({
      supplier_id: values.supplier_id,
      payment_date: values.payment_date || getTodayISO(),
      amount: Number(values.amount),
      method: values.method || 'نقدي',
      reference: String(values.reference || '').trim() || null,
      notes: String(values.notes || '').trim() || null,
    })
    showToast('تم تسجيل الدفعة للمورد بنجاح')
    setPaymentForm(null)
  }

  return (
    <div>
      {/* Tab Header Controls */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-800">دليل الموردين والمستحقات</h2>
          <span className="badge badge-primary">{filteredSuppliers.length} مورد</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative min-w-[240px] sm:w-64">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث باسم المورد أو رقم الهاتف..."
              className="app-input py-2 text-xs sm:text-sm"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          <button
            onClick={() => setPurchaseForm(emptyPurchase())}
            className="app-btn app-btn-ghost py-2 text-xs sm:text-sm"
          >
            <span>فاتورة مشتريات</span>
          </button>
          <button
            onClick={() => setPaymentForm(emptyPayment())}
            className="app-btn app-btn-info py-2 text-xs sm:text-sm"
          >
            <span>سداد دفعة</span>
          </button>
          <button
            onClick={openNew}
            className="app-btn app-btn-primary py-2 text-xs sm:text-sm"
          >
            <span>+</span>
            <span>إضافة مورد جديد</span>
          </button>
        </div>
      </div>

      {/* Desktop Suppliers Table */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
        <table className="app-table">
          <thead>
            <tr>
              <th className="w-12 text-center">#</th>
              <th>اسم المورد</th>
              <th className="text-center">رقم الهاتف</th>
              <th className="text-center">رصيد أول المدة</th>
              <th className="text-center">المستحق الحالي</th>
              <th className="text-center">تاريخ الإضافة</th>
              <th className="text-center w-48">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {paginatedSuppliers.map((supplier: any, idx: number) => {
              const balance = balances.get(supplier.id) ?? 0
              return (
                <tr key={supplier.id}>
                  <td className="text-center text-xs text-slate-400 font-mono">
                    {filteredSuppliers.length - ((currentPage - 1) * pageSize + idx)}
                  </td>
                  <td className="font-semibold text-slate-900">
                    <button
                      onClick={() => setStatementSupplier(supplier)}
                      className="text-start font-bold text-primary-700 hover:text-primary-800 hover:underline flex items-center gap-2 group"
                      title="انقر لفتح كشف الحساب التراكمي للمورد"
                    >
                      <span>{supplier.name}</span>
                      <span className="text-[11px] bg-primary-50 text-primary-700 border border-primary-200 px-2 py-0.5 rounded-full font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        كشف حساب
                      </span>
                    </button>
                  </td>
                  <td className="text-center text-slate-600 text-sm font-mono" dir="ltr">
                    {supplier.phone || '-'}
                  </td>
                  <td className="text-center font-mono text-xs text-slate-500 tabular-nums">
                    {formatNumber(Number(supplier.opening_balance || 0))}
                  </td>
                  <td className="text-center font-mono font-bold tabular-nums">
                    <span className={balance > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                      {formatNumber(balance)}
                    </span>
                    <span className="text-[11px] font-normal text-slate-400 ms-1">ج.م</span>
                  </td>
                  <td className="text-center text-xs text-slate-500">
                    {new Date(supplier.created_at).toLocaleDateString('ar-EG')}
                  </td>
                  <td>
                    <div className="flex gap-1.5 justify-center">
                      <button
                        onClick={() => setStatementSupplier(supplier)}
                        className="app-btn app-btn-sm app-btn-success text-xs font-bold"
                        title="عرض كشف الحساب التراكمي"
                      >
                        <span>كشف حساب</span>
                      </button>
                      <button
                        onClick={() => openEdit(supplier)}
                        className="app-btn app-btn-sm app-btn-ghost text-xs hover:border-blue-400 hover:text-blue-700"
                        title="تعديل بيانات المورد"
                      >
                        تعديل
                      </button>
                      <button
                        onClick={() => handleDelete(supplier)}
                        className="app-btn app-btn-sm app-btn-ghost text-xs text-rose-600 hover:bg-rose-50 hover:border-rose-300"
                        title="حذف المورد"
                      >
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View (Optimized for phone screens) */}
      <div className="md:hidden space-y-3">
        {paginatedSuppliers.map((supplier: any) => {
          const balance = balances.get(supplier.id) ?? 0
          return (
            <div key={supplier.id} className="app-card p-3.5 shadow-sm space-y-2.5">
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                <div>
                  <button
                    onClick={() => setStatementSupplier(supplier)}
                    className="font-extrabold text-slate-900 text-sm block text-start hover:text-primary-700"
                  >
                    {supplier.name}
                  </button>
                  {supplier.phone ? (
                    <a
                      href={`tel:${supplier.phone}`}
                      className="font-mono text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-block mt-1"
                      dir="ltr"
                    >
                      {supplier.phone}
                    </a>
                  ) : (
                    <span className="text-[11px] text-slate-400">لا يوجد رقم هاتف</span>
                  )}
                </div>
                <div className="text-end">
                  <span className={`font-mono font-black text-base block ${balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {formatNumber(balance)}
                  </span>
                  <span className="text-[10px] text-slate-400">المستحق الحالي (ج.م)</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-xl">
                <span className="text-slate-500 text-[11px]">رصيد أول المدة:</span>
                <span className="font-mono font-bold text-slate-700">
                  {formatNumber(Number(supplier.opening_balance || 0))} ج.م
                </span>
              </div>

              <div className="flex gap-2 pt-1 border-t border-slate-100">
                <button
                  onClick={() => setStatementSupplier(supplier)}
                  className="app-btn app-btn-success app-btn-sm flex-1 py-1.5 text-xs font-bold"
                >
                  كشف حساب
                </button>
                <button
                  onClick={() => openEdit(supplier)}
                  className="app-btn app-btn-ghost app-btn-sm px-3 py-1.5 text-xs font-semibold text-blue-700 border-blue-200"
                >
                  تعديل
                </button>
                <button
                  onClick={() => handleDelete(supplier)}
                  className="app-btn app-btn-ghost app-btn-sm px-2.5 py-1.5 text-xs text-rose-600 border-rose-200"
                >
                  حذف
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination Component */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredSuppliers.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />

      {filteredSuppliers.length === 0 && (
        <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 mt-4">
          <h3 className="text-slate-700 font-bold text-base mb-1">
            {searchTerm ? 'لا توجد نتائج مطابقة لبحثك' : 'لا يوجد موردين مسجلين بعد'}
          </h3>
          <p className="text-slate-500 text-xs max-w-sm mx-auto">
            {searchTerm
              ? 'تأكد من كتابة اسم المورد أو رقم هاتفه بشكل صحيح، أو أعد ضبط شروط البحث.'
              : 'ابدأ بإضافة أول مورد لتسجيل فواتير المشتريات والدفعات ومتابعة المستحقات.'}
          </p>
        </div>
      )}

      {statementSupplier && (
        <SupplierStatementModal
          supplier={statementSupplier}
          onClose={() => setStatementSupplier(null)}
        />
      )}

      {editing && (
        <FormModal
          title={editing.id ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}
          initialValues={editing}
          onClose={() => setEditing(null)}
          onSubmit={handleSubmitSupplier}
          validate={validateSupplier}
          fields={[
            { name: 'name', label: 'اسم المورد', required: true, full: true },
            { name: 'phone', label: 'رقم الهاتف', dir: 'ltr' },
            { name: 'opening_balance', label: 'رصيد أول المدة (ج.م)', type: 'number', min: 0, step: '0.01' },
            { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true },
          ]}
        />
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
            if (!values.total_amount || Number(values.total_amount) <= 0) {
              return 'قيمة الفاتورة يجب أن تكون أكبر من صفر'
            }
            return null
          }}
          fields={[
            {
              name: 'supplier_id',
              label: 'المورد',
              type: 'select',
              required: true,
              placeholder: 'اختر المورد',
              options: supplierOptions,
              full: true,
            },
            { name: 'purchase_date', label: 'تاريخ الفاتورة', type: 'date', required: true },
            {
              name: 'payment_type',
              label: 'نوع الدفع',
              type: 'select',
              required: true,
              options: [
                { value: 'credit', label: 'آجل (على الحساب)' },
                { value: 'cash', label: 'نقدي (مدفوع فورًا)' },
              ],
            },
            { name: 'invoice_no', label: 'رقم الفاتورة', dir: 'ltr' },
            { name: 'total_amount', label: 'قيمة الفاتورة (ج.م)', type: 'number', required: true, min: 0, step: '0.01' },
            { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true },
          ]}
        />
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
            if (!values.amount || Number(values.amount) <= 0) {
              return 'قيمة الدفعة يجب أن تكون أكبر من صفر'
            }
            return null
          }}
          fields={[
            {
              name: 'supplier_id',
              label: 'المورد',
              type: 'select',
              required: true,
              placeholder: 'اختر المورد',
              options: supplierOptions,
              full: true,
            },
            { name: 'payment_date', label: 'تاريخ الدفعة', type: 'date', required: true },
            {
              name: 'method',
              label: 'طريقة الدفع',
              type: 'select',
              options: [
                { value: 'نقدي', label: 'نقدي' },
                { value: 'تحويل بنكي', label: 'تحويل بنكي' },
                { value: 'شيك', label: 'شيك' },
              ],
            },
            { name: 'amount', label: 'قيمة الدفعة (ج.م)', type: 'number', required: true, min: 0, step: '0.01' },
            { name: 'reference', label: 'المرجع / رقم الشيك', dir: 'ltr' },
            { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true },
          ]}
        />
      )}
    </div>
  )
}
