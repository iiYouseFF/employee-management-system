import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { Database, Json } from '@/shared/types/supabase'

export type SupplierReturn = Database['public']['Tables']['supplier_returns']['Row']
export type SupplierReturnLine = Database['public']['Tables']['supplier_return_lines']['Row']

export interface SupplierReturnWithDetails extends SupplierReturn {
  suppliers?: { name: string } | null
  supplier_purchases?: { invoice_no: string | null } | null
}

export interface SupplierReturnHeaderInput {
  id?: string
  supplier_id: string
  purchase_id?: string | null
  return_date: string
  settlement_method: 'reduce_payable' | 'cash_refund'
  notes?: string | null
}

export interface SupplierReturnLineInput {
  product_id: string
  qty: number
  unit_cost: number
}

export interface SaveSupplierReturnPayload {
  returnHeader: SupplierReturnHeaderInput
  lines: SupplierReturnLineInput[]
}

export function useSupplierReturns(supplierId?: string) {
  return useQuery({
    queryKey: ['supplier_returns', supplierId],
    queryFn: async () => {
      let query = supabase
        .from('supplier_returns')
        .select('*, suppliers(name), supplier_purchases(invoice_no)')
        .order('return_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (supplierId) query = query.eq('supplier_id', supplierId)

      const { data, error } = await query
      if (error) throw error
      return (data || []) as unknown as SupplierReturnWithDetails[]
    },
  })
}

export function useSupplierReturnLines(returnId: string | null) {
  return useQuery({
    queryKey: ['supplier_return_lines', returnId],
    enabled: !!returnId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_return_lines')
        .select('*')
        .eq('return_id', returnId!)

      if (error) throw error
      return (data || []) as SupplierReturnLine[]
    },
  })
}

function invalidateSupplierReturnQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['supplier_returns'] })
  qc.invalidateQueries({ queryKey: ['supplier_return_lines'] })
  qc.invalidateQueries({ queryKey: ['supplier_purchases'] })
  qc.invalidateQueries({ queryKey: ['supplier_payments'] })
  qc.invalidateQueries({ queryKey: ['supplier_statement'] })
  qc.invalidateQueries({ queryKey: ['suppliers'] })
  qc.invalidateQueries({ queryKey: ['product_stock'] })
  qc.invalidateQueries({ queryKey: ['stock_movements'] })
  qc.invalidateQueries({ queryKey: ['stock_valuation'] })
  qc.invalidateQueries({ queryKey: ['stock_alerts_summary'] })
  qc.invalidateQueries({ queryKey: ['kpi_summary'] })
  qc.invalidateQueries({ queryKey: ['cashflow_series'] })
}

export function useSaveSupplierReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ returnHeader, lines }: SaveSupplierReturnPayload) => {
      const { data, error } = await supabase.rpc('save_supplier_return', {
        p_return: returnHeader as unknown as Json,
        p_lines: lines as unknown as Json,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => invalidateSupplierReturnQueries(qc),
  })
}

export function useDeleteSupplierReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_supplier_return', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => invalidateSupplierReturnQueries(qc),
  })
}
