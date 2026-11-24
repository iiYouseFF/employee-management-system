import { useEffect, useMemo, useState } from 'react'
import { useCustomers, useUpsertCustomer, useUpdateCustomer, useDeleteCustomer } from '@/features/sales/useInvoices'
import { useReps } from '@/features/reps/useReps'
import FormModal from '@/shared/ui/FormModal'
import Pagination from '@/shared/ui/Pagination'
import PageHeader from '@/shared/ui/PageHeader'
import FilterToolbar from '@/shared/ui/FilterToolbar'
import ResponsiveDataView from '@/shared/ui/ResponsiveDataView'
import { MobileCard, MobileCardRow } from '@/shared/ui/MobileCards'
import CumulativeCustomerStatementModal from '@/features/statements/CumulativeCustomerStatementModal'
import { formatNumber } from '@/shared/lib/format'

export default function CustomersTab({ showToast, repFilter, isReadOnly = false }: any) {
  const { data: customers = [], isLoading, error } = useCustomers(repFilter)
  const { data: reps = [] } = useReps()
  const upsertCustomer = useUpsertCustomer()
  const updateCustomer = useUpdateCustomer()
  const deleteCustomer = useDeleteCustomer()
  const [searchTerm, setSearchTerm] = useState('')
  const [editing, setEditing] = useState<any | null>(null)
  const [statementCustomer, setStatementCustomer] = useState<any | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return customers
    const term = searchTerm.toLowerCase().trim()
    return customers.filter((c: any) => c.name.toLowerCase().includes(term) || (c.phone && c.phone.includes(term)))
  }, [customers, searchTerm])

  useEffect(() => { setCurrentPage(1) }, [searchTerm, repFilter])

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

  const openNew = () => setEditing({ name: '', phone: '', representative_id: '' })
  const openEdit = (customer: any) => setEditing({ id: customer.id, name: customer.name, phone: customer.phone || '', representative_id: customer.representative_id || '' })

  const handleSubmit = async (values: Record<string, any>) => {
    const payload = {
      name: String(values.name || '').trim(),
      phone: String(values.phone || '').trim() || null,
      representative_id: values.representative_id || null,
      representative_name: reps.find((r: any) => r.id === values.representative_id)?.name || null,
    }
    try {
      if (editing?.id) { await updateCustomer.mutateAsync({ id: editing.id, ...payload } as any); showToast('تم تحديث بيانات العميل بنجاح') }
      else { await upsertCustomer.mutateAsync(payload as any); showToast('تمت إضافة العميل بنجاح') }
      setEditing(null)
    } catch { showToast('تعذر حفظ بيانات العميل، يرجى المحاولة لاحقاً') }
  }

  const handleDelete = async (customer: any) => {
    if (isReadOnly) return
    if (!confirm(`هل أنت متأكد من حذف العميل ${customer.name} نهائياً؟ سيتم حذف كافة فواتيره ومدفوعاته.`)) return
    try { await deleteCustomer.mutateAsync(customer.id); showToast('تم حذف العميل بنجاح') }
    catch { showToast('تعذر حذف العميل لأنه مرتبط بفواتير أو مدفوعات سابقة') }
  }

  return (
    <div className="app-page">
      <PageHeader
        title="إدارة العملاء"
        subtitle="عرض وإدارة بيانات العملاء وحساباتهم المرتبطة بالمناديب."
        count={filteredCustomers.length}
        actions={!isReadOnly ? <button type="button" onClick={openNew} className="app-btn app-btn-primary">+ إضافة عميل جديد</button> : undefined}
      />

      <FilterToolbar
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="ابحث بالاسم أو رقم الهاتف..."
        onReset={() => setSearchTerm('')}
        hasActiveFilters={!!searchTerm.trim()}
      />

      <ResponsiveDataView
        loading={isLoading}
        error={error ? 'تعذر تحميل العملاء' : null}
        hasData={paginatedCustomers.length > 0}
        empty={searchTerm ? 'لا توجد نتائج تطابق البحث.' : 'لا يوجد عملاء حالياً.'}
        cards={paginatedCustomers.map((c: any) => (
          <MobileCard key={c.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-slate-900 truncate">{c.name}</div>
                <div className="text-xs text-slate-500 font-mono mt-0.5" dir="ltr">{c.phone || '-'}</div>
              </div>
              <span className="app-pill app-pill-neutral shrink-0">{repName(c)}</span>
            </div>
            <MobileCardRow label="الرصيد الافتتاحي" value={<span className="num font-bold">{formatNumber(c.opening_balance || 0)} ج.م</span>} />
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={() => setStatementCustomer(c)} className="app-btn app-btn-secondary app-btn-sm flex-1">كشف الحساب</button>
              {!isReadOnly && <button type="button" onClick={() => openEdit(c)} className="app-btn app-btn-ghost app-btn-sm flex-1">تعديل</button>}
              {!isReadOnly && <button type="button" onClick={() => handleDelete(c)} className="app-btn app-btn-danger app-btn-sm">حذف</button>}
            </div>
          </MobileCard>
        ))}
        table={(
          <div className="app-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>اسم العميل</th>
                    <th>رقم الهاتف</th>
                    <th>المندوب المسؤول</th>
                    <th className="text-end">الرصيد الافتتاحي</th>
                    <th className="text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCustomers.map((c: any) => (
                    <tr key={c.id}>
                      <td className="font-bold text-slate-900">{c.name}</td>
                      <td className="font-mono text-slate-600" dir="ltr">{c.phone || '-'}</td>
                      <td><span className="app-pill app-pill-neutral">{repName(c)}</span></td>
                      <td className="num font-bold text-slate-900">{formatNumber(c.opening_balance || 0)} ج.م</td>
                      <td>
                        <div className="flex items-center justify-center gap-1.5">
                          <button type="button" onClick={() => setStatementCustomer(c)} className="app-btn app-btn-secondary app-btn-sm">كشف حساب</button>
                          {!isReadOnly && <button type="button" onClick={() => openEdit(c)} className="app-btn app-btn-ghost app-btn-sm">تعديل</button>}
                          {!isReadOnly && <button type="button" onClick={() => handleDelete(c)} className="app-btn app-btn-danger app-btn-sm">حذف</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        footer={
          <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredCustomers.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1) }} />
        }
      />

      {editing && !isReadOnly && (
        <FormModal
          title={editing.id ? 'تعديل بيانات عميل' : 'إضافة عميل جديد'}
          subtitle={editing.id ? 'تحديث الاسم أو رقم الهاتف أو المندوب المسؤول.' : 'أدخل بيانات العميل الأساسية وسيتم ربطه بالمندوب المختار.'}
          submitLabel={editing.id ? 'حفظ التعديلات' : 'إضافة العميل'}
          initialValues={editing}
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
          fields={[
            { name: 'name', label: 'اسم العميل', required: true, placeholder: 'مثال: محل الأمل للتجارة' },
            { name: 'phone', label: 'رقم الهاتف', required: true, dir: 'ltr', placeholder: '01xxxxxxxxx' },
            { name: 'representative_id', label: 'المندوب المسؤول', type: 'searchable', placeholder: 'اختر المندوب المسؤول عن العميل', searchPlaceholder: 'ابحث عن مندوب...', options: reps.map((r: any) => ({ value: r.id, label: r.name })) },
          ]}
        />
      )}

      {statementCustomer && (
        <CumulativeCustomerStatementModal
          customer={statementCustomer}
          onClose={() => setStatementCustomer(null)}
        />
      )}
    </div>
  )
}




