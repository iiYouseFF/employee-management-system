import { supabase } from '@/shared/lib/supabase'
import type { ProductStockRow } from '@/features/inventory/useInventory'
import type { LowStockReportRow } from '@/features/reporting/pdfGenerators'

const isLowStockRow = (row: ProductStockRow) =>
  row.alert_status === 'low_stock' || row.alert_status === 'out_of_stock'

/** Map inventory rows into the shared PDF/share template shape. */
export function toLowStockReportRows(rows: ProductStockRow[]): LowStockReportRow[] {
  return rows.filter(isLowStockRow).map((row) => ({
    name_ar: row.name_ar,
    sku: row.sku,
    category: row.category,
    unit: row.unit,
    available_qty: Number(row.available_qty) || 0,
    min_stock_alert: Number(row.min_stock_alert) || undefined,
    alert_status: row.alert_status,
  }))
}

/** Fetch the current نواقص list for surfaces (drawer) that do not mount InventoryTab. */
export async function fetchLowStockRows(): Promise<LowStockReportRow[]> {
  const { data, error } = await supabase.rpc('product_stock_summary_v3')
  if (error) throw error
  return toLowStockReportRows((data ?? []) as ProductStockRow[])
}
