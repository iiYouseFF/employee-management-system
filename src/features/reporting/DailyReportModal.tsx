import { useMemo, useState } from 'react'
import Modal from '@/shared/ui/Modal'
import WhatsAppShareButton from '@/shared/ui/WhatsAppShareButton'
import { formatNumber, getTodayISO } from '@/shared/lib/format'
import { useCashInvoices, useCreditInvoices, usePayments } from '@/features/sales/useInvoices'
import { useExpenses } from '@/features/expenses/useExpenses'
import { useReps } from '@/features/reps/useReps'
import { useSettings } from '@/features/settings/useSettings'
import { printDailyReport, shareDailyReportWhatsApp, type DailyReportRepRow } from './pdfGenerators'

interface DailyReportModalProps {
  onClose: () => void
  showToast: (message: string) => void
}

export default function DailyReportModal({ onClose, showToast }: DailyReportModalProps) {
  const [date, setDate] = useState(() => getTodayISO())
  const [sharing, setSharing] = useState(false)

  const { data: cashInvoices = [] } = useCashInvoices()
  const { data: creditInvoices = [] } = useCreditInvoices()
  const { data: payments = [] } = usePayments()
  const { data: expenses = [] } = useExpenses()
  const { data: reps = [] } = useReps()
  const { data: settings } = useSettings()

  const summary = useMemo(() => {
    const dayCash = cashInvoices.filter((inv) => inv.date === date)
    const dayCredit = creditInvoices.filter((inv) => inv.date === date)
    const dayPayments = payments.filter((p) => p.date === date)
    const dayExpenses = expenses.filter((e) => e.date === date)

    const cashTotal = dayCash.reduce((s, r) => s + Number(r.amount || 0), 0)
    const creditTotal = dayCredit.reduce((s, r) => s + Number(r.amount || 0), 0)
    const paymentsTotal = dayPayments.reduce((s, r) => s + Number(r.amount || 0), 0)
    const expensesTotal = dayExpenses.reduce((s, r) => s + Number(r.amount || 0), 0)
    const returnsCount = 0
    const returnsTotal = 0
    const netCashFlow = cashTotal + paymentsTotal - expensesTotal

    const repMap = new Map<string, DailyReportRepRow>()
    for (const rep of reps) {
      repMap.set(rep.id, { repName: rep.name, cashTotal: 0, creditTotal: 0, paymentsTotal: 0 })
    }
    for (const inv of dayCash) {
      if (!inv.rep_id) continue
      const row = repMap.get(inv.rep_id)
      if (row) row.cashTotal += Number(inv.amount || 0)
    }
    for (const inv of dayCredit) {
      if (!inv.rep_id) continue
      const row = repMap.get(inv.rep_id)
      if (row) row.creditTotal += Number(inv.amount || 0)
    }
    for (const p of dayPayments) {
      if (!p.rep_id) continue
      const row = repMap.get(p.rep_id)
      if (row) row.paymentsTotal += Number(p.amount || 0)
    }

    const repRows = Array.from(repMap.values()).filter(
      (r) => r.cashTotal > 0 || r.creditTotal > 0 || r.paymentsTotal > 0
    )

    return {
      cashCount: dayCash.length,
      cashTotal,
      creditCount: dayCredit.length,
      creditTotal,
      paymentsCount: dayPayments.length,
      paymentsTotal,
      returnsCount,
      returnsTotal,
      expensesCount: dayExpenses.length,
      expensesTotal,
      netCashFlow,
      repRows,
    }
  }, [cashInvoices, creditInvoices, payments, expenses, reps, date])

  const companyName = settings?.title || 'المؤسسة المصرية لتوزيع المواد الغذائية'

  const handlePrint = async () => {
    const printed = await printDailyReport({ date, companyName, ...summary })
    if (!printed) {
      showToast('يرجى السماح بالنوافذ المنبثقة للطباعة')
      return
    }
    onClose()
  }

  const handleShareWhatsApp = async () => {
    setSharing(true)
    try {
      const result = await shareDailyReportWhatsApp({ date, companyName, ...summary })
      if (!result.sharedViaNative) {
        showToast('تم تنزيل ملف PDF — أرفقه في محادثة واتساب')
      }
    } catch {
      showToast('تعذر تجهيز ملف التقرير اليومي للمشاركة')
    } finally {
      setSharing(false)
    }
  }

  return (
    <Modal title="التقرير اليومي المختصر" onClose={onClose} size="default">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label htmlFor="daily-report-date" className="text-xs font-extrabold text-slate-700">
            تاريخ التقرير:
          </label>
          <input
            id="daily-report-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="app-input w-auto py-1.5 text-xs font-bold"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
            <p className="text-[11px] font-bold text-emerald-800">المبيعات النقدية ({summary.cashCount})</p>
            <p className="mt-1 text-base font-extrabold text-emerald-950 font-num tabular-nums">
              {formatNumber(summary.cashTotal)} ج.م
            </p>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3">
            <p className="text-[11px] font-bold text-sky-800">المبيعات الآجلة ({summary.creditCount})</p>
            <p className="mt-1 text-base font-extrabold text-sky-950 font-num tabular-nums">
              {formatNumber(summary.creditTotal)} ج.م
            </p>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-3">
            <p className="text-[11px] font-bold text-violet-800">التحصيلات ({summary.paymentsCount})</p>
            <p className="mt-1 text-base font-extrabold text-violet-950 font-num tabular-nums">
              {formatNumber(summary.paymentsTotal)} ج.م
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
            <p className="text-[11px] font-bold text-amber-800">المرتجعات ({summary.returnsCount})</p>
            <p className="mt-1 text-base font-extrabold text-amber-950 font-num tabular-nums">
              {formatNumber(summary.returnsTotal)} ج.م
            </p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3">
            <p className="text-[11px] font-bold text-rose-800">المصروفات ({summary.expensesCount})</p>
            <p className="mt-1 text-base font-extrabold text-rose-950 font-num tabular-nums">
              {formatNumber(summary.expensesTotal)} ج.م
            </p>
          </div>
          <div className="rounded-xl border border-slate-300 bg-slate-100 p-3">
            <p className="text-[11px] font-bold text-slate-700">صافي الحركة النقدية</p>
            <p className="mt-1 text-base font-extrabold text-slate-900 font-num tabular-nums">
              {formatNumber(summary.netCashFlow)} ج.م
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={() => void handlePrint()}
            className="app-btn app-btn-primary inline-flex items-center gap-1.5"
          >
            طباعة / حفظ PDF
          </button>
          <WhatsAppShareButton
            loading={sharing}
            onClick={() => void handleShareWhatsApp()}
            label="إرسال عبر واتساب"
          />
          <button type="button" onClick={onClose} className="app-btn app-btn-ghost">
            إغلاق
          </button>
        </div>
      </div>
    </Modal>
  )
}
