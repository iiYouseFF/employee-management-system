import { useEffect, useState } from 'react'
import Modal from '@/shared/ui/Modal'
import { MoneyText } from '@/shared/ui/MoneyText'
import type { EmployeeRow } from './hr.types'
import { useEmployees, useSaveEmployee, type SaveEmployeeInput } from './useHr'

interface EmployeesDirectorySectionProps {
  showToast: (message: string) => void
  openNewSignal?: number
}

export default function EmployeesDirectorySection({ showToast, openNewSignal }: EmployeesDirectorySectionProps) {
  const { data: employees = [], isLoading, isError } = useEmployees()
  const saveEmployee = useSaveEmployee()
  const [editing, setEditing] = useState<SaveEmployeeInput | null>(null)

  const openNew = () => {
    setEditing({
      full_name: '',
      phone: '',
      job_title: 'أمين مخزن',
      base_salary: 0,
      shift_start: '09:00',
      shift_end: '17:00',
      overtime_hourly_rate: 0,
      is_active: true,
    })
  }

  useEffect(() => {
    if (openNewSignal && openNewSignal > 0) {
      openNew()
    }
  }, [openNewSignal])

  const openEdit = (emp: EmployeeRow) => {
    setEditing({
      id: emp.id,
      full_name: emp.full_name,
      phone: emp.phone || '',
      job_title: emp.job_title,
      base_salary: emp.base_salary,
      shift_start: emp.shift_start.slice(0, 5),
      shift_end: emp.shift_end.slice(0, 5),
      overtime_hourly_rate: emp.overtime_hourly_rate,
      is_active: emp.is_active,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing || !editing.full_name.trim()) {
      showToast('يرجى إدخال اسم الموظف')
      return
    }
    try {
      await saveEmployee.mutateAsync({
        ...editing,
        shift_start: `${editing.shift_start}:00`,
        shift_end: `${editing.shift_end}:00`,
      })
      showToast('تم حفظ بيانات الموظف بنجاح')
      setEditing(null)
    } catch {
      showToast('تعذر حفظ بيانات الموظف')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-600">
          يتم مزامنة مناديب المبيعات تلقائياً؛ يمكنك إضافة موظفي المخزن والإدارة وتحديد الرواتب ومواعيد العمل.
        </p>
        <button type="button" onClick={openNew} className="app-btn app-btn-sm app-btn-primary shrink-0">
          + إضافة موظف
        </button>
      </div>

      {isLoading && <div className="py-8 text-center text-sm text-slate-500">جاري تحميل الموظفين...</div>}
      {isError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
          تعذر تحميل قائمة الموظفين.
        </div>
      )}

      {!isLoading && !isError && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="app-table w-full text-xs">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>المسمى الوظيفي</th>
                <th>الراتب الأساسي</th>
                <th>سعر ساعة الإضافي</th>
                <th>مواعيد العمل</th>
                <th>الحالة</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td>
                    <div className="font-bold text-slate-900">{emp.full_name}</div>
                    {emp.phone && <div className="text-[11px] text-slate-500 font-num">{emp.phone}</div>}
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                      {emp.job_title}
                    </span>
                  </td>
                  <td className="font-bold"><MoneyText amount={emp.base_salary} /></td>
                  <td><MoneyText amount={emp.overtime_hourly_rate} /></td>
                  <td className="font-num tabular-nums">
                    {emp.shift_start.slice(0, 5)} – {emp.shift_end.slice(0, 5)}
                  </td>
                  <td>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        emp.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {emp.is_active ? 'نشط' : 'غير نشط'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => openEdit(emp)}
                      className="app-btn app-btn-sm border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      تعديل
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? 'تعديل بيانات موظف' : 'إضافة موظف جديد'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">الاسم الكامل</label>
                <input
                  type="text"
                  required
                  value={editing.full_name}
                  onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                  className="app-input w-full text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">المسمى الوظيفي</label>
                <input
                  type="text"
                  required
                  value={editing.job_title}
                  onChange={(e) => setEditing({ ...editing, job_title: e.target.value })}
                  className="app-input w-full text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">الهاتف</label>
                <input
                  type="text"
                  value={editing.phone || ''}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  className="app-input w-full text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">الراتب الأساسي</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={editing.base_salary}
                  onChange={(e) => setEditing({ ...editing, base_salary: Number(e.target.value) })}
                  className="app-input w-full text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">سعر ساعة الإضافي</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={editing.overtime_hourly_rate}
                  onChange={(e) => setEditing({ ...editing, overtime_hourly_rate: Number(e.target.value) })}
                  className="app-input w-full text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">بداية الوردية</label>
                <input
                  type="time"
                  required
                  value={editing.shift_start}
                  onChange={(e) => setEditing({ ...editing, shift_start: e.target.value })}
                  className="app-input w-full text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">نهاية الوردية</label>
                <input
                  type="time"
                  required
                  value={editing.shift_end}
                  onChange={(e) => setEditing({ ...editing, shift_end: e.target.value })}
                  className="app-input w-full text-xs"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={editing.is_active}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
              />
              موظف نشط
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(null)} className="app-btn app-btn-ghost">إلغاء</button>
              <button type="submit" disabled={saveEmployee.isPending} className="app-btn app-btn-primary">
                {saveEmployee.isPending ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
