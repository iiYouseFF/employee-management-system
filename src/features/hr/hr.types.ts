export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'
export type LoanStatus = 'active' | 'settled'
export type AdjustmentKind = 'bonus' | 'deduction' | 'overtime' | 'loan_repayment'

export interface EmployeeRow {
  id: string
  owner_id: string
  rep_id: string | null
  full_name: string
  phone: string | null
  job_title: string
  base_salary: number
  shift_start: string
  shift_end: string
  overtime_hourly_rate: number
  is_active: boolean
  created_at: string
}

export interface AttendanceLogRow {
  id: string
  owner_id: string
  employee_id: string
  work_date: string
  status: AttendanceStatus
  check_in_time: string | null
  check_out_time: string | null
  overtime_hours: number
  late_minutes: number
  notes: string | null
  created_at: string
}

export interface EmployeeLoanRow {
  id: string
  owner_id: string
  employee_id: string
  loan_date: string
  total_amount: number
  monthly_installment: number
  remaining_amount: number
  status: LoanStatus
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface EmployeeAdjustmentRow {
  id: string
  owner_id: string
  employee_id: string
  tx_date: string
  kind: AdjustmentKind
  amount: number
  hours: number | null
  reason: string | null
  loan_id: string | null
  created_by: string | null
  created_at: string
}

export interface MonthlyPayrollRow {
  employee_id: string
  full_name: string
  job_title: string
  phone: string | null
  present_days: number
  absent_days: number
  late_days: number
  total_overtime_hours: number
  total_late_minutes: number
  base_salary: number
  overtime_total: number
  bonuses_total: number
  deductions_total: number
  active_loan_balance: number
  suggested_loan_deduction: number
  net_salary: number
}
