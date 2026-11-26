import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Modal from '@/shared/ui/Modal'
import { supabase } from '@/shared/lib/supabase'
import { formatNumber } from '@/shared/lib/format'
import { formatLocalDate, formatLocalNumber, getUiLang, t } from '@/shared/lib/bilingual'
import { useInvoiceLines } from '@/features/inventory/useInventory'
import { useSettings } from '@/features/settings/useSettings'
import { exportCSV } from '@/features/reporting/csv'
import { buildUnifiedReportTemplate } from '@/features/reporting/pdfGenerators'
import { generatePdfFromHtml, printHtml, sharePdfBlobViaWhatsApp } from '@/shared/lib/pdfShare'

interface InvoiceDetailsModalProps {
  invoiceId: string
  invoiceType: 'cash' | 'credit'
  onClose: () => void
}

type InvoiceHeader = {
  id: string
  date: string
  invoice_no: string
  customer_name: string
  customer_phone?: string | null
  rep_name: string
  amount: number
  paid?: number
  remaining?: number
  status?: string | null
  notes?: string | null
  item?: string | null
  due_date?: string | null
}

export default function InvoiceDetailsModal({ invoiceId, invoiceType, onClose }: InvoiceDetailsModalProps) {
  const { data: lines = [], isLoading: linesLoading } = useInvoiceLines(invoiceType, invoiceId)

  const headerQuery = useQuery({
    queryKey: ['invoice-details', invoiceType, invoiceId],
    queryFn: async (): Promise<InvoiceHeader | null> => {
      if (invoiceType === 'cash') {
        const { data, error } = await supabase
          .from('cash_invoices')
          .select('id,date,invoice_no,amount,status,notes,item,customer_id,rep_id,customers(name,phone),reps(name)')
          .eq('id', invoiceId)
          .maybeSingle()
        if (error) throw error
        if (!data) return null
        const row = data as Record<string, unknown>
        return {
          id: String(row.id),
          date: String(row.date || ''),
          invoice_no: String(row.invoice_no || ''),
          customer_name: String((row.customers as Record<string, unknown> | null)?.name || '-'),
          customer_phone: (row.customers as Record<string, unknown> | null)?.phone as string | null ?? null,
          rep_name: String((row.reps as Record<string, unknown> | null)?.name || '-'),
          amount: Number(row.amount || 0),
          status: (row.status as string | null) ?? null,
          notes: (row.notes as string | null) ?? null,
          item: (row.item as string | null) ?? null,
        }
      }

      const { data, error } = await supabase
        .from('credit_invoices')
        .select('id,date,invoice_no,amount,paid,status,due_date,item,customer_id,rep_id,customers(name,phone),reps(name)')
        .eq('id', invoiceId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as Record<string, unknown>
      const { data: paidRows } = await supabase
        .from('payments')
        .select('amount')
        .eq('credit_invoice_id', invoiceId)
      const linkedPaid = (paidRows || []).reduce((sum, p) => sum + Number((p as Record<string, unknown>).amount || 0), 0)
      const paid = Number(row.paid || 0) + linkedPaid
      const amount = Number(row.amount || 0)
      return {
        id: String(row.id),
        date: String(row.date || ''),
        invoice_no: String(row.invoice_no || ''),
        customer_name: String((row.customers as Record<string, unknown> | null)?.name || '-'),
        customer_phone: (row.customers as Record<string, unknown> | null)?.phone as string | null ?? null,
        rep_name: String((row.reps as Record<string, unknown> | null)?.name || '-'),
        amount,
        paid,
        remaining: Math.max(0, amount - paid),
        status: (row.status as string | null) ?? null,
        item: (row.item as string | null) ?? null,
        due_date: (row.due_date as string | null) ?? null,
      }
    },
  })

  const title = invoiceType === 'cash' ? 'تفاصيل فاتورة نقدية' : 'تفاصيل فاتورة آجلة'
  const header = headerQuery.data
  const totalLines = useMemo(
    () => lines.reduce((sum, l) => sum + Number(l.line_total || 0), 0),
    [lines]
  )
  const lang = getUiLang()
  const { data: settings } = useSettings()
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const reportHtml = useMemo(
    () => header
      ? buildInvoiceReportHtml(header, lines, settings?.title || t(lang, 'نظام المبيعات', 'Sales system'), lang, invoiceType)
      : '',
    [header, lines, settings?.title, lang, invoiceType]
  )

  const handleCsv = () => {
    if (!header) return
    const labels = lang === 'ar'
      ? ['المنتج', 'الكمية', 'سعر الوحدة', 'الإجمالي']
      : ['Product', 'Qty', 'Unit price', 'Total']
    const data = lines.map((line) => {
      const product = (line as Record<string, unknown>).products as Record<string, unknown> | null
      return Object.fromEntries([
        [labels[0], String(product?.name_ar || product?.name_en || 'منتج')],
        [labels[1], Number(line.qty || 0)],
        [labels[2], Number(line.unit_price || 0)],
        [labels[3], Number(line.line_total || 0)],
      ])
    })
    exportCSV(`invoice-${header.invoice_no}.csv`, data, labels)
  }

  const handleWhatsApp = async () => {
    if (!header || !reportHtml) return
    setBusy(true)
    setActionError('')
    try {
      const blob = await generatePdfFromHtml(reportHtml)
      await sharePdfBlobViaWhatsApp({
        blob,
        filename: `invoice-${header.invoice_no}.pdf`,
        recipientPhone: header.customer_phone,
        message: `${t(lang, 'فاتورة', 'Invoice')} ${header.invoice_no} — ${header.customer_name}`,
      })
    } catch (e) {
      setActionError((e as Error).message || t(lang, 'تعذّر إرسال الفاتورة', 'Could not send the invoice'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose} overlayClassName="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 md:p-6 animate-fade-in"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {actionError && <span className="me-auto text-xs font-semibold text-rose-700">{actionError}</span>}
          <button type="button" onClick={handleCsv} disabled={!header} className="app-btn app-btn-ghost text-xs">{t(lang, 'تصدير CSV', 'Export CSV')}</button>
          <button type="button" onClick={() => { void printHtml(reportHtml, header?.invoice_no || 'invoice') }} disabled={!header} className="app-btn app-btn-ghost text-xs">{t(lang, 'طباعة A4', 'Print A4')}</button>
          <button type="button" onClick={() => { void handleWhatsApp() }} disabled={!header || busy} className="app-btn app-btn-primary text-xs">
            {busy ? t(lang, 'جارٍ الإعداد...', 'Preparing...') : t(lang, 'إرسال PDF واتساب', 'Send PDF on WhatsApp')}
          </button>
        </div>
      }
    >
        {headerQuery.isLoading ? (
          <div className="py-10 text-center text-sm text-slate-500">جاري تحميل تفاصيل الفاتورة...</div>
        ) : headerQuery.error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            تعذر تحميل تفاصيل الفاتورة: {(headerQuery.error as Error).message}
          </div>
        ) : !header ? (
          <div className="py-10 text-center text-sm text-slate-500">لم يتم العثور على الفاتورة.</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Info label="رقم الفاتورة" value={header.invoice_no} mono />
              <Info label="التاريخ" value={header.date || '-'} />
              <Info label="العميل" value={header.customer_name} />
              <Info label="المندوب" value={header.rep_name} />
              <Info label="الإجمالي" value={`${formatNumber(header.amount)} ج.م`} mono />
              {invoiceType === 'credit' && <Info label="المدفوع" value={`${formatNumber(header.paid || 0)} ج.م`} mono />}
              {invoiceType === 'credit' && <Info label="المتبقي" value={`${formatNumber(header.remaining || 0)} ج.م`} mono />}
              {header.due_date && <Info label="تاريخ الاستحقاق" value={header.due_date} />}
              {header.status && <Info label="الحالة" value={statusLabel(header.status)} />}
            </div>

            {(header.item || header.notes) && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {header.item && <div><span className="font-bold text-slate-600">البيان: </span>{header.item}</div>}
                {header.notes && <div className="mt-1"><span className="font-bold text-slate-600">ملاحظات: </span>{header.notes}</div>}
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-sm text-slate-800">بنود الفاتورة</div>
              {linesLoading ? (
                <div className="py-8 text-center text-sm text-slate-500">جاري تحميل البنود...</div>
              ) : lines.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">لا توجد بنود مسجلة لهذه الفاتورة.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-start text-xs font-bold text-slate-600">المنتج</th>
                        <th className="px-3 py-2 text-center text-xs font-bold text-slate-600">الكمية</th>
                        <th className="px-3 py-2 text-center text-xs font-bold text-slate-600">سعر الوحدة</th>
                        <th className="px-3 py-2 text-center text-xs font-bold text-slate-600">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lines.map((line) => {
                        const product = (line as Record<string, unknown>).products as Record<string, unknown> | null
                        const name = String(product?.name_ar || 'منتج')
                        const unit = String(product?.unit || '')
                        return (
                          <tr key={String(line.id)}>
                            <td className="px-3 py-2 font-medium text-slate-800">{name}</td>
                            <td className="px-3 py-2 text-center font-mono tabular-nums">{formatNumber(Number(line.qty || 0))} {unit}</td>
                            <td className="px-3 py-2 text-center font-mono tabular-nums">{formatNumber(Number(line.unit_price || 0))}</td>
                            <td className="px-3 py-2 text-center font-mono font-bold tabular-nums">{formatNumber(Number(line.line_total || 0))}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-end text-xs font-bold text-slate-700">إجمالي البنود</td>
                        <td className="px-3 py-2 text-center font-mono font-extrabold tabular-nums text-emerald-800">{formatNumber(totalLines)} ج.م</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
    </Modal>
  )
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-bold text-slate-500 mb-0.5">{label}</div>
      <div className={`text-sm font-semibold text-slate-800 ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</div>
    </div>
  )
}

function statusLabel(status: string): string {
  switch (status) {
    case 'draft': return 'مسودة'
    case 'confirmed': return 'مؤكدة'
    case 'cancelled': return 'ملغاة'
    default: return status
  }
}

function esc(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildInvoiceReportHtml(
  header: InvoiceHeader,
  lines: { qty?: number | string; unit_price?: number | string; line_total?: number | string; products?: unknown }[],
  companyName: string,
  lang: 'ar' | 'en',
  invoiceType: 'cash' | 'credit',
): string {
  const num = (value: number | string | null | undefined) => esc(formatLocalNumber(value, lang))
  const date = (value: string) => esc(formatLocalDate(value, lang))
  const bodyRows = lines.map((line) => {
    const product = line.products as { name_ar?: string; name_en?: string; unit?: string } | null
    return `
      <tr>
        <td>${esc(product?.name_ar || product?.name_en || '—')}</td>
        <td class="num">${num(line.qty)} ${esc(product?.unit || '')}</td>
        <td class="num">${num(line.unit_price)}</td>
        <td class="num">${num(line.line_total)}</td>
      </tr>`
  }).join('')
  const meta = [
    { label: t(lang, 'التاريخ', 'Date'), value: date(header.date) },
    { label: t(lang, 'العميل', 'Customer'), value: header.customer_name },
    { label: t(lang, 'المندوب', 'Rep'), value: header.rep_name },
    { label: t(lang, 'الحالة', 'Status'), value: header.status ? esc(statusLabel(header.status)) : '—' },
  ]
  if (invoiceType === 'credit' && header.due_date) {
    meta.push({ label: t(lang, 'تاريخ الاستحقاق', 'Due date'), value: date(header.due_date) })
  }
  if (invoiceType === 'credit') {
    meta.push({ label: t(lang, 'المدفوع', 'Paid'), value: num(header.paid || 0) })
    meta.push({ label: t(lang, 'المتبقي', 'Remaining'), value: num(header.remaining || 0) })
  }

  return buildUnifiedReportTemplate({
    companyName,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    docBadge: invoiceType === 'cash'
      ? t(lang, 'فاتورة نقدية', 'Cash invoice')
      : t(lang, 'فاتورة آجلة', 'Credit invoice'),
    entityTitle: t(lang, 'رقم الفاتورة', 'Invoice no.') + ': ' + esc(header.invoice_no),
    meta,
    bodyHtml: `
      <section class="pdf-section">
        <h3 class="pdf-section-title">${t(lang, 'بنود الفاتورة', 'Invoice lines')}</h3>
        <div class="pdf-table-wrap"><table class="pdf-table">
          <thead><tr>
            <th>${t(lang, 'المنتج', 'Product')}</th>
            <th class="num">${t(lang, 'الكمية', 'Qty')}</th>
            <th class="num">${t(lang, 'سعر الوحدة', 'Unit price')}</th>
            <th class="num">${t(lang, 'الإجمالي', 'Total')}</th>
          </tr></thead>
          <tbody>${bodyRows || `<tr><td colspan="4" class="pdf-empty">${t(lang, 'لا توجد بنود', 'No line items')}</td></tr>`}</tbody>
          <tfoot><tr class="row-total">
            <td colspan="3">${t(lang, 'الإجمالي الكلي', 'Grand total')}</td>
            <td class="num">${num(header.amount)}</td>
          </tr></tfoot>
        </table></div>
      </section>`,
    notes: header.item || undefined,
  })
}
