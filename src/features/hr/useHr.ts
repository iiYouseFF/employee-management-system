import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { fromPiastres, toPiastres } from '@/shared/lib/format'
import type {
  AdjustmentKind,
  AttendanceLogRow,
  AttendanceStatus,
  EmployeeAdjustmentRow,
  EmployeeLoanRow,
  EmployeeRow,
  MonthlyPayrollRow,
} from './hr.types'

const EMPLOYEES_KEY = ['hr', 'employees'] as const
const ATTENDANCE_KEY = (date: string) => ['hr', 'attendance', date] as const
const LOANS_KEY = ['hr', 'loans'] as const
const ADJUSTMENTS_KEY = ['hr', 'adjustments'] as const
const PAYROLL_KEY = (year: number, month: number) => ['hr', 'payroll', year, month] as const

export function useEmployees() {
  return useQuery({
    queryKey: EMPLOYEES_KEY,
    queryFn: async (): Promise<EmployeeRow[]> => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('full_name', { ascending: true })
      if (error) throw error
      return (data ?? []) as EmployeeRow[]
    },
  })
}

export interface SaveEmployeeInput {
  id?: string
  full_name: string
  phone?: string | null
  job_title: string
  base_salary: number
  shift_start: string
  shift_end: string
  overtime_hourly_rate: number
  is_active: boolean
}

export function useSaveEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SaveEmployeeInput) => {
      const payload = {
        full_name: input.full_name.trim(),
        phone: input.phone?.trim() || null,
        job_title: input.job_title.trim() || 'موظف',
        base_salary: fromPiastres(toPiastres(input.base_salary)),
        shift_start: input.shift_start || '09:00:00',
        shift_end: input.shift_end || '17:00:00',
        overtime_hourly_rate: fromPiastres(toPiastres(input.overtime_hourly_rate)),
        is_active: input.is_active,
      }
      if (input.id) {
        const { error } = await supabase.from('employees').update(payload).eq('id', input.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('employees').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: EMPLOYEES_KEY })
    },
  })
}

export function useAttendanceLogs(workDate: string) {
  return useQuery({
    queryKey: ATTENDANCE_KEY(workDate),
    queryFn: async (): Promise<AttendanceLogRow[]> => {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('work_date', workDate)
      if (error) throw error
      return (data ?? []) as AttendanceLogRow[]
    },
  })
}

export interface UpsertAttendanceInput {
  employee_id: string
  work_date: string
  status: AttendanceStatus
  check_in_time: string | null
  check_out_time: string | null
  overtime_hours: number
  late_minutes: number
  notes?: string | null
}

export function useUpsertAttendance(workDate: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: UpsertAttendanceInput[]) => {
      if (!rows.length) return
      const payload = rows.map((r) => ({
        employee_id: r.employee_id,
        work_date: r.work_date,
        status: r.status,
        check_in_time: r.check_in_time || null,
        check_out_time: r.check_out_time || null,
        overtime_hours: Number(r.overtime_hours || 0),
        late_minutes: Math.max(0, Math.round(Number(r.late_minutes || 0))),
        notes: r.notes?.trim() || null,
      }))
      const { error } = await supabase
        .from('attendance_logs')
        .upsert(payload, { onConflict: 'employee_id,work_date' })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ATTENDANCE_KEY(workDate) })
      void qc.invalidateQueries({ queryKey: ['hr', 'payroll'] })
    },
  })
}

export function useEmployeeLoans() {
  return useQuery({
    queryKey: LOANS_KEY,
    queryFn: async (): Promise<EmployeeLoanRow[]> => {
      const { data, error } = await supabase
        .from('employee_loans')
        .select('*')
        .order('loan_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as EmployeeLoanRow[]
    },
  })
}

export interface CreateLoanInput {
  employee_id: string
  employee_name: string
  loan_date: string
  total_amount: number
  monthly_installment: number
  notes?: string | null
  record_expense?: boolean
}

export function useCreateLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateLoanInput) => {
      const total = fromPiastres(toPiastres(input.total_amount))
      const installment = fromPiastres(toPiastres(input.monthly_installment))
      const { error } = await supabase.from('employee_loans').insert({
        employee_id: input.employee_id,
        loan_date: input.loan_date,
        total_amount: total,
        monthly_installment: installment,
        remaining_amount: total,
        status: 'active',
        notes: input.notes?.trim() || null,
      })
      if (error) throw error

      if (input.record_expense) {
        const { error: expErr } = await supabase.from('expenses').insert({
          date: input.loan_date,
          category: 'سُلف موظفين',
          amount: total,
          description: `صرف سُلفة للموظف: ${input.employee_name}${input.notes ? ` — ${input.notes}` : ''}`,
        })
        if (expErr) throw expErr
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LOANS_KEY })
      void qc.invalidateQueries({ queryKey: ['hr', 'payroll'] })
      void qc.invalidateQueries({ queryKey: ['expenses'] })
    },
  })
}

