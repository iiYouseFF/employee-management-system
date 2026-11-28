import { formatNumber } from '@/shared/lib/format'
import { buildUnifiedReportTemplate } from '@/features/reporting/pdfGenerators'
import { printHtml } from '@/shared/lib/pdfShare'

type Direction = 'rtl' | 'ltr'
type Cell = string | number | null | undefined

const money = (value: Cell) => `${formatNumber(Number(value ?? 0))} ج.م`

function esc(value: Cell): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function infoRows(rows: Array<[string, Cell]>): string {
  return `
    <section class="pdf-section">
      <h3 class="pdf-section-title">بيانات المستند</h3>
      <div class="pdf-table-wrap">
        <table class="pdf-table">
          <tbody>${rows
            .map(([label, value]) => `<tr><td>${esc(label)}</td><td class="num">${esc(value ?? '-')}</td></tr>`)
            .join('')}</tbody>
        </table>
      </div>
    </section>`
}

function signatureBlock(): string {
  return `
    <div class="pdf-signatures">
      <span>استلام: ................................</span>
      <span>اعتماد: ................................</span>
    </div>`
}

const DOCUMENT_CSS = `
  .pdf-signatures {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 8px;
    font-size: 10px;
    font-weight: 700;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .wide-table { table-layout: fixed; }
  .wide-table th, .wide-table td { padding: 3px 4px; font-size: 10px; overflow-wrap: anywhere; }
  .wide-table .num { white-space: nowrap; }
  .payroll-table th, .payroll-table td { padding: 1px 2px; font-size: 8px; line-height: 1.2; white-space: normal; }
  .payroll-table .num { white-space: normal; }
  .payroll-table th:nth-child(1) { width: 14%; }
`

export interface CustomerPaymentReceiptInput {
  companyName: string
  date: string
  customerName: string
  repName?: Cell
  invoiceNo?: Cell
  amount: number
  method: string
  dir?: Direction
}

export function buildCustomerPaymentReceiptHtml(input: CustomerPaymentReceiptInput): string {
  const dir = input.dir ?? 'rtl'
  return buildUnifiedReportTemplate({
    companyName: input.companyName,
    docBadge: 'إيصال تحصيل',
    entityTitle: `استلام من: ${input.customerName}`,
    entitySubtitle: input.invoiceNo ? `مرتبط بالفاتورة: ${input.invoiceNo}` : undefined,
    meta: [{ label: 'التاريخ', value: input.date }],
    bodyHtml: `
      <style>${DOCUMENT_CSS}</style>
      ${infoRows([
        ['العميل', input.customerName],
        ['المندوب', input.repName || '-'],
        ['رقم الفاتورة', input.invoiceNo || '-'],
        ['طريقة الدفع', input.method],
        ['المبلغ المحصل', money(input.amount)],
      ])}
      ${signatureBlock()}`,
    footerStamp: 'إيصال تحصيل صادر من النظام',
    dir,
  })
}

export async function printCustomerPaymentReceipt(input: CustomerPaymentReceiptInput): Promise<boolean> {
  return printHtml(
    buildCustomerPaymentReceiptHtml(input),
    `إيصال تحصيل - ${input.customerName}`,
    input.dir ?? 'rtl'
  )
}

export interface SupplierPaymentReceiptInput {
  companyName: string
  date: string
  supplierName: string
  amount: number
  method: string
  reference?: Cell
  notes?: Cell
  dir?: Direction
}

export function buildSupplierPaymentReceiptHtml(input: SupplierPaymentReceiptInput): string {
  const dir = input.dir ?? 'rtl'
  return buildUnifiedReportTemplate({
    companyName: input.companyName,
    docBadge: 'إيصال دفع مورد',
    entityTitle: `دفع إلى: ${input.supplierName}`,
    meta: [{ label: 'التاريخ', value: input.date }],
    bodyHtml: `
      <style>${DOCUMENT_CSS}</style>
      ${infoRows([
        ['المورد', input.supplierName],
        ['طريقة الدفع', input.method],
        ['المرجع', input.reference || '-'],
        ['المبلغ المدفوع', money(input.amount)],
        ['ملاحظات', input.notes || '-'],
      ])}
      ${signatureBlock()}`,
    footerStamp: 'إيصال دفع مورد صادر من النظام',
    dir,
  })
}

