import { generatePdfFromHtml, printHtml, sharePdfBlobViaWhatsApp } from '@/shared/lib/pdfShare'
import { formatNumber } from '@/shared/lib/format'
import type { StatementRow } from '@/features/statements/useStatements'
import type { Product } from '@/features/products/useProducts'
import type { Report, Cell } from '@/features/reporting/report'
import { LOW_STOCK_THRESHOLD } from '@/shared/lib/stockThresholds'

function esc(val: unknown): string {
  if (val === null || val === undefined) return ''
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface UnifiedReportMetaItem {
  label: string
  value: string
}

export interface UnifiedReportTemplateInput {
  companyName: string
  docBadge: string
  meta?: UnifiedReportMetaItem[]
  entityTitle: string
  entitySubtitle?: string
  bodyHtml: string
  notes?: string
  footerStamp?: string
  dir?: 'rtl' | 'ltr'
}

const UNIFIED_REPORT_CSS = `
  .pdf-root, .pdf-root * { box-sizing: border-box; }
  .pdf-root {
    width: 794px;
    margin: 0;
    padding: 0 0 24px;
    background: #ffffff;
    color: #0f172a;
    font-family: 'Tajawal', system-ui, -apple-system, 'Segoe UI', sans-serif;
    line-height: 1.6;
  }
  .pdf-top-bar {
    height: 8px;
    background: #1a4971;
    width: 100%;
  }
  .pdf-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    padding: 24px 32px 20px;
  }
  .pdf-header-start {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
    min-width: 0;
  }
  .pdf-company {
    margin: 0;
    font-size: 24px;
    font-weight: 800;
    color: #1a4971;
    line-height: 1.35;
  }
  .pdf-doc-badge {
    display: inline-flex;
    align-items: center;
    padding: 6px 14px;
    font-size: 16px;
    font-weight: 800;
    color: #103352;
    background: #e0eefb;
    border: 1.5px solid #1a4971;
    border-radius: 8px;
    line-height: 1.4;
  }
  .pdf-meta-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 240px;
    text-align: end;
  }
  .pdf-meta-item {
    font-size: 14px;
    color: #334155;
    line-height: 1.6;
  }
  .pdf-meta-label { font-weight: 600; color: #475569; }
  .pdf-meta-value { font-weight: 700; color: #0f172a; }
  .pdf-entity-banner {
    margin: 0 32px 20px;
    padding: 12px 16px;
    background: #f0f6fc;
    border-inline-start: 5px solid #1a4971;
    border-radius: 10px;
  }
  .pdf-entity-title {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.5;
  }
  .pdf-entity-subtitle {
    margin-top: 4px;
    font-size: 14px;
    font-weight: 600;
    color: #334155;
    line-height: 1.6;
  }
  .pdf-body { padding: 0 32px; }
  .pdf-section { margin-bottom: 20px; }
  .pdf-section-title {
    margin: 0 0 10px;
    padding: 8px 12px;
    font-size: 15px;
    font-weight: 800;
    color: #103352;
    background: #e0eefb;
    border-inline-start: 4px solid #1a4971;
    border-radius: 6px;
  }
  .pdf-table-wrap { width: 100%; overflow: hidden; }
  .pdf-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: auto;
  }
  .pdf-table th {
    padding: 12px;
    font-size: 15px;
    font-weight: 800;
    color: #ffffff;
    background: #1a4971;
    text-align: start;
    border: 1px solid #1a4971;
    line-height: 1.5;
    vertical-align: middle;
  }
  .pdf-table td {
    padding: 11px 12px;
    font-size: 14.5px;
    font-weight: 600;
    color: #0f172a;
    text-align: start;
    border-block-end: 1.5px solid #cbd5e1;
    line-height: 1.6;
    vertical-align: middle;
    background: #ffffff;
  }
  .pdf-table tbody tr:nth-child(even) td { background: #f8fafc; }
  .pdf-table tr { break-inside: avoid; page-break-inside: avoid; }
  .pdf-table thead { display: table-header-group; }
  .pdf-table tfoot { display: table-footer-group; }
  .pdf-table .num {
    font-size: 14.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: end;
    white-space: nowrap;
  }
  .pdf-table th.num { text-align: end; }
  .pdf-table tr.row-total td {
    font-size: 15.5px;
    font-weight: 800;
    color: #103352;
    background: #e0eefb !important;
    border-block-start: 2.5px solid #1a4971;
    border-block-end: 2.5px solid #1a4971;
  }
  .pdf-notes {
    margin: 18px 32px 0;
    padding: 12px 14px;
    font-size: 14px;
    font-weight: 700;
    color: #334155;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
  }
  .pdf-footer {
    margin: 20px 32px 0;
    padding-top: 12px;
    border-block-start: 1.5px solid #94a3b8;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    font-size: 13px;
    font-weight: 700;
    color: #334155;
  }
  .pdf-empty {
    padding: 16px;
    font-size: 14px;
    font-weight: 600;
    color: #64748b;
    text-align: center;
    border: 1px dashed #cbd5e1;
    border-radius: 8px;
    background: #f8fafc;
  }
`

export function buildUnifiedReportTemplate(input: UnifiedReportTemplateInput): string {
  const dir = input.dir ?? 'rtl'
  const meta = (input.meta ?? []).filter((m) => m.value)
  const metaHtml = meta.length
    ? `<div class="pdf-meta-grid">${meta
        .map(
          (m) =>
            `<div class="pdf-meta-item"><span class="pdf-meta-label">${esc(m.label)}: </span><span class="pdf-meta-value">${esc(m.value)}</span></div>`
        )
        .join('')}</div>`
    : ''

  const entitySubtitle = input.entitySubtitle
    ? `<div class="pdf-entity-subtitle">${esc(input.entitySubtitle)}</div>`
    : ''
  const notesHtml = input.notes ? `<div class="pdf-notes">${esc(input.notes)}</div>` : ''
  const footerStamp = input.footerStamp ?? 'مستند صادر من النظام'
  const issueDate = new Date().toLocaleDateString('ar-EG')

  return `
    <div class="pdf-root" dir="${dir}">
      <style>${UNIFIED_REPORT_CSS}</style>
      <div class="pdf-top-bar"></div>
      <header class="pdf-header">
        <div class="pdf-header-start">
          <h1 class="pdf-company">${esc(input.companyName)}</h1>
          <div class="pdf-doc-badge">${esc(input.docBadge)}</div>
        </div>
        ${metaHtml}
      </header>
      <section class="pdf-entity-banner">
        <h2 class="pdf-entity-title">${esc(input.entityTitle)}</h2>
        ${entitySubtitle}
      </section>
      <main class="pdf-body">
        ${input.bodyHtml}
      </main>
      ${notesHtml}
      <footer class="pdf-footer">
        <span>${esc(input.companyName)}</span>
        <span>${esc(footerStamp)} — ${esc(issueDate)}</span>
      </footer>
    </div>
  `.trim()
}

function fmtDate(v?: string | null): string {
  if (!v) return '-'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('ar-EG')
}

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-'
  return `${formatNumber(v)} ج.م`
}

