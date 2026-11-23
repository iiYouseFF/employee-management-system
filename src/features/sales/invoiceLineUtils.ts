import type { LineItem } from '@/features/sales/InvoiceLineEditor'

function makeKey() {
  return Math.random().toString(36).slice(2)
}

export function createEmptyInvoiceLine(): LineItem {
  return {
    _key: makeKey(),
    product_id: '',
    product_name: '',
    unit: '',
    unit_price: 0,
    qty: 1,
    line_total: 0,
  }
}

export function isMeaningfulInvoiceLine(line: LineItem): boolean {
  return Boolean(line.product_id) && Number(line.qty) > 0
}

export function isEmptyPlaceholderInvoiceLine(line: LineItem): boolean {
  return !line.product_id && Number(line.qty || 0) <= 1 && Number(line.unit_price || 0) === 0 && Number(line.line_total || 0) === 0
}
