import autoTable from 'jspdf-autotable'
import { createArabicPdf, shapeArabic, sharePdfViaWhatsApp } from './pdfShare'
import { formatNumber } from './format'
import type { StatementRow } from '../hooks/useStatements'
import type { Product } from '../hooks/useProducts'
import type { Report } from './report'

/**
 * Generate and share a Customer Cumulative Statement PDF via WhatsApp.
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
  const doc = await createArabicPdf('p')
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header background banner
  doc.setFillColor(31, 78, 121)
  doc.rect(0, 0, pageWidth, 28, 'F')

  // Header title
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.text(shapeArabic(doc, companyName), pageWidth / 2, 11, { align: 'center' })
  doc.setFontSize(11)
  doc.text(shapeArabic(doc, `كشف حساب عميل تفصيلي (تراكمي)`), pageWidth / 2, 20, { align: 'center' })

  // Customer & Meta Info Card
  doc.setTextColor(40, 40, 40)
  doc.setFontSize(10)

  const dateRangeLabel = fromDate || toDate
    ? `الفترة: من ${fromDate || 'البداية'} إلى ${toDate || 'اليوم'}`
    : 'الفترة: كشف حساب شامل'

  doc.text(shapeArabic(doc, `العميل: ${customer.name}`), pageWidth - 14, 36, { align: 'right' })
  doc.text(shapeArabic(doc, `المندوب: ${customer.representative_name || '-'}`), pageWidth - 14, 43, { align: 'right' })

  doc.text(shapeArabic(doc, `رقم الهاتف: ${customer.phone || 'غير مسجل'}`), 14, 36, { align: 'left' })
  doc.text(shapeArabic(doc, dateRangeLabel), 14, 43, { align: 'left' })

  // Prepare table data (Columns ordered right-to-left: #, التاريخ, البيان, المرجع, مدين, دائن, الرصيد)
  const head = [[
    shapeArabic(doc, 'الرصيد التراكمي'),
    shapeArabic(doc, 'دائن (-)'),
    shapeArabic(doc, 'مدين (+)'),
    shapeArabic(doc, 'المرجع'),
    shapeArabic(doc, 'البيان والتفاصيل'),
    shapeArabic(doc, 'التاريخ'),
    shapeArabic(doc, '#'),
  ]]

  const body = statementRows.map((r) => [
    `${formatNumber(r.balance)} ج.م`,
    r.credit !== null ? formatNumber(r.credit) : '-',
    r.debit !== null ? formatNumber(r.debit) : '-',
    r.ref ? String(r.ref) : '-',
    shapeArabic(doc, r.description),
    r.tx_date || '-',
    r.row_no === 0 ? shapeArabic(doc, 'رصيد سابق') : String(r.row_no),
  ])

  // Calculate totals
  const totalDebit = statementRows.reduce((acc, r) => acc + (r.debit || 0), 0)
  const totalCredit = statementRows.reduce((acc, r) => acc + (r.credit || 0), 0)
  const finalBalance = statementRows[statementRows.length - 1]?.balance ?? 0

  const foot = [[
    `${formatNumber(finalBalance)} ج.م`,
    formatNumber(totalCredit),
    formatNumber(totalDebit),
    '',
    shapeArabic(doc, 'الإجمالي والرصيد الختامي'),
    '',
    '',
  ]]

  autoTable(doc, {
    startY: 48,
    head,
    body,
    foot,
    styles: {
      font: 'Amiri',
      fontSize: 9,
      cellPadding: 2.5,
      halign: 'center',
    },
    headStyles: {
      font: 'Amiri',
      fillColor: [31, 78, 121],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    footStyles: {
      font: 'Amiri',
      fillColor: [230, 238, 246],
      textColor: [31, 78, 121],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold' },
      4: { halign: 'right' },
    },
    theme: 'grid',
    margin: { left: 12, right: 12, top: 48, bottom: 20 },
  })

  // Add footer to all pages
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(130, 130, 130)
    doc.text(
      shapeArabic(doc, `صفحة ${i} من ${totalPages}`),
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    )
    doc.text(
      shapeArabic(doc, `تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-EG')}`),
      14,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'left' }
    )
  }

  const filename = `كشف_حساب_${customer.name}_${new Date().toISOString().slice(0, 10)}.pdf`
  const message = `السلام عليكم ورحمة الله،\nمرفق كشف الحساب التراكمي للعميل: ${customer.name}\nالرصيد الحالي: ${formatNumber(finalBalance)} ج.م\nشكراً لتعاملكم معنا.`

  return await sharePdfViaWhatsApp({
    doc,
    filename,
    recipientPhone: customer.phone,
    message,
  })
}

/**
 * Generate and share a Supplier Cumulative Statement PDF via WhatsApp.
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
  const doc = await createArabicPdf('p')
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header background banner
  doc.setFillColor(31, 78, 121)
  doc.rect(0, 0, pageWidth, 28, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.text(shapeArabic(doc, companyName), pageWidth / 2, 11, { align: 'center' })
  doc.setFontSize(11)
  doc.text(shapeArabic(doc, `كشف حساب مورد تفصيلي (تراكمي)`), pageWidth / 2, 20, { align: 'center' })

  doc.setTextColor(40, 40, 40)
  doc.setFontSize(10)

  const dateRangeLabel = fromDate || toDate
    ? `الفترة: من ${fromDate || 'البداية'} إلى ${toDate || 'اليوم'}`
    : 'الفترة: كشف حساب شامل'

  doc.text(shapeArabic(doc, `المورد: ${supplier.name}`), pageWidth - 14, 36, { align: 'right' })
  doc.text(shapeArabic(doc, `رصيد أول المدة: ${formatNumber(supplier.opening_balance || 0)} ج.م`), pageWidth - 14, 43, { align: 'right' })

  doc.text(shapeArabic(doc, `رقم الهاتف: ${supplier.phone || 'غير مسجل'}`), 14, 36, { align: 'left' })
  doc.text(shapeArabic(doc, dateRangeLabel), 14, 43, { align: 'left' })

  const head = [[
    shapeArabic(doc, 'الرصيد التراكمي'),
    shapeArabic(doc, 'دائن (-) مشتريات'),
    shapeArabic(doc, 'مدين (+) سدادات'),
    shapeArabic(doc, 'المرجع'),
    shapeArabic(doc, 'البيان والتفاصيل'),
    shapeArabic(doc, 'التاريخ'),
    shapeArabic(doc, '#'),
  ]]

  const body = statementRows.map((r) => [
    `${formatNumber(r.balance)} ج.م`,
    r.credit !== null ? formatNumber(r.credit) : '-',
    r.debit !== null ? formatNumber(r.debit) : '-',
    r.ref ? String(r.ref) : '-',
    shapeArabic(doc, r.description),
    r.tx_date || '-',
    r.row_no === 0 ? shapeArabic(doc, 'رصيد سابق') : String(r.row_no),
  ])

  const totalDebit = statementRows.reduce((acc, r) => acc + (r.debit || 0), 0)
  const totalCredit = statementRows.reduce((acc, r) => acc + (r.credit || 0), 0)
  const finalBalance = statementRows[statementRows.length - 1]?.balance ?? 0

  const foot = [[
    `${formatNumber(finalBalance)} ج.م`,
    formatNumber(totalCredit),
    formatNumber(totalDebit),
    '',
    shapeArabic(doc, 'الإجمالي والرصيد المستحق للمورد'),
    '',
    '',
  ]]

  autoTable(doc, {
    startY: 48,
    head,
    body,
    foot,
    styles: {
      font: 'Amiri',
      fontSize: 9,
      cellPadding: 2.5,
      halign: 'center',
    },
    headStyles: {
      font: 'Amiri',
      fillColor: [31, 78, 121],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    footStyles: {
      font: 'Amiri',
      fillColor: [230, 238, 246],
      textColor: [31, 78, 121],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold' },
      4: { halign: 'right' },
    },
    theme: 'grid',
    margin: { left: 12, right: 12, top: 48, bottom: 20 },
  })

  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(130, 130, 130)
    doc.text(
      shapeArabic(doc, `صفحة ${i} من ${totalPages}`),
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    )
    doc.text(
      shapeArabic(doc, `تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-EG')}`),
      14,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'left' }
    )
  }

  const filename = `كشف_حساب_مورد_${supplier.name}_${new Date().toISOString().slice(0, 10)}.pdf`
  const message = `السلام عليكم ورحمة الله،\nمرفق كشف حساب للمورد: ${supplier.name}\nالمتبقي المستحق: ${formatNumber(finalBalance)} ج.م.`

  return await sharePdfViaWhatsApp({
    doc,
    filename,
    recipientPhone: supplier.phone,
    message,
  })
}

/**
 * Generate and share a Product Price List / Catalog PDF via WhatsApp.
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
  const doc = await createArabicPdf('p')
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header banner
  doc.setFillColor(31, 78, 121)
  doc.rect(0, 0, pageWidth, 28, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.text(shapeArabic(doc, companyName), pageWidth / 2, 11, { align: 'center' })
  doc.setFontSize(11)
  doc.text(shapeArabic(doc, 'كتالوج وقائمة الأسعار المعتمدة'), pageWidth / 2, 20, { align: 'center' })

  // Subheader
  doc.setTextColor(50, 50, 50)
  doc.setFontSize(10)
  const catLabel = categoryFilter === 'all' ? 'جميع التصنيفات' : categoryFilter
  doc.text(shapeArabic(doc, `التصنيف: ${catLabel}`), pageWidth - 14, 36, { align: 'right' })
  doc.text(shapeArabic(doc, `عدد الأصناف: ${products.length}`), 14, 36, { align: 'left' })

  const head = [[
    shapeArabic(doc, 'السعر (ج.م)'),
    shapeArabic(doc, 'الوحدة'),
    shapeArabic(doc, 'التصنيف'),
    shapeArabic(doc, 'كود الصنف SKU'),
    shapeArabic(doc, 'اسم الصنف بالإنجليزية'),
    shapeArabic(doc, 'اسم الصنف'),
    shapeArabic(doc, '#'),
  ]]

  const body = products.map((p, index) => [
    `${formatNumber(p.price)} ج.م`,
    shapeArabic(doc, p.unit || 'قطعة'),
    shapeArabic(doc, p.category || '-'),
    p.sku || '-',
    p.name_en || '-',
    shapeArabic(doc, p.name_ar),
    String(index + 1),
  ])

  autoTable(doc, {
    startY: 42,
    head,
    body,
    styles: {
      font: 'Amiri',
      fontSize: 9,
      cellPadding: 2.5,
      halign: 'center',
    },
    headStyles: {
      font: 'Amiri',
      fillColor: [31, 78, 121],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold' },
      5: { halign: 'right', fontStyle: 'bold' },
    },
    theme: 'grid',
    margin: { left: 12, right: 12, top: 42, bottom: 20 },
  })

  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(130, 130, 130)
    doc.text(
      shapeArabic(doc, `صفحة ${i} من ${totalPages}`),
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    )
    doc.text(
      shapeArabic(doc, `تاريخ الإصدار: ${new Date().toLocaleDateString('ar-EG')}`),
      14,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'left' }
    )
  }

  const filename = `قائمة_الأسعار_${new Date().toISOString().slice(0, 10)}.pdf`
  const message = `السلام عليكم ورحمة الله،\nمرفق قائمة الأسعار والكتالوج المعتمد لمنتجات ${companyName}.`

  return await sharePdfViaWhatsApp({
    doc,
    filename,
    message,
  })
}

/**
 * Generate and share general Reports (from ReportModal) via WhatsApp.
 */