export async function printSupplierPaymentReceipt(input: SupplierPaymentReceiptInput): Promise<boolean> {
  return printHtml(
    buildSupplierPaymentReceiptHtml(input),
    `إيصال دفع مورد - ${input.supplierName}`,
    input.dir ?? 'rtl'
  )
}

export interface ExpenseVoucherInput {
  companyName: string
  date: string
  category: string
  amount: number
  description?: Cell
  dir?: Direction
}

export function buildExpenseVoucherHtml(input: ExpenseVoucherInput): string {
  const dir = input.dir ?? 'rtl'
  return buildUnifiedReportTemplate({
    companyName: input.companyName,
    docBadge: 'قسيمة مصروف',
    entityTitle: `نوع المصروف: ${input.category}`,
    meta: [{ label: 'التاريخ', value: input.date }],
    bodyHtml: `
      <style>${DOCUMENT_CSS}</style>
      ${infoRows([
        ['التاريخ', input.date],
        ['النوع', input.category],
        ['الوصف', input.description || '-'],
        ['المبلغ', money(input.amount)],
      ])}
      ${signatureBlock()}`,
    footerStamp: 'قسيمة مصروف صادرة من النظام',
    dir,
  })
}

export async function printExpenseVoucher(input: ExpenseVoucherInput): Promise<boolean> {
  return printHtml(buildExpenseVoucherHtml(input), `قسيمة مصروف - ${input.category}`, input.dir ?? 'rtl')
}

export interface PayrollRegisterRow {
  employeeName: string
  jobTitle?: Cell
  presentDays: number
  absentDays: number
  lateDays: number
  overtimeHours: number
  baseSalary: number
  overtimeTotal: number
  bonusesTotal: number
  deductionsTotal: number
  loanDeduction: number
  netSalary: number
}

export interface PayrollRegisterInput {
  companyName: string
  year: number
  month: number
  rows: PayrollRegisterRow[]
  dir?: Direction
}

export function buildPayrollRegisterHtml(input: PayrollRegisterInput): string {
  const dir = input.dir ?? 'rtl'
  const totals = input.rows.reduce(
    (sum, row) => ({
      presentDays: sum.presentDays + Number(row.presentDays || 0),
      absentDays: sum.absentDays + Number(row.absentDays || 0),
      lateDays: sum.lateDays + Number(row.lateDays || 0),
      overtimeHours: sum.overtimeHours + Number(row.overtimeHours || 0),
      baseSalary: sum.baseSalary + Number(row.baseSalary || 0),
      overtimeTotal: sum.overtimeTotal + Number(row.overtimeTotal || 0),
      bonusesTotal: sum.bonusesTotal + Number(row.bonusesTotal || 0),
      deductionsTotal: sum.deductionsTotal + Number(row.deductionsTotal || 0),
      loanDeduction: sum.loanDeduction + Number(row.loanDeduction || 0),
      netSalary: sum.netSalary + Number(row.netSalary || 0),
    }),
    {
      presentDays: 0, absentDays: 0, lateDays: 0, overtimeHours: 0,
      baseSalary: 0, overtimeTotal: 0, bonusesTotal: 0,
      deductionsTotal: 0, loanDeduction: 0, netSalary: 0,
    }
  )

  const bodyHtml = `
    <style>${DOCUMENT_CSS}</style>
    <section class="pdf-section">
      <h3 class="pdf-section-title">مسير الرواتب</h3>
      <div class="pdf-table-wrap">
        <table class="pdf-table wide-table payroll-table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th class="num">حضور</th>
              <th class="num">غياب</th>
              <th class="num">تأخير</th>
              <th class="num">إضافي</th>
              <th class="num">الأساسي</th>
              <th class="num">الإضافي</th>
              <th class="num">مكافآت</th>
              <th class="num">خصومات</th>
              <th class="num">سُلفة</th>
              <th class="num">الصافي</th>
            </tr>
          </thead>
          <tbody>
            ${input.rows
              .map(
                (row) => `
              <tr>
                <td>${esc(row.employeeName)}${row.jobTitle ? `<div class="pdf-meta-item">${esc(row.jobTitle)}</div>` : ''}</td>
                <td class="num">${esc(formatNumber(row.presentDays))}</td>
                <td class="num">${esc(formatNumber(row.absentDays))}</td>
                <td class="num">${esc(formatNumber(row.lateDays))}</td>
                <td class="num">${esc(formatNumber(row.overtimeHours))}</td>
                <td class="num">${esc(money(row.baseSalary))}</td>
                <td class="num">${esc(money(row.overtimeTotal))}</td>
                <td class="num">${esc(money(row.bonusesTotal))}</td>
                <td class="num">${esc(money(row.deductionsTotal))}</td>
                <td class="num">${esc(money(row.loanDeduction))}</td>
                <td class="num">${esc(money(row.netSalary))}</td>
              </tr>`
              )
              .join('')}
          </tbody>
          <tfoot>
            <tr class="row-total">
              <td>الإجمالي (${input.rows.length} موظف)</td>
              <td class="num">${esc(formatNumber(totals.presentDays))}</td>
              <td class="num">${esc(formatNumber(totals.absentDays))}</td>
              <td class="num">${esc(formatNumber(totals.lateDays))}</td>
              <td class="num">${esc(formatNumber(totals.overtimeHours))}</td>
              <td class="num">${esc(money(totals.baseSalary))}</td>
              <td class="num">${esc(money(totals.overtimeTotal))}</td>
              <td class="num">${esc(money(totals.bonusesTotal))}</td>
              <td class="num">${esc(money(totals.deductionsTotal))}</td>
              <td class="num">${esc(money(totals.loanDeduction))}</td>
              <td class="num">${esc(money(totals.netSalary))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
    ${signatureBlock()}`

  return buildUnifiedReportTemplate({
    companyName: input.companyName,
    docBadge: 'مسير رواتب شهري',
    entityTitle: `رواتب شهر ${input.month}/${input.year}`,
    meta: [
      { label: 'عدد الموظفين', value: String(input.rows.length) },
      { label: 'إجمالي الصافي', value: money(totals.netSalary) },
    ],
    bodyHtml,
    footerStamp: 'مسير رواتب صادر من النظام',
    dir,
  })
}

