import { buildInvoicePdfHtml } from '@/features/reporting/pdfGenerators'
import { printHtml, PRINT_PAGE_BREAK_CSS } from '@/shared/lib/pdfShare'
import { buildInvoicePdfInput } from '@/features/sales/invoicePdfInput'
import { fetchInvoiceDetails, type InvoiceDetails, type InvoiceType } from '@/features/sales/useInvoices'

export interface BulkInvoiceRef {
  id: string
  type: InvoiceType
}

export interface BulkInvoicePrintResult {
  printed: boolean
  loaded: number
  failed: number
}

/**
 * Loads the full details of every selected invoice (lines, payments and totals)
 * and prints each one as a separate page using the same document as the
 * single-invoice print button. Unreadable invoices are skipped and counted.
 */
export async function printInvoicesBatch({
  invoices,
  companyName,
  dir,
  title = 'الفواتير المحددة',
}: {
  invoices: BulkInvoiceRef[]
  companyName: string
  dir: 'rtl' | 'ltr'
  title?: string
}): Promise<BulkInvoicePrintResult> {
  const loaded = await Promise.all(invoices.map(async ({ id, type }) => {
    try {
      return await fetchInvoiceDetails(id, type)
    } catch {
      return null
    }
  }))

  const documents = loaded.filter((details): details is InvoiceDetails => Boolean(details))
  const failed = invoices.length - documents.length
  if (!documents.length) return { printed: false, loaded: 0, failed }

  const html = `${documents
    .map((details) => `<section class="pdf-print-page">${buildInvoicePdfHtml(buildInvoicePdfInput(details, companyName, dir))}</section>`)
    .join('')}<style>${PRINT_PAGE_BREAK_CSS}</style>`

  const printed = await printHtml(html, title, dir)
  return { printed, loaded: documents.length, failed }
}
