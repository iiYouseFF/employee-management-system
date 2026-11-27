import { useMemo, useState } from 'react'
import { formatNumber, getTodayISO } from '@/shared/lib/format'
import { MobileCard, MobileCardRow, MobileCardsGrid } from '@/shared/ui/MobileCards'
import type { AttendanceLogRow, AttendanceStatus, EmployeeRow } from './hr.types'
import { useAttendanceLogs, useEmployees, useUpsertAttendance, type UpsertAttendanceInput } from './useHr'

interface AttendanceSectionProps {
  showToast: (message: string) => void
}

interface DraftRow {
  status: AttendanceStatus
  check_in_time: string
  check_out_time: string
  overtime_hours: string
  late_minutes: string
  notes: string
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'حاضر',
  late: 'متأخر',
  absent: 'غائب',
  excused: 'إجازة',
}

function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function parseMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

function calcWorkedAndOvertime(
  checkIn: string,
  checkOut: string,
  shiftStart: string,
  shiftEnd: string
): { workedHours: number; overtimeHours: number; lateMinutes: number } {
  const inMin = parseMinutes(checkIn)
  const outMin = parseMinutes(checkOut)
  const sStart = parseMinutes(shiftStart) ?? 9 * 60
  const sEnd = parseMinutes(shiftEnd) ?? 17 * 60

  const lateMinutes = inMin !== null && inMin > sStart ? inMin - sStart : 0

  if (inMin === null || outMin === null || outMin <= inMin) {
    return { workedHours: 0, overtimeHours: 0, lateMinutes }
  }

  const workedMin = outMin - inMin
  const shiftMin = Math.max(60, sEnd - sStart)
  const overtimeMin = Math.max(0, workedMin - shiftMin)

  return {
    workedHours: Math.round((workedMin / 60) * 100) / 100,
    overtimeHours: Math.round((overtimeMin / 60) * 100) / 100,
    lateMinutes,
  }
}

