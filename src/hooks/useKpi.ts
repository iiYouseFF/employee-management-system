import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface KpiSummaryData {
  income: number
  outcome: number
  net_profit: number
  cash_sales: number
  credit_sales: number
  receivables: number
  payables: number
  dso: number
  avg_collection_days: number
  collection_rate_30d: number
  cogs?: number
  gross_margin?: number
}

export interface ReceivablesAgingData {
  bucket: string
  amount: number
}

export interface CashflowData {
  tx_date: string
  income: number
  outcome: number
}

export function useKpiSummary(from?: string, to?: string) {
  return useQuery({
    queryKey: ['kpi_summary', from, to],
    queryFn: async () => {
      const params: { p_from?: string; p_to?: string } = {}
      if (from) params.p_from = from
      if (to) params.p_to = to

      const { data, error } = await supabase.rpc('kpi_summary', params)
      if (error) throw error
      return (data || {}) as unknown as KpiSummaryData
    },
  })
}

export function useReceivablesAging(asOf?: string) {
  return useQuery({
    queryKey: ['receivables_aging', asOf],
    queryFn: async () => {
      const params: { p_as_of?: string } = {}
      if (asOf) params.p_as_of = asOf

      const { data, error } = await supabase.rpc('receivables_aging', params)
      if (error) throw error
      return (data || []) as ReceivablesAgingData[]
    },
  })
}

export function useCashflowSeries(from?: string, to?: string) {
  return useQuery({
    queryKey: ['cashflow_series', from, to],
    queryFn: async () => {
      const params: { p_from?: string; p_to?: string } = {}
      if (from) params.p_from = from
      if (to) params.p_to = to

      const { data, error } = await supabase.rpc('cashflow_series', params)
      if (error) throw error
      return (data || []) as CashflowData[]
    },
  })
}
