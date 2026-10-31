import { formatNumber, monthNames } from './format'

export type Cell = string | number | { date: string | null } | { money: number }

export type ReportSection = {
  key: string
  title: string
  columns: string[]
  rows: Cell[][]
  totals?: Cell[]
}

export type ReportConfig = {
  sections: string[]
  customerId: string
  repId: string
  from: string
  to: string
  company?: string
}

export type ReportData = {
  cashInvoices: any[]
  creditInvoices: any[]
  payments: any[]
  customers: any[]
  reps: any[]
}

export type Report = {
  title: string
  subtitle: string
  filters: string[]
  sections: ReportSection[]
}

export const REPORT_SECTIONS = [
  { key: 'cash', title: 'البيع النقدي' },
  { key: 'credit', title: 'البيع الآجل' },
  { key: 'payments', title: 'الدفعات' },
  { key: 'statement', title: 'كشف حساب العملاء' },
  { key: 'monthly', title: 'الملخص الشهري' },
  { key: 'customers', title: 'العملاء' },
]

const dayOf = (value?: string | null) => (value ? String(value).slice(0, 10) : '')

const num = (value: any) => {
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const formatDay = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('ar-EG') : ''

const inRange = (value: string | null | undefined, from: string, to: string) => {
  const day = dayOf(value)
  if (!day) return !from && !to
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

export function buildReport(config: ReportConfig, data: ReportData): Report {
  const customerById = new Map<string, any>(
    data.customers.map((c: any): [string, any] => [c.id, c])
  )

  const repName = (id?: string | null) =>
    data.reps.find((r: any) => r.id === id)?.name || '-'
  const customerName = (id?: string | null) => customerById.get(id || '')?.name || '-'

  const matches = (row: any) =>
    (!config.customerId || row.customer_id === config.customerId) &&
    (!config.repId || row.rep_id === config.repId) &&
    inRange(row.date, config.from, config.to)

  const cash = data.cashInvoices.filter(matches)
  const credit = data.creditInvoices.filter(matches)
  const payments = data.payments.filter(matches)

  const sections: ReportSection[] = []

  if (config.sections.includes('cash')) {
    const total = cash.reduce((sum, row) => sum + num(row.amount), 0)
    sections.push({
      key: 'cash',
      title: 'البيع النقدي',
      columns: ['#', 'التاريخ', 'رقم الفاتورة', 'العميل', 'المندوب', 'بيان الأصناف', 'ملاحظات', 'المبلغ'],
      rows: cash.map((row, idx) => [
        idx + 1,
        { date: row.date },
        row.invoice_no || '-',
        customerName(row.customer_id),
        repName(row.rep_id),
        row.item || '-',
        row.notes || '-',
        { money: num(row.amount) },
      ]),
      totals: ['', '', '', '', '', '', 'الإجمالي', { money: total }],
    })
  }

  if (config.sections.includes('credit')) {
    const total = credit.reduce((sum, row) => sum + num(row.amount), 0)
    const paid = credit.reduce((sum, row) => sum + num(row.paid) + num(row.linked_payments), 0)
    const remaining = credit.reduce((sum, row) => sum + num(row.remaining), 0)
    sections.push({
      key: 'credit',
      title: 'البيع الآجل',
      columns: [
        '#', 'التاريخ', 'رقم الفاتورة', 'العميل', 'المندوب', 'بيان الأصناف',
        'قيمة الفاتورة', 'تاريخ الاستحقاق', 'مدفوع', 'المتبقي', 'الحالة',
      ],
      rows: credit.map((row, idx) => [
        idx + 1,
        { date: row.date },
        row.invoice_no || '-',
        customerName(row.customer_id),
        repName(row.rep_id),
        row.item || '-',
        { money: num(row.amount) },
        { date: row.due_date },
        { money: num(row.paid) + num(row.linked_payments) },
        { money: num(row.remaining) },
        num(row.remaining) <= 0
          ? 'مسدد'
          : num(row.paid) + num(row.linked_payments) > 0
            ? 'جزئي'
            : 'غير مسدد',
      ]),
      totals: ['', '', '', '', '', 'الإجمالي', { money: total }, '', { money: paid }, { money: remaining }, ''],
    })
  }

  if (config.sections.includes('payments')) {
    const total = payments.reduce((sum, row) => sum + num(row.amount), 0)
    sections.push({
      key: 'payments',
      title: 'الدفعات',
      columns: ['#', 'التاريخ', 'العميل', 'المندوب', 'رقم فاتورة الآجل', 'المبلغ', 'طريقة الدفع'],
      rows: payments.map((row, idx) => [
        idx + 1,
        { date: row.date },
        customerName(row.customer_id),
        repName(row.rep_id),
        row.credit_invoices?.invoice_no || '-',
        { money: num(row.amount) },
        row.method || '-',
      ]),
      totals: ['', '', '', '', 'الإجمالي', { money: total }, ''],
    })
  }

  if (config.sections.includes('statement')) {
    const totalsByCustomer = new Map<string, { cash: number; credit: number; paid: number; reps: Set<string> }>()

    const touch = (customerId?: string | null) => {
      if (!customerId) return null
      let entry = totalsByCustomer.get(customerId)
      if (!entry) {
        entry = { cash: 0, credit: 0, paid: 0, reps: new Set<string>() }
        totalsByCustomer.set(customerId, entry)
      }
      return entry
    }

    cash.forEach((row) => {
      const entry = touch(row.customer_id)
      if (!entry) return
      entry.cash += num(row.amount)
      const name = data.reps.find((r: any) => r.id === row.rep_id)?.name
      if (name) entry.reps.add(name)
    })
    credit.forEach((row) => {
      const entry = touch(row.customer_id)
      if (!entry) return
      entry.credit += num(row.amount)
      entry.paid += num(row.paid)
      const name = data.reps.find((r: any) => r.id === row.rep_id)?.name
      if (name) entry.reps.add(name)
    })
    payments.forEach((row) => {
      const entry = touch(row.customer_id)
      if (!entry) return
      entry.paid += num(row.amount)
      const name = data.reps.find((r: any) => r.id === row.rep_id)?.name
      if (name) entry.reps.add(name)
    })

    if (config.customerId && !totalsByCustomer.has(config.customerId)) {
      totalsByCustomer.set(config.customerId, { cash: 0, credit: 0, paid: 0, reps: new Set<string>() })
    }

    const statementRows = Array.from(totalsByCustomer.entries())
      .filter(([, entry]) =>
        entry.cash !== 0 || entry.credit !== 0 || entry.paid !== 0 || !!config.customerId
      )
      .sort((a, b) => customerName(a[0]).localeCompare(customerName(b[0]), 'ar'))
      .map(([customerId, entry]) => {
        const customer = customerById.get(customerId)
        return {
          name: customer?.name || customerName(customerId),
          phone: customer?.phone || '-',
          cash: entry.cash,
          credit: entry.credit,
          paid: entry.paid,
          remaining: entry.credit - entry.paid,
          reps: Array.from(entry.reps).join('، ') || '-',
        }
      })

    const sum = (key: 'cash' | 'credit' | 'paid' | 'remaining') =>
      statementRows.reduce((acc, row) => acc + row[key], 0)

    sections.push({
      key: 'statement',
      title: 'كشف حساب العملاء',
      columns: ['العميل', 'الهاتف', 'نقدي', 'آجل', 'مدفوع', 'المتبقي', 'المناديب'],
      rows: statementRows.map((row) => [
        row.name,
        row.phone,
        { money: row.cash },
        { money: row.credit },
        { money: row.paid },
        { money: row.remaining },
        row.reps,
      ]),
      totals: [
        'الإجمالي', '', { money: sum('cash') }, { money: sum('credit') },
        { money: sum('paid') }, { money: sum('remaining') }, '',
      ],
    })
  }

  if (config.sections.includes('monthly')) {
    const monthKeys = new Set<string>()
    ;[...cash, ...credit, ...payments].forEach((row) => {
      const day = dayOf(row.date)
      if (day.length >= 7) monthKeys.add(day.slice(0, 7))
    })

    let carried = 0
    const monthlyRows = Array.from(monthKeys)
      .sort()
      .map((key) => {
        const [year, month] = key.split('-')
        const inMonth = (row: any) => dayOf(row.date).slice(0, 7) === key
        const cashM = cash.filter(inMonth).reduce((sum, row) => sum + num(row.amount), 0)
        const creditRows = credit.filter(inMonth)
        const creditM = creditRows.reduce((sum, row) => sum + num(row.amount), 0)
        const paidM = creditRows.reduce((sum, row) => sum + num(row.paid), 0)
        const payM = payments.filter(inMonth).reduce((sum, row) => sum + num(row.amount), 0)
        const collections = payM + paidM
        const remainM = creditM - collections
        carried += remainM
        return {
          label: `${monthNames[parseInt(month, 10) - 1] || month} ${year}`,
          cashM,
          creditM,
          collections,
          totalSales: cashM + creditM,
          remainM,
          carried,
          invoiceCount: cash.filter(inMonth).length + creditRows.length,
        }
      })

    const sum = (key: 'cashM' | 'creditM' | 'collections' | 'totalSales' | 'remainM' | 'invoiceCount') =>
      monthlyRows.reduce((acc, row) => acc + row[key], 0)

    sections.push({
      key: 'monthly',
      title: 'الملخص الشهري',
      columns: [
        'الشهر', 'نقدي', 'آجل', 'تحصيلات', 'إجمالي المبيعات',
        'متبقي الشهر', 'المتبقي التراكمي', 'عدد الفواتير',
      ],
      rows: monthlyRows.map((row) => [
        row.label,
        { money: row.cashM },
        { money: row.creditM },
        { money: row.collections },
        { money: row.totalSales },
        { money: row.remainM },
        { money: row.carried },
        row.invoiceCount,
      ]),
      totals: [
        'الإجمالي',
        { money: sum('cashM') },
        { money: sum('creditM') },
        { money: sum('collections') },
        { money: sum('totalSales') },
        { money: sum('remainM') },
        '',
        sum('invoiceCount'),
      ],
    })
  }

  if (config.sections.includes('customers')) {
    const rows = data.customers.filter(
      (customer: any) =>
        (!config.customerId || customer.id === config.customerId) &&
        (!config.repId || customer.representative_id === config.repId) &&
        inRange(customer.created_at, config.from, config.to)
    )

    sections.push({
      key: 'customers',
      title: 'العملاء',
      columns: ['#', 'اسم العميل', 'رقم الهاتف', 'المندوب', 'تاريخ الإضافة'],
      rows: rows.map((customer: any, idx) => [
        idx + 1,
        customer.name,
        customer.phone || '-',
        repName(customer.representative_id) !== '-'
          ? repName(customer.representative_id)
          : customer.representative_name || '-',
        { date: customer.created_at },
      ]),
    })
  }

  const subtitle = REPORT_SECTIONS.filter((section) =>
    config.sections.includes(section.key)
  )
    .map((section) => section.title)
    .join(' • ')

  const filters: string[] = []
  if (config.customerId) filters.push(`العميل: ${customerName(config.customerId)}`)
  if (config.repId) filters.push(`المندوب: ${repName(config.repId)}`)
  if (config.from && config.to) {
    filters.push(`الفترة: من ${formatDay(config.from)} إلى ${formatDay(config.to)}`)
  } else if (config.from) {
    filters.push(`الفترة: من ${formatDay(config.from)}`)
  } else if (config.to) {
    filters.push(`الفترة: حتى ${formatDay(config.to)}`)
  }
  if (!filters.length) filters.push('كل البيانات')

  return { title: 'تقرير', subtitle, filters, sections }
}

export function esc(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cellText(cell: Cell, csv: boolean): string {
  if (typeof cell === 'number') return csv ? String(cell) : formatNumber(cell)
  if (typeof cell === 'string') return cell
  if ('money' in cell) {
    return csv ? String(cell.money) : `${formatNumber(cell.money)} جنيه`
  }
  return csv ? dayOf(cell.date) : formatDay(cell.date) || '-'
}

function sectionTable(section: ReportSection): string {
  if (!section.rows.length) {
    return `<section><h2>${esc(section.title)}</h2><p class="empty">لا توجد بيانات</p></section>`
  }

  const head = section.columns.map((column) => `<th>${esc(column)}</th>`).join('')
  const body = section.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${esc(cellText(cell, false))}</td>`).join('')}</tr>`)
    .join('')
  const foot = section.totals
    ? `<tfoot><tr>${section.totals.map((cell) => `<td>${esc(cellText(cell, false))}</td>`).join('')}</tr></tfoot>`
    : ''

  return `<section><h2>${esc(section.title)}</h2><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></section>`
}

export function printReport(report: Report, company?: string): boolean {
  const win = window.open('', '_blank', 'width=1100,height=800')
  if (!win) return false

  const html = `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>${esc(report.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; font-family: "Tajawal", system-ui, -apple-system, "Segoe UI", sans-serif; }
  body { margin: 0; color: #111827; }
  header { border-bottom: 3px solid #1F4E79; padding-bottom: 8px; margin-bottom: 14px; text-align: center; }
  h1 { margin: 0 0 2px; font-size: 20px; color: #1F4E79; }
  .company { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
  .subtitle { font-size: 12px; color: #374151; }
  .filters { font-size: 11px; color: #4b5563; margin-bottom: 14px; text-align: center; }
  section { margin-bottom: 16px; }
  h2 { font-size: 13px; color: #1F4E79; background: #e6eef6; padding: 5px 8px; border-radius: 4px; margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border: 1px solid #dbe6f0; padding: 4px 6px; text-align: center; }
  th { background: #1F4E79; color: #ffffff; font-weight: 700; }
  tbody tr:nth-child(even) { background: #f6f9fc; }
  tfoot td { background: #e6eef6; font-weight: 800; }
  .empty { font-size: 11px; color: #6b7280; margin: 0; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
</style>
</head>
<body>
  <header>
    ${company ? `<div class="company">${esc(company)}</div>` : ''}
    <h1>${esc(report.title)}</h1>
    ${report.subtitle ? `<div class="subtitle">${esc(report.subtitle)}</div>` : ''}
  </header>
  <div class="filters">${report.filters.map(esc).join(' • ')}</div>
  ${report.sections.map(sectionTable).join('')}
</body>
</html>`

  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
  return true
}

export function exportReportCsv(report: Report, filename: string, company?: string) {
  const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`
  const lines: string[] = []
  const push = (values: string[]) => lines.push(values.map(csvCell).join(','))

  if (company) push([company])
  push([report.title])
  if (report.subtitle) push([report.subtitle])
  push([report.filters.join(' • ')])
  lines.push('')

  report.sections.forEach((section) => {
    push([section.title])
    push(section.columns)
    section.rows.forEach((row) => push(row.map((cell) => cellText(cell, true))))
    if (section.totals) push(section.totals.map((cell) => cellText(cell, true)))
    lines.push('')
  })

  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
