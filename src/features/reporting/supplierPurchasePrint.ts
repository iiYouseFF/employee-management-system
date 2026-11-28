import { formatMoney, formatNumber } from '@/shared/lib/format'
import { printHtml, PRINT_PAGE_BREAK_CSS } from '@/shared/lib/pdfShare'
import { buildUnifiedReportTemplate } from '@/features/reporting/pdfGenerators'
import {
  fetchSupplierPurchaseLines,
  type SupplierPurchaseLineWithProduct,
} from '@/features/suppliers/useSuppliers'

type Direction = 'rtl' | 'ltr'

function esc(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtDate(value: string | null | undefined, dir: Direction): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(dir === 'ltr' ? 'en-US' : 'ar-EG')
}

export interface SupplierPurchasePrintInput {
  companyName: string
  supplierName: string
  purchaseDate: string
  invoiceNo?: string | null
  paymentType: string
  notes?: string | null
  total: number
  lines: SupplierPurchaseLineWithProduct[]
  dir?: Direction
}

/** Full purchase document: header plus every item line, batch and expiry date. */
export function buildSupplierPurchaseHtml(input: SupplierPurchasePrintInput): string {
  const dir = input.dir ?? 'rtl'
  const rowsHtml = input.lines.length
    ? input.lines
        .map((line, index) => `
          <tr>
            <td class="num">${esc(index + 1)}</td>
            <td>${esc(line.products?.name_ar || line.product_id)}</td>
            <td dir="ltr">${esc(line.products?.sku || '-')}</td>
            <td>${esc(line.batch_number || '-')}</td>
            <td>${esc(fmtDate(line.expiry_date, dir))}</td>
            <td class="num">${esc(formatNumber(line.qty))}</td>
            <td class="num">${esc(formatMoney(line.unit_cost))}</td>
            <td class="num">${esc(formatMoney(line.line_total ?? Number(line.qty) * Number(line.unit_cost)))}</td>
          </tr>`)
        .join('')
    : '<tr><td colspan="8">لا توجد أصناف مسجلة</td></tr>'

  const bodyHtml = `
    <section class="pdf-section">
      <h3 class="pdf-section-title">أصناف الفاتورة</h3>
      <div class="pdf-table-wrap">
        <table class="pdf-table">
          <thead>
            <tr>
              <th class="num" style="width:28px;">#</th>
              <th>الصنف</th>
              <th style="width:70px;">الكود</th>
              <th style="width:64px;">التشغيلة</th>
              <th style="width:70px;">الانتهاء</th>
              <th class="num" style="width:48px;">الكمية</th>
              <th class="num" style="width:76px;">سعر الوحدة</th>
              <th class="num" style="width:82px;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot>
            <tr class="row-total">
              <td colspan="7">الإجمالي الكلي</td>
              <td class="num">${esc(formatMoney(input.total))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>`

  return buildUnifiedReportTemplate({
    companyName: input.companyName,
    docBadge: 'فاتورة مشتريات',
    meta: [
      { label: 'رقم الفاتورة', value: input.invoiceNo || '-' },
      { label: 'التاريخ', value: fmtDate(input.purchaseDate, dir) },
      { label: 'النوع', value: input.paymentType === 'cash' ? 'نقدي' : 'آجل' },
    ],
    entityTitle: `المورد: ${input.supplierName}`,
    entitySubtitle: input.notes || undefined,
    bodyHtml,
    footerStamp: 'فاتورة مشتريات صادرة من النظام',
    dir,
  })
}

export async function printSupplierPurchase(input: SupplierPurchasePrintInput): Promise<boolean> {
  return printHtml(
    buildSupplierPurchaseHtml(input),
    `فاتورة مشتريات - ${input.supplierName}`,
    input.dir ?? 'rtl'
  )
}

export interface SupplierPurchaseRef {
  id: string
  supplierName: string
  purchaseDate: string
  invoiceNo?: string | null
  paymentType: string
  notes?: string | null
  total: number
}

export interface SupplierPurchasePrintResult {
  printed: boolean
  loaded: number
  failed: number
}

/** Prints each checked purchase as a full document on its own sheet in one job. */
export async function printSupplierPurchasesBatch({
  purchases,
  companyName,
  dir,
  title = 'فواتير المشتريات المحددة',
}: {
  purchases: SupplierPurchaseRef[]
  companyName: string
  dir: Direction
  title?: string
}): Promise<SupplierPurchasePrintResult> {
  const loaded = await Promise.all(purchases.map(async (purchase) => {
    try {
      return { ...purchase, lines: await fetchSupplierPurchaseLines(purchase.id) }
    } catch {
      return null
    }
  }))

  const documents = loaded.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  const failed = purchases.length - documents.length
  if (!documents.length) return { printed: false, loaded: 0, failed }

  const html = `${documents
    .map((entry) => `<section class="pdf-print-page">${buildSupplierPurchaseHtml({ ...entry, companyName, dir })}</section>`)
    .join('')}<style>${PRINT_PAGE_BREAK_CSS}</style>`

  const printed = await printHtml(html, title, dir)
  return { printed, loaded: documents.length, failed }
}
