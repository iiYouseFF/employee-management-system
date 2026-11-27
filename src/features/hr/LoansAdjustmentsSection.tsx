import { useMemo, useState } from 'react'
import Modal from '@/shared/ui/Modal'
import { MoneyText } from '@/shared/ui/MoneyText'
import { formatNumber, getTodayISO } from '@/shared/lib/format'
import type { AdjustmentKind } from './hr.types'
import {
  useAddAdjustment,
  useCreateLoan,
  useEmployeeAdjustments,
  useEmployeeLoans,
  useEmployees,
} from './useHr'

interface LoansAdjustmentsSectionProps {
  showToast: (message: string) => void
}

const KIND_LABELS: Record<AdjustmentKind, { label: string; cls: string }> = {
  bonus: { label: 'مكافأة', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  deduction: { label: 'خصم', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
  overtime: { label: 'إضافي', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  loan_repayment: { label: 'قسط سُلفة', cls: 'bg-violet-50 text-violet-800 border-violet-200' },
}

export default function LoansAdjustmentsSection({ showToast }: LoansAdjustmentsSectionProps) {
  const { data: employees = [] } = useEmployees()
  const { data: loans = [], isLoading: loansLoading } = useEmployeeLoans()
  const { data: adjustments = [], isLoading: adjLoading } = useEmployeeAdjustments()
  const createLoan = useCreateLoan()
  const addAdjustment = useAddAdjustment()

  const [empFilter, setEmpFilter] = useState('all')
  const [loanModalOpen, setLoanModalOpen] = useState(false)
  const [adjModalOpen, setAdjModalOpen] = useState(false)

  // Loan form state
  const [loanEmpId, setLoanEmpId] = useState('')
  const [loanDate, setLoanDate] = useState(() => getTodayISO())
  const [loanTotal, setLoanTotal] = useState('')
  const [loanInstallment, setLoanInstallment] = useState('')
  const [loanNotes, setLoanNotes] = useState('')
  const [loanRecordExpense, setLoanRecordExpense] = useState(true)

  // Adjustment form state
  const [adjEmpId, setAdjEmpId] = useState('')
  const [adjDate, setAdjDate] = useState(() => getTodayISO())
  const [adjKind, setAdjKind] = useState<AdjustmentKind>('bonus')
  const [adjHours, setAdjHours] = useState('')
  const [adjAmount, setAdjAmount] = useState('')
  const [adjReason, setAdjReason] = useState('')

  const empNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of employees) map.set(e.id, e.full_name)
    return map
  }, [employees])

  const filteredLoans = useMemo(
    () => (empFilter === 'all' ? loans : loans.filter((l) => l.employee_id === empFilter)),
    [loans, empFilter]
  )

  const filteredAdj = useMemo(
    () => (empFilter === 'all' ? adjustments : adjustments.filter((a) => a.employee_id === empFilter)),
    [adjustments, empFilter]
  )

  const handleHoursChange = (val: string) => {
    setAdjHours(val)
    if (adjKind === 'overtime' && adjEmpId) {
      const emp = employees.find((e) => e.id === adjEmpId)
      const hrs = Number(val)
      if (emp && Number.isFinite(hrs) && hrs > 0 && emp.overtime_hourly_rate > 0) {
        setAdjAmount(String(Math.round(hrs * emp.overtime_hourly_rate * 100) / 100))
      }
    }
  }

  const handleCreateLoan = async (e: React.FormEvent) => {
    e.preventDefault()
    const total = Number(loanTotal)
    const inst = Number(loanInstallment)
    if (!loanEmpId || !(total > 0) || !(inst > 0)) {
      showToast('يرجى إدخال بيانات السُلفة بشكل صحيح')
      return
    }
    try {
      await createLoan.mutateAsync({
        employee_id: loanEmpId,
        employee_name: empNameMap.get(loanEmpId) || 'موظف',
        loan_date: loanDate,
        total_amount: total,
        monthly_installment: inst,
        notes: loanNotes,
        record_expense: loanRecordExpense,
      })
      showToast('تم تسجيل السُلفة بنجاح')
      setLoanModalOpen(false)
      setLoanTotal('')
      setLoanInstallment('')
      setLoanNotes('')
    } catch {
      showToast('تعذر حفظ السُلفة')
    }
  }

  const handleAddAdj = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = Number(adjAmount)
    if (!adjEmpId || !(amt > 0)) {
      showToast('يرجى اختيار الموظف وإدخال مبلغ صحيح')
      return
    }
    try {
      await addAdjustment.mutateAsync({
        employee_id: adjEmpId,
        tx_date: adjDate,
        kind: adjKind,
        amount: amt,
        hours: adjKind === 'overtime' ? Number(adjHours || 0) : null,
        reason: adjReason,
      })
      showToast('تمت إضافة الحركة بنجاح')
      setAdjModalOpen(false)
      setAdjHours('')
      setAdjAmount('')
      setAdjReason('')
    } catch {
      showToast('تعذر حفظ الحركة')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <select
          value={empFilter}
          onChange={(e) => setEmpFilter(e.target.value)}
          className="app-select w-full sm:w-56 py-1.5 text-xs"
        >
          <option value="all">كل الموظفين</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.full_name}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLoanModalOpen(true)}
            className="app-btn app-btn-sm border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
          >
            + صرف سُلفة
          </button>
          <button
            type="button"
            onClick={() => setAdjModalOpen(true)}
            className="app-btn app-btn-sm app-btn-primary"
          >
            + مكافأة / خصم / إضافي
          </button>
        </div>
      </div>

      {/* Active & settled loans */}
      <section className="space-y-2">
        <h3 className="text-sm font-extrabold text-slate-800">السُلف ({filteredLoans.length})</h3>
        {loansLoading ? (
          <div className="py-6 text-center text-xs text-slate-500">جاري تحميل السُلف...</div>
        ) : filteredLoans.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-500">
            لا توجد سُلف مسجلة.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="app-table w-full text-xs">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>التاريخ</th>
                  <th>إجمالي السُلفة</th>
                  <th>القسط الشهري</th>
                  <th>المتبقي</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filteredLoans.map((loan) => (
                  <tr key={loan.id}>
                    <td className="font-bold text-slate-900">{empNameMap.get(loan.employee_id) || '-'}</td>
                    <td className="font-num tabular-nums">{loan.loan_date}</td>
                    <td><MoneyText amount={loan.total_amount} /></td>
                    <td><MoneyText amount={loan.monthly_installment} /></td>
                    <td className="font-bold"><MoneyText amount={loan.remaining_amount} /></td>
                    <td>
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                          loan.status === 'settled'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-amber-200 bg-amber-50 text-amber-800'
                        }`}
                      >
                        {loan.status === 'settled' ? 'مسددة' : 'نشطة'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Adjustments ledger */}
      <section className="space-y-2">
        <h3 className="text-sm font-extrabold text-slate-800">سجل المكافآت والخصومات والإضافي ({filteredAdj.length})</h3>
        {adjLoading ? (
          <div className="py-6 text-center text-xs text-slate-500">جاري تحميل السجل...</div>
        ) : filteredAdj.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-500">
            لا توجد حركات مسجلة.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="app-table w-full text-xs">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>الموظف</th>
                  <th>النوع</th>
                  <th>المبلغ</th>
                  <th>الساعات</th>
                  <th>السبب</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdj.map((adj) => {
                  const meta = KIND_LABELS[adj.kind]
                  return (
                    <tr key={adj.id}>
                      <td className="font-num tabular-nums">{adj.tx_date}</td>
                      <td className="font-bold text-slate-900">{empNameMap.get(adj.employee_id) || '-'}</td>
                      <td>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${meta.cls}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="font-bold"><MoneyText amount={adj.amount} /></td>
                      <td className="font-num tabular-nums">{adj.hours ? `${formatNumber(adj.hours)} س` : '-'}</td>
                      <td className="text-slate-600">{adj.reason || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {loanModalOpen && (
        <Modal title="صرف سُلفة موظف" onClose={() => setLoanModalOpen(false)}>
          <form onSubmit={handleCreateLoan} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">الموظف</label>
              <select
                required
                value={loanEmpId}
                onChange={(e) => setLoanEmpId(e.target.value)}
                className="app-select w-full text-xs"
              >
                <option value="">اختر الموظف...</option>
                {employees.filter((e) => e.is_active).map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">التاريخ</label>
                <input type="date" required value={loanDate} onChange={(e) => setLoanDate(e.target.value)} className="app-input w-full text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">إجمالي السُلفة</label>
                <input type="number" step="0.01" min="0.01" required value={loanTotal} onChange={(e) => setLoanTotal(e.target.value)} className="app-input w-full text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">القسط الشهري</label>
                <input type="number" step="0.01" min="0.01" required value={loanInstallment} onChange={(e) => setLoanInstallment(e.target.value)} className="app-input w-full text-xs" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">ملاحظات</label>
              <input type="text" value={loanNotes} onChange={(e) => setLoanNotes(e.target.value)} className="app-input w-full text-xs" />
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={loanRecordExpense} onChange={(e) => setLoanRecordExpense(e.target.checked)} />
              تسجيل مبلغ السُلفة كمصروف في سجل المصروفات
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setLoanModalOpen(false)} className="app-btn app-btn-ghost">إلغاء</button>
              <button type="submit" disabled={createLoan.isPending} className="app-btn app-btn-primary">
                {createLoan.isPending ? 'جاري الحفظ...' : 'حفظ السُلفة'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {adjModalOpen && (
        <Modal title="إضافة مكافأة / خصم / إضافي" onClose={() => setAdjModalOpen(false)}>
          <form onSubmit={handleAddAdj} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">الموظف</label>
                <select required value={adjEmpId} onChange={(e) => setAdjEmpId(e.target.value)} className="app-select w-full text-xs">
                  <option value="">اختر الموظف...</option>
                  {employees.filter((e) => e.is_active).map((e) => (
                    <option key={e.id} value={e.id}>{e.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">النوع</label>
                <select value={adjKind} onChange={(e) => setAdjKind(e.target.value as AdjustmentKind)} className="app-select w-full text-xs">
                  <option value="bonus">مكافأة</option>
                  <option value="deduction">خصم</option>
                  <option value="overtime">ساعات إضافية</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">التاريخ</label>
                <input type="date" required value={adjDate} onChange={(e) => setAdjDate(e.target.value)} className="app-input w-full text-xs" />
              </div>
              {adjKind === 'overtime' && (
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">عدد الساعات</label>
                  <input type="number" step="0.25" min="0.25" value={adjHours} onChange={(e) => handleHoursChange(e.target.value)} className="app-input w-full text-xs" />
                </div>
              )}
              <div className={adjKind === 'overtime' ? '' : 'sm:col-span-2'}>
                <label className="mb-1 block text-xs font-bold text-slate-700">المبلغ (ج.م)</label>
                <input type="number" step="0.01" min="0.01" required value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} className="app-input w-full text-xs" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">السبب / البيان</label>
              <input type="text" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} className="app-input w-full text-xs" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAdjModalOpen(false)} className="app-btn app-btn-ghost">إلغاء</button>
              <button type="submit" disabled={addAdjustment.isPending} className="app-btn app-btn-primary">
                {addAdjustment.isPending ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
