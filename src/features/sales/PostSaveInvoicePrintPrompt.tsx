import { useRef, useState } from 'react'
import Modal from '@/shared/ui/Modal'
import { useInvoiceDetails, type InvoiceType } from '@/hooks/useInvoices'
import { useSettings } from '@/features/settings/useSettings'
import { printInvoice, type InvoicePdfInput } from '@/features/reporting/pdfGenerators'
import { useAuth } from '@/features/auth/useAuth'

interface PostSaveInvoicePrintPromptProps {
  invoiceId: string
  invoiceType: InvoiceType
  invoiceNo?: string
  onClose: () => void
}

function buildPdfInput(
  details: NonNullable<ReturnType<typeof useInvoiceDetails>['data']>,
  companyName: string,
  dir: 'rtl' | 'ltr'
): InvoicePdfInput {
  return {
    invoiceType: details.invoiceType,
    invoice_no: details.invoice_no,
    date: details.date,
    due_date: details.due_date,
    customer_name: details.customer_name,
    customer_phone: details.customer_phone,
    rep_name: details.rep_name,
    amount: details.amount,
    down_payment: details.down_payment,
    recorded_payments: details.recorded_payments,
    pooled_payments: details.pooled_payments,
    total_paid: details.total_paid,
    remaining: details.remaining,
    notes: details.notes,
    item: details.item,
    lines: details.lines,
    payments: details.payments,
    companyName,
    dir,
  }
}

export default function PostSaveInvoicePrintPrompt({
  invoiceId,
  invoiceType,
  invoiceNo,
  onClose,
}: PostSaveInvoicePrintPromptProps) {
  const { data: details, isLoading, error } = useInvoiceDetails(invoiceId, invoiceType)
  const { data: settings } = useSettings()
  const { can } = useAuth()
  const canExportPrint = can('export_print')
  const printingRef = useRef(false)
  const [printError, setPrintError] = useState('')
  const [printing, setPrinting] = useState(false)

  const companyName = settings?.title || 'شركة توريد'
  const dir: 'rtl' | 'ltr' =
    typeof document !== 'undefined' && document.documentElement.dir === 'ltr' ? 'ltr' : 'rtl'

  const handlePrint = async () => {
    if (!canExportPrint || !details || printingRef.current) return
    printingRef.current = true
    setPrinting(true)
    setPrintError('')
    try {
      const printed = await printInvoice(buildPdfInput(details, companyName, dir))
      if (!printed) throw new Error('تعذر فتح نافذة الطباعة. تحقق من السماح بالنوافذ المنبثقة.')
      onClose()
    } catch (e) {
      setPrintError(e instanceof Error ? e.message : 'تعذر طباعة الفاتورة.')
    } finally {
      printingRef.current = false
      setPrinting(false)
    }
  }

  return (
    <Modal
      title="تم حفظ الفاتورة"
      subtitle={invoiceNo ? `الفاتورة رقم ${invoiceNo} تم حفظها بنجاح.` : 'تم حفظ الفاتورة بنجاح.'}
      onClose={onClose}
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="app-btn app-btn-ghost px-4 text-xs">
            إغلاق
          </button>
          {canExportPrint && (
            <button
              type="button"
              onClick={() => void handlePrint()}
              disabled={isLoading || !details || printing}
              className="app-btn app-btn-primary px-4 text-xs font-bold disabled:opacity-50"
            >
              {printing ? 'جاري الطباعة...' : isLoading ? 'جاري التجهيز...' : 'طباعة الفاتورة'}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-slate-700 font-medium">هل تريد طباعة الفاتورة الآن؟</p>
        {!canExportPrint && (
          <p className="text-xs text-slate-500">ليس لديك صلاحية الطباعة، يمكنك إغلاق هذه النافذة.</p>
        )}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
            تعذر تحميل بيانات الفاتورة للطباعة: {(error as Error).message}
          </div>
        )}
        {printError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
            {printError}
          </div>
        )}
      </div>
    </Modal>
  )
}
