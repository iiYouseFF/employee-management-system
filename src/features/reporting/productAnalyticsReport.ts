import { buildUnifiedReportTemplate } from '@/features/reporting/pdfGenerators'
import { generatePdfFromHtml, sharePdfBlobViaWhatsApp } from '@/shared/lib/pdfShare'
import {
  formatLocalDate,
  formatLocalNumber,
  t,
  type UiLang,
} from '@/shared/lib/bilingual'
import type {
  ProductConsumptionSummary,
  ProductCustomerBreakdownRow,
  ProductSalesHistoryRow,
} from '@/shared/hooks/useProductAnalytics'

export interface ProductAnalyticsReportProduct {
  name_ar: string
  name_en?: string | null
  sku?: string | null
  unit?: string | null
  price: number | string
}

export interface ProductAnalyticsReportInput {
  product: ProductAnalyticsReportProduct
  from: string
  to: string
  summary: ProductConsumptionSummary
  breakdown: ProductCustomerBreakdownRow[]
  history: ProductSalesHistoryRow[]
  companyName: string
  lang: UiLang
}

function esc(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const MAX_HISTORY_ROWS = 100

/** Compact A5 overrides for the wide eight-column analytics tables. */
const ANALYTICS_A5_CSS = `
  .analytics-table { table-layout: fixed; }
  .analytics-table th, .analytics-table td { padding: 4px 4px; font-size: 10.5px; white-space: normal; overflow-wrap: anywhere; }
  .analytics-table .num { font-size: 10.5px; white-space: nowrap; }
  .analytics-table td[dir="ltr"] { font-size: 10px; }
  .analytics-customer th:nth-child(1) { width: 17%; }
  .analytics-customer th:nth-child(2) { width: 12%; }
  .analytics-customer th:nth-child(3) { width: 12%; }
  .analytics-customer th:nth-child(4) { width: 9%; }
  .analytics-customer th:nth-child(5) { width: 9%; }
  .analytics-customer th:nth-child(6) { width: 9%; }
  .analytics-customer th:nth-child(7) { width: 17%; }
  .analytics-customer th:nth-child(8) { width: 15%; }
  .analytics-history th:nth-child(1) { width: 13%; }
  .analytics-history th:nth-child(2) { width: 12%; }
  .analytics-history th:nth-child(3) { width: 10%; }
  .analytics-history th:nth-child(4) { width: 18%; }
  .analytics-history th:nth-child(5) { width: 14%; }
  .analytics-history th:nth-child(6) { width: 9%; }
  .analytics-history th:nth-child(7) { width: 12%; }
  .analytics-history th:nth-child(8) { width: 12%; }
`

/** Unified A5 template used for the WhatsApp PDF export. */
export function buildProductConsumptionReportHtml(input: ProductAnalyticsReportInput): string {
  const { lang, product, from, to, summary, breakdown, history } = input
  const num = (value: number | string | null | undefined, digits = 2) => esc(formatLocalNumber(value, lang, digits))
  const date = (value: string | null | undefined) => esc(formatLocalDate(value, lang))
  const dir: 'rtl' | 'ltr' = lang === 'ar' ? 'rtl' : 'ltr'

  const productLabel = lang === 'ar'
    ? (product.name_ar || product.name_en || '—')
    : (product.name_en || product.name_ar || '—')

  const kpiRows = [
    [t(lang, 'إجمالي الكمية المباعة', 'Total quantity sold'), `${num(summary.total_qty)} ${esc(product.unit || '')}`],
    [t(lang, 'إجمالي المبيعات', 'Total revenue'), num(summary.total_revenue)],
    [t(lang, 'عدد العملاء المشترين', 'Buying customers'), num(summary.unique_customers, 0)],
    [t(lang, 'عدد الفواتير', 'Invoice count'), num(summary.invoice_count, 0)],
    [t(lang, 'متوسط سعر البيع', 'Average unit price'), num(summary.avg_unit_price)],
  ]
    .map(([label, value]) => `<tr><td>${label}</td><td class="num">${value}</td></tr>`)
    .join('')

  const customerRows = breakdown.length
    ? breakdown
        .map((row) => `
          <tr>
            <td>${esc(row.customer_name || '—')}</td>
            <td dir="ltr">${esc(row.customer_phone || '—')}</td>
            <td>${esc(row.rep_name || '—')}</td>
            <td class="num">${num(row.order_count, 0)}</td>
            <td class="num">${num(row.total_qty)}</td>
            <td class="num">${num(row.share_pct)}%</td>
            <td class="num">${num(row.total_revenue)}</td>
            <td class="num">${date(row.last_purchase_date)}</td>
          </tr>`)
        .join('')
    : `<tr><td colspan="8" class="pdf-empty">${t(lang, 'لا توجد بيانات عملاء في هذه الفترة', 'No customer data in this period')}</td></tr>`

  const shownHistory = history.slice(0, MAX_HISTORY_ROWS)
  const historyRows = shownHistory.length
    ? shownHistory
        .map((row) => `
          <tr>
            <td class="num">${date(row.tx_date)}</td>
            <td dir="ltr">${esc(row.invoice_no)}</td>
            <td>${esc(row.invoice_type === 'cash' ? t(lang, 'كاش', 'Cash') : t(lang, 'آجل', 'Credit'))}</td>
            <td>${esc(row.customer_name || '—')}</td>
            <td>${esc(row.rep_name || '—')}</td>
            <td class="num">${num(row.qty)}</td>
            <td class="num">${num(row.unit_price)}</td>
            <td class="num">${num(row.line_total)}</td>
          </tr>`)
        .join('')
    : `<tr><td colspan="8" class="pdf-empty">${t(lang, 'لا توجد فواتير في هذه الفترة', 'No invoices in this period')}</td></tr>`

  const notes = [
    history.length > MAX_HISTORY_ROWS
      ? t(lang, `تم عرض أول ${MAX_HISTORY_ROWS} بند من أصل ${history.length} في ملف PDF.`, `Showing the first ${MAX_HISTORY_ROWS} of ${history.length} lines in this PDF.`)
      : '',
    product.sku ? `${t(lang, 'SKU', 'SKU')}: ${product.sku}` : '',
  ]
    .filter(Boolean)
    .join(' • ')

  return buildUnifiedReportTemplate({
    companyName: input.companyName,
    docBadge: t(lang, 'تقرير تحليل مبيعات صنف', 'Product sales analytics report'),
    dir,
    entityTitle: productLabel,
    entitySubtitle: `${t(lang, 'من', 'From')} ${date(from)} — ${t(lang, 'إلى', 'To')} ${date(to)}`,
    meta: [
      { label: t(lang, 'الوحدة', 'Unit'), value: product.unit || '—' },
      { label: t(lang, 'سعر البيع الحالي', 'Current price'), value: num(product.price) },
    ],
    bodyHtml: `
      <style>${ANALYTICS_A5_CSS}</style>
      <section class="pdf-section">
        <h3 class="pdf-section-title">${t(lang, 'ملخص المؤشرات', 'KPI summary')}</h3>
        <div class="pdf-table-wrap"><table class="pdf-table"><tbody>${kpiRows}</tbody></table></div>
      </section>
      <section class="pdf-section">
        <h3 class="pdf-section-title">${t(lang, 'تحليل العملاء الأكثر شراءً', 'Top buying customers')}</h3>
        <div class="pdf-table-wrap"><table class="pdf-table analytics-table analytics-customer">
          <thead><tr>
            <th>${t(lang, 'العميل', 'Customer')}</th>
            <th>${t(lang, 'الهاتف', 'Phone')}</th>
            <th>${t(lang, 'المندوب', 'Rep')}</th>
            <th class="num">${t(lang, 'الفواتير', 'Invoices')}</th>
            <th class="num">${t(lang, 'الكمية', 'Qty')}</th>
            <th class="num">${t(lang, 'النسبة', 'Share')}</th>
            <th class="num">${t(lang, 'الإيراد', 'Revenue')}</th>
            <th class="num">${t(lang, 'آخر شراء', 'Last purchase')}</th>
          </tr></thead>
          <tbody>${customerRows}</tbody>
        </table></div>
      </section>
      <section class="pdf-section">
        <h3 class="pdf-section-title">${t(lang, 'سجل الفواتير التفصيلي', 'Detailed invoice lines')}</h3>
        <div class="pdf-table-wrap"><table class="pdf-table analytics-table analytics-history">
          <thead><tr>
            <th>${t(lang, 'التاريخ', 'Date')}</th>
            <th>${t(lang, 'رقم الفاتورة', 'Invoice no.')}</th>
            <th>${t(lang, 'النوع', 'Type')}</th>
            <th>${t(lang, 'العميل', 'Customer')}</th>
            <th>${t(lang, 'المندوب', 'Rep')}</th>
            <th class="num">${t(lang, 'الكمية', 'Qty')}</th>
            <th class="num">${t(lang, 'سعر الوحدة', 'Unit price')}</th>
            <th class="num">${t(lang, 'الإجمالي', 'Total')}</th>
          </tr></thead>
          <tbody>${historyRows}</tbody>
        </table></div>
      </section>`,
    notes: notes || undefined,
  })
}

export async function shareProductConsumptionReportWhatsApp(input: ProductAnalyticsReportInput): Promise<void> {
  const html = buildProductConsumptionReportHtml(input)
  const blob = await generatePdfFromHtml(html, input.lang === 'ar' ? 'rtl' : 'ltr')
  const filename = `product-analytics-${(input.product.sku || input.product.name_ar || 'product').replace(/[^\p{L}\p{N}_-]+/gu, '_')}.pdf`
  await sharePdfBlobViaWhatsApp({
    blob,
    filename,
    message: input.lang === 'ar'
      ? `تقرير تحليل مبيعات: ${input.product.name_ar || input.product.name_en || ''}`
      : `Product sales analytics: ${input.product.name_en || input.product.name_ar || ''}`,
  })
}
