import { useMemo, useState } from 'react'
import { MoneyText } from '@/shared/ui/MoneyText'
import WhatsAppShareButton from '@/shared/ui/WhatsAppShareButton'
import { formatNumber, getTodayISO, toPiastres, fromPiastres } from '@/shared/lib/format'
import { useSettings } from '@/features/settings/useSettings'
import { printSalarySlip, shareSalarySlipWhatsApp } from '@/features/reporting/pdfGenerators'
import { printPayrollRegister } from '@/features/reporting/printableDocuments'
import { useAuth } from '@/features/auth/useAuth'
import type { MonthlyPayrollRow } from './hr.types'
import { useEmployeeLoans, useMonthlyPayroll, useSettlePayroll } from './useHr'

interface PayrollSectionProps {
  showToast: (message: string) => void
}

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

export default function PayrollSection({ showToast }: PayrollSectionProps) {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)
  const [sharingId, setSharingId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: rows = [], isLoading, isError, refetch } = useMonthlyPayroll(year, month)
  const { data: loans = [] } = useEmployeeLoans()
  const { data: settings } = useSettings()
  const { can } = useAuth()
  const canPrint = can('export_print')
  const settlePayroll = useSettlePayroll()

  const companyName = settings?.title || 'المؤسسة المصرية لتوزيع المواد الغذائية'

  const totalNet = useMemo(
    () => fromPiastres(rows.reduce((s, r) => s + Math.max(0, toPiastres(r.net_salary)), 0)),
    [rows]
  )

  const handlePrintSlip = async (row: MonthlyPayrollRow) => {
    const printed = await printSalarySlip({
      companyName,
      year,
      month,
      employeeName: row.full_name,
      jobTitle: row.job_title,
      phone: row.phone,
      presentDays: row.present_days,
      absentDays: row.absent_days,
      lateDays: row.late_days,
      totalOvertimeHours: row.total_overtime_hours,
      baseSalary: row.base_salary,
      overtimeTotal: row.overtime_total,
      bonusesTotal: row.bonuses_total,
      deductionsTotal: row.deductions_total,
      suggestedLoanDeduction: row.suggested_loan_deduction,
      activeLoanBalance: row.active_loan_balance,
      netSalary: row.net_salary,
    })
    if (!printed) showToast('يرجى السماح بالنوافذ المنبثقة للطباعة')
  }

  const handleShareSlip = async (row: MonthlyPayrollRow) => {
    setSharingId(row.employee_id)
    try {
      const res = await shareSalarySlipWhatsApp({
        companyName,
        year,
        month,
        employeeName: row.full_name,
        jobTitle: row.job_title,
        phone: row.phone,
        presentDays: row.present_days,
        absentDays: row.absent_days,
        lateDays: row.late_days,
        totalOvertimeHours: row.total_overtime_hours,
        baseSalary: row.base_salary,
        overtimeTotal: row.overtime_total,
        bonusesTotal: row.bonuses_total,
        deductionsTotal: row.deductions_total,
        suggestedLoanDeduction: row.suggested_loan_deduction,
        activeLoanBalance: row.active_loan_balance,
        netSalary: row.net_salary,
      })
      if (!res.sharedViaNative) showToast('تم تنزيل قسيمة الراتب — أرفقها في واتساب')
    } catch {
      showToast('تعذر تجهيز قسيمة الراتب للمشاركة')
    } finally {
      setSharingId(null)
    }
  }

  const handlePrintRegister = () => {
    void printPayrollRegister({
      companyName,
      year,
      month,
      rows: rows.map((row) => ({
        employeeName: row.full_name,
        jobTitle: row.job_title,
        presentDays: Number(row.present_days || 0),
        absentDays: Number(row.absent_days || 0),
        lateDays: Number(row.late_days || 0),
        overtimeHours: Number(row.total_overtime_hours || 0),
        baseSalary: Number(row.base_salary || 0),
        overtimeTotal: Number(row.overtime_total || 0),
        bonusesTotal: Number(row.bonuses_total || 0),
        deductionsTotal: Number(row.deductions_total || 0),
        loanDeduction: Number(row.suggested_loan_deduction || 0),
        netSalary: Number(row.net_salary || 0),
      })),
    }).then((printed) => {
      if (!printed) showToast('يرجى السماح بالنوافذ المنبثقة للطباعة')
    })
  }

  const handleSettle = async () => {
    try {
      await settlePayroll.mutateAsync({
        year,
        month,
        rows,
        loans,
        txDate: getTodayISO(),
      })
      setConfirmOpen(false)
      showToast(`تم اعتماد وصرف رواتب شهر ${month}/${year} وتسجيلها في المصروفات`)
    } catch {
      showToast('تعذر اعتماد مسير الرواتب')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="app-select w-auto py-1.5 text-xs font-bold"
          >
            {ARABIC_MONTHS.map((label, idx) => (
              <option key={idx + 1} value={idx + 1}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={2020}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="app-input w-24 py-1.5 text-xs font-bold font-num"
          />
          <button type="button" onClick={() => void refetch()} className="app-btn app-btn-sm border border-slate-200 bg-white">
            تحديث
          </button>
          {canPrint && (
            <button
              type="button"
              onClick={handlePrintRegister}
              disabled={!rows.length}
              className="app-btn app-btn-sm border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              طباعة المسير
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs font-bold text-slate-700">
            إجمالي المسير: <MoneyText amount={totalNet} className="text-sm font-extrabold text-emerald-700" />
          </div>
          <button
            type="button"
            disabled={!rows.length || settlePayroll.isPending}
            onClick={() => setConfirmOpen(true)}
            className="app-btn app-btn-sm app-btn-primary"
          >
            اعتماد وصرف الرواتب
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-bold text-amber-900">
            سيتم خصم أقساط السُلف المستحقة وتسجيل إجمالي الرواتب (<MoneyText amount={totalNet} />) كمصروف "رواتب وأجور". هل تريد المتابعة؟
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setConfirmOpen(false)} className="app-btn app-btn-sm app-btn-ghost">إلغاء</button>
            <button
              type="button"
              onClick={() => void handleSettle()}
              disabled={settlePayroll.isPending}
              className="app-btn app-btn-sm bg-amber-600 text-white hover:bg-amber-700"
            >
              {settlePayroll.isPending ? 'جاري الاعتماد...' : 'تأكيد الصرف'}
            </button>
          </div>
        </div>
      )}

      {isLoading && <div className="py-10 text-center text-sm text-slate-500">جاري حساب مسير الرواتب...</div>}
      {isError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
          تعذر تحميل مسير الرواتب. تأكد من تطبيق دالة `monthly_payroll_summary`.
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-xs text-slate-500">
          لا توجد بيانات رواتب لهذا الشهر.
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="app-table w-full text-xs">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>الحضور / الغياب</th>
                <th>الراتب الأساسي</th>
                <th>الإضافي</th>
                <th>المكافآت</th>
                <th>الخصومات</th>
                <th>قسط السُلفة</th>
                <th>صافي الراتب</th>
                <th>قسيمة الراتب</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.employee_id}>
                  <td>
                    <div className="font-bold text-slate-900">{row.full_name}</div>
                    <div className="text-[11px] text-slate-500">{row.job_title}</div>
                  </td>
                  <td className="font-num tabular-nums">
                    <span className="text-emerald-700 font-bold">{formatNumber(row.present_days)}</span>
                    {' / '}
                    <span className="text-rose-700 font-bold">{formatNumber(row.absent_days)}</span>
                  </td>
                  <td><MoneyText amount={row.base_salary} /></td>
                  <td className="text-sky-700"><MoneyText amount={row.overtime_total} /></td>
                  <td className="text-emerald-700"><MoneyText amount={row.bonuses_total} /></td>
                  <td className="text-rose-700"><MoneyText amount={row.deductions_total} /></td>
                  <td className="text-amber-700"><MoneyText amount={row.suggested_loan_deduction} /></td>
                  <td className="font-extrabold text-slate-900">
                    <MoneyText amount={row.net_salary} />
                  </td>
                  <td>
                    {canPrint && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handlePrintSlip(row)}
                          className="app-btn app-btn-sm border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        >
                          طباعة
                        </button>
                        <WhatsAppShareButton
                          loading={sharingId === row.employee_id}
                          onClick={() => void handleShareSlip(row)}
                          label="واتساب"
                        />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
