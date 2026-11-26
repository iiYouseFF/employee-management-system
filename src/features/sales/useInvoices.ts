import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { getTenantId } from '@/shared/lib/tenant'


export function useCustomers(repFilter?: string) {
  return useQuery({
    queryKey: ['customers', repFilter],
    queryFn: async () => {
      let query = supabase
        .from('customers')
        .select('*')
        .order('name')

      if (repFilter && repFilter !== 'all') {
        query = query.eq('representative_id', repFilter)
      }

      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

export function useUpsertCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, phone, representative_id, representative_name }: { name: string, phone?: string, representative_id?: string | null, representative_name?: string | null }) => {
      const tenantId = await getTenantId()
      const { data, error } = await supabase
        .from('customers')
        .insert({
          name,
          phone: phone || null,
          representative_id: representative_id || null,
          representative_name: representative_name || null,
          owner_id: tenantId,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['unpaid-credit-invoices'] })
    },
  })
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name, phone, representative_id, representative_name }: { id: string, name: string, phone: string, representative_id?: string | null, representative_name?: string | null }) => {
      const trimmedPhone = String(phone || '').trim()
      if (!trimmedPhone) throw new Error('رقم هاتف العميل مطلوب')
      const { data, error } = await supabase
        .from('customers')
        .update({
          name,
          phone: trimmedPhone,
          representative_id: representative_id || null,
          representative_name: representative_name || null,
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['unpaid-credit-invoices'] })
    },
  })
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['unpaid-credit-invoices'] })
    },
  })
}

export function useCashInvoices(repFilter?: string) {
  return useQuery({
    queryKey: ['cash_invoices', repFilter],
    queryFn: async () => {
      let query = supabase
        .from('cash_invoices')
        .select('*, customers(name), reps(name)')
        .order('created_at', { ascending: false })
      
      if (repFilter && repFilter !== 'all') {
        query = query.eq('rep_id', repFilter)
      }
      
      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

export function useCreditInvoices(repFilter?: string) {
  return useQuery({
    queryKey: ['credit_invoices', repFilter],
    queryFn: async () => {
      let query = supabase
        .from('v_credit_invoices')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (repFilter && repFilter !== 'all') {
        query = query.eq('rep_id', repFilter)
      }
      
      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

export type UnpaidCreditInvoice = {
  invoice_id: string
  invoice_no: string
  invoice_date: string
  due_date: string
  days_diff: number
  is_overdue: boolean
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  rep_id: string | null
  rep_name: string | null
  total_amount: number
  paid_amount: number
  remaining_amount: number
  status: string
}

/** Unpaid / overdue credit invoices, RLS-scoped by the SECURITY INVOKER RPC. */
export function useUnpaidCreditInvoices() {
  return useQuery({
    queryKey: ['unpaid-credit-invoices'],
    queryFn: async (): Promise<UnpaidCreditInvoice[]> => {
      const { data, error } = await supabase.rpc('unpaid_credit_invoices_list')
      if (error) throw error
      return (data || []) as UnpaidCreditInvoice[]
    },
  })
}

export function usePayments(repFilter?: string) {
  return useQuery({
    queryKey: ['payments', repFilter],
    queryFn: async () => {
      let query = supabase
        .from('payments')
        .select('*, customers(name), reps(name), credit_invoices(invoice_no)')
        .order('created_at', { ascending: false })
      
      if (repFilter && repFilter !== 'all') {
        query = query.eq('rep_id', repFilter)
      }
      
      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

export function useAddPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payment: any) => {
      const tenantId = await getTenantId()
      const { data, error } = await supabase
        .from('payments')
        .insert({ ...payment, owner_id: tenantId })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['credit_invoices'] })
      queryClient.invalidateQueries({ queryKey: ['unpaid-credit-invoices'] })
    },
  })
}

export function useUpdatePayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { data, error } = await supabase
        .from('payments')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['credit_invoices'] })
      queryClient.invalidateQueries({ queryKey: ['unpaid-credit-invoices'] })
    },
  })
}

export function useDeletePayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['credit_invoices'] })
      queryClient.invalidateQueries({ queryKey: ['unpaid-credit-invoices'] })
    },
  })
}

export function useCustomerStatement(repFilter?: string) {
  return useQuery({
    queryKey: ['customer_statement', repFilter],
    queryFn: async () => {
      let query = supabase
        .from('v_customer_statement')
        .select('*')
      
      if (repFilter && repFilter !== 'all') {
        const { data: rep } = await supabase
          .from('reps')
          .select('name')
          .eq('id', repFilter)
          .maybeSingle()
        if (rep?.name) {
          query = query.like('reps_list', `%${rep.name}%`)
        }
      }
      
      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}
