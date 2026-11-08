import { useState, useMemo } from 'react'
import {
  useExpenses,
  useAddExpense,
  useUpdateExpense,
  useDeleteExpense,
} from '../../hooks/useExpenses'
import { formatNumber, getTodayISO } from '../../lib/format'
import FormModal from '../FormModal'
import Pagination from '../Pagination'

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
  const { data: expenses = [] } = useExpenses()
  const addExpense = useAddExpense()
  const updateExpense = useUpdateExpense()
  const deleteExpense = useDeleteExpense()
  const [searchTerm, setSearchTerm] = useState('')
  const [editing, setEditing] = useState<any | null>(null)

  const filteredExpenses = useMemo(() => {
    if (!searchTerm.trim()) return expenses
    const term = searchTerm.toLowerCase().trim()
    return expenses.filter(
      (e: any) =>
        e.category.toLowerCase().includes(term) ||
        (e.description && e.description.toLowerCase().includes(term))
    )
  }, [expenses, searchTerm])

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
    <div>
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-800">المصاريف التشغيلية</h2>
          <span className="badge badge-primary">{filteredExpenses.length} مصروف</span>
          <span className="badge badge-danger">
            إجمالي: {formatNumber(total)} ج.م
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative min-w-[240px] sm:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث بنوع المصروف أو الوصف..."
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
            onClick={openNew}
            className="app-btn app-btn-primary py-2 text-xs sm:text-sm"
          >
            <span>+</span>
            <span>إضافة مصروف</span>
          </button>
        </div>
      </div>

      {/* Desktop Expenses Table */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
        <table className="app-table">
          <thead>
            <tr>
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
                <td className="text-center text-xs text-slate-400 font-mono">
                  {filteredExpenses.length - ((currentPage - 1) * pageSize + idx)}
                </td>
                <td className="text-center text-xs text-slate-500 font-mono">
                  {expense.date}
                </td>
                <td>
                  <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                    {expense.category}
                  </span>
                </td>
                <td className="text-center font-mono text-sm font-bold text-rose-600 tabular-nums">
                  {formatNumber(Number(expense.amount))}
                </td>
                <td className="text-slate-600 text-sm">
                  {expense.description || '-'}
                </td>
                <td>
                  <div className="flex gap-1.5 justify-center">
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
              <div>
                <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                  {expense.category}
                </span>
                <span className="text-[11px] text-slate-400 block mt-1 font-mono">
                  {expense.date}
                </span>
              </div>
              <div className="text-end">
                <span className="font-mono font-black text-rose-600 text-base block">
                  {formatNumber(Number(expense.amount))}
                </span>
                <span className="text-[10px] text-slate-400">ج.م</span>
              </div>
            </div>

            {expense.description && (
              <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-xl">
                {expense.description}
              </p>
            )}

            <div className="flex gap-2 pt-1 border-t border-slate-100">
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

      {/* Pagination Component */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredExpenses.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />

      {filteredExpenses.length === 0 && (
        <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 mt-4">
          <h3 className="text-slate-700 font-bold text-base mb-1">
            {searchTerm ? 'لا توجد نتائج مطابقة لبحثك' : 'لا توجد مصروفات مسجلة بعد'}
          </h3>
          <p className="text-slate-500 text-xs max-w-sm mx-auto">
            {searchTerm
              ? 'تأكد من كتابة نوع المصروف أو وصفه بشكل صحيح، أو أعد ضبط شروط البحث.'
              : 'سجّل المصروفات التشغيلية لتظهر في حساب التدفق النقدي ولوحة المؤشرات.'}
          </p>
        </div>
      )}

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
