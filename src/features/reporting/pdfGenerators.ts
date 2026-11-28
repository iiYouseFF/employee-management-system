import { generatePdfFromHtml, printHtml, sharePdfBlobViaWhatsApp } from '@/shared/lib/pdfShare'
import { formatNumber } from '@/shared/lib/format'
import type { StatementRow } from '@/features/statements/useStatements'
import type { Product } from '@/features/products/useProducts'
import type { Report, Cell } from '@/features/reporting/report'
import { LOW_STOCK_THRESHOLD } from '@/shared/lib/stockThresholds'
import { resolveProductUnit } from '@/shared/lib/productUnits'
import { t, type UiLang } from '@/shared/lib/bilingual'

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

/** Compact unified sheet shared by A4 and A5; denser rows leave room for more data. */
const UNIFIED_REPORT_CSS = `
  .pdf-root, .pdf-root * { box-sizing: border-box; }
  .pdf-root {
    width: 559px;
    margin: 0;
    padding: 10px 12px;
    background: #ffffff;
    color: #0f172a;
    font-family: 'Tajawal', system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 12px;
    line-height: 1.35;
  }
  .pdf-top-bar {
    height: 4px;
    background: #1a4971;
    width: 100%;
  }
  .pdf-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    padding: 0 0 6px;
  }
  .pdf-header-start {
    display: flex;
    flex-direction: column;
    gap: 3px;
    align-items: flex-start;
    min-width: 0;
  }
  .pdf-company {
    margin: 0;
    font-size: 16px;
    font-weight: 800;
    color: #1a4971;
    line-height: 1.2;
  }
  .pdf-doc-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    font-size: 11px;
    font-weight: 800;
    color: #103352;
    background: #e0eefb;
    border: 1.5px solid #1a4971;
    border-radius: 5px;
    line-height: 1.2;
  }
  .pdf-meta-grid {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 150px;
    text-align: end;
  }
  .pdf-meta-item {
    font-size: 10.5px;
    color: #334155;
    line-height: 1.3;
  }
  .pdf-meta-label { font-weight: 600; color: #475569; }
  .pdf-meta-value { font-weight: 700; color: #0f172a; }
  .pdf-entity-banner {
    margin: 0 0 6px;
    padding: 4px 7px;
    background: #f0f6fc;
    border-inline-start: 3px solid #1a4971;
    border-radius: 6px;
  }
  .pdf-entity-title {
    margin: 0;
    font-size: 12.5px;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.3;
  }
  .pdf-entity-subtitle {
    margin-top: 1px;
    font-size: 10.5px;
    font-weight: 600;
    color: #334155;
    line-height: 1.3;
  }
  .pdf-body { padding: 0; }
  .pdf-section { margin-bottom: 8px; }
  .pdf-section-title {
    margin: 0 0 4px;
    padding: 3px 6px;
    font-size: 11px;
    font-weight: 800;
    color: #103352;
    background: #e0eefb;
    border-inline-start: 3px solid #1a4971;
    border-radius: 5px;
  }
  .pdf-table-wrap { width: 100%; overflow: hidden; }
  .pdf-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: auto;
  }
  .pdf-table th {
    padding: 4px 5px;
    font-size: 11px;
    font-weight: 800;
    color: #ffffff;
    background: #1a4971;
    text-align: start;
    border: 1px solid #1a4971;
    line-height: 1.25;
    vertical-align: middle;
  }
  .pdf-table td {
    padding: 3px 5px;
    font-size: 10.5px;
    font-weight: 600;
    color: #0f172a;
    text-align: start;
    border-block-end: 1px solid #cbd5e1;
    line-height: 1.3;
    vertical-align: middle;
    background: #ffffff;
  }
  .pdf-table tbody tr:nth-child(even) td { background: #f8fafc; }
  .pdf-table tr { break-inside: avoid; page-break-inside: avoid; }
  .pdf-table thead { display: table-header-group; }
  .pdf-table tfoot { display: table-footer-group; }
  .pdf-table .num {
    font-size: 10.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: end;
    white-space: nowrap;
  }
  .pdf-table th.num { text-align: end; }
  .pdf-table tr.row-total td {
    font-size: 11px;
    font-weight: 800;
    color: #103352;
    background: #e0eefb !important;
    border-block-start: 2px solid #1a4971;
    border-block-end: 2px solid #1a4971;
  }
  .pdf-notes {
    margin: 6px 0 0;
    padding: 4px 6px;
    font-size: 10.5px;
    font-weight: 700;
    color: #334155;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
  }
  .pdf-footer {
    margin: 8px 0 0;
    padding-top: 4px;
    border-block-start: 1px solid #94a3b8;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    font-weight: 700;
    color: #334155;
  }
  .pdf-empty {
    padding: 6px;
    font-size: 10.5px;
    font-weight: 600;
    color: #64748b;
    text-align: center;
    border: 1px dashed #cbd5e1;
    border-radius: 6px;
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
            <th class="num" style="width:32px;">#</th>
            <th style="width:72px;">التاريخ</th>
            <th>البيان والتفاصيل</th>
            <th style="width:80px;">المرجع</th>
            <th class="num" style="width:72px;">مدين (+)</th>
            <th class="num" style="width:72px;">دائن (-)</th>
            <th class="num" style="width:96px;">الرصيد التراكمي</th>
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
            <th class="num" style="width:32px;">#</th>
            <th style="width:72px;">التاريخ</th>
            <th>البيان والتفاصيل</th>
            <th style="width:80px;">المرجع</th>
            <th class="num" style="width:72px;">مدين (+) سداد</th>
            <th class="num" style="width:72px;">دائن (-) شراء</th>
            <th class="num" style="width:96px;">المستحق للمورد</th>
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
  const uncategorizedLabel = 'بدون تصنيف'

  const grouped = new Map<string, Product[]>()
  for (const p of products) {
    const key = p.category?.trim() || uncategorizedLabel
    const list = grouped.get(key)
    if (list) {
      list.push(p)
    } else {
      grouped.set(key, [p])
    }
  }

  const sortedCategories = Array.from(grouped.keys()).sort((a, b) => {
    if (a === uncategorizedLabel) return 1
    if (b === uncategorizedLabel) return -1
    return a.localeCompare(b, 'ar')
  })

  const buildRows = (items: Product[]) =>
    items
      .slice()
      .sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar'))
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

  const bodyHtml = sortedCategories.length
    ? sortedCategories
        .map((category) => {
          const items = grouped.get(category) ?? []
          return `
    <div style="margin-bottom:8px;">
      <div style="display:flex; align-items:center; justify-content:space-between; background:#eef5fc; color:#103352; border:1px solid #cbd5e1; border-bottom:none; padding:3px 6px; font-weight:800; font-size:11px; border-radius:5px 5px 0 0; break-after:avoid-page; page-break-after:avoid;">
        <span>${esc(category)}</span>
        <span style="font-size:9px; color:#475569;">${items.length} صنف</span>
      </div>
      <div class="pdf-table-wrap" style="margin-top:0;">
        <table class="pdf-table">
          <thead>
            <tr>
              <th class="num" style="width:32px;">#</th>
              <th>اسم الصنف</th>
              <th style="width:92px;">English Name</th>
              <th style="width:78px;">الكود (SKU)</th>
              <th style="width:78px;">التصنيف</th>
              <th style="width:56px;">الوحدة</th>
              <th class="num" style="width:88px;">السعر المعتمد</th>
            </tr>
          </thead>
          <tbody>${buildRows(items)}</tbody>
        </table>
      </div>
    </div>`
        })
        .join('')
    : '<div class="pdf-empty">لا توجد أصناف</div>'

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
  .lowstock-table { width: 100%; border-collapse: collapse; font-size: 10.5px; table-layout: auto; }
  .lowstock-table th, .lowstock-table td {
    border: 1px solid #cbd5e1; padding: 3px 4px; text-align: center; vertical-align: middle;
  }
  .lowstock-table th {
    background: #e0eefb !important; color: #103352; font-weight: 800; font-size: 10.5px;
  }
  .lowstock-table td.lowstock-name { text-align: start; font-weight: 700; }
  .lowstock-meta { font-size: 10px; color: #64748b; font-weight: 500; }
  .lowstock-order-box {
    display: inline-block; min-width: 62px; height: 18px;
    border: 1px solid #94a3b8; border-radius: 3px; background: #ffffff;
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
  unit?: string | null
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
              <td>${esc(resolveProductUnit(line.unit || line.product?.unit))}</td>
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
                <th class="num" style="width:32px;">#</th>
                <th style="width:72px;">التاريخ</th>
                <th>البيان</th>
                <th>المرجع</th>
                <th class="num" style="width:88px;">المبلغ</th>
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
              <th class="num" style="width:32px;">#</th>
              <th>المنتج</th>
              <th style="width:56px;">الوحدة</th>
              <th class="num" style="width:64px;">الكمية</th>
              <th class="num" style="width:80px;">سعر الوحدة</th>
              <th class="num" style="width:96px;">إجمالي السطر</th>
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
  const blob = await generatePdfFromHtml(html, input.dir ?? 'rtl')
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
  return printHtml(buildInvoicePdfHtml(input), `فاتورة ${input.invoice_no}`, input.dir ?? 'rtl')
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
    <section class="pdf-section" style="margin-top: 8px;">
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
  return printHtml(buildDailyReportHtml(input), `التقرير اليومي - ${input.date}`, input.dir ?? 'rtl')
}

export async function shareDailyReportWhatsApp(input: DailyReportInput) {
  const html = buildDailyReportHtml(input)
  const blob = await generatePdfFromHtml(html, input.dir ?? 'rtl')
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

export interface SalarySlipPdfInput {
  companyName: string
  year: number
  month: number
  employeeName: string
  jobTitle: string
  phone?: string | null
  presentDays: number
  absentDays: number
  lateDays: number
  totalOvertimeHours: number
  baseSalary: number
  overtimeTotal: number
  bonusesTotal: number
  deductionsTotal: number
  suggestedLoanDeduction: number
  activeLoanBalance: number
  netSalary: number
  dir?: 'rtl' | 'ltr'
}

export function buildSalarySlipHtml(input: SalarySlipPdfInput): string {
  const {
    companyName,
    year,
    month,
    employeeName,
    jobTitle,
    phone,
    presentDays,
    absentDays,
    lateDays,
    totalOvertimeHours,
    baseSalary,
    overtimeTotal,
    bonusesTotal,
    deductionsTotal,
    suggestedLoanDeduction,
    activeLoanBalance,
    netSalary,
    dir = 'rtl',
  } = input

  const bodyHtml = `
    <section class="pdf-section">
      <h3 class="pdf-section-title">ملخص الحضور الشهري</h3>
      <div class="pdf-table-wrap">
        <table class="pdf-table">
          <thead>
            <tr>
              <th class="num">أيام الحضور</th>
              <th class="num">أيام الغياب</th>
              <th class="num">مرات التأخير</th>
              <th class="num">ساعات الإضافي</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="num">${esc(formatNumber(presentDays))}</td>
              <td class="num">${esc(formatNumber(absentDays))}</td>
              <td class="num">${esc(formatNumber(lateDays))}</td>
              <td class="num">${esc(formatNumber(totalOvertimeHours))} س</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <section class="pdf-section" style="margin-top: 16px;">
      <h3 class="pdf-section-title">تفاصيل المستحقات والاستقطاعات</h3>
      <div class="pdf-table-wrap">
        <table class="pdf-table">
          <thead>
            <tr>
              <th>البند</th>
              <th class="num">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>الراتب الأساسي</td><td class="num">${esc(formatNumber(baseSalary))} ج.م</td></tr>
            <tr><td>بدل ساعات إضافية</td><td class="num">+ ${esc(formatNumber(overtimeTotal))} ج.م</td></tr>
            <tr><td>المكافآت</td><td class="num">+ ${esc(formatNumber(bonusesTotal))} ج.م</td></tr>
            <tr><td>الخصومات</td><td class="num">- ${esc(formatNumber(deductionsTotal))} ج.م</td></tr>
            <tr><td>قسط السُلفة (الرصيد المتبقي: ${esc(formatNumber(activeLoanBalance))} ج.م)</td><td class="num">- ${esc(formatNumber(suggestedLoanDeduction))} ج.م</td></tr>
          </tbody>
          <tfoot>
            <tr class="row-total">
              <td>صافي الراتب المستحق</td>
              <td class="num">${esc(formatNumber(netSalary))} ج.م</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>`

  return buildUnifiedReportTemplate({
    companyName,
    docBadge: 'قسيمة راتب شهرية',
    meta: [
      { label: 'الفترة', value: `${month}/${year}` },
      { label: 'تاريخ الإصدار', value: new Date().toLocaleDateString('ar-EG') },
    ],
    entityTitle: `الموظف: ${employeeName}${phone ? ` — هاتف: ${phone}` : ''}`,
    entitySubtitle: `المسمى الوظيفي: ${jobTitle}`,
    bodyHtml,
    footerStamp: 'قسيمة راتب صادرة من النظام',
    dir,
  })
}

export async function printSalarySlip(input: SalarySlipPdfInput) {
  return printHtml(
    buildSalarySlipHtml(input),
    `قسيمة راتب - ${input.employeeName} (${input.month}/${input.year})`,
    input.dir ?? 'rtl'
  )
}

export async function shareSalarySlipWhatsApp(input: SalarySlipPdfInput) {
  const html = buildSalarySlipHtml(input)
  const blob = await generatePdfFromHtml(html, input.dir ?? 'rtl')
  const safeName = input.employeeName.replace(/[^\w\u0600-\u06FF-]+/g, '_') || 'employee'
  const filename = `قسيمة_راتب_${safeName}_${input.year}_${input.month}.pdf`
  const message = `قسيمة راتب ${input.employeeName} لشهر ${input.month}/${input.year} — صافي المستحق: ${formatNumber(input.netSalary)} ج.م`
  return sharePdfBlobViaWhatsApp({
    blob,
    filename,
    recipientPhone: input.phone || undefined,
    message,
  })
}

// ─── Warehouse physical stock count sheet ─────────────────────────────────────
export interface StockCountRow {
  name_ar: string
  name_en?: string | null
  sku?: string | null
  category?: string | null
  unit?: string | null
  current_stock: number
  /** Shelf order from the products table; used to walk the warehouse systematically. */
  sort_order?: number | null
}

export interface StockCountReportInput {
  rows: StockCountRow[]
  categoryFilter?: string
  companyName?: string
  dir?: 'rtl' | 'ltr'
}

const STOCK_COUNT_REPORT_CSS = `
  .stock-count-sub { font-size: 10.5px; font-weight: 700; color: #475569; line-height: 1.4; }
  .pdf-table .stock-count-index, .pdf-table .stock-count-box-cell { text-align: center; }
  .stock-count-index { font-weight: 700; }
  .stock-count-num {
    font-size: 10.5px; font-weight: 800;
    font-variant-numeric: tabular-nums; text-align: end; white-space: nowrap;
  }
  .stock-count-box {
    display: inline-block;
    width: 100%;
    min-width: 78px;
    height: 20px;
    border: 1.5px solid #64748b;
    background: #ffffff;
    border-radius: 3px;
  }
  .stock-count-box-diff { min-width: 62px; border-color: #94a3b8; }
  .stock-count-category td {
    background: #eef5fc !important; color: #103352;
    font-size: 10.5px; font-weight: 800; padding: 3px 5px;
    border: 1px solid #cbd5e1;
  }
  .stock-count-category { break-after: avoid; page-break-after: avoid; }
  .stock-count-signoff {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 8px;
    font-weight: 700;
    font-size: 11px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
`

/**
 * Blank physical count sheet built on the unified A5 report template.
 * Rows are grouped by category then shelf sort order then Arabic name, so the
 * warehouse team can count shelves in order and write counts/differences by hand.
 */
export function buildStockCountReportHtml({
  rows,
  categoryFilter = 'all',
  companyName = 'شركة توريد',
  dir = 'rtl',
}: StockCountReportInput): string {
  const lang: UiLang = dir === 'ltr' ? 'en' : 'ar'
  const uncategorized = t(lang, 'بدون تصنيف', 'Uncategorized')
  const allLabel = t(lang, 'الكل', 'All')
  const categoryLabel = !categoryFilter || categoryFilter === 'all' ? allLabel : categoryFilter

  const sortedRows = rows.slice().sort((a, b) => {
    const catA = a.category?.trim() || uncategorized
    const catB = b.category?.trim() || uncategorized
    if (catA === uncategorized && catB !== uncategorized) return 1
    if (catB === uncategorized && catA !== uncategorized) return -1
    const byCategory = catA.localeCompare(catB, lang === 'ar' ? 'ar' : 'en')
    if (byCategory !== 0) return byCategory
    const orderA = a.sort_order ?? Number.MAX_SAFE_INTEGER
    const orderB = b.sort_order ?? Number.MAX_SAFE_INTEGER
    if (orderA !== orderB) return orderA - orderB
    return (a.name_ar || '').localeCompare(b.name_ar || '', 'ar')
  })

  let lastCategory = ''
  const rowsHtml = sortedRows
    .map((row, index) => {
      const category = row.category?.trim() || uncategorized
      const categoryBand =
        category === lastCategory
          ? ''
          : `<tr class="stock-count-category"><td colspan="7">${esc(category)}</td></tr>`
      lastCategory = category
      const englishName = row.name_en
        ? `<div class="stock-count-sub" dir="ltr">${esc(row.name_en)}</div>`
        : ''
      return `${categoryBand}
        <tr>
          <td class="stock-count-index">${esc(index + 1)}</td>
          <td dir="ltr">${esc(row.sku || '—')}</td>
          <td><strong>${esc(row.name_ar || row.name_en || '—')}</strong>${englishName}</td>
          <td>${esc(row.unit || '—')}</td>
          <td class="num stock-count-num">${esc(formatNumber(Number(row.current_stock) || 0))}</td>
          <td class="stock-count-box-cell"><span class="stock-count-box" aria-hidden="true"></span></td>
          <td class="stock-count-box-cell"><span class="stock-count-box stock-count-box-diff" aria-hidden="true"></span></td>
        </tr>`
    })
    .join('')

  const emptyRow = `<tr><td colspan="7"><div class="pdf-empty">${esc(
    t(lang, 'لا توجد أصناف نشطة مطابقة', 'No active products match the selected filters')
  )}</div></td></tr>`

  const headHtml = [
    '#',
    t(lang, 'كود الصنف', 'SKU'),
    t(lang, 'اسم الصنف', 'Product name'),
    t(lang, 'الوحدة', 'Unit'),
    t(lang, 'رصيد النظام', 'System stock'),
    t(lang, 'الجرد الفعلي', 'Physical count'),
    t(lang, 'الفرق (+/-)', 'Difference (+/-)'),
  ]
    .map((label, i) => {
      const width = ['30px', '72px', '', '42px', '68px', '82px', '70px'][i]
      const cls =
        i === 0
          ? 'stock-count-index'
          : i === 4
            ? 'num stock-count-num'
            : i === 5 || i === 6
              ? 'stock-count-box-cell'
              : ''
      return `<th class="${cls}"${width ? ` style="width:${width};"` : ''}>${esc(label)}</th>`
    })
    .join('')

  const bodyHtml = `
    <style>${STOCK_COUNT_REPORT_CSS}</style>
    <div class="pdf-table-wrap">
      <table class="pdf-table">
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${rowsHtml || emptyRow}</tbody>
      </table>
    </div>
    <div class="stock-count-signoff">
      <span>${esc(t(lang, 'القائم بالجرد: ..............................', 'Counted by: ..............................'))}</span>
      <span>${esc(t(lang, 'اعتماد أمين المخزن / المدير: ..............................', 'Warehouse manager / director approval: ..............................'))}</span>
    </div>
  `

  return buildUnifiedReportTemplate({
    companyName,
    docBadge: t(lang, 'كشف جرد المخزن الفعلي', 'Physical Stock Count Sheet'),
    meta: [
      { label: t(lang, 'التصنيف', 'Category'), value: categoryLabel },
      { label: t(lang, 'عدد الأصناف النشطة', 'Active products'), value: formatNumber(rows.length) },
      {
        label: t(lang, 'تاريخ الإصدار', 'Issued on'),
        value: new Date().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US'),
      },
    ],
    entityTitle: `${t(lang, 'التصنيف', 'Category')}: ${categoryLabel}`,
    entitySubtitle: `${t(lang, 'إجمالي الأصناف النشطة', 'Total active products')}: ${formatNumber(rows.length)}`,
    bodyHtml,
    footerStamp: t(lang, 'كشف جرد صادر من النظام', 'Stock count sheet issued by the system'),
    dir,
  })
}

export async function printStockCountReport(input: StockCountReportInput) {
  return printHtml(
    buildStockCountReportHtml(input),
    input.dir === 'ltr' ? 'Physical Stock Count Sheet' : 'كشف جرد المخزن الفعلي',
    input.dir ?? 'rtl'
  )
}

export async function shareStockCountWhatsApp(input: StockCountReportInput) {
  const blob = await generatePdfFromHtml(buildStockCountReportHtml(input), input.dir ?? 'rtl')
  const filename = `stock-count_${new Date().toISOString().slice(0, 10)}.pdf`
  const message =
    input.dir === 'ltr'
      ? `Attached is the physical stock count sheet (${input.rows.length} products) for recording actual counts.`
      : `السلام عليكم ورحمة الله،\nمرفق كشف الجرد الفعلي للمخزن (${input.rows.length} صنف) لتسجيل الأعداد الفعلية والفروق.`
  return sharePdfBlobViaWhatsApp({ blob, filename, message })
}