export function useEmployeeAdjustments() {
  return useQuery({
    queryKey: ADJUSTMENTS_KEY,
    queryFn: async (): Promise<EmployeeAdjustmentRow[]> => {
      const { data, error } = await supabase
        .from('employee_adjustments')
        .select('*')
        .order('tx_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as EmployeeAdjustmentRow[]
    },
  })
}

export interface AddAdjustmentInput {
  employee_id: string
  tx_date: string
  kind: AdjustmentKind
  amount: number
  hours?: number | null
  reason?: string | null
}

export function useAddAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AddAdjustmentInput) => {
      const { error } = await supabase.from('employee_adjustments').insert({
        employee_id: input.employee_id,
        tx_date: input.tx_date,
        kind: input.kind,
        amount: fromPiastres(toPiastres(input.amount)),
        hours: input.kind === 'overtime' ? Number(input.hours || 0) : null,
        reason: input.reason?.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADJUSTMENTS_KEY })
      void qc.invalidateQueries({ queryKey: ['hr', 'payroll'] })
    },
  })
}

export function useMonthlyPayroll(year: number, month: number) {
  return useQuery({
    queryKey: PAYROLL_KEY(year, month),
    queryFn: async (): Promise<MonthlyPayrollRow[]> => {
      const { data, error } = await supabase.rpc('monthly_payroll_summary', {
        p_year: year,
        p_month: month,
      })
      if (error) throw error
      return (data ?? []) as MonthlyPayrollRow[]
    },
  })
}

export interface SettlePayrollInput {
  year: number
  month: number
  rows: MonthlyPayrollRow[]
  loans: EmployeeLoanRow[]
  txDate: string
}

export function useSettlePayroll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ year, month, rows, loans, txDate }: SettlePayrollInput) => {
      // 1. Deduct suggested loan installments from active loans & log loan_repayment
      for (const row of rows) {
        let toDeductPiastres = toPiastres(row.suggested_loan_deduction)
        if (toDeductPiastres <= 0) continue

        const empLoans = loans.filter(
          (l) => l.employee_id === row.employee_id && l.status === 'active' && toPiastres(l.remaining_amount) > 0
        )

        for (const loan of empLoans) {
          if (toDeductPiastres <= 0) break
          const remPiastres = toPiastres(loan.remaining_amount)
          const instPiastres = toPiastres(loan.monthly_installment)
          const payPiastres = Math.min(toDeductPiastres, remPiastres, instPiastres)
          if (payPiastres <= 0) continue

          const nextRemPiastres = remPiastres - payPiastres
          const { error: loanErr } = await supabase
            .from('employee_loans')
            .update({
              remaining_amount: fromPiastres(nextRemPiastres),
              status: nextRemPiastres <= 0 ? 'settled' : 'active',
            })
            .eq('id', loan.id)
          if (loanErr) throw loanErr

          const { error: adjErr } = await supabase.from('employee_adjustments').insert({
            employee_id: row.employee_id,
            tx_date: txDate,
            kind: 'loan_repayment',
            amount: fromPiastres(payPiastres),
            reason: `قسط سُلفة مسير رواتب ${month}/${year}`,
            loan_id: loan.id,
          })
          if (adjErr) throw adjErr

          toDeductPiastres -= payPiastres
        }
      }

      // 2. Record total net payroll disbursement in expenses
      const totalNetPiastres = rows.reduce((sum, r) => sum + Math.max(0, toPiastres(r.net_salary)), 0)
      if (totalNetPiastres > 0) {
        const { error: expErr } = await supabase.from('expenses').insert({
          date: txDate,
          category: 'رواتب وأجور',
          amount: fromPiastres(totalNetPiastres),
          description: `صرف رواتب شهر ${month}/${year} (${rows.length} موظف)`,
        })
        if (expErr) throw expErr
      }
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: LOANS_KEY })
      void qc.invalidateQueries({ queryKey: ADJUSTMENTS_KEY })
      void qc.invalidateQueries({ queryKey: PAYROLL_KEY(vars.year, vars.month) })
      void qc.invalidateQueries({ queryKey: ['expenses'] })
    },
  })
}
