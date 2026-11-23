import { generatePdfFromHtml, printHtml, sharePdfBlobViaWhatsApp } from '@/shared/lib/pdfShare'
import { formatNumber } from '@/shared/lib/format'
import type { StatementRow } from '@/features/statements/useStatements'
import type { Product } from '@/features/products/useProducts'
import type { Report, Cell } from '@/features/reporting/report'

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
