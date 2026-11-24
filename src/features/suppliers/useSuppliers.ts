import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { getTenantId } from '@/shared/lib/tenant'
import type { Database, Json } from '@/shared/types/supabase'

export type Supplier = Database['public']['Tables']['suppliers']['Row']
export type SupplierInsert = Database['public']['Tables']['suppliers']['Insert']
export type SupplierUpdate = Database['public']['Tables']['suppliers']['Update']

export type SupplierPurchase = Database['public']['Tables']['supplier_purchases']['Row']
export type SupplierPurchaseLine = Database['public']['Tables']['supplier_purchase_lines']['Row']

export interface SupplierPurchaseLineInput {
  product_id: string
  qty: number
  unit_cost: number
  expiry_date?: string | null
  batch_number?: string | null
}

export interface SupplierPurchaseInput {
  id?: string
  supplier_id: string
  purchase_date: string
  invoice_no?: string | null
  payment_type: string
  notes?: string | null
}

export interface SupplierPurchaseLineWithProduct extends SupplierPurchaseLine {
  products: { name_ar: string; sku: string | null; unit: string | null } | null
}

export type SupplierPayment = Database['public']['Tables']['supplier_payments']['Row']
export type SupplierPaymentInsert = Database['public']['Tables']['supplier_payments']['Insert']
export type SupplierPaymentUpdate = Database['public']['Tables']['supplier_payments']['Update']

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
      const tenantId = await getTenantId()

      const { data, error } = await supabase
        .from('suppliers')
        .insert({ ...supplier, owner_id: tenantId })
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

export function useSupplierPurchaseLines(purchaseId: string | null) {
  return useQuery({
    queryKey: ['supplier_purchase_lines', purchaseId],
    enabled: !!purchaseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_purchase_lines')
        .select('*, products(name_ar, sku, unit)')
        .eq('purchase_id', purchaseId!)
        .order('created_at')

      if (error) throw error
      return data as SupplierPurchaseLineWithProduct[]
    },
  })
}

function invalidatePurchaseQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['supplier_purchases'] })
  queryClient.invalidateQueries({ queryKey: ['supplier_purchase_lines'] })
  queryClient.invalidateQueries({ queryKey: ['suppliers'] })
  queryClient.invalidateQueries({ queryKey: ['supplier_statement'] })
  queryClient.invalidateQueries({ queryKey: ['supplier-purchase-details'] })
  queryClient.invalidateQueries({ queryKey: ['product_stock'] })
  queryClient.invalidateQueries({ queryKey: ['stock_movements'] })
  queryClient.invalidateQueries({ queryKey: ['stock_valuation'] })
  queryClient.invalidateQueries({ queryKey: ['stock_alerts_summary'] })
  queryClient.invalidateQueries({ queryKey: ['kpi_summary'] })
  queryClient.invalidateQueries({ queryKey: ['cashflow_series'] })
}

export function useSaveSupplierPurchase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      purchase,
      lines,
    }: {
      purchase: SupplierPurchaseInput
      lines: SupplierPurchaseLineInput[]
    }) => {
      const { data, error } = await supabase.rpc('save_supplier_purchase', {
        p_purchase: purchase as unknown as Json,
        p_lines: lines as unknown as Json,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => invalidatePurchaseQueries(queryClient),
  })
}

export function useDeleteSupplierPurchase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_supplier_purchase', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => invalidatePurchaseQueries(queryClient),
  })
}

export function useAddSupplierPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payment: Omit<SupplierPaymentInsert, 'owner_id' | 'created_by'>) => {
      const tenantId = await getTenantId()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Unauthenticated')

      const { data, error } = await supabase
        .from('supplier_payments')
        .insert({
          ...payment,
          owner_id: tenantId,
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
      queryClient.invalidateQueries({ queryKey: ['supplier-payment-details'] })
      queryClient.invalidateQueries({ queryKey: ['kpi_summary'] })
      queryClient.invalidateQueries({ queryKey: ['cashflow_series'] })
    },
  })
}

export function useUpdateSupplierPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: SupplierPaymentUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('supplier_payments')
        .update(patch)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier_payments'] })
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      queryClient.invalidateQueries({ queryKey: ['supplier_statement'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-payment-details'] })
      queryClient.invalidateQueries({ queryKey: ['kpi_summary'] })
      queryClient.invalidateQueries({ queryKey: ['cashflow_series'] })
    },
  })
}

export function useDeleteSupplierPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('supplier_payments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier_payments'] })
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      queryClient.invalidateQueries({ queryKey: ['supplier_statement'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-payment-details'] })
      queryClient.invalidateQueries({ queryKey: ['kpi_summary'] })
      queryClient.invalidateQueries({ queryKey: ['cashflow_series'] })
    },
  })
}
