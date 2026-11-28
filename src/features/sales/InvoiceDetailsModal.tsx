import { useMemo, useState } from 'react'
import Modal from '@/shared/ui/Modal'
import { formatNumber } from '@/shared/lib/format'
import { resolveProductUnit } from '@/shared/lib/productUnits'
import { useInvoiceDetails, type InvoiceDetails, type InvoiceType } from '@/hooks/useInvoices'
import { useSettings } from '@/features/settings/useSettings'
import { printInvoice, shareInvoiceWhatsApp } from '@/features/reporting/pdfGenerators'
import { buildInvoicePdfInput } from '@/features/sales/invoicePdfInput'
import { exportCSV } from '@/features/reporting/csv'
import { useAuth } from '@/features/auth/useAuth'

interface InvoiceDetailsModalProps {
  invoiceId: string
  invoiceType: InvoiceType
  onClose: () => void
}

type BusyAction = 'whatsapp' | 'print' | 'csv' | null

const CSV_HEADERS = [
  'رقم الفاتورة',
  'التاريخ',
  'العميل',
  'الهاتف',
  'المندوب',
  'الصنف',
  'الوحدة',
  'الكمية',
  'سعر الوحدة',
  'إجمالي السطر',
  'إجمالي الفاتورة',
  'المدفوع',
  'المتبقي',
] as const

function displayDate(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('ar-EG')
}

function money(value: number): string {
  return formatNumber(value)
}

