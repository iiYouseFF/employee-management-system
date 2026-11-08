import { useState, useMemo } from 'react'
import {
  useCustomers,
  useUpsertCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
} from '../../hooks/useInvoices'
import { useReps } from '../../hooks/useData'
import FormModal from '../FormModal'
import Pagination from '../Pagination'
import CumulativeCustomerStatementModal from '../CumulativeCustomerStatementModal'

export default function CustomersTab({ showToast, repFilter, isReadOnly = false }: any) {
  const { data: customers = [] } = useCustomers(repFilter)
  const { data: reps = [] } = useReps()
  const upsertCustomer = useUpsertCustomer()
  const updateCustomer = useUpdateCustomer()
  const deleteCustomer = useDeleteCustomer()
  const [searchTerm, setSearchTerm] = useState('')
  const [editing, setEditing] = useState<any | null>(null)
  const [statementCustomer, setStatementCustomer] = useState<any | null>(null)

  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return customers
    const term = searchTerm.toLowerCase().trim()
    return customers.filter(
      (c: any) =>
        c.name.toLowerCase().includes(term) || (c.phone && c.phone.includes(term))
    )
  }, [customers, searchTerm])

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  const totalPages = Math.ceil(filteredCustomers.length / pageSize) || 1
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredCustomers.slice(start, start + pageSize)
  }, [filteredCustomers, currentPage, pageSize])

  const repName = (customer: any) => {
    if (customer.representative_id) {
      const rep = reps.find((r: any) => r.id === customer.representative_id)
      if (rep) return rep.name
    }
    return customer.representative_name || '-'
  }

  const openNew = () => {
    setEditing({ name: '', phone: '', representative_id: '' })
  }

  const openEdit = (customer: any) => {
    setEditing({
      id: customer.id,
      name: customer.name,
      phone: customer.phone || '',
      representative_id: customer.representative_id || '',
    })
  }

  const validate = (values: Record<string, any>) => {
    const name = String(values.name).trim()
    if (/^\d+$/.test(name)) return 'اسم العميل لا يمكن أن يكون أرقام فقط'
    const duplicate = customers.find(
      (c: any) =>
        c.id !== editing?.id && c.name.toLowerCase() === name.toLowerCase()
    )
    if (duplicate) return 'اسم العميل موجود بالفعل'
    return null
  }

  const handleSubmit = async (values: Record<string, any>) => {
    const rep = reps.find((r: any) => r.id === values.representative_id)
    const payload = {
      name: String(values.name).trim(),
      phone: String(values.phone || '').trim() || undefined,
      representative_id: values.representative_id || null,
      representative_name: rep?.name || null,
    }

    if (editing?.id) {
      await updateCustomer.mutateAsync({ id: editing.id, ...payload })
      showToast('تم تحديث العميل بنجاح')
    } else {
      await upsertCustomer.mutateAsync(payload)
      showToast('تم إضافة العميل بنجاح')
    }
    setEditing(null)
  }

  const handleDelete = async (customer: any) => {
    if (!confirm(`هل أنت متأكد من حذف العميل ${customer.name}؟`)) return
    try {
      await deleteCustomer.mutateAsync(customer.id)
      showToast('تم حذف العميل بنجاح')
    } catch {
      showToast('خطأ في حذف العميل - قد يكون مرتبط بفواتير')
    }
  }

  return (
    <div>
      {/* Tab Header Controls */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-800">قائمة ودليل العملاء</h2>
          <span className="badge badge-primary">{filteredCustomers.length} عميل</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative min-w-[240px] sm:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث باسم العميل أو رقم الهاتف..."
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

          {!isReadOnly && (
            <button
              onClick={openNew}
              className="app-btn app-btn-primary py-2 text-xs sm:text-sm"
            >
              <span>+</span>
              <span>إضافة عميل جديد</span>
            </button>
          )}
        </div>
      </div>

      {/* Desktop Customers Table */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
        <table className="app-table">
          <thead>
            <tr>
              <th className="w-12 text-center">#</th>
              <th className="w-24 text-center">الكود</th>
              <th>اسم العميل</th>
              <th className="text-center">رقم الهاتف</th>
              <th className="text-center">المندوب المخصص</th>
              <th className="text-center">تاريخ الإضافة</th>
              <th className="text-center w-48">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {paginatedCustomers.map((customer: any, idx: number) => (
              <tr key={customer.id}>
                <td className="text-center text-xs text-slate-400 font-mono">
                  {filteredCustomers.length - ((currentPage - 1) * pageSize + idx)}
                </td>
                <td className="text-center text-xs font-mono text-slate-500">
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                    {customer.id.slice(0, 8)}
                  </span>
                </td>
                <td className="font-semibold text-slate-900">
                  <button
                    onClick={() => setStatementCustomer(customer)}
                    className="text-start font-bold text-primary-700 hover:text-primary-800 hover:underline flex items-center gap-2 group"
                    title="انقر لفتح كشف الحساب التراكمي للعميل"
                  >
                    <span>{customer.name}</span>
                    <span className="text-[11px] bg-primary-50 text-primary-700 border border-primary-200 px-2 py-0.5 rounded-full font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      كشف حساب
                    </span>
                  </button>
                </td>
                <td className="text-center text-slate-600 text-sm font-mono" dir="ltr">
                  {customer.phone || '-'}
                </td>
                <td className="text-center">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                    <span>{repName(customer)}</span>
                  </span>
                </td>
                <td className="text-center text-xs text-slate-500">
                  {new Date(customer.created_at).toLocaleDateString('ar-EG')}
                </td>
                <td>
                  <div className="flex gap-1.5 justify-center">
                    <button
                      onClick={() => setStatementCustomer(customer)}
                      className="app-btn app-btn-sm app-btn-success text-xs font-bold"
                      title="عرض كشف الحساب التراكمي"
                    >
                      <span>كشف حساب</span>
                    </button>
                    {!isReadOnly && (
                      <>
                        <button
                          onClick={() => openEdit(customer)}
                          className="app-btn app-btn-sm app-btn-ghost text-xs hover:border-blue-400 hover:text-blue-700"
                          title="تعديل بيانات العميل"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => handleDelete(customer)}
                          className="app-btn app-btn-sm app-btn-ghost text-xs text-rose-600 hover:bg-rose-50 hover:border-rose-300"
                          title="حذف العميل"
                        >
                          حذف
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View (Optimized for field reps on phones) */}
      <div className="md:hidden space-y-3">
        {paginatedCustomers.map((customer: any) => (
          <div key={customer.id} className="app-card p-3.5 shadow-sm space-y-2.5">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <button
                  onClick={() => setStatementCustomer(customer)}
                  className="font-extrabold text-slate-900 text-sm block text-start hover:text-primary-700"
                >
                  {customer.name}
                </button>
                <span className="text-[11px] text-slate-400 font-mono">
                  كود: {customer.id.slice(0, 8)}
                </span>
              </div>
              {customer.phone && (
                <a
                  href={`tel:${customer.phone}`}
                  className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200"
                  dir="ltr"
                >
                  {customer.phone}
                </a>
              )}
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px]">
                المندوب: {repName(customer)}
              </span>
              <span className="text-[11px] text-slate-400">
                تسجيل: {new Date(customer.created_at).toLocaleDateString('ar-EG')}
              </span>
            </div>

            <div className="flex gap-2 pt-1 border-t border-slate-100">
              <button
                onClick={() => setStatementCustomer(customer)}
                className="app-btn app-btn-success app-btn-sm flex-1 py-1.5 text-xs font-bold"
              >
                كشف حساب تراكمي
              </button>
              {!isReadOnly && (
                <>
                  <button
                    onClick={() => openEdit(customer)}
                    className="app-btn app-btn-ghost app-btn-sm px-3 py-1.5 text-xs font-semibold text-blue-700 border-blue-200"
                  >
                    تعديل
                  </button>
                  <button
                    onClick={() => handleDelete(customer)}
                    className="app-btn app-btn-ghost app-btn-sm px-2.5 py-1.5 text-xs text-rose-600 border-rose-200"
                  >
                    حذف
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination Component */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredCustomers.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />

      {filteredCustomers.length === 0 && (
        <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 mt-4">
          <h3 className="text-slate-700 font-bold text-base mb-1">
            {searchTerm ? 'لا توجد نتائج مطابقة لبحثك' : 'لا يوجد عملاء مسجلين بعد'}
          </h3>
          <p className="text-slate-500 text-xs max-w-sm mx-auto">
            {searchTerm
              ? 'تأكد من كتابة اسم العميل أو رقم هاتفه بشكل صحيح، أو أعد ضبط شروط البحث.'
              : 'ابدأ بإضافة أول عميل إلى قاعدة بيانات النظام لإنشاء الفواتير وكشوفات الحساب.'}
          </p>
        </div>
      )}

      {statementCustomer && (
        <CumulativeCustomerStatementModal
          customer={statementCustomer}
          onClose={() => setStatementCustomer(null)}
        />
      )}

      {editing && (
        <FormModal
          title={editing.id ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
          initialValues={editing}
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
          validate={validate}
          fields={[
            { name: 'name', label: 'اسم العميل', required: true, full: true },
            { name: 'phone', label: 'رقم الهاتف', dir: 'ltr' },
            {
              name: 'representative_id',
              label: 'المندوب المسؤول',
              type: 'select',
              placeholder: 'اختر المندوب المسؤول عن العميل',
              options: reps.map((rep: any) => ({ value: rep.id, label: rep.name })),
            },
          ]}
        />
      )}
    </div>
  )
}
