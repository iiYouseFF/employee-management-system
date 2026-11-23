import { useMemo, useState } from 'react'
import FormModal from '@/shared/ui/FormModal'
import Pagination from '@/shared/ui/Pagination'
import SupplierStatementModal from '@/features/suppliers/SupplierStatementModal'
import { formatNumber } from '@/shared/lib/format'
import {
  useAddSupplier,
  useDeleteSupplier,
  useSupplierPayments,
  useSupplierPurchases,
  useSuppliers,
  useUpdateSupplier,
} from '@/features/suppliers/useSuppliers'

interface Props {
  showToast: (msg: string) => void
}

export default function SupplierDirectoryTab({ showToast }: Props) {
  const { data: suppliers = [] } = useSuppliers()
  const { data: purchases = [] } = useSupplierPurchases()
  const { data: payments = [] } = useSupplierPayments()
  const addSupplier = useAddSupplier()
  const updateSupplier = useUpdateSupplier()
  const deleteSupplier = useDeleteSupplier()

  const [searchTerm, setSearchTerm] = useState('')
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [statementSupplier, setStatementSupplier] = useState<Record<string, unknown> | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  const filteredSuppliers = useMemo(() => {
    if (!searchTerm.trim()) return suppliers
    const term = searchTerm.toLowerCase().trim()
    return suppliers.filter((s) => s.name.toLowerCase().includes(term) || (s.phone || '').includes(term))
  }, [suppliers, searchTerm])

  const totalPages = Math.ceil(filteredSuppliers.length / pageSize) || 1
  const paginatedSuppliers = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredSuppliers.slice(start, start + pageSize)
  }, [filteredSuppliers, currentPage, pageSize])

  const balances = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of suppliers) map.set(s.id, Number(s.opening_balance || 0))
    for (const p of purchases) {
      if (p.payment_type !== 'credit') continue
      map.set(p.supplier_id, (map.get(p.supplier_id) ?? 0) + Number(p.total_amount || 0))
    }
    for (const p of payments) {
      map.set(p.supplier_id, (map.get(p.supplier_id) ?? 0) - Number(p.amount || 0))
    }
    return map
  }, [suppliers, purchases, payments])

  const openNew = () => setEditing({ name: '', phone: '', opening_balance: '', notes: '' })
  const openEdit = (supplier: Record<string, unknown>) => setEditing({
    id: supplier.id,
    name: supplier.name,
    phone: (supplier.phone as string) || '',
    opening_balance: (supplier.opening_balance as number) ?? 0,
    notes: (supplier.notes as string) || '',
  })

  const validateSupplier = (values: Record<string, unknown>) => {
    const name = String(values.name || '').trim()
    const phone = String(values.phone || '').trim()
    if (!name) return 'اسم المورد مطلوب'
    if (/^\d+$/.test(name)) return 'اسم المورد لا يمكن أن يكون أرقام فقط'
    if (!phone) return 'رقم هاتف المورد مطلوب'
    const duplicate = suppliers.find((s) => s.id !== editing?.id && s.name.toLowerCase() === name.toLowerCase())
    if (duplicate) return 'اسم المورد موجود بالفعل'
    return null
  }

  const handleSubmitSupplier = async (values: Record<string, unknown>) => {
    const payload = {
      name: String(values.name).trim(),
      phone: String(values.phone || '').trim(),
      opening_balance: Number(values.opening_balance || 0),
      notes: String(values.notes || '').trim() || null,
    }
    if (editing?.id) {
      await updateSupplier.mutateAsync({ id: String(editing.id), ...payload })
      showToast('تم تحديث المورد بنجاح')
    } else {
      await addSupplier.mutateAsync(payload)
      showToast('تم إضافة المورد بنجاح')
    }
    setEditing(null)
  }

  const handleDelete = async (supplier: Record<string, unknown>) => {
    if (!confirm(`هل أنت متأكد من حذف المورد ${String(supplier.name)}؟`)) return
    try {
      await deleteSupplier.mutateAsync(String(supplier.id))
      showToast('تم حذف المورد بنجاح')
    } catch {
      showToast('لا يمكن حذف المورد لوجود مشتريات أو دفعات مسجلة')
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-base sm:text-lg font-bold text-slate-800">دليل الموردين</h3>
          <span className="badge badge-primary">{filteredSuppliers.length} مورد</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative min-w-[240px] sm:w-64">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1) }}
              placeholder="بحث باسم المورد أو رقم الهاتف..."
              className="app-input py-2 text-xs sm:text-sm"
            />
          </div>
          <button onClick={openNew} className="app-btn app-btn-primary py-2 text-xs sm:text-sm">+ إضافة مورد جديد</button>
        </div>
      </div>

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
              <th className="text-center w-52">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {paginatedSuppliers.map((supplier, idx) => {
              const balance = balances.get(supplier.id) ?? 0
              return (
                <tr key={supplier.id}>
                  <td className="text-center text-xs text-slate-400 font-mono">{filteredSuppliers.length - ((currentPage - 1) * pageSize + idx)}</td>
                  <td className="font-semibold text-slate-900">
                    <button onClick={() => setStatementSupplier(supplier)} className="text-start font-bold text-primary-700 hover:text-primary-800 hover:underline">{supplier.name}</button>
                  </td>
                  <td className="text-center text-slate-600 text-sm font-mono" dir="ltr">{supplier.phone || '-'}</td>
                  <td className="text-center font-mono text-xs text-slate-500 tabular-nums">{formatNumber(Number(supplier.opening_balance || 0))}</td>
                  <td className="text-center font-mono font-bold tabular-nums"><span className={balance > 0 ? 'text-rose-700' : 'text-emerald-700'}>{formatNumber(balance)}</span> <span className="text-[11px] font-normal text-slate-400">ج.م</span></td>
                  <td className="text-center text-xs text-slate-500">{new Date(supplier.created_at).toLocaleDateString('ar-EG')}</td>
                  <td>
                    <div className="flex gap-1.5 justify-center">
                      <button onClick={() => setStatementSupplier(supplier)} className="app-btn app-btn-sm app-btn-success text-xs font-bold">كشف حساب</button>
                      <button onClick={() => openEdit(supplier as unknown as Record<string, unknown>)} className="app-btn app-btn-sm app-btn-ghost text-xs">تعديل</button>
                      <button onClick={() => handleDelete(supplier as unknown as Record<string, unknown>)} className="app-btn app-btn-sm app-btn-ghost text-xs text-rose-600">حذف</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {paginatedSuppliers.map((supplier) => {
          const balance = balances.get(supplier.id) ?? 0
          return (
            <div key={supplier.id} className="app-card p-3.5 shadow-sm space-y-2.5">
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                <div>
                  <button onClick={() => setStatementSupplier(supplier)} className="font-extrabold text-slate-900 text-sm block text-start hover:text-primary-700">{supplier.name}</button>
                  <div className="font-mono text-xs text-slate-600 mt-1" dir="ltr">{supplier.phone || 'لا يوجد رقم هاتف'}</div>
                </div>
                <div className="text-end">
                  <span className={`font-mono font-black text-base block ${balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatNumber(balance)}</span>
                  <span className="text-[10px] text-slate-400">المستحق الحالي (ج.م)</span>
                </div>
              </div>
              <div className="flex gap-2 pt-1 border-t border-slate-100">
                <button onClick={() => setStatementSupplier(supplier)} className="app-btn app-btn-success app-btn-sm flex-1 py-1.5 text-xs font-bold">كشف حساب</button>
                <button onClick={() => openEdit(supplier as unknown as Record<string, unknown>)} className="app-btn app-btn-ghost app-btn-sm px-3 py-1.5 text-xs">تعديل</button>
                <button onClick={() => handleDelete(supplier as unknown as Record<string, unknown>)} className="app-btn app-btn-ghost app-btn-sm px-3 py-1.5 text-xs text-rose-600">حذف</button>
              </div>
            </div>
          )
        })}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredSuppliers.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1) }}
      />

      {filteredSuppliers.length === 0 && (
        <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 mt-4">
          <h3 className="text-slate-700 font-bold text-base mb-1">{searchTerm ? 'لا توجد نتائج مطابقة لبحثك' : 'لا يوجد موردين مسجلين بعد'}</h3>
          <p className="text-slate-500 text-xs max-w-sm mx-auto">أضف الموردين لمتابعة المشتريات والمدفوعات وكشوف الحساب.</p>
        </div>
      )}

      {statementSupplier && (
        <SupplierStatementModal supplier={statementSupplier as { id: string; name: string; phone?: string | null; opening_balance?: number | null }} onClose={() => setStatementSupplier(null)} />
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
            { name: 'phone', label: 'رقم الهاتف', required: true, dir: 'ltr' },
            { name: 'opening_balance', label: 'رصيد أول المدة (ج.م)', type: 'number', min: 0, step: '0.01' },
            { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true },
          ]}
        />
      )}
    </div>
  )
}
