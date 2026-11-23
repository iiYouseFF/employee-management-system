import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { Database } from '@/shared/types/supabase'

export type SalesReturn = Database['public']['Tables']['sales_returns']['Row']
export type SalesReturnLine = Database['public']['Tables']['sales_return_lines']['Row']

export interface SalesReturnWithDetails extends SalesReturn {
  customers?: { name: string; phone?: string | null } | null
  reps?: { name: string } | null
}

export interface ReturnLinePayload {
  product_id: string
  qty: number
  unit_price: number
  condition: 'salable' | 'damaged'
}

export interface SalesReturnHeaderPayload {
  id?: string
  customer_id: string
  rep_id?: string | null
  invoice_type?: 'cash' | 'credit' | 'direct' | null
  invoice_id?: string | null
  return_date: string
  refund_method: 'credit_balance' | 'cash_refund'
  notes?: string | null
}

export interface ProcessSalesReturnPayload {
  returnHeader: SalesReturnHeaderPayload
  lines: ReturnLinePayload[]
}

export function useSalesReturns(repFilter?: string) {
  return useQuery({
    queryKey: ['sales_returns', repFilter],
    queryFn: async () => {
      let query = supabase
        .from('sales_returns')
        .select('*')
        .order('return_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (repFilter && repFilter !== 'all') {
        query = query.eq('rep_id', repFilter)
      }

      const { data, error } = await query
      if (error) throw error
      return (data || []) as unknown as SalesReturnWithDetails[]
    },
  })
}

export function useSalesReturnLines(returnId: string | null) {
  return useQuery({
    queryKey: ['sales_return_lines', returnId],
    enabled: !!returnId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_return_lines')
        .select('*')
        .eq('return_id', returnId!)
      if (error) throw error
      return (data || []) as SalesReturnLine[]
    },
  })
}

function invalidateSalesReturnQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['sales_returns'] })
  qc.invalidateQueries({ queryKey: ['sales_return_lines'] })
  qc.invalidateQueries({ queryKey: ['product_stock'] })
  qc.invalidateQueries({ queryKey: ['stock_movements'] })
  qc.invalidateQueries({ queryKey: ['customer_statement'] })
  qc.invalidateQueries({ queryKey: ['kpi_summary'] })
  qc.invalidateQueries({ queryKey: ['stock_alerts_summary'] })
}

export function useProcessSalesReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ returnHeader, lines }: ProcessSalesReturnPayload) => {
      const { data, error } = await supabase.rpc('process_sales_return', {
        p_return: returnHeader as any,
        p_lines: lines as any,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => invalidateSalesReturnQueries(qc),
  })
}

export function useSaveSalesReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ returnHeader, lines }: ProcessSalesReturnPayload) => {
      const { data, error } = await supabase.rpc('save_sales_return', {
        p_return: returnHeader as any,
        p_lines: lines as any,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => invalidateSalesReturnQueries(qc),
  })
}

export function useDeleteSalesReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_sales_return', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => invalidateSalesReturnQueries(qc),
  })
}
