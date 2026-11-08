import { useState } from 'react'
import {
  useCashInvoices,
  useCreditInvoices,
  usePayments,
  useCustomers,
} from '../hooks/useInvoices'
import { useReps, useSettings } from '../hooks/useData'
import Modal from './Modal'
import WhatsAppShareButton from './WhatsAppShareButton'
import { REPORT_SECTIONS, buildReport, exportReportCsv, printReport } from '../lib/report'
import { getTodayISO } from '../lib/format'
import { shareGeneralReportWhatsApp } from '../lib/pdfGenerators'

interface ReportModalProps {
  onClose: () => void
  showToast: (message: string) => void
  defaultTab: string
  defaultRepFilter: string
  defaultAction?: 'print' | 'csv'
}

const TAB_SECTIONS: Record<string, string> = {
  cash: 'cash',
  credit: 'credit',
  payments: 'payments',
  statement: 'statement',
  monthly: 'monthly',
  customers: 'customers',
}

export default function ReportModal({
  onClose,
  showToast,
  defaultTab,
  defaultRepFilter,
  defaultAction = 'print',
}: ReportModalProps) {
  const { data: cashInvoices = [] } = useCashInvoices()
  const { data: creditInvoices = [] } = useCreditInvoices()
  const { data: payments = [] } = usePayments()
  const { data: customers = [] } = useCustomers()
  const { data: reps = [] } = useReps()
  const { data: settings } = useSettings()

  const [sections, setSections] = useState<string[]>(() => {
    const initial = TAB_SECTIONS[defaultTab]
    return initial ? [initial] : ['cash']
  })
  const [customerId, setCustomerId] = useState('')
  const [repId, setRepId] = useState(defaultRepFilter !== 'all' ? defaultRepFilter : '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sharing, setSharing] = useState(false)

  const toggleSection = (key: string) => {
    setSections((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    )
  }

  const run = (action: 'print' | 'csv') => {
    if (!sections.length) {
      showToast('يرجى اختيار قسم واحد على الأقل للتقرير')
      return
    }
    if (from && to && from > to) {
      showToast('تاريخ البداية يجب أن يكون قبل تاريخ النهاية')
      return
    }

    const company = settings?.title || 'المؤسسة المصرية لتوزيع المواد الغذائية'
    const report = buildReport(
      { sections, customerId, repId, from, to, company },
      { cashInvoices, creditInvoices, payments, customers, reps }
    )

    const totalRows = report.sections.reduce((sum, section) => sum + section.rows.length, 0)
    if (!totalRows) {
      showToast('لا توجد بيانات مطابقة للفلاتر المحددة')
      return
    }

    if (action === 'print') {
      if (!printReport(report, company)) {
        showToast('يرجى السماح بالنوافذ المنبثقة للطباعة')
        return
      }
    } else {
      exportReportCsv(report, `تقرير-${getTodayISO()}.csv`, company)
      showToast('تم تصدير التقرير بنجاح')
    }
    onClose()
  }

  const handleShareWhatsApp = async () => {
    if (!sections.length) {
      showToast('يرجى اختيار قسم واحد على الأقل للتقرير')
      return
    }
    if (from && to && from > to) {
      showToast('تاريخ البداية يجب أن يكون قبل تاريخ النهاية')
      return
    }

    const company = settings?.title || 'المؤسسة المصرية لتوزيع المواد الغذائية'
    const report = buildReport(
      { sections, customerId, repId, from, to, company },
      { cashInvoices, creditInvoices, payments, customers, reps }
    )

    const totalRows = report.sections.reduce((sum, section) => sum + section.rows.length, 0)
    if (!totalRows) {
      showToast('لا توجد بيانات مطابقة للفلاتر المحددة')
      return
    }

    setSharing(true)
    try {
      await shareGeneralReportWhatsApp({ report, companyName: company })
      showToast('تم تجهيز التقرير للمشاركة عبر واتساب')
    } catch (err) {
      console.error('Failed to share general report via WhatsApp:', err)
      showToast('تعذر مشاركة التقرير عبر واتساب')
    } finally {
      setSharing(false)
    }
  }

  return (
    <Modal
      title="طباعة وتصدير التقارير المالية"
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center gap-2.5 flex-wrap">
          <WhatsAppShareButton
            onClick={handleShareWhatsApp}
            loading={sharing}
            label="مشاركة واتساب (PDF)"
            title="إنشاء ملف PDF ومشاركته مباشرة عبر واتساب"
          />
          <button
            onClick={onClose}
            className="app-btn app-btn-ghost px-5"
          >
            إلغاء
          </button>
          <button
            onClick={() => run('csv')}
            className={`app-btn ${defaultAction === 'csv' ? 'app-btn-primary' : 'app-btn-ghost'} px-5`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            <span>تصدير ملف CSV</span>
          </button>
          <button
            onClick={() => run('print')}
            className={`app-btn ${defaultAction === 'print' ? 'app-btn-primary' : 'app-btn-ghost'} px-5`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            <span>طباعة التقرير</span>
          </button>
        </div>
      }
    >
      <div className="space-y-5" dir="rtl">
        {/* Sections Selection */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">
            اختر الأقسام المراد تضمينها في التقرير:
          </label>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {REPORT_SECTIONS.map((section) => {
              const checked = sections.includes(section.key)
              return (
                <label
                  key={section.key}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-xs sm:text-sm font-semibold transition-all ${
                    checked
                      ? 'border-primary-600 bg-primary-50 text-primary-900 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSection(section.key)}
                    className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4"
                  />
                  <span>{section.title}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Filters */}
        <div className="grid gap-3.5 sm:grid-cols-2 bg-slate-50 p-4.5 rounded-2xl border border-slate-200">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">تصفية حسب العميل</label>
            <select
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              className="app-select"
            >
              <option value="">جميع العملاء</option>
              {customers.map((customer: any) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">تصفية حسب المندوب</label>
            <select
              value={repId}
              onChange={(event) => setRepId(event.target.value)}
              className="app-select"
            >
              <option value="">جميع المناديب</option>
              {reps.map((rep: any) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">من تاريخ</label>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="app-input font-mono"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">إلى تاريخ</label>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="app-input font-mono"
            />
          </div>
        </div>

        <p className="text-xs text-slate-400 font-medium">
          ملاحظة: عند ترك حقلي التاريخين فارغين، سيشمل التقرير جميع الفترات المسجلة في النظام.
        </p>
      </div>
    </Modal>
  )
}
