import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProductStockRow {
  product_id: string
  name_ar: string
  name_en: string | null
  sku: string | null
  unit: string | null
  category: string | null
  price: number
  on_hand: number
  avg_cost: number
  stock_value: number
  is_active: boolean
}

export interface StockMovementRow {
  id: string
  product_id: string
  product_name: string
  movement_type: 'in' | 'out' | 'adjustment'
  qty: number
  unit_cost: number
  avg_cost_snapshot: number | null
  reference_type: string | null
  reference_id: string | null
  notes: string | null
  created_at: string
}

export interface InvoiceLine {
  product_id: string
  qty: number
  unit_price: number
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** On-hand quantity, average cost, and stock value per product. Manager only. */
export function useProductStock() {
  return useQuery({
    queryKey: ['product_stock'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('product_stock_summary')
      if (error) throw error
      return (data || []) as ProductStockRow[]
    },
  })
}

/** Full movement history, optionally filtered by product and date range. */
export function useStockMovements(params?: {
  productId?: string
  from?: string
  to?: string
}) {
  return useQuery({
    queryKey: ['stock_movements', params?.productId, params?.from, params?.to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('stock_movement_history', {
        p_product_id: params?.productId ?? null,
        p_from: params?.from ?? null,
        p_to: params?.to ?? null,
      })
      if (error) throw error
      return (data || []) as StockMovementRow[]
    },
  })
}

/** Stock valuation: on-hand × avg cost per product. Manager only. */
export function useStockValuation() {
  return useQuery({
    queryKey: ['stock_valuation'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('stock_valuation')
      if (error) throw error
      return data || []
    },
  })
}

/** Manual stock-in (receive goods). */
export function useReceiveStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      productId,
      qty,
      unitCost,
      notes,
      reference,
    }: {
      productId: string
      qty: number
      unitCost: number
      notes?: string
      reference?: string
    }) => {
      const { data, error } = await supabase.rpc('receive_stock', {
        p_product_id: productId,
        p_qty: qty,
        p_unit_cost: unitCost,
        p_notes: notes ?? null,
        p_reference: reference ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product_stock'] })
      qc.invalidateQueries({ queryKey: ['stock_movements'] })
      qc.invalidateQueries({ queryKey: ['stock_valuation'] })
    },
  })
}

/** Stock adjustment (positive = add, negative = remove). */
export function useAdjustStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      productId,
      qtyDelta,
      notes,
    }: {
      productId: string
      qtyDelta: number
      notes?: string
    }) => {
      const { data, error } = await supabase.rpc('adjust_stock', {
        p_product_id: productId,
        p_qty_delta: qtyDelta,
        p_notes: notes ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product_stock'] })
      qc.invalidateQueries({ queryKey: ['stock_movements'] })
      qc.invalidateQueries({ queryKey: ['stock_valuation'] })
    },
  })
}

/** Save cash invoice with lines (create or update). Replaces direct table insert. */
export function useSaveCashInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      invoice,
      lines,
    }: {
      invoice: Record<string, unknown>
      lines: InvoiceLine[]
    }) => {
      const { data, error } = await supabase.rpc('save_cash_invoice', {
        p_invoice: invoice as any,
        p_lines: lines as any,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash_invoices'] })
      qc.invalidateQueries({ queryKey: ['product_stock'] })
      qc.invalidateQueries({ queryKey: ['stock_movements'] })
      qc.invalidateQueries({ queryKey: ['kpi_summary'] })
    },
  })
}

/** Save credit invoice with lines (create or update). */
export function useSaveCreditInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      invoice,
      lines,
    }: {
      invoice: Record<string, unknown>
      lines: InvoiceLine[]
    }) => {
      const { data, error } = await supabase.rpc('save_credit_invoice', {
        p_invoice: invoice as any,
        p_lines: lines as any,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit_invoices'] })
      qc.invalidateQueries({ queryKey: ['product_stock'] })
      qc.invalidateQueries({ queryKey: ['stock_movements'] })
      qc.invalidateQueries({ queryKey: ['kpi_summary'] })
    },
  })
}

/** Delete cash invoice and reverse its stock movements. */
export function useDeleteCashInvoiceWithStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_cash_invoice', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash_invoices'] })
      qc.invalidateQueries({ queryKey: ['product_stock'] })
      qc.invalidateQueries({ queryKey: ['stock_movements'] })
    },
  })
}

/** Delete credit invoice and reverse its stock movements. */
export function useDeleteCreditInvoiceWithStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_credit_invoice', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit_invoices'] })
      qc.invalidateQueries({ queryKey: ['product_stock'] })
      qc.invalidateQueries({ queryKey: ['stock_movements'] })
    },
  })
}

/** Fetch invoice lines for a specific invoice (for displaying in edit form). */
export function useInvoiceLines(invoiceType: 'cash' | 'credit', invoiceId: string | null) {
  return useQuery({
    queryKey: ['invoice_lines', invoiceType, invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_lines')
        .select('*, products(name_ar, name_en, unit, price)')
        .eq('invoice_type', invoiceType)
        .eq('invoice_id', invoiceId!)
        .order('created_at')
      if (error) throw error
      return data || []
    },
  })
}