function dateRangeMeta(fromDate?: string, toDate?: string): UnifiedReportMetaItem {
  return {
    label: 'الفترة من / إلى',
    value: `${fromDate || 'البداية'} / ${toDate || 'اليوم'}`,
  }
}

function isNumericCell(cell: Cell): boolean {
  return typeof cell === 'number' || (typeof cell === 'object' && cell !== null && 'money' in cell)
}

function renderReportCell(cell: Cell): string {
  if (typeof cell === 'object' && cell !== null) {
    if ('date' in cell) return esc(fmtDate(cell.date))
    if ('money' in cell) return esc(`${formatNumber(cell.money)} ج.م`)
  }
  if (typeof cell === 'number') return esc(formatNumber(cell))
  return esc(cell)
}

export function buildReportSectionTable(section: Report['sections'][number]): string {
  if (!section.rows.length) {
    return `<section class="pdf-section"><h3 class="pdf-section-title">${esc(section.title)}</h3><div class="pdf-empty">لا توجد بيانات</div></section>`
  }

  const numericCols = section.columns.map((_, i) => {
    const sample = section.rows.find((r) => r[i] !== undefined && r[i] !== null && r[i] !== '')?.[i]
    return sample !== undefined ? isNumericCell(sample as Cell) : false
  })

  const head = section.columns
    .map((c, i) => `<th class="${numericCols[i] ? 'num' : ''}">${esc(c)}</th>`)
    .join('')

  const body = section.rows
    .map((row) => {
      const cells = section.columns
        .map((_, i) => {
          const cell = row[i] ?? ''
          const cls = numericCols[i] ? 'num' : ''
          return `<td class="${cls}">${renderReportCell(cell as Cell)}</td>`
        })
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')

  const foot = section.totals
    ? `<tfoot><tr class="row-total">${section.columns
        .map((_, i) => {
          const cell = section.totals?.[i] ?? ''
          const cls = numericCols[i] ? 'num' : ''
          return `<td class="${cls}">${renderReportCell(cell as Cell)}</td>`
        })
        .join('')}</tr></tfoot>`
    : ''

  return `
    <section class="pdf-section">
      <h3 class="pdf-section-title">${esc(section.title)}</h3>
      <div class="pdf-table-wrap">
        <table class="pdf-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
          ${foot}
        </table>
      </div>
    </section>
  `.trim()
}

export interface CustomerStatementPdfInput {
  customer: {
    id: string
    name: string
    phone?: string | null
    representative_name?: string | null
  }
  statementRows: StatementRow[]
  companyName?: string
  fromDate?: string
  toDate?: string
}

export function buildCustomerStatementHtml({
  customer,
  statementRows,
  companyName = 'شركة توريد',
  fromDate,
  toDate,
}: CustomerStatementPdfInput): string {
  const totalDebit = statementRows.reduce((acc, r) => acc + (r.debit || 0), 0)
  const totalCredit = statementRows.reduce((acc, r) => acc + (r.credit || 0), 0)
  const finalBalance = statementRows[statementRows.length - 1]?.balance ?? 0

  const rowsHtml = statementRows
    .map((r) => {
      const isOpening = r.tx_type === 'opening'
      const label = r.row_no === 0 ? 'افتتاحي' : String(r.row_no)
      return `
        <tr>
          <td class="num" style="${isOpening ? 'font-weight:800;' : ''}">${esc(label)}</td>
          <td>${esc(r.tx_date || '-')}</td>
          <td style="${isOpening ? 'font-weight:800;' : ''}">${esc(r.description)}</td>
          <td>${esc(r.ref || '-')}</td>
          <td class="num">${r.debit !== null ? esc(formatNumber(r.debit)) : '-'}</td>
          <td class="num">${r.credit !== null ? esc(formatNumber(r.credit)) : '-'}</td>
          <td class="num" style="font-weight:800;">${esc(fmtMoney(r.balance))}</td>
        </tr>`
    })
    .join('')

  const bodyHtml = `
    <div class="pdf-table-wrap">
      <table class="pdf-table">
        <thead>
          <tr>
            <th class="num" style="width:56px;">#</th>
            <th style="width:110px;">التاريخ</th>
            <th>البيان والتفاصيل</th>
            <th style="width:120px;">المرجع</th>
            <th class="num" style="width:110px;">مدين (+)</th>
            <th class="num" style="width:110px;">دائن (-)</th>
            <th class="num" style="width:140px;">الرصيد التراكمي</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr class="row-total">
            <td colspan="4">الإجمالي والرصيد الختامي</td>
            <td class="num">${esc(formatNumber(totalDebit))}</td>
            <td class="num">${esc(formatNumber(totalCredit))}</td>
            <td class="num">${esc(fmtMoney(finalBalance))}</td>
          </tr>
        </tfoot>
      </table>
    </div>`

  return buildUnifiedReportTemplate({
    companyName,
    docBadge: 'كشف حساب عميل',
    meta: [
      { label: 'تاريخ الإصدار', value: new Date().toLocaleDateString('ar-EG') },
      dateRangeMeta(fromDate, toDate),
    ],
    entityTitle: customer.name,
    entitySubtitle: `رقم الهاتف: ${customer.phone || 'غير مسجل'}${customer.representative_name ? ` — المندوب: ${customer.representative_name}` : ''}`,
    bodyHtml,
    footerStamp: 'كشف حساب صادر من النظام',
  })
}

export async function shareCustomerStatementWhatsApp(input: CustomerStatementPdfInput) {
  const html = buildCustomerStatementHtml(input)
  const blob = await generatePdfFromHtml(html)
  const finalBalance = input.statementRows[input.statementRows.length - 1]?.balance ?? 0
  const filename = `كشف_حساب_${input.customer.name}_${new Date().toISOString().slice(0, 10)}.pdf`
  const message = `السلام عليكم ورحمة الله،\nمرفق كشف الحساب التراكمي للعميل: ${input.customer.name}\nالرصيد الحالي: ${formatNumber(finalBalance)} ج.م\nشكراً لتعاملكم معنا.`
  return sharePdfBlobViaWhatsApp({ blob, filename, recipientPhone: input.customer.phone, message })
}

export async function printCustomerStatement(input: CustomerStatementPdfInput) {
  return printHtml(buildCustomerStatementHtml(input), `كشف حساب ${input.customer.name}`)
}

export interface SupplierStatementPdfInput {
  supplier: {
    id: string
    name: string
    phone?: string | null
    opening_balance?: number | null
  }
  statementRows: StatementRow[]
  companyName?: string
  fromDate?: string
  toDate?: string
}

export function buildSupplierStatementHtml({
  supplier,
  statementRows,
  companyName = 'شركة توريد',
  fromDate,
  toDate,
}: SupplierStatementPdfInput): string {
  const totalDebit = statementRows.reduce((acc, r) => acc + (r.debit || 0), 0)
  const totalCredit = statementRows.reduce((acc, r) => acc + (r.credit || 0), 0)
  const finalBalance = statementRows[statementRows.length - 1]?.balance ?? 0

  const rowsHtml = statementRows
    .map((r) => {
      const isOpening = r.tx_type === 'opening'
      const label = r.row_no === 0 ? 'افتتاحي' : String(r.row_no)
      return `
        <tr>
          <td class="num" style="${isOpening ? 'font-weight:800;' : ''}">${esc(label)}</td>
          <td>${esc(r.tx_date || '-')}</td>
          <td style="${isOpening ? 'font-weight:800;' : ''}">${esc(r.description)}</td>
          <td>${esc(r.ref || '-')}</td>
          <td class="num">${r.debit !== null ? esc(formatNumber(r.debit)) : '-'}</td>
          <td class="num">${r.credit !== null ? esc(formatNumber(r.credit)) : '-'}</td>
          <td class="num" style="font-weight:800;">${esc(fmtMoney(r.balance))}</td>
        </tr>`
    })
    .join('')

  const bodyHtml = `
    <div class="pdf-table-wrap">
      <table class="pdf-table">
        <thead>
          <tr>
            <th class="num" style="width:56px;">#</th>
            <th style="width:110px;">التاريخ</th>
            <th>البيان والتفاصيل</th>
            <th style="width:120px;">المرجع</th>
            <th class="num" style="width:110px;">مدين (+) سداد</th>
            <th class="num" style="width:110px;">دائن (-) شراء</th>
            <th class="num" style="width:140px;">المستحق للمورد</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr class="row-total">
            <td colspan="4">الإجمالي والرصيد المستحق للمورد</td>
            <td class="num">${esc(formatNumber(totalDebit))}</td>
            <td class="num">${esc(formatNumber(totalCredit))}</td>
            <td class="num">${esc(fmtMoney(finalBalance))}</td>
          </tr>
        </tfoot>
      </table>
    </div>`

  return buildUnifiedReportTemplate({
    companyName,
    docBadge: 'كشف حساب مورد',
    meta: [
      { label: 'تاريخ الإصدار', value: new Date().toLocaleDateString('ar-EG') },
      dateRangeMeta(fromDate, toDate),
    ],
    entityTitle: supplier.name,
    entitySubtitle: `رقم الهاتف: ${supplier.phone || 'غير مسجل'}`,
    bodyHtml,
    footerStamp: 'كشف حساب صادر من النظام',
  })
}

export async function shareSupplierStatementWhatsApp(input: SupplierStatementPdfInput) {
  const html = buildSupplierStatementHtml(input)
  const blob = await generatePdfFromHtml(html)
  const finalBalance = input.statementRows[input.statementRows.length - 1]?.balance ?? 0
  const filename = `كشف_حساب_مورد_${input.supplier.name}_${new Date().toISOString().slice(0, 10)}.pdf`
  const message = `السلام عليكم ورحمة الله،\nمرفق كشف حساب للمورد: ${input.supplier.name}\nالمتبقي المستحق: ${formatNumber(finalBalance)} ج.م.`
  return sharePdfBlobViaWhatsApp({ blob, filename, recipientPhone: input.supplier.phone, message })
}

export async function printSupplierStatement(input: SupplierStatementPdfInput) {
  return printHtml(buildSupplierStatementHtml(input), `كشف حساب ${input.supplier.name}`)
}

export interface ProductCatalogPdfInput {
  products: Product[]
  categoryFilter?: string
  companyName?: string
}

export function buildProductCatalogHtml({
  products,
  categoryFilter = 'all',
  companyName = 'شركة توريد',
}: ProductCatalogPdfInput): string {
  const catLabel = categoryFilter === 'all' ? 'جميع التصنيفات' : categoryFilter
  const rowsHtml = products
    .map(
      (p, idx) => `
        <tr>
          <td class="num">${idx + 1}</td>
          <td style="font-weight:700;">${esc(p.name_ar)}</td>
          <td dir="ltr" style="text-align:start;">${esc(p.name_en || '-')}</td>
          <td>${esc(p.sku || '-')}</td>
          <td>${esc(p.category || '-')}</td>
          <td>${esc(p.unit || 'قطعة')}</td>
          <td class="num" style="font-weight:800;">${esc(fmtMoney(p.price))}</td>
        </tr>`
    )
    .join('')

  const bodyHtml = `
    <div class="pdf-table-wrap">
      <table class="pdf-table">
        <thead>
          <tr>
            <th class="num" style="width:48px;">#</th>
            <th>اسم الصنف</th>
            <th style="width:130px;">English Name</th>
            <th style="width:110px;">الكود (SKU)</th>
            <th style="width:110px;">التصنيف</th>
            <th style="width:80px;">الوحدة</th>
            <th class="num" style="width:120px;">السعر المعتمد</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`

  return buildUnifiedReportTemplate({
    companyName,
    docBadge: 'قائمة الأسعار',
    meta: [
      { label: 'تاريخ الإصدار', value: new Date().toLocaleDateString('ar-EG') },
      { label: 'عدد الأصناف', value: String(products.length) },
    ],
    entityTitle: `التصنيف: ${catLabel}`,
    bodyHtml,
    footerStamp: 'قائمة أسعار صادرة من النظام',
  })
}

export async function shareProductCatalogWhatsApp(input: ProductCatalogPdfInput) {
  const html = buildProductCatalogHtml(input)
  const blob = await generatePdfFromHtml(html)
  const companyName = input.companyName || 'شركة توريد'
  const filename = `قائمة_الأسعار_${new Date().toISOString().slice(0, 10)}.pdf`
  const message = `السلام عليكم ورحمة الله،\nمرفق قائمة الأسعار والكتالوج المعتمد لمنتجات ${companyName}.`
  return sharePdfBlobViaWhatsApp({ blob, filename, message })
}

export async function printProductCatalog(input: ProductCatalogPdfInput) {
  return printHtml(buildProductCatalogHtml(input), 'قائمة الأسعار')
}

export interface GeneralReportPdfInput {
  report: Report
  companyName?: string
}

export function buildGeneralReportHtml({
  report,
  companyName = 'شركة توريد',
}: GeneralReportPdfInput): string {
  const sectionsHtml = report.sections.map(buildReportSectionTable).join('')
  const bodyHtml = sectionsHtml || '<div class="pdf-empty">لا توجد بيانات</div>'

  return buildUnifiedReportTemplate({
    companyName,
    docBadge: report.title || 'تقرير',
    meta: [
      { label: 'تاريخ الإصدار', value: new Date().toLocaleDateString('ar-EG') },
      ...(report.subtitle ? [{ label: 'الأقسام', value: report.subtitle }] : []),
    ],
    entityTitle: report.subtitle || report.title || 'تقرير مالي',
    entitySubtitle: report.filters?.length ? report.filters.join(' • ') : undefined,
    bodyHtml,
    footerStamp: 'تقرير صادر من النظام',
  })
}

export async function shareGeneralReportWhatsApp(input: GeneralReportPdfInput) {
  const html = buildGeneralReportHtml(input)
  const blob = await generatePdfFromHtml(html)
  const filename = `${(input.report.title || 'تقرير').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`
  const message = `السلام عليكم ورحمة الله،\nمرفق تقرير: ${input.report.title || 'تقرير'}`
  return sharePdfBlobViaWhatsApp({ blob, filename, message })
}

export async function printGeneralReport(input: GeneralReportPdfInput) {
  return printHtml(buildGeneralReportHtml(input), input.report.title || 'تقرير')
}

// ─── Low-stock ("نواقص") purchase list ───────────────────────────────────────
export interface LowStockReportRow {
  name_ar: string
  sku?: string | null
  category?: string | null
  unit?: string | null
  available_qty: number
  min_stock_alert?: number | null
  alert_status?: string | null
}

export interface LowStockReportPdfInput {
  rows: LowStockReportRow[]
  companyName?: string
}

const LOW_STOCK_REPORT_CSS = `
  .lowstock-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .lowstock-table th, .lowstock-table td {
    border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center; vertical-align: middle;
  }
  .lowstock-table th {
    background: #e0eefb !important; color: #103352; font-weight: 800;
  }
  .lowstock-table td.lowstock-name { text-align: start; font-weight: 700; }
  .lowstock-meta { font-size: 11px; color: #64748b; font-weight: 500; }
  .lowstock-order-box {
    display: inline-block; min-width: 90px; height: 22px;
    border: 1px solid #94a3b8; border-radius: 4px; background: #ffffff;
  }
  .lowstock-out { color: #be123c; font-weight: 800; }
`

/** Shared template used by both print and WhatsApp sharing of the نواقص list. */
export function buildLowStockReportHtml({
  rows,
  companyName = 'شركة توريد',
}: LowStockReportPdfInput): string {
  const bodyRows = rows.length
    ? rows
        .map(
          (row, index) => `
            <tr>
              <td class="tabular-nums">${esc(index + 1)}</td>
              <td class="lowstock-name">
                ${esc(row.name_ar)}
                ${row.unit ? `<div class="lowstock-meta">الوحدة: ${esc(row.unit)}</div>` : ''}
              </td>
              <td dir="ltr">${esc(row.sku || '-')}</td>
              <td>${esc(row.category || '-')}</td>
              <td class="tabular-nums ${row.alert_status === 'out_of_stock' ? 'lowstock-out' : ''}">
                ${esc(formatNumber(Number(row.available_qty) || 0))}
              </td>
              <td class="tabular-nums">${esc(formatNumber(Number(row.min_stock_alert ?? LOW_STOCK_THRESHOLD) || LOW_STOCK_THRESHOLD))}</td>
              <td><span class="lowstock-order-box"></span></td>
            </tr>`
        )
        .join('')
    : '<tr><td colspan="7"><div class="pdf-empty">لا توجد أصناف نواقص حالياً</div></td></tr>'

  const bodyHtml = `
    <style>${LOW_STOCK_REPORT_CSS}</style>
    <section class="pdf-section">
      <h3 class="pdf-section-title">الأصناف النواقص (رصيد متاح ≤ ${esc(formatNumber(LOW_STOCK_THRESHOLD))})</h3>
      <table class="lowstock-table">
        <thead>
          <tr>
            <th>م</th>
            <th>الصنف</th>
            <th>الكود (SKU)</th>
            <th>الفئة</th>
            <th>الرصيد المتاح</th>
            <th>حد الأمان</th>
            <th>الكمية المطلوبة (Order Qty)</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </section>
  `

  return buildUnifiedReportTemplate({
    companyName,
    docBadge: 'قائمة نواقص المخزون (للطلب من الموردين)',
    meta: [
      { label: 'تاريخ الإصدار', value: new Date().toLocaleDateString('ar-EG') },
      { label: 'عدد الأصناف', value: formatNumber(rows.length) },
    ],
    entityTitle: 'قائمة نواقص المخزون',
    entitySubtitle: `الأصناف التي وصل رصيدها المتاح إلى ${formatNumber(LOW_STOCK_THRESHOLD)} أو أقل — تُستخدم لطلب الموردين.`,
    bodyHtml,
    footerStamp: 'قائمة نواقص صادرة من النظام',
  })
}

export async function printLowStockReport(input: LowStockReportPdfInput) {
  return printHtml(buildLowStockReportHtml(input), 'نواقص المخزون')
}

export async function shareLowStockWhatsApp(input: LowStockReportPdfInput) {
  const blob = await generatePdfFromHtml(buildLowStockReportHtml(input))
  const filename = `low-stock_${new Date().toISOString().slice(0, 10)}.pdf`
  const message = `السلام عليكم ورحمة الله،\nمرفق قائمة نواقص المخزون (${input.rows.length} صنف) لطلب الموردين.`
  return sharePdfBlobViaWhatsApp({ blob, filename, message })
}

export interface InvoicePdfLine {
  qty: number
  unit_price: number
  line_total: number
  product: {
    name_ar: string | null
    name_en: string | null
    sku: string | null
    unit: string | null
  } | null
}

export interface InvoicePdfPayment {
  date: string
  amount: number
  method: string
  reference: string
}

export interface InvoicePdfInput {
  invoiceType: 'cash' | 'credit'
  invoice_no: string
  date: string
  due_date?: string | null
  customer_name: string
  customer_phone?: string | null
  rep_name?: string | null
  amount: number
  down_payment?: number
  recorded_payments?: number
  pooled_payments?: number
  total_paid?: number
  remaining?: number
  notes?: string | null
  item?: string | null
  lines: InvoicePdfLine[]
  payments?: InvoicePdfPayment[]
  companyName?: string
  dir?: 'rtl' | 'ltr'
}

/** Standalone invoice document built on the same unified template as reports/statements. */
export function buildInvoicePdfHtml({
  invoiceType,
  invoice_no,
  date,
  due_date,
  customer_name,
  customer_phone,
  rep_name,
  amount,
  down_payment = 0,
  recorded_payments = 0,
  pooled_payments = 0,
  total_paid = 0,
  remaining = 0,
  notes,
  item,
  lines,
  payments = [],
  companyName = 'شركة توريد',
  dir = 'rtl',
}: InvoicePdfInput): string {
  const isCredit = invoiceType === 'credit'
  const productName = (line: InvoicePdfLine) =>
    line.product?.name_ar || line.product?.name_en || line.product?.sku || item || '-'

  const rowsHtml = lines.length
    ? lines
        .map(
          (line, index) => `
            <tr>
              <td class="num">${esc(index + 1)}</td>
              <td>${esc(productName(line))}</td>
              <td>${esc(line.product?.unit || '-')}</td>
              <td class="num">${esc(formatNumber(line.qty))}</td>
              <td class="num">${esc(formatNumber(line.unit_price))}</td>
              <td class="num">${esc(fmtMoney(line.line_total))}</td>
            </tr>`
        )
        .join('')
    : `<tr>
          <td class="num">1</td>
          <td>${esc(item || 'بيان الفاتورة')}</td>
          <td>-</td>
          <td class="num">1</td>
          <td class="num">${esc(formatNumber(amount))}</td>
          <td class="num">${esc(fmtMoney(amount))}</td>
        </tr>`

  const paymentRowsHtml = isCredit
    ? [
        ...(down_payment > 0
          ? [
              `<tr>
                <td class="num">0</td>
                <td>${esc(fmtDate(date))}</td>
                <td>مدفوع مقدمًا</td>
                <td>${esc(invoice_no)}</td>
                <td class="num">${esc(fmtMoney(down_payment))}</td>
              </tr>`,
            ]
          : []),
        ...payments.map(
          (payment, index) => `
            <tr>
              <td class="num">${esc(index + 1)}</td>
              <td>${esc(fmtDate(payment.date))}</td>
              <td>${esc(payment.method || '-')}</td>
              <td>${esc(payment.reference || '-')}</td>
              <td class="num">${esc(fmtMoney(payment.amount))}</td>
            </tr>`
        ),
        ...(pooled_payments > 0
          ? [
              `<tr>
                <td class="num">•</td>
                <td>-</td>
                <td>تخصيص مدفوعات غير مرتبطة</td>
                <td>-</td>
                <td class="num">${esc(fmtMoney(pooled_payments))}</td>
              </tr>`,
            ]
          : []),
      ].join('') || '<tr><td colspan="5">لا توجد مدفوعات مسجلة</td></tr>'
    : ''

  const paymentSectionHtml = isCredit
    ? `
      <section class="pdf-section">
        <h3 class="pdf-section-title">سجل المدفوعات</h3>
        <div class="pdf-table-wrap">
          <table class="pdf-table">
            <thead>
              <tr>
                <th class="num" style="width:52px;">#</th>
                <th style="width:130px;">التاريخ</th>
                <th>البيان</th>
                <th>المرجع</th>
                <th class="num" style="width:140px;">المبلغ</th>
              </tr>
            </thead>
            <tbody>${paymentRowsHtml}</tbody>
            <tfoot>
              <tr class="row-total">
                <td colspan="4">إجمالي المدفوعات المرتبطة</td>
                <td class="num">${esc(fmtMoney(recorded_payments))}</td>
              </tr>
              <tr class="row-total">
                <td colspan="4">إجمالي المسدد</td>
                <td class="num">${esc(fmtMoney(total_paid))}</td>
              </tr>
              <tr class="row-total">
                <td colspan="4">الرصيد المتبقي</td>
                <td class="num">${esc(fmtMoney(remaining))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>`
    : ''

  const bodyHtml = `
    <section class="pdf-section">
      <h3 class="pdf-section-title">بنود الفاتورة</h3>
      <div class="pdf-table-wrap">
        <table class="pdf-table">
          <thead>
            <tr>
              <th class="num" style="width:52px;">#</th>
              <th>المنتج</th>
              <th style="width:90px;">الوحدة</th>
              <th class="num" style="width:100px;">الكمية</th>
              <th class="num" style="width:120px;">سعر الوحدة</th>
              <th class="num" style="width:140px;">إجمالي السطر</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot>
            <tr class="row-total">
              <td colspan="5">الإجمالي الكلي</td>
              <td class="num">${esc(fmtMoney(amount))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
    ${paymentSectionHtml}`

  return buildUnifiedReportTemplate({
    companyName,
    docBadge: isCredit ? 'فاتورة بيع آجل' : 'فاتورة بيع نقدي',
    meta: [
      { label: 'رقم الفاتورة', value: invoice_no },
      { label: 'تاريخ الإصدار', value: fmtDate(date) },
      ...(isCredit ? [{ label: 'تاريخ الاستحقاق', value: fmtDate(due_date) }] : []),
    ],
    entityTitle: `العميل: ${customer_name} — هاتف: ${customer_phone || 'غير مسجل'}`,
    entitySubtitle: `المندوب: ${rep_name || '-'}`,
    bodyHtml,
    notes: notes || (!lines.length ? item : null) || undefined,
    footerStamp: isCredit ? 'فاتورة آجل صادرة من النظام' : 'فاتورة نقدية صادرة من النظام',
    dir,
  })
}

export async function shareInvoiceWhatsApp(input: InvoicePdfInput) {
  const html = buildInvoicePdfHtml(input)
  const blob = await generatePdfFromHtml(html)
  const safeInvoiceNo = input.invoice_no.replace(/[^\w\u0600-\u06FF-]+/g, '_') || 'invoice'
  const filename = `فاتورة_${safeInvoiceNo}_${new Date().toISOString().slice(0, 10)}.pdf`
  const message = `فاتورة رقم #${input.invoice_no} بقيمة ${formatNumber(input.amount)} ج.م`
  return sharePdfBlobViaWhatsApp({
    blob,
    filename,
    recipientPhone: input.customer_phone,
    message,
  })
}

export async function printInvoice(input: InvoicePdfInput) {
  return printHtml(buildInvoicePdfHtml(input), `فاتورة ${input.invoice_no}`)
}

export interface DailyReportRepRow {
  repName: string
  cashTotal: number
  creditTotal: number
  paymentsTotal: number
}

export interface DailyReportInput {
  date: string
  companyName: string
  cashCount: number
  cashTotal: number
  creditCount: number
  creditTotal: number
  paymentsCount: number
  paymentsTotal: number
  returnsCount: number
  returnsTotal: number
  expensesCount: number
  expensesTotal: number
  netCashFlow: number
  repRows: DailyReportRepRow[]
  dir?: 'rtl' | 'ltr'
}

export function buildDailyReportHtml(input: DailyReportInput): string {
  const {
    date,
    companyName,
    cashCount,
    cashTotal,
    creditCount,
    creditTotal,
    paymentsCount,
    paymentsTotal,
    returnsCount,
    returnsTotal,
    expensesCount,
    expensesTotal,
    netCashFlow,
    repRows,
    dir = 'rtl',
  } = input

  const summaryRows = [
    { label: 'المبيعات النقدية', count: cashCount, total: cashTotal },
    { label: 'المبيعات الآجلة', count: creditCount, total: creditTotal },
    { label: 'تحصيلات العملاء', count: paymentsCount, total: paymentsTotal },
    { label: 'المرتجعات', count: returnsCount, total: returnsTotal },
    { label: 'المصروفات', count: expensesCount, total: expensesTotal },
  ]

  const summaryRowsHtml = summaryRows
    .map(
      (r) => `
      <tr>
        <td>${esc(r.label)}</td>
        <td class="num">${esc(formatNumber(r.count))}</td>
        <td class="num">${esc(formatNumber(r.total))} ج.م</td>
      </tr>`
    )
    .join('')

  const repSectionHtml = repRows.length
    ? `
    <section class="pdf-section" style="margin-top: 18px;">
      <h3 class="pdf-section-title">ملخص نشاط المناديب</h3>
      <div class="pdf-table-wrap">
        <table class="pdf-table">
          <thead>
            <tr>
              <th>المندوب</th>
              <th class="num">مبيعات نقدي</th>
              <th class="num">مبيعات آجل</th>
              <th class="num">تحصيلات</th>
            </tr>
          </thead>
          <tbody>
            ${repRows
              .map(
                (rep) => `
              <tr>
                <td>${esc(rep.repName)}</td>
                <td class="num">${esc(formatNumber(rep.cashTotal))} ج.م</td>
                <td class="num">${esc(formatNumber(rep.creditTotal))} ج.م</td>
                <td class="num">${esc(formatNumber(rep.paymentsTotal))} ج.م</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>`
    : ''

  const bodyHtml = `
    <section class="pdf-section">
      <h3 class="pdf-section-title">ملخص الحركة اليومية</h3>
      <div class="pdf-table-wrap">
        <table class="pdf-table">
          <thead>
            <tr>
              <th>البند</th>
              <th class="num">العدد</th>
              <th class="num">الإجمالي</th>
            </tr>
          </thead>
          <tbody>${summaryRowsHtml}</tbody>
          <tfoot>
            <tr class="row-total">
              <td colspan="2">صافي الحركة النقدية اليومية (النقدي + التحصيلات - المصروفات)</td>
              <td class="num">${esc(formatNumber(netCashFlow))} ج.م</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
    ${repSectionHtml}`

  return buildUnifiedReportTemplate({
    companyName,
    docBadge: 'التقرير اليومي المختصر',
    meta: [
      { label: 'تاريخ التقرير', value: date },
      { label: 'تاريخ الطباعة', value: new Date().toLocaleDateString('ar-EG') },
    ],
    entityTitle: 'ملخص نهاية اليوم',
    entitySubtitle: 'نظرة سريعة على المبيعات والتحصيلات والمصروفات',
    bodyHtml,
    footerStamp: 'تقرير يومي صادر من النظام',
    dir,
  })
}

export async function printDailyReport(input: DailyReportInput) {
  return printHtml(buildDailyReportHtml(input), `التقرير اليومي - ${input.date}`)
}

export async function shareDailyReportWhatsApp(input: DailyReportInput) {
  const html = buildDailyReportHtml(input)
  const blob = await generatePdfFromHtml(html)
  const filename = `التقرير_اليومي_${input.date}.pdf`
  const message =
    `التقرير اليومي (${input.date}):\n` +
    `• المبيعات النقدية: ${formatNumber(input.cashTotal)} ج.م (${input.cashCount})\n` +
    `• المبيعات الآجلة: ${formatNumber(input.creditTotal)} ج.م (${input.creditCount})\n` +
    `• التحصيلات: ${formatNumber(input.paymentsTotal)} ج.م (${input.paymentsCount})\n` +
    `• المصروفات: ${formatNumber(input.expensesTotal)} ج.م (${input.expensesCount})\n` +
    `• صافي الحركة النقدية: ${formatNumber(input.netCashFlow)} ج.م`

  return sharePdfBlobViaWhatsApp({
    blob,
    filename,
    message,
  })
}