export default function AttendanceSection({ showToast }: AttendanceSectionProps) {
  const [workDate, setWorkDate] = useState(() => getTodayISO())
  const { data: employees = [], isLoading: empLoading } = useEmployees()
  const { data: logs = [], isLoading: logsLoading, isError } = useAttendanceLogs(workDate)
  const upsertAttendance = useUpsertAttendance(workDate)

  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({})

  const activeEmployees = useMemo(() => employees.filter((e) => e.is_active), [employees])

  const logByEmp = useMemo(() => {
    const map = new Map<string, AttendanceLogRow>()
    for (const l of logs) map.set(l.employee_id, l)
    return map
  }, [logs])

  const getRow = (emp: EmployeeRow): DraftRow => {
    const draft = drafts[`${workDate}:${emp.id}`]
    if (draft) return draft
    const existing = logByEmp.get(emp.id)
    if (existing) {
      return {
        status: existing.status,
        check_in_time: existing.check_in_time ? existing.check_in_time.slice(0, 5) : '',
        check_out_time: existing.check_out_time ? existing.check_out_time.slice(0, 5) : '',
        overtime_hours: String(existing.overtime_hours ?? 0),
        late_minutes: String(existing.late_minutes ?? 0),
        notes: existing.notes || '',
      }
    }
    return {
      status: 'present',
      check_in_time: '',
      check_out_time: '',
      overtime_hours: '0',
      late_minutes: '0',
      notes: '',
    }
  }

  const updateRow = (emp: EmployeeRow, patch: Partial<DraftRow>) => {
    const key = `${workDate}:${emp.id}`
    const current = getRow(emp)
    const next = { ...current, ...patch }
    if (patch.check_in_time !== undefined || patch.check_out_time !== undefined) {
      const calc = calcWorkedAndOvertime(
        next.check_in_time,
        next.check_out_time,
        emp.shift_start,
        emp.shift_end
      )
      next.overtime_hours = String(calc.overtimeHours)
      next.late_minutes = String(calc.lateMinutes)
    }
    setDrafts((prev) => ({ ...prev, [key]: next }))
  }

  const toPayload = (emp: EmployeeRow, row: DraftRow): UpsertAttendanceInput => ({
    employee_id: emp.id,
    work_date: workDate,
    status: row.status,
    check_in_time: row.check_in_time ? `${row.check_in_time}:00` : null,
    check_out_time: row.check_out_time ? `${row.check_out_time}:00` : null,
    overtime_hours: Number(row.overtime_hours || 0),
    late_minutes: Number(row.late_minutes || 0),
    notes: row.notes || null,
  })

  const handleSaveOne = async (emp: EmployeeRow) => {
    try {
      await upsertAttendance.mutateAsync([toPayload(emp, getRow(emp))])
      showToast(`تم حفظ حضور ${emp.full_name}`)
    } catch {
      showToast('تعذر حفظ سجل الحضور')
    }
  }

  const handleMarkAllPresent = () => {
    const nextDrafts: Record<string, DraftRow> = { ...drafts }
    for (const emp of activeEmployees) {
      const current = getRow(emp)
      const checkIn = current.check_in_time || emp.shift_start.slice(0, 5)
      const checkOut = current.check_out_time || emp.shift_end.slice(0, 5)
      const calc = calcWorkedAndOvertime(checkIn, checkOut, emp.shift_start, emp.shift_end)
      nextDrafts[`${workDate}:${emp.id}`] = {
        ...current,
        status: 'present',
        check_in_time: checkIn,
        check_out_time: checkOut,
        overtime_hours: String(calc.overtimeHours),
        late_minutes: String(calc.lateMinutes),
      }
    }
    setDrafts(nextDrafts)
  }

  const handleSaveAll = async () => {
    try {
      const rows = activeEmployees.map((emp) => toPayload(emp, getRow(emp)))
      await upsertAttendance.mutateAsync(rows)
      showToast(`تم حفظ حضور ${rows.length} موظف`)
    } catch {
      showToast('تعذر حفظ سجلات الحضور')
    }
  }

  const isLoading = empLoading || logsLoading

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-2">
          <label htmlFor="att-work-date" className="text-xs font-extrabold text-slate-700">
            التاريخ:
          </label>
          <input
            id="att-work-date"
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            className="app-input w-auto py-1.5 text-xs font-bold"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleMarkAllPresent}
            disabled={!activeEmployees.length}
            className="app-btn app-btn-sm border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
          >
            تسجيل حضور للجميع
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAll()}
            disabled={!activeEmployees.length || upsertAttendance.isPending}
            className="app-btn app-btn-sm app-btn-primary"
          >
            {upsertAttendance.isPending ? 'جاري الحفظ...' : 'حفظ الكل'}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="py-10 text-center text-sm text-slate-500">جاري تحميل كشف الحضور...</div>
      )}

      {!isLoading && isError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          تعذر تحميل بيانات الحضور. تأكد من تطبيق الترحيل الخاص بشؤون الموظفين.
        </div>
      )}

      {!isLoading && !isError && activeEmployees.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          لا يوجد موظفون نشطون حالياً.
        </div>
      )}

      {!isLoading && !isError && activeEmployees.length > 0 && (
        <>
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
            <table className="app-table w-full text-xs">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>الحالة</th>
                  <th>وقت الحضور</th>
                  <th>وقت الانصراف</th>
                  <th>ساعات العمل / الإضافي</th>
                  <th>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {activeEmployees.map((emp) => {
                  const row = getRow(emp)
                  const calc = calcWorkedAndOvertime(
                    row.check_in_time,
                    row.check_out_time,
                    emp.shift_start,
                    emp.shift_end
                  )
                  const saved = logByEmp.has(emp.id)
                  return (
                    <tr key={emp.id}>
                      <td>
                        <div className="font-bold text-slate-900">{emp.full_name}</div>
                        <div className="text-[11px] text-slate-500">{emp.job_title}</div>
                      </td>
                      <td>
                        <select
                          value={row.status}
                          onChange={(e) => updateRow(emp, { status: e.target.value as AttendanceStatus })}
                          className="app-select py-1.5 text-xs"
                        >
                          {(Object.keys(STATUS_LABELS) as AttendanceStatus[]).map((k) => (
                            <option key={k} value={k}>
                              {STATUS_LABELS[k]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <input
                            type="time"
                            value={row.check_in_time}
                            onChange={(e) => updateRow(emp, { check_in_time: e.target.value })}
                            className="app-input w-28 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => updateRow(emp, { check_in_time: nowHHMM() })}
                            className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
                          >
                            الآن
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <input
                            type="time"
                            value={row.check_out_time}
                            onChange={(e) => updateRow(emp, { check_out_time: e.target.value })}
                            className="app-input w-28 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => updateRow(emp, { check_out_time: nowHHMM() })}
                            className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
                          >
                            الآن
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1.5 font-num tabular-nums">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                            {formatNumber(calc.workedHours)} س
                          </span>
                          {Number(row.overtime_hours) > 0 && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                              +{formatNumber(Number(row.overtime_hours))} إضافي
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => void handleSaveOne(emp)}
                          disabled={upsertAttendance.isPending}
                          className={`app-btn app-btn-sm ${
                            saved
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              : 'app-btn-primary'
                          }`}
                        >
                          {saved ? 'تحديث' : 'حفظ'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden">
            <MobileCardsGrid>
              {activeEmployees.map((emp) => {
                const row = getRow(emp)
                const calc = calcWorkedAndOvertime(
                  row.check_in_time,
                  row.check_out_time,
                  emp.shift_start,
                  emp.shift_end
                )
                return (
                  <MobileCard key={emp.id}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-extrabold text-slate-900 text-sm">{emp.full_name}</p>
                        <p className="text-xs text-slate-500">{emp.job_title}</p>
                      </div>
                      <select
                        value={row.status}
                        onChange={(e) => updateRow(emp, { status: e.target.value as AttendanceStatus })}
                        className="app-select w-auto py-1 text-xs"
                      >
                        {(Object.keys(STATUS_LABELS) as AttendanceStatus[]).map((k) => (
                          <option key={k} value={k}>
                            {STATUS_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <MobileCardRow
                      label="الحضور"
                      value={
                        <div className="flex items-center gap-1">
                          <input
                            type="time"
                            value={row.check_in_time}
                            onChange={(e) => updateRow(emp, { check_in_time: e.target.value })}
                            className="app-input w-28 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => updateRow(emp, { check_in_time: nowHHMM() })}
                            className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-bold"
                          >
                            الآن
                          </button>
                        </div>
                      }
                    />
                    <MobileCardRow
                      label="الانصراف"
                      value={
                        <div className="flex items-center gap-1">
                          <input
                            type="time"
                            value={row.check_out_time}
                            onChange={(e) => updateRow(emp, { check_out_time: e.target.value })}
                            className="app-input w-28 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => updateRow(emp, { check_out_time: nowHHMM() })}
                            className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-bold"
                          >
                            الآن
                          </button>
                        </div>
                      }
                    />
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className="text-xs font-bold text-slate-600 font-num tabular-nums">
                        العمل: {formatNumber(calc.workedHours)} س • إضافي: {formatNumber(Number(row.overtime_hours))} س
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleSaveOne(emp)}
                        className="app-btn app-btn-sm app-btn-primary"
                      >
                        حفظ
                      </button>
                    </div>
                  </MobileCard>
                )
              })}
            </MobileCardsGrid>
          </div>
        </>
      )}
    </div>
  )
}
