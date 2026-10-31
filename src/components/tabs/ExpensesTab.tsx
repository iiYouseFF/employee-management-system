import { useState, useMemo } from 'react'
import {
  useExpenses,
  useAddExpense,
  useUpdateExpense,
  useDeleteExpense,
} from '../../hooks/useExpenses'
import { formatNumber, getTodayISO } from '../../lib/format'
import FormModal from '../FormModal'

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

      <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
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
            {filteredExpenses.map((expense: any, idx: number) => (
              <tr key={expense.id}>
                <td className="text-center text-xs text-slate-400 font-mono">
                  {filteredExpenses.length - idx}
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
