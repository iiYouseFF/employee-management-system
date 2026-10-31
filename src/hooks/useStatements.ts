import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface StatementRow {
  row_no: number
  tx_date: string
  tx_type: string
  ref: string | null
  description: string
  debit: number | null
  credit: number | null
  balance: number
}

export function useCustomerStatement(
  customerId: string | undefined,
  from?: string,
  to?: string
) {
  return useQuery({
    queryKey: ['customer_statement', customerId, from, to],
    enabled: Boolean(customerId),
    queryFn: async () => {
      if (!customerId) return []

      const params: { p_customer_id: string; p_from?: string; p_to?: string } = {
        p_customer_id: customerId,
      }
      if (from) params.p_from = from
      if (to) params.p_to = to

      const { data, error } = await supabase.rpc('customer_statement', params)
      if (error) throw error
      return (data || []) as StatementRow[]
    },
  })
}

export function useSupplierStatement(
  supplierId: string | undefined,
  from?: string,
  to?: string
) {
  return useQuery({
    queryKey: ['supplier_statement', supplierId, from, to],
    enabled: Boolean(supplierId),
    queryFn: async () => {
      if (!supplierId) return []

      const params: { p_supplier_id: string; p_from?: string; p_to?: string } = {
        p_supplier_id: supplierId,
      }
      if (from) params.p_from = from
      if (to) params.p_to = to

      const { data, error } = await supabase.rpc('supplier_statement', params)
      if (error) throw error
      return (data || []) as StatementRow[]
    },
  })
}
