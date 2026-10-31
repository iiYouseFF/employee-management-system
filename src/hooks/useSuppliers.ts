import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/supabase'

export type Supplier = Database['public']['Tables']['suppliers']['Row']
export type SupplierInsert = Database['public']['Tables']['suppliers']['Insert']
export type SupplierUpdate = Database['public']['Tables']['suppliers']['Update']

export type SupplierPurchase = Database['public']['Tables']['supplier_purchases']['Row']
export type SupplierPurchaseInsert = Database['public']['Tables']['supplier_purchases']['Insert']

export type SupplierPayment = Database['public']['Tables']['supplier_payments']['Row']
export type SupplierPaymentInsert = Database['public']['Tables']['supplier_payments']['Insert']

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error
      return data as Supplier[]
    },
  })
}

export function useSupplierPurchases(supplierId?: string) {
  return useQuery({
    queryKey: ['supplier_purchases', supplierId],
    queryFn: async () => {
      let query = supabase
        .from('supplier_purchases')
        .select('*, suppliers(name)')
        .order('purchase_date', { ascending: false })

      if (supplierId) {
        query = query.eq('supplier_id', supplierId)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useSupplierPayments(supplierId?: string) {
  return useQuery({
    queryKey: ['supplier_payments', supplierId],
    queryFn: async () => {
      let query = supabase
        .from('supplier_payments')
        .select('*, suppliers(name)')
        .order('payment_date', { ascending: false })

      if (supplierId) {
        query = query.eq('supplier_id', supplierId)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useAddSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (supplier: Omit<SupplierInsert, 'owner_id'>) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Unauthenticated')

      const { data, error } = await supabase
        .from('suppliers')
        .insert({ ...supplier, owner_id: user.id })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
  })
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: SupplierUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('suppliers')
        .update(patch)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
  })
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('suppliers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
  })
}

export function useAddSupplierPurchase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (purchase: Omit<SupplierPurchaseInsert, 'owner_id' | 'created_by'>) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Unauthenticated')

      const { data, error } = await supabase
        .from('supplier_purchases')
        .insert({
          ...purchase,
          owner_id: user.id,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier_purchases'] })
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      queryClient.invalidateQueries({ queryKey: ['supplier_statement'] })
      queryClient.invalidateQueries({ queryKey: ['kpi_summary'] })
      queryClient.invalidateQueries({ queryKey: ['cashflow_series'] })
    },
  })
}

export function useAddSupplierPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payment: Omit<SupplierPaymentInsert, 'owner_id' | 'created_by'>) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Unauthenticated')

      const { data, error } = await supabase
        .from('supplier_payments')
        .insert({
          ...payment,
          owner_id: user.id,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier_payments'] })
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      queryClient.invalidateQueries({ queryKey: ['supplier_statement'] })
      queryClient.invalidateQueries({ queryKey: ['kpi_summary'] })
      queryClient.invalidateQueries({ queryKey: ['cashflow_series'] })
    },
  })
}
