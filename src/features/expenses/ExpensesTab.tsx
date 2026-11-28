import { useState, useMemo } from 'react'
import {
  useExpenses,
  useAddExpense,
  useUpdateExpense,
  useDeleteExpense,
} from '@/features/expenses/useExpenses'
import { formatMoney, getTodayISO } from '@/shared/lib/format'
import FormModal from '@/shared/ui/FormModal'
import Pagination from '@/shared/ui/Pagination'
import PageHeader from '@/shared/ui/PageHeader'
import FilterToolbar from '@/shared/ui/FilterToolbar'
import ResponsiveDataView from '@/shared/ui/ResponsiveDataView'
import { useDatePreset } from '@/shared/hooks/useDatePreset'
import { useAuth } from '@/features/auth/useAuth'
import { useSettings } from '@/features/settings/useSettings'
import { printExpenseVoucher, printGenericDocument } from '@/features/reporting/printableDocuments'
import { useRowSelection } from '@/shared/hooks/useRowSelection'
import { BulkActionBar } from '@/shared/ui/BulkActionBar'

const categories = [
  'إيجار',
  'رواتب',
  'كهرباء ومياه',
  'مواصلات',
  'صيانة',
  'مصروفات تشغيلية',
  'أخرى',
]

export default function ExpensesTab({ showToast }: any) {
  const { data: expenses = [], isLoading, error } = useExpenses()
  const addExpense = useAddExpense()
  const updateExpense = useUpdateExpense()
  const deleteExpense = useDeleteExpense()
  const { data: settings } = useSettings()
  const { can } = useAuth()
  const canPrint = can('export_print')
  const companyName = settings?.title || 'المؤسسة المصرية لتوزيع المواد الغذائية'
  const [searchTerm, setSearchTerm] = useState('')
  const { preset, from, to, setPreset, setFrom, setTo, reset } = useDatePreset('all')
  const [editing, setEditing] = useState<any | null>(null)

  const filteredExpenses = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return expenses.filter((e: any) => {
      const date = String(e.date || '')
      if (from && date < from) return false
      if (to && date > to) return false
      if (!term) return true
      return (
        e.category.toLowerCase().includes(term) ||
        (e.description && e.description.toLowerCase().includes(term))
      )
    })
  }, [expenses, searchTerm, from, to])

  const total = useMemo(
    () => filteredExpenses.reduce((sum: number, e: any) => sum + Number(e.amount), 0),
    [filteredExpenses]
  )

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  const totalPages = Math.ceil(filteredExpenses.length / pageSize) || 1
  const paginatedExpenses = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredExpenses.slice(start, start + pageSize)
  }, [filteredExpenses, currentPage, pageSize])

  const notifyPrintBlocked = (printed: boolean) => {
    if (!printed) showToast('يرجى السماح بالنوافذ المنبثقة للطباعة')
  }

  const handlePrintVoucher = (expense: any) => {
    void printExpenseVoucher({
      companyName,
      date: expense.date || '',
      category: expense.category || '-',
      amount: Number(expense.amount || 0),
      description: expense.description,
    }).then(notifyPrintBlocked)
  }

  const handlePrintList = () => {
    void printGenericDocument({
      companyName,
      title: 'سجل المصاريف التشغيلية',
      subtitle: from || to ? `من ${from || 'البداية'} إلى ${to || 'اليوم'}` : undefined,
      columns: [
        { label: '#', numeric: true },
        { label: 'التاريخ' },
        { label: 'النوع' },
        { label: 'المبلغ', numeric: true },
        { label: 'الوصف' },
      ],
      rows: filteredExpenses.map((expense: any, index: number) => [
        filteredExpenses.length - index,
        expense.date || '-',
        expense.category || '-',
        formatMoney(Number(expense.amount || 0), { withCurrency: false }),
        expense.description || '-',
      ]),
    }).then(notifyPrintBlocked)
  }

  const hasActiveFilters = !!searchTerm.trim() || !!from || !!to
  const resetFilters = () => {
    setSearchTerm('')
    reset()
    setCurrentPage(1)
  }

  // ── Bulk selection (print/delete the checked rows on this page) ─────────────
  const selection = useRowSelection(
    paginatedExpenses as Record<string, unknown>[],
    (expense) => String(expense.id)
  )

  const handleBulkPrint = async () => {
    const printed = await printGenericDocument({
      companyName,
      title: 'المصاريف المحددة',
      columns: [
        { label: '#', numeric: true },
        { label: 'التاريخ' },
        { label: 'النوع' },
        { label: 'المبلغ', numeric: true },
        { label: 'الوصف' },
      ],
      rows: selection.selectedRows.map((expense, index) => [
        String(selection.selectedRows.length - index),
        String(expense.date || '-'),
        String(expense.category || '-'),
        formatMoney(Number(expense.amount || 0), { withCurrency: false }),
        String(expense.description || '-'),
      ]),
    })
    if (printed) selection.clear()
    else notifyPrintBlocked(printed)
  }

  const handleBulkDelete = async () => {
    if (!confirm(`هل أنت متأكد من حذف ${selection.count} مصروف؟`)) return
    let failed = 0
    for (const expense of selection.selectedRows) {
      try {
        await deleteExpense.mutateAsync(String(expense.id))
      } catch {
        failed += 1
      }
    }
    showToast(failed ? `تم حذف ${selection.count - failed} مصروف وفشل ${failed}` : `تم حذف ${selection.count} مصروف`)
    selection.clear()
  }

  const openNew = () => {
    setEditing({ date: getTodayISO(), category: '', amount: '', description: '' })
  }

  const openEdit = (expense: any) => {
    setEditing({
      id: expense.id,
      date: expense.date,
      category: expense.category,
      amount: String(Number(expense.amount)),
      description: expense.description || '',
    })
  }

  const validate = (values: Record<string, any>) => {
    if (!values.category) return 'اختر نوع المصروف'
    if (!(parseFloat(values.amount) > 0)) return 'المبلغ يجب أن يكون أكبر من صفر'
    return null
  }

  const handleSubmit = async (values: Record<string, any>) => {
    const payload = {
      date: values.date,
      category: values.category,
      amount: Number(values.amount),
      description: String(values.description || '').trim() || null,
    }

    if (editing?.id) {
      await updateExpense.mutateAsync({ id: editing.id, ...payload })
      showToast('تم تحديث المصروف بنجاح')
    } else {
      await addExpense.mutateAsync(payload)
      showToast('تم تسجيل المصروف بنجاح')
    }
    setEditing(null)
  }

  const handleDelete = async (expense: any) => {
    if (!confirm('هل أنت متأكد من حذف هذا المصروف؟')) return
    try {
      await deleteExpense.mutateAsync(expense.id)
      showToast('تم حذف المصروف بنجاح')
    } catch {
      showToast('خطأ في حذف المصروف')
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="المصاريف التشغيلية"
        count={`${filteredExpenses.length} مصروف`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-danger">
              إجمالي: <span className="font-num font-extrabold" dir="ltr">{formatMoney(total)}</span>
            </span>
            {canPrint && (
              <button
                onClick={handlePrintList}
                className="app-btn app-btn-secondary py-2 text-xs sm:text-sm"
              >
                طباعة القائمة
              </button>
            )}
            <button
              onClick={openNew}
              className="app-btn app-btn-primary py-2 text-xs sm:text-sm"
            >
              <span>+</span>
              <span>إضافة مصروف</span>
            </button>
          </div>
        }
      />

      <FilterToolbar
        search={searchTerm}
        onSearchChange={(v) => { setSearchTerm(v); setCurrentPage(1) }}
        searchPlaceholder="بحث بنوع المصروف أو الوصف..."
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
        printLabel="طباعة المصروفات المحددة"
        deleteLabel="حذف المصروفات المحددة"
      />

      <ResponsiveDataView
        loading={isLoading}
        error={error ? 'تعذّر تحميل المصروفات. أعد المحاولة لاحقاً.' : undefined}
        hasData={filteredExpenses.length > 0}
        empty={
          <div className="space-y-1">
            <p className="font-bold text-slate-700">
              {hasActiveFilters ? 'لا توجد نتائج مطابقة لبحثك' : 'لا توجد مصروفات مسجلة بعد'}
            </p>
            <p className="text-xs text-slate-500">
              {hasActiveFilters
                ? 'تأكد من كتابة نوع المصروف أو وصفه بشكل صحيح، أو أعد ضبط شروط البحث.'
                : 'سجّل المصروفات التشغيلية لتظهر في حساب التدفق النقدي ولوحة المؤشرات.'}
            </p>
          </div>
        }
        table={(
          <>
      {/* Desktop Expenses Table */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
        <table className="app-table">
          <thead>
            <tr>
              <th className="w-10 text-center">
                <input
                  type="checkbox"
                  checked={selection.allCurrentPageSelected}
                  onChange={selection.toggleCurrentPage}
                  aria-label="تحديد كل مصروفات الصفحة"
                  className="h-4 w-4 accent-[var(--primary)] cursor-pointer"
                />
              </th>
              <th className="w-12 text-center">#</th>
              <th className="w-32 text-center">التاريخ</th>
              <th className="w-44">النوع</th>
              <th className="w-32 text-center">المبلغ</th>
              <th>الوصف</th>
              <th className="text-center w-48">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {paginatedExpenses.map((expense: any, idx: number) => (
              <tr key={expense.id}>
                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={selection.isSelected(String(expense.id))}
                    onChange={() => selection.toggle(String(expense.id))}
                    aria-label="تحديد المصروف"
                    className="h-4 w-4 accent-[var(--primary)] cursor-pointer"
                  />
                </td>
                <td className="text-center text-xs text-slate-400 font-mono">
                  {filteredExpenses.length - ((currentPage - 1) * pageSize + idx)}
                </td>
                <td className="text-center text-xs text-slate-600 font-num font-semibold" dir="ltr">
                  {expense.date}
                </td>
                <td>
                  <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    {expense.category}
                  </span>
                </td>
                <td className="text-center font-num text-sm font-extrabold text-rose-600 tabular-nums" dir="ltr">
                  {formatMoney(Number(expense.amount), { withCurrency: false })}
                </td>
                <td className="text-slate-600 text-sm">
                  {expense.description || '-'}
                </td>
                <td>
                  <div className="flex gap-1.5 justify-center">
                    {canPrint && (
                      <button
                        onClick={() => handlePrintVoucher(expense)}
                        className="app-btn app-btn-sm app-btn-ghost text-xs hover:border-blue-400 hover:text-blue-700"
                        title="طباعة قسيمة المصروف"
                      >
                        إيصال
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(expense)}
                      className="app-btn app-btn-sm app-btn-ghost text-xs hover:border-blue-400 hover:text-blue-700"
                    >
                      تعديل
                    </button>
                    <button
                      onClick={() => handleDelete(expense)}
                      className="app-btn app-btn-sm app-btn-ghost text-xs text-rose-600 hover:bg-rose-50 hover:border-rose-300"
                    >
                      حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View (Optimized for field reps / mobile view) */}
      <div className="md:hidden space-y-3">
        {paginatedExpenses.map((expense: any) => (
          <div key={expense.id} className="app-card p-3.5 shadow-sm space-y-2.5">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
              <input
                type="checkbox"
                checked={selection.isSelected(String(expense.id))}
                onChange={() => selection.toggle(String(expense.id))}
                aria-label="تحديد المصروف"
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)] cursor-pointer"
              />
              <div>
                <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                  {expense.category}
                </span>
                <span className="text-[11px] text-slate-500 block mt-1 font-num font-semibold" dir="ltr">
                  {expense.date}
                </span>
              </div>
              <div className="text-end">
                <span className="font-num font-extrabold text-rose-600 text-base block" dir="ltr">
                  {formatMoney(Number(expense.amount))}
                </span>
              </div>
            </div>

            {expense.description && (
              <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-xl">
                {expense.description}
              </p>
            )}

            <div className="flex gap-2 pt-1 border-t border-slate-100">
              {canPrint && (
                <button
                  onClick={() => handlePrintVoucher(expense)}
                  className="app-btn app-btn-ghost app-btn-sm flex-1 py-1.5 text-xs font-semibold text-blue-700 border-blue-200 hover:bg-blue-50"
                >
                  طباعة الإيصال
                </button>
              )}
              <button
                onClick={() => openEdit(expense)}
                className="app-btn app-btn-ghost app-btn-sm flex-1 py-1.5 text-xs font-semibold text-blue-700 border-blue-200"
              >
                تعديل المصروف
              </button>
              <button
                onClick={() => handleDelete(expense)}
                className="app-btn app-btn-ghost app-btn-sm px-3 py-1.5 text-xs text-rose-600 border-rose-200"
              >
                حذف
              </button>
            </div>
          </div>
        ))}
      </div>

          </>
        )}
        footer={
          <>
            {/* Pagination Component */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredExpenses.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          </>
        }
      />

      {editing && (
        <FormModal
          title={editing.id ? 'تعديل المصروف' : 'إضافة مصروف جديد'}
          initialValues={editing}
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
          validate={validate}
          fields={[
            { name: 'date', label: 'التاريخ', type: 'date', required: true },
            {
              name: 'category',
              label: 'نوع المصروف',
              type: 'select',
              required: true,
              placeholder: 'اختر نوع المصروف',
              options: categories.map((c) => ({ value: c, label: c })),
            },
            {
              name: 'amount',
              label: 'المبلغ',
              type: 'number',
              required: true,
              min: 0.01,
              step: '0.01',
              placeholder: '0.00',
            },
            {
              name: 'description',
              label: 'الوصف',
              type: 'textarea',
              full: true,
              placeholder: 'تفاصيل إضافية عن المصروف (اختياري)',
            },
          ]}
        />
      )}
    </div>
  )
}
