import type { InvoicePdfInput } from '@/features/reporting/pdfGenerators'
import type { InvoiceDetails } from '@/features/sales/useInvoices'

/** One mapping from full invoice details to the PDF document used by every print path. */
export function buildInvoicePdfInput(
  details: InvoiceDetails,
  companyName: string,
  dir: 'rtl' | 'ltr'
): InvoicePdfInput {
  return {
    invoiceType: details.invoiceType,
    invoice_no: details.invoice_no,
    date: details.date,
    due_date: details.due_date,
    customer_name: details.customer_name,
    customer_phone: details.customer_phone,
    rep_name: details.rep_name,
    amount: details.amount,
    down_payment: details.down_payment,
    recorded_payments: details.recorded_payments,
    pooled_payments: details.pooled_payments,
    total_paid: details.total_paid,
    remaining: details.remaining,
    notes: details.notes,
    item: details.item,
    lines: details.lines,
    payments: details.payments,
    companyName,
    dir,
  }
}
