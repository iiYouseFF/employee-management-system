import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { friendlyError } from '@/shared/lib/errors'
import { getTodayISO } from '@/shared/lib/format'

export interface ProductConsumptionSummary {
  total_qty: number
  total_revenue: number
  invoice_count: number
  unique_customers: number
  avg_unit_price: number
}

export interface ProductCustomerBreakdownRow {
  customer_id: string | null
  customer_name: string
  customer_phone: string | null
  rep_name: string
  order_count: number
  total_qty: number
  total_revenue: number
  share_pct: number
  last_purchase_date: string
}

export interface ProductSalesHistoryRow {
  invoice_id: string
  invoice_no: string
  invoice_type: string
  tx_date: string
  customer_id: string | null
  customer_name: string
  rep_name: string
  qty: number
  unit_price: number
  line_total: number
}

const EMPTY_SUMMARY: ProductConsumptionSummary = {
  total_qty: 0,
  total_revenue: 0,
  invoice_count: 0,
  unique_customers: 0,
  avg_unit_price: 0,
}

const OPEN_START = '1900-01-01'

/** All three RPCs are SECURITY INVOKER, so RLS enforces tenant/rep scoping. */
export function useProductAnalytics(productId: string | null, from: string, to: string) {
  const enabled = Boolean(productId)
  const p_from = from || OPEN_START
  const p_to = to || getTodayISO()

  const summaryQuery = useQuery({
    queryKey: ['product_analytics', 'summary', productId, p_from, p_to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('product_consumption_summary', {
        p_product_id: productId as string,
        p_from,
        p_to,
      })
      if (error) throw new Error(friendlyError(error, 'تعذّر تحميل ملخص مبيعات الصنف.'))
      return (data?.[0] ?? EMPTY_SUMMARY) as ProductConsumptionSummary
    },
    enabled,
  })

  const breakdownQuery = useQuery({
    queryKey: ['product_analytics', 'breakdown', productId, p_from, p_to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('product_customer_breakdown', {
        p_product_id: productId as string,
        p_from,
        p_to,
      })
      if (error) throw new Error(friendlyError(error, 'تعذّر تحميل تحليل العملاء لهذا الصنف.'))
      return (data ?? []) as ProductCustomerBreakdownRow[]
    },
    enabled,
  })

  const historyQuery = useQuery({
    queryKey: ['product_analytics', 'history', productId, p_from, p_to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('product_sales_history', {
        p_product_id: productId as string,
        p_from,
        p_to,
      })
      if (error) throw new Error(friendlyError(error, 'تعذّر تحميل سجل فواتير الصنف.'))
      return (data ?? []) as ProductSalesHistoryRow[]
    },
    enabled,
  })

  const errors = [summaryQuery.error, breakdownQuery.error, historyQuery.error].filter(Boolean)
  const isError = errors.length > 0

  return {
    summary: summaryQuery.data ?? EMPTY_SUMMARY,
    breakdown: breakdownQuery.data ?? [],
    history: historyQuery.data ?? [],
    isLoading: enabled && !isError && (
      summaryQuery.isLoading || breakdownQuery.isLoading || historyQuery.isLoading
    ),
    isError,
    error: isError
      ? errors.map((err) => friendlyError(err, 'تعذّر تحميل بيانات تحليل الصنف.')).join(' ')
      : '',
    refetch: () => Promise.all([
      summaryQuery.refetch(),
      breakdownQuery.refetch(),
      historyQuery.refetch(),
    ]),
  }
}
