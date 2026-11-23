export interface RepFormValues {
  name: string
  email?: string | null
  phone?: string | null
  notes?: string | null
  monthly_target?: number | null
  is_active?: boolean
}

export interface RepDirectoryRow {
  rep_id: string
  name: string
  email: string | null
  phone: string | null
  is_active: boolean
  notes: string | null
  monthly_target: number
  is_linked: boolean
  created_at: string
  customers_count: number
  cash_count: number
  cash_total: number
  credit_count: number
  credit_total: number
  collected_total: number
  outstanding_total: number
  overdue_count: number
  month_sales: number
  month_collected: number
  last_activity: string | null
}