export async function printPayrollRegister(input: PayrollRegisterInput): Promise<boolean> {
  return printHtml(buildPayrollRegisterHtml(input), `مسير رواتب ${input.month}/${input.year}`, input.dir ?? 'rtl')
}

export interface PrintableColumn {
  label: string
  numeric?: boolean
}

export interface GenericDocumentInput {
  companyName: string
  title: string
  subtitle?: Cell
  columns: PrintableColumn[]
  rows: Cell[][]
  dir?: Direction
}

export function buildGenericDocumentHtml(input: GenericDocumentInput): string {
  const dir = input.dir ?? 'rtl'
  const bodyHtml = `
    <style>${DOCUMENT_CSS}</style>
    <section class="pdf-section">
      <h3 class="pdf-section-title">${esc(input.title)}</h3>
      <div class="pdf-table-wrap">
        <table class="pdf-table wide-table">
          <thead>
            <tr>${input.columns
              .map((column) => `<th${column.numeric ? ' class="num"' : ''}>${esc(column.label)}</th>`)
              .join('')}</tr>
          </thead>
          <tbody>
            ${
              input.rows.length
                ? input.rows
                    .map(
                      (row) =>
                        `<tr>${input.columns
                          .map(
                            (column, index) =>
                              `<td${column.numeric ? ' class="num"' : ''}>${esc(row[index] ?? '-')}</td>`
                          )
                          .join('')}</tr>`
                    )
                    .join('')
                : `<tr><td colspan="${input.columns.length}" class="pdf-empty">لا توجد بيانات</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>`

  return buildUnifiedReportTemplate({
    companyName: input.companyName,
    docBadge: input.title,
    entityTitle: input.title,
    entitySubtitle: input.subtitle == null ? undefined : String(input.subtitle),
    meta: [{ label: 'عدد السجلات', value: String(input.rows.length) }],
    bodyHtml,
    footerStamp: 'مستند صادر من النظام',
    dir,
  })
}

export async function printGenericDocument(input: GenericDocumentInput): Promise<boolean> {
  return printHtml(buildGenericDocumentHtml(input), input.title, input.dir ?? 'rtl')
}