export async function shareGeneralReportWhatsApp({
  report,
  companyName = 'شركة توريد',
}: {
  report: Report
  companyName?: string
}) {
  const doc = await createArabicPdf('p')
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header banner
  doc.setFillColor(31, 78, 121)
  doc.rect(0, 0, pageWidth, 28, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.text(shapeArabic(doc, companyName), pageWidth / 2, 11, { align: 'center' })
  doc.setFontSize(11)
  doc.text(shapeArabic(doc, report.title), pageWidth / 2, 20, { align: 'center' })

  // Filters text
  doc.setTextColor(60, 60, 60)
  doc.setFontSize(9)
  if (report.subtitle) {
    doc.text(shapeArabic(doc, report.subtitle), pageWidth / 2, 34, { align: 'center' })
  }
  if (report.filters && report.filters.length > 0) {
    doc.text(shapeArabic(doc, report.filters.join(' • ')), pageWidth / 2, 40, { align: 'center' })
  }

  let currentY = 46

  for (const section of report.sections) {
    // Section Title
    doc.setFontSize(11)
    doc.setTextColor(31, 78, 121)
    doc.text(shapeArabic(doc, section.title), pageWidth - 14, currentY, { align: 'right' })
    currentY += 4

    // Reverse columns and cell order for RTL view
    const head = [section.columns.slice().reverse().map((c) => shapeArabic(doc, c))]
    const body = section.rows.map((row) =>
      row.slice().reverse().map((cell) => {
        if (typeof cell === 'object' && cell !== null) {
          if ('date' in cell) return cell.date || '-'
          if ('money' in cell) return `${formatNumber(cell.money)} ج.م`
        }
        if (typeof cell === 'number') return formatNumber(cell)
        return shapeArabic(doc, cell)
      })
    )

    let foot: any = undefined
    if (section.totals) {
      foot = [section.totals.slice().reverse().map((cell) => {
        if (typeof cell === 'object' && cell !== null) {
          if ('date' in cell) return cell.date || '-'
          if ('money' in cell) return `${formatNumber(cell.money)} ج.م`
        }
        if (typeof cell === 'number') return formatNumber(cell)
        return shapeArabic(doc, cell)
      })]
    }

    autoTable(doc, {
      startY: currentY,
      head,
      body,
      foot,
      styles: {
        font: 'Amiri',
        fontSize: 8.5,
        cellPadding: 2,
        halign: 'center',
      },
      headStyles: {
        font: 'Amiri',
        fillColor: [31, 78, 121],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      footStyles: {
        font: 'Amiri',
        fillColor: [230, 238, 246],
        textColor: [31, 78, 121],
        fontStyle: 'bold',
        halign: 'center',
      },
      theme: 'grid',
      margin: { left: 12, right: 12, bottom: 20 },
    })

    currentY = (doc as any).lastAutoTable.finalY + 10
  }

  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(130, 130, 130)
    doc.text(
      shapeArabic(doc, `صفحة ${i} من ${totalPages}`),
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    )
    doc.text(
      shapeArabic(doc, `تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')}`),
      14,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'left' }
    )
  }

  const filename = `${report.title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`
  const message = `السلام عليكم ورحمة الله،\nمرفق تقرير: ${report.title}`

  return await sharePdfViaWhatsApp({
    doc,
    filename,
    message,
  })
}