function paymentStatus(details: InvoiceDetails): { label: string; className: string } {
  if (details.status === 'cancelled') {
    return { label: 'ملغاة', className: 'bg-slate-200 text-slate-600 border-slate-300' }
  }
  if (details.remaining <= 0) {
    return { label: 'مدفوع', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
  }
  if (details.total_paid > 0) {
    return { label: 'جزئي', className: 'bg-amber-100 text-amber-800 border-amber-300' }
  }
  return { label: 'غير مدفوع', className: 'bg-rose-100 text-rose-800 border-rose-300' }
}

export default function InvoiceDetailsModal({ invoiceId, invoiceType, onClose }: InvoiceDetailsModalProps) {
  const { data: details, isLoading, error } = useInvoiceDetails(invoiceId, invoiceType)
  const { data: settings } = useSettings()
  const [busy, setBusy] = useState<BusyAction>(null)
  const [actionError, setActionError] = useState('')
  const { can } = useAuth()
  const canExportPrint = can('export_print')

  const companyName = settings?.title || 'شركة توريد'
  const dir: 'rtl' | 'ltr' = typeof document !== 'undefined' && document.documentElement.dir === 'ltr' ? 'ltr' : 'rtl'
  const pdfInput = useMemo(
    () => (details ? buildInvoicePdfInput(details, companyName, dir) : null),
    [details, companyName, dir]
  )

  const documentBadge = invoiceType === 'cash' ? 'فاتورة مبيعات نقدي' : 'فاتورة مبيعات آجل'
  const status = details ? paymentStatus(details) : null

  const headerTitle = (
    <span className="flex flex-wrap items-center gap-2">
      <span className="rounded-lg bg-[#e0eefb] px-2.5 py-1 text-xs font-extrabold text-[#103352] ring-1 ring-inset ring-[#1a4971]/30">
        {documentBadge}
      </span>
      <span className="font-mono text-sm font-extrabold tracking-tight text-slate-800" dir="ltr">
        #{details?.invoice_no || '—'}
      </span>
      {status && (
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-extrabold ${status.className}`}>
          {status.label}
        </span>
      )}
    </span>
  )

  const exportCsv = (data: InvoiceDetails) => {
    const base = {
      'رقم الفاتورة': data.invoice_no,
      'التاريخ': displayDate(data.date),
      'العميل': data.customer_name,
      'الهاتف': data.customer_phone || '-',
      'المندوب': data.rep_name,
      'إجمالي الفاتورة': money(data.amount),
      'المدفوع': money(data.total_paid),
      'المتبقي': money(data.remaining),
    }
    const rows = data.lines.length
      ? data.lines.map((line) => ({
          ...base,
          'الصنف': line.product?.name_ar || line.product?.name_en || line.product?.sku || data.item || '-',
          'الوحدة': resolveProductUnit(line.unit),
          'الكمية': formatNumber(line.qty),
          'سعر الوحدة': money(line.unit_price),
          'إجمالي السطر': money(line.line_total),
        }))
      : [{
          ...base,
          'الصنف': data.item || 'بيان الفاتورة',
          'الوحدة': '-',
          'الكمية': '1',
          'سعر الوحدة': money(data.amount),
          'إجمالي السطر': money(data.amount),
        }]

    exportCSV(`فاتورة_${data.invoice_no || 'invoice'}.csv`, rows, [...CSV_HEADERS])
  }

  const runAction = async (action: Exclude<BusyAction, null>) => {
    if (!details || !pdfInput || busy) return
    setActionError('')
    setBusy(action)
    try {
      if (action === 'whatsapp') {
        await shareInvoiceWhatsApp(pdfInput)
      } else if (action === 'print') {
        const printed = await printInvoice(pdfInput)
        if (!printed) throw new Error('تعذر فتح نافذة الطباعة. تحقق من السماح بالنوافذ المنبثقة.')
      } else {
        exportCsv(details)
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء. حاول مرة أخرى.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal
      title={headerTitle}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 md:p-6 animate-fade-in"
      panelClassName="bg-white border border-slate-200/80 shadow-2xl w-screen h-dvh rounded-none md:w-[95vw] md:max-w-[1100px] md:h-[90vh] md:rounded-2xl overflow-hidden animate-scale-in flex flex-col"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-xs text-slate-500">
            {actionError ? (
              <span className="font-semibold text-rose-700">{actionError}</span>
            ) : details ? (
              <span>
                الإجمالي: <span className="font-mono font-extrabold text-slate-900" dir="ltr">{money(details.amount)}</span> ج.م
              </span>
            ) : null}
          </div>
          {canExportPrint && (
            <div className="flex flex-wrap items-center gap-2">
              <WhatsAppShareButton
                disabled={!details || busy !== null}
                onClick={() => void runAction('whatsapp')}
                busy={busy === 'whatsapp'}
              />
              <button
                type="button"
                disabled={!details || busy !== null}
                onClick={() => void runAction('print')}
                className="app-btn app-btn-ghost text-xs font-bold disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1.5">
                  <PrintIcon />
                  {busy === 'print' ? 'جاري الطباعة...' : 'طباعة'}
                </span>
              </button>
              <button
                type="button"
                disabled={!details || busy !== null}
                onClick={() => void runAction('csv')}
                className="app-btn app-btn-primary text-xs font-bold disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1.5">
                  <CsvIcon />
                  {busy === 'csv' ? 'جاري التصدير...' : 'تصدير CSV'}
                </span>
              </button>
            </div>
          )}
        </div>
      }
    >
      {isLoading ? (
        <div className="py-16 text-center text-sm font-semibold text-slate-500">جاري تحميل تفاصيل الفاتورة...</div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          تعذر تحميل تفاصيل الفاتورة: {(error as Error).message}
        </div>
      ) : !details ? (
        <div className="py-16 text-center text-sm font-semibold text-slate-500">لم يتم العثور على الفاتورة.</div>
      ) : (
        <div className="space-y-5">
          <section className="grid grid-cols-1 gap-3 rounded-2xl border border-[#cfe0f2] bg-[#f0f6fc] p-3.5 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="العميل" value={details.customer_name} />
            <Info label="الهاتف" value={details.customer_phone || 'غير مسجل'} dir="ltr" />
            <Info label="المندوب" value={details.rep_name} />
            <Info label="تاريخ الفاتورة" value={displayDate(details.date)} />
            {invoiceType === 'credit' && <Info label="تاريخ الاستحقاق" value={displayDate(details.due_date)} />}
            <Info label="رقم الفاتورة" value={details.invoice_no} mono dir="ltr" />
            {(details.notes || details.item) && (
              <div className="sm:col-span-2 lg:col-span-3">
                <div className="text-[11px] font-bold text-slate-500">ملاحظات / البيان</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-800">{details.notes || details.item}</div>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-extrabold text-slate-800">
              بنود الفاتورة
            </div>
            <div className="overflow-x-auto">
              <table className="app-table">
                <thead>
                  <tr>
                    <th className="w-12 text-center">#</th>
                    <th>المنتج</th>
                    <th className="w-24 text-center">الوحدة</th>
                    <th className="w-24 text-end">الكمية</th>
                    <th className="w-28 text-end">سعر الوحدة</th>
                    <th className="w-32 text-end">إجمالي السطر</th>
                  </tr>
                </thead>
                <tbody>
                  {details.lines.length === 0 ? (
                    <tr>
                      <td className="text-center font-mono text-xs">1</td>
                      <td className="font-semibold text-slate-800">{details.item || 'بيان الفاتورة'}</td>
                      <td className="text-center text-xs text-slate-500">-</td>
                      <td className="text-end font-mono tabular-nums">1</td>
                      <td className="text-end font-mono tabular-nums">{money(details.amount)}</td>
                      <td className="text-end font-mono font-bold tabular-nums">{money(details.amount)}</td>
                    </tr>
                  ) : (
                    details.lines.map((line, index) => (
                      <tr key={line.id || index}>
                        <td className="text-center font-mono text-xs text-slate-500">{index + 1}</td>
                        <td>
                          <div className="font-semibold text-slate-800">
                            {line.product?.name_ar || line.product?.name_en || line.product?.sku || details.item || '-'}
                          </div>
                          {line.product?.name_en && line.product.name_en !== line.product.name_ar && (
                            <div className="text-[11px] text-slate-500" dir="ltr">{line.product.name_en}</div>
                          )}
                          {line.product?.sku && (
                            <div className="text-[10px] font-mono text-slate-400" dir="ltr">SKU: {line.product.sku}</div>
                          )}
                        </td>
                        <td className="text-center text-xs text-slate-600">{resolveProductUnit(line.unit)}</td>
                        <td className="text-end font-mono tabular-nums">{formatNumber(line.qty)}</td>
                        <td className="text-end font-mono tabular-nums">{money(line.unit_price)}</td>
                        <td className="text-end font-mono font-bold tabular-nums">{money(line.line_total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-[#e0eefb]">
                  <tr className="font-extrabold text-[#103352]">
                    <td colSpan={5} className="text-end">الإجمالي الكلي</td>
                    <td className="text-end font-mono text-base font-extrabold tabular-nums" dir="ltr">
                      {money(details.amount)} ج.م
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {invoiceType === 'credit' && (details.payments.length > 0 || details.down_payment > 0 || details.pooled_payments > 0) && (
            <section className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-extrabold text-slate-800">
                سجل المدفوعات
              </div>
              <div className="overflow-x-auto">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th className="w-12 text-center">#</th>
                      <th>التاريخ</th>
                      <th>البيان</th>
                      <th>المرجع</th>
                      <th className="text-end">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.down_payment > 0 && (
                      <tr>
                        <td className="text-center font-mono text-xs">0</td>
                        <td className="whitespace-nowrap text-xs">{displayDate(details.date)}</td>
                        <td className="text-xs font-semibold text-slate-700">مدفوع مقدمًا</td>
                        <td className="font-mono text-[11px] text-slate-500" dir="ltr">{details.invoice_no}</td>
                        <td className="text-end font-mono font-bold tabular-nums text-emerald-700">{money(details.down_payment)}</td>
                      </tr>
                    )}
                    {details.payments.map((payment, index) => (
                      <tr key={payment.id || index}>
                        <td className="text-center font-mono text-xs">{index + 1}</td>
                        <td className="whitespace-nowrap text-xs">{displayDate(payment.date)}</td>
                        <td className="text-xs text-slate-700">{payment.method || '-'}</td>
                        <td className="font-mono text-[11px] text-slate-500" dir="ltr">{payment.reference}</td>
                        <td className="text-end font-mono font-bold tabular-nums text-emerald-700">{money(payment.amount)}</td>
                      </tr>
                    ))}
                    {details.pooled_payments > 0 && (
                      <tr>
                        <td className="text-center font-mono text-xs">•</td>
                        <td className="whitespace-nowrap text-xs">-</td>
                        <td className="text-xs font-semibold text-slate-700">تخصيص مدفوعات غير مرتبطة</td>
                        <td className="font-mono text-[11px] text-slate-500" dir="ltr">-</td>
                        <td className="text-end font-mono font-bold tabular-nums text-emerald-700">{money(details.pooled_payments)}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="bg-slate-50">
                    <tr className="font-bold text-slate-800">
                      <td colSpan={4} className="text-end">إجمالي المسدد</td>
                      <td className="text-end font-mono font-extrabold tabular-nums text-emerald-800" dir="ltr">{money(details.total_paid)}</td>
                    </tr>
                    <tr className="font-extrabold text-rose-800">
                      <td colSpan={4} className="text-end">المتبقي</td>
                      <td className="text-end font-mono text-base font-extrabold tabular-nums" dir="ltr">{money(details.remaining)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </Modal>
  )
}

function Info({ label, value, mono, dir }: { label: string; value: string; mono?: boolean; dir?: 'ltr' | 'rtl' }) {
  return (
    <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2">
      <div className="text-[11px] font-bold text-slate-500">{label}</div>
      <div
        className={`mt-0.5 text-sm font-extrabold text-slate-800 ${mono ? 'font-mono tabular-nums' : ''}`}
        dir={dir}
      >
        {value}
      </div>
    </div>
  )
}

function WhatsAppShareButton({ onClick, disabled, busy }: { onClick: () => void; disabled: boolean; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="app-btn text-xs font-bold text-[#075e54] ring-1 ring-inset ring-emerald-200 hover:bg-emerald-50 disabled:opacity-50"
      aria-label="مشاركة واتساب"
    >
      <span className="inline-flex items-center gap-1.5">
        <WhatsAppIcon />
        {busy ? 'جاري الإعداد...' : 'مشاركة واتساب'}
      </span>
    </button>
  )
}

function WhatsAppIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.5 2 2.04 6.46 2.04 12c0 1.77.46 3.5 1.34 5.02L2 22l5.13-1.34A9.93 9.93 0 0 0 12.04 22c5.54 0 10-4.46 10-10S17.58 2 12.04 2Zm0 18.15a8.1 8.1 0 0 1-4.14-1.13l-.3-.18-3.05.8.82-2.97-.2-.31a8.08 8.08 0 0 1-1.24-4.34c0-4.48 3.64-8.12 8.11-8.12 4.48 0 8.12 3.64 8.12 8.12 0 4.48-3.64 8.13-8.12 8.13Zm4.45-6.08c-.24-.12-1.44-.71-1.66-.79-.22-.08-.38-.12-.54.12-.16.24-.62.79-.76.95-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.19-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.46-.39-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.59 4.12 3.63.58.25 1.03.4 1.38.51.58.19 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  )
}

function PrintIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z" />
    </svg>
  )
}

function CsvIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
    </svg>
  )
}
