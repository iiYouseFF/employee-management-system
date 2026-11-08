import { generatePdfFromHtml, sharePdfBlobViaWhatsApp } from './pdfShare'
import { formatNumber } from './format'
import type { StatementRow } from '../hooks/useStatements'
import type { Product } from '../hooks/useProducts'
import type { Report } from './report'

function esc(val: any): string {
  if (val === null || val === undefined) return ''
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const COMMON_STYLES = `
  box-sizing: border-box;
  font-family: 'Tajawal', system-ui, -apple-system, sans-serif;
  color: #1e293b;
  padding: 24px;
  background-color: #ffffff;
  direction: rtl;
`

/**
 * Customer Statement HTML Template & PDF generator
 */
export async function shareCustomerStatementWhatsApp({
  customer,
  statementRows,
  companyName = 'شركة توريد',
  fromDate,
  toDate,
}: {
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
}) {
  const totalDebit = statementRows.reduce((acc, r) => acc + (r.debit || 0), 0)
  const totalCredit = statementRows.reduce((acc, r) => acc + (r.credit || 0), 0)
  const finalBalance = statementRows[statementRows.length - 1]?.balance ?? 0

  const dateRangeLabel = fromDate || toDate
    ? `الفترة: من ${fromDate || 'البداية'} إلى ${toDate || 'اليوم'}`
    : 'الفترة: كشف حساب شامل'

  const rowsHtml = statementRows.map((r) => {
    const isOpening = r.tx_type === 'opening'
    return `
      <tr style="background-color: ${isOpening ? '#fef3c7' : '#ffffff'}; font-weight: ${isOpening ? '700' : '500'}; border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 7px 6px; text-align: center; font-size: 11px; color: #64748b;">${r.row_no === 0 ? 'افتتاحي' : r.row_no}</td>
        <td style="padding: 7px 6px; text-align: center; font-size: 11px; color: #475569; font-family: monospace;">${esc(r.tx_date || '-')}</td>
        <td style="padding: 7px 8px; text-align: right; font-size: 12px; color: #1e293b;">${esc(r.description)}</td>
        <td style="padding: 7px 6px; text-align: center; font-size: 11px; color: #64748b; font-family: monospace;">${esc(r.ref || '-')}</td>
        <td style="padding: 7px 6px; text-align: center; font-size: 12px; color: #1d4ed8; font-weight: 700;">${r.debit !== null ? formatNumber(r.debit) : '-'}</td>
        <td style="padding: 7px 6px; text-align: center; font-size: 12px; color: #047857; font-weight: 700;">${r.credit !== null ? formatNumber(r.credit) : '-'}</td>
        <td style="padding: 7px 6px; text-align: center; font-size: 12px; color: #0f172a; font-weight: 800;">${formatNumber(r.balance)} ج.م</td>
      </tr>
    `
  }).join('')

  const html = `
    <div style="${COMMON_STYLES}">
      <!-- Header Banner -->
      <div style="background: linear-gradient(135deg, #1e3a8a, #0f172a); color: #ffffff; padding: 18px 22px; border-radius: 12px; text-align: center; margin-bottom: 18px;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 800;">${esc(companyName)}</h1>
        <div style="margin-top: 4px; font-size: 14px; opacity: 0.9; font-weight: 600;">كشف حساب عميل تفصيلي (تراكمي)</div>
      </div>

      <!-- Info Card -->
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px 18px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
        <div>
          <div style="font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">العميل: ${esc(customer.name)}</div>
          <div style="color: #64748b;">المندوب المخصص: <b style="color: #334155;">${esc(customer.representative_name || '-')}</b></div>
        </div>
        <div style="text-align: left;">
          <div style="color: #334155; margin-bottom: 4px;">رقم الهاتف: <b style="font-family: monospace; color: #0f172a;">${esc(customer.phone || 'غير مسجل')}</b></div>
          <div style="color: #64748b; font-weight: 600;">${esc(dateRangeLabel)}</div>
        </div>
      </div>

      <!-- Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 11px;">
        <thead>
          <tr style="background-color: #1e3a8a; color: #ffffff; font-weight: 700;">
            <th style="padding: 9px 6px; text-align: center; width: 45px;">#</th>
            <th style="padding: 9px 6px; text-align: center; width: 85px;">التاريخ</th>
            <th style="padding: 9px 8px; text-align: right;">البيان والتفاصيل</th>
            <th style="padding: 9px 6px; text-align: center; width: 75px;">المرجع</th>
            <th style="padding: 9px 6px; text-align: center; width: 85px;">مدين (+)</th>
            <th style="padding: 9px 6px; text-align: center; width: 85px;">دائن (-)</th>
            <th style="padding: 9px 6px; text-align: center; width: 110px;">الرصيد التراكمي</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr style="background-color: #e2e8f0; font-weight: 800; border-top: 2px solid #0f172a;">
            <td colspan="4" style="padding: 9px 8px; text-align: center; font-size: 12px; color: #1e293b;">الإجمالي والرصيد الختامي</td>
            <td style="padding: 9px 6px; text-align: center; font-size: 12px; color: #1d4ed8;">${formatNumber(totalDebit)}</td>
            <td style="padding: 9px 6px; text-align: center; font-size: 12px; color: #047857;">${formatNumber(totalCredit)}</td>
            <td style="padding: 9px 6px; text-align: center; font-size: 13px; color: #0f172a;">${formatNumber(finalBalance)} ج.م</td>
          </tr>
        </tfoot>
      </table>

      <!-- Footer Notes -->
      <div style="border-top: 1px dashed #cbd5e1; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b;">
        <span>تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-EG')}</span>
        <span>شكراً لتعاملكم معنا - نعتز بخدمتكم دائماً</span>
      </div>
    </div>
  `

  const blob = await generatePdfFromHtml(html)
  const filename = `كشف_حساب_${customer.name}_${new Date().toISOString().slice(0, 10)}.pdf`
  const message = `السلام عليكم ورحمة الله،\nمرفق كشف الحساب التراكمي للعميل: ${customer.name}\nالرصيد الحالي: ${formatNumber(finalBalance)} ج.م\nشكراً لتعاملكم معنا.`

  return await sharePdfBlobViaWhatsApp({
    blob,
    filename,
    recipientPhone: customer.phone,
    message,
  })
}

/**
 * Supplier Statement HTML Template & PDF generator
 */
export async function shareSupplierStatementWhatsApp({
  supplier,
  statementRows,
  companyName = 'شركة توريد',
  fromDate,
  toDate,
}: {
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
}) {
  const totalDebit = statementRows.reduce((acc, r) => acc + (r.debit || 0), 0)
  const totalCredit = statementRows.reduce((acc, r) => acc + (r.credit || 0), 0)
  const finalBalance = statementRows[statementRows.length - 1]?.balance ?? 0

  const dateRangeLabel = fromDate || toDate
    ? `الفترة: من ${fromDate || 'البداية'} إلى ${toDate || 'اليوم'}`
    : 'الفترة: كشف حساب شامل'

  const rowsHtml = statementRows.map((r) => {
    const isOpening = r.tx_type === 'opening'
    return `
      <tr style="background-color: ${isOpening ? '#fef3c7' : '#ffffff'}; font-weight: ${isOpening ? '700' : '500'}; border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 7px 6px; text-align: center; font-size: 11px; color: #64748b;">${r.row_no === 0 ? 'افتتاحي' : r.row_no}</td>
        <td style="padding: 7px 6px; text-align: center; font-size: 11px; color: #475569; font-family: monospace;">${esc(r.tx_date || '-')}</td>
        <td style="padding: 7px 8px; text-align: right; font-size: 12px; color: #1e293b;">${esc(r.description)}</td>
        <td style="padding: 7px 6px; text-align: center; font-size: 11px; color: #64748b; font-family: monospace;">${esc(r.ref || '-')}</td>
        <td style="padding: 7px 6px; text-align: center; font-size: 12px; color: #1d4ed8; font-weight: 700;">${r.debit !== null ? formatNumber(r.debit) : '-'}</td>
        <td style="padding: 7px 6px; text-align: center; font-size: 12px; color: #047857; font-weight: 700;">${r.credit !== null ? formatNumber(r.credit) : '-'}</td>
        <td style="padding: 7px 6px; text-align: center; font-size: 12px; color: #0f172a; font-weight: 800;">${formatNumber(r.balance)} ج.م</td>
      </tr>
    `
  }).join('')

  const html = `
    <div style="${COMMON_STYLES}">
      <!-- Header Banner -->
      <div style="background: linear-gradient(135deg, #1e3a8a, #0f172a); color: #ffffff; padding: 18px 22px; border-radius: 12px; text-align: center; margin-bottom: 18px;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 800;">${esc(companyName)}</h1>
        <div style="margin-top: 4px; font-size: 14px; opacity: 0.9; font-weight: 600;">كشف حساب مورد تفصيلي (تراكمي)</div>
      </div>

      <!-- Info Card -->
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px 18px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
        <div>
          <div style="font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">المورد: ${esc(supplier.name)}</div>
          <div style="color: #64748b;">رصيد أول المدة: <b style="color: #334155;">${formatNumber(supplier.opening_balance || 0)} ج.م</b></div>
        </div>
        <div style="text-align: left;">
          <div style="color: #334155; margin-bottom: 4px;">رقم الهاتف: <b style="font-family: monospace; color: #0f172a;">${esc(supplier.phone || 'غير مسجل')}</b></div>
          <div style="color: #64748b; font-weight: 600;">${esc(dateRangeLabel)}</div>
        </div>
      </div>

      <!-- Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 11px;">
        <thead>
          <tr style="background-color: #1e3a8a; color: #ffffff; font-weight: 700;">
            <th style="padding: 9px 6px; text-align: center; width: 45px;">#</th>
            <th style="padding: 9px 6px; text-align: center; width: 85px;">التاريخ</th>
            <th style="padding: 9px 8px; text-align: right;">البيان والتفاصيل</th>
            <th style="padding: 9px 6px; text-align: center; width: 75px;">المرجع</th>
            <th style="padding: 9px 6px; text-align: center; width: 85px;">مدين (+) سداد</th>
            <th style="padding: 9px 6px; text-align: center; width: 85px;">دائن (-) شراء</th>
            <th style="padding: 9px 6px; text-align: center; width: 110px;">المستحق للمورد</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr style="background-color: #e2e8f0; font-weight: 800; border-top: 2px solid #0f172a;">
            <td colspan="4" style="padding: 9px 8px; text-align: center; font-size: 12px; color: #1e293b;">الإجمالي والرصيد المستحق للمورد</td>
            <td style="padding: 9px 6px; text-align: center; font-size: 12px; color: #1d4ed8;">${formatNumber(totalDebit)}</td>
            <td style="padding: 9px 6px; text-align: center; font-size: 12px; color: #047857;">${formatNumber(totalCredit)}</td>
            <td style="padding: 9px 6px; text-align: center; font-size: 13px; color: #0f172a;">${formatNumber(finalBalance)} ج.م</td>
          </tr>
        </tfoot>
      </table>

      <!-- Footer Notes -->
      <div style="border-top: 1px dashed #cbd5e1; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b;">
        <span>تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-EG')}</span>
        <span>كشف حساب مالي صادر من نظام الإدارة المالية</span>
      </div>
    </div>
  `

  const blob = await generatePdfFromHtml(html)
  const filename = `كشف_حساب_مورد_${supplier.name}_${new Date().toISOString().slice(0, 10)}.pdf`
  const message = `السلام عليكم ورحمة الله،\nمرفق كشف حساب للمورد: ${supplier.name}\nالمتبقي المستحق: ${formatNumber(finalBalance)} ج.م.`

  return await sharePdfBlobViaWhatsApp({
    blob,
    filename,
    recipientPhone: supplier.phone,
    message,
  })
}

/**
 * Product Price List / Catalog HTML Template & PDF generator
 */
export async function shareProductCatalogWhatsApp({
  products,
  categoryFilter = 'all',
  companyName = 'شركة توريد',
}: {
  products: Product[]
  categoryFilter?: string
  companyName?: string
}) {
  const catLabel = categoryFilter === 'all' ? 'جميع التصنيفات' : categoryFilter

  const rowsHtml = products.map((p, idx) => `
    <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 8px 6px; text-align: center; font-size: 11px; color: #64748b;">${idx + 1}</td>
      <td style="padding: 8px 10px; text-align: right; font-size: 13px; font-weight: 700; color: #0f172a;">${esc(p.name_ar)}</td>
      <td style="padding: 8px 8px; text-align: left; font-size: 11px; color: #64748b; font-family: sans-serif;">${esc(p.name_en || '-')}</td>
      <td style="padding: 8px 6px; text-align: center; font-size: 11px; color: #475569; font-family: monospace;">${esc(p.sku || '-')}</td>
      <td style="padding: 8px 6px; text-align: center; font-size: 12px; color: #334155;">${esc(p.category || '-')}</td>
      <td style="padding: 8px 6px; text-align: center; font-size: 12px; color: #475569;">${esc(p.unit || 'قطعة')}</td>
      <td style="padding: 8px 10px; text-align: center; font-size: 14px; font-weight: 800; color: #1e3a8a;">${formatNumber(p.price)} ج.م</td>
    </tr>
  `).join('')

  const html = `
    <div style="${COMMON_STYLES}">
      <!-- Header Banner -->
      <div style="background: linear-gradient(135deg, #1e3a8a, #0f172a); color: #ffffff; padding: 18px 22px; border-radius: 12px; text-align: center; margin-bottom: 18px;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 800;">${esc(companyName)}</h1>
        <div style="margin-top: 4px; font-size: 14px; opacity: 0.9; font-weight: 600;">كتالوج وقائمة الأسعار المعتمدة</div>
      </div>

      <!-- Info Bar -->
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px 18px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
        <div style="color: #0f172a; font-weight: 700;">التصنيف المختار: <span style="color: #1e3a8a;">${esc(catLabel)}</span></div>
        <div style="color: #64748b;">إجمالي عدد الأصناف: <b style="color: #0f172a;">${products.length} صنف</b></div>
      </div>

      <!-- Products Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 12px;">
        <thead>
          <tr style="background-color: #1e3a8a; color: #ffffff; font-weight: 700;">
            <th style="padding: 9px 6px; text-align: center; width: 40px;">#</th>
            <th style="padding: 9px 10px; text-align: right;">اسم الصنف</th>
            <th style="padding: 9px 8px; text-align: left; width: 120px;">English Name</th>
            <th style="padding: 9px 6px; text-align: center; width: 90px;">كود الصنف (SKU)</th>
            <th style="padding: 9px 6px; text-align: center; width: 90px;">التصنيف</th>
            <th style="padding: 9px 6px; text-align: center; width: 70px;">الوحدة</th>
            <th style="padding: 9px 10px; text-align: center; width: 110px;">السعر المعتمد</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <!-- Footer Notes -->
      <div style="border-top: 1px dashed #cbd5e1; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b;">
        <span>تاريخ الإصدار: ${new Date().toLocaleDateString('ar-EG')}</span>
        <span>الأسعار شاملة الضريبة وفق اللائحة المعتمدة</span>
      </div>
    </div>
  `

  const blob = await generatePdfFromHtml(html)
  const filename = `قائمة_الأسعار_${new Date().toISOString().slice(0, 10)}.pdf`
  const message = `السلام عليكم ورحمة الله،\nمرفق قائمة الأسعار والكتالوج المعتمد لمنتجات ${companyName}.`

  return await sharePdfBlobViaWhatsApp({
    blob,
    filename,
    message,
  })
}

/**
 * General Financial Reports HTML Template & PDF generator
 */
export async function shareGeneralReportWhatsApp({
  report,
  companyName = 'شركة توريد',
}: {
  report: Report
  companyName?: string
}) {
  const sectionsHtml = report.sections.map((section) => {
    const headHtml = section.columns.map((c) => `<th style="padding: 8px 6px; text-align: center; border: 1px solid #cbd5e1;">${esc(c)}</th>`).join('')

    const bodyHtml = section.rows.map((row, idx) => {
      const cellsHtml = row.map((cell) => {
        let val = ''
        if (typeof cell === 'object' && cell !== null) {
          if ('date' in cell) val = cell.date || '-'
          else if ('money' in cell) val = `${formatNumber(cell.money)} ج.م`
        } else if (typeof cell === 'number') {
          val = formatNumber(cell)
        } else {
          val = esc(cell)
        }
        return `<td style="padding: 7px 6px; text-align: center; border: 1px solid #e2e8f0;">${val}</td>`
      }).join('')

      return `<tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">${cellsHtml}</tr>`
    }).join('')

    let footHtml = ''
    if (section.totals) {
      const footCells = section.totals.map((cell) => {
        let val = ''
        if (typeof cell === 'object' && cell !== null) {
          if ('date' in cell) val = cell.date || '-'
          else if ('money' in cell) val = `${formatNumber(cell.money)} ج.م`
        } else if (typeof cell === 'number') {
          val = formatNumber(cell)
        } else {
          val = esc(cell)
        }
        return `<td style="padding: 8px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: 800;">${val}</td>`
      }).join('')
      footHtml = `<tr style="background-color: #e2e8f0;">${footCells}</tr>`
    }

    return `
      <div style="margin-bottom: 20px;">
        <h3 style="margin: 0 0 8px; font-size: 14px; font-weight: 800; color: #1e3a8a; background-color: #e0f2fe; padding: 6px 12px; border-radius: 6px;">${esc(section.title)}</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background-color: #1e3a8a; color: #ffffff;">
              ${headHtml}
            </tr>
          </thead>
          <tbody>
            ${bodyHtml}
          </tbody>
          ${footHtml ? `<tfoot>${footHtml}</tfoot>` : ''}
        </table>
      </div>
    `
  }).join('')

  const html = `
    <div style="${COMMON_STYLES}">
      <!-- Header Banner -->
      <div style="background: linear-gradient(135deg, #1e3a8a, #0f172a); color: #ffffff; padding: 18px 22px; border-radius: 12px; text-align: center; margin-bottom: 18px;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 800;">${esc(companyName)}</h1>
        <div style="margin-top: 4px; font-size: 14px; opacity: 0.9; font-weight: 600;">${esc(report.title)}</div>
        ${report.subtitle ? `<div style="font-size: 12px; opacity: 0.8; margin-top: 2px;">${esc(report.subtitle)}</div>` : ''}
      </div>

      <!-- Filters Summary -->
      ${report.filters && report.filters.length > 0 ? `
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 14px; margin-bottom: 16px; font-size: 11px; color: #475569; text-align: center;">
          ${report.filters.map(esc).join(' • ')}
        </div>
      ` : ''}

      <!-- Sections -->
      ${sectionsHtml}

      <!-- Footer Notes -->
      <div style="border-top: 1px dashed #cbd5e1; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b;">
        <span>تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')}</span>
        <span>تقرير مالي صادر من نظام الإدارة</span>
      </div>
    </div>
  `

  const blob = await generatePdfFromHtml(html)
  const filename = `${report.title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`
  const message = `السلام عليكم ورحمة الله،\nمرفق تقرير: ${report.title}`

  return await sharePdfBlobViaWhatsApp({
    blob,
    filename,
    message,
  })
}
