import { useState } from 'react'
import PageHeader from '@/shared/ui/PageHeader'
import AttendanceSection from './AttendanceSection'
import LoansAdjustmentsSection from './LoansAdjustmentsSection'
import PayrollSection from './PayrollSection'
import EmployeesDirectorySection from './EmployeesDirectorySection'

interface HrPayrollTabProps {
  showToast: (message: string) => void
}

type HrSubTab = 'attendance' | 'loans_adj' | 'payroll' | 'directory'

const SUB_TABS: { id: HrSubTab; label: string }[] = [
  { id: 'attendance', label: 'الحضور والانصراف اليومي' },
  { id: 'loans_adj', label: 'السُلف والمكافآت والخصومات' },
  { id: 'payroll', label: 'مسير الرواتب الشهري' },
  { id: 'directory', label: 'بيانات الموظفين والرواتب' },
]

export default function HrPayrollTab({ showToast }: HrPayrollTabProps) {
  const [subTab, setSubTab] = useState<HrSubTab>('attendance')
  const [openNewSignal, setOpenNewSignal] = useState(0)

  const handleQuickAddEmployee = () => {
    setSubTab('directory')
    setOpenNewSignal((n) => n + 1)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="شؤون الموظفين والرواتب"
        subtitle="متابعة الحضور والانصراف اليومي، السُلف، المكافآت والخصومات، ومسير الرواتب الشهري"
        actions={
          <button
            type="button"
            onClick={handleQuickAddEmployee}
            className="app-btn app-btn-sm app-btn-primary shrink-0"
          >
            + إضافة موظف
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        {SUB_TABS.map((t) => {
          const active = subTab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`rounded-xl px-3.5 py-2 text-xs font-extrabold transition-colors ${
                active
                  ? 'bg-[#1a4971] text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {subTab === 'attendance' && <AttendanceSection showToast={showToast} />}
      {subTab === 'loans_adj' && <LoansAdjustmentsSection showToast={showToast} />}
      {subTab === 'payroll' && <PayrollSection showToast={showToast} />}
      {subTab === 'directory' && (
        <EmployeesDirectorySection showToast={showToast} openNewSignal={openNewSignal} />
      )}
    </div>
  )
}
