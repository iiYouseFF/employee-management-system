import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import Modal from '@/shared/ui/Modal'
import { useSettings } from '@/features/settings/useSettings'
import CumulativeCustomerStatementModal from '@/features/statements/CumulativeCustomerStatementModal'
import { exportCSV } from '@/features/reporting/csv'
import { shareProductConsumptionReportWhatsApp } from '@/features/reporting/productAnalyticsReport'
import { friendlyError } from '@/shared/lib/errors'
import {
  formatLocalDate,
  formatLocalNumber,
  getUiLang,
  localISODate,
  t,
  type UiLang,
} from '@/shared/lib/bilingual'
import {
  useProductAnalytics,
  type ProductCustomerBreakdownRow,
} from '@/shared/hooks/useProductAnalytics'
import { useAuth } from '@/features/auth/useAuth'

export interface AnalyticsProduct {
  id: string
  name_ar: string
  name_en?: string | null
  sku?: string | null
  unit?: string | null
  price: number | string
}

type AnalyticsPreset = 'month' | '3months' | 'year' | 'custom'
type Bucket = 'day' | 'week' | 'month'

interface ProductConsumptionModalProps {
  product: AnalyticsProduct
  stockQty?: number | string | null
  onClose: () => void
}

function rangeForPreset(preset: AnalyticsPreset): { from: string; to: string } {
  const today = new Date()
  const to = localISODate(today)
  if (preset === 'month') {
    return { from: localISODate(new Date(today.getFullYear(), today.getMonth(), 1)), to }
  }
  if (preset === '3months') {
    const from = new Date(today)
    from.setMonth(from.getMonth() - 3)
    return { from: localISODate(from), to }
  }
  if (preset === 'year') {
    return { from: `${today.getFullYear()}-01-01`, to }
  }
  return { from: '', to }
}

function bucketForRange(from: string, to: string): Bucket {
  const start = new Date(`${from || localISODate(new Date())}T00:00:00`).getTime()
  const end = new Date(`${to || localISODate(new Date())}T00:00:00`).getTime()
  const days = Math.max(1, Math.ceil((end - start) / 86_400_000) + 1)
  return days <= 31 ? 'day' : days <= 120 ? 'week' : 'month'
}

function bucketKey(txDate: string, bucket: Bucket): string {
  const date = new Date(`${txDate}T00:00:00`)
  if (bucket === 'month') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  if (bucket === 'week') {
    const start = new Date(date)
    // Egypt's week starts on Saturday (0=Sunday → shift by 6).
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    return localISODate(start)
  }
  return localISODate(date)
}

function bucketLabel(key: string, bucket: Bucket, lang: UiLang): string {
  if (bucket === 'month') {
    const [year, month] = key.split('-')
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
      month: 'short',
      year: 'numeric',
    }).format(new Date(Number(year), Number(month) - 1, 1))
  }
  return formatLocalDate(key, lang)
}

function KpiCard({
  label,
  value,
  hint,
  numeric = false,
}: {
  label: string
  value: string
  hint?: string
  numeric?: boolean
}) {
  return (
    <div className="app-card p-3 sm:p-4 min-w-0">
      <p className="text-[11px] sm:text-xs text-slate-500 font-semibold truncate">{label}</p>
      <p className={`mt-1 text-lg sm:text-2xl font-extrabold text-slate-800 truncate ${numeric ? 'tabular-nums' : ''}`}>
        {value}
      </p>
      {hint && <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">{hint}</p>}
    </div>
  )
}

export default function ProductConsumptionModal({
  product,
  stockQty,
  onClose,
}: ProductConsumptionModalProps) {
  const lang: UiLang = getUiLang()
  const { data: settings } = useSettings()
  const initialRange = useMemo(() => rangeForPreset('month'), [])

  const [preset, setPreset] = useState<AnalyticsPreset>('month')
  const [from, setFrom] = useState(initialRange.from)
  const [to, setTo] = useState(initialRange.to)
  const [showHistory, setShowHistory] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<ProductCustomerBreakdownRow | null>(null)
  const { can } = useAuth()
  const canExportPrint = can('export_print')

  const { summary, breakdown, history, isLoading, isError, error, refetch } =
    useProductAnalytics(product.id, from, to)

  const bucket = useMemo(() => bucketForRange(from, to), [from, to])
  const chartData = useMemo(() => {
    const groups = new Map<string, { label: string; qty: number }>()
    history.forEach((row) => {
      const key = bucketKey(row.tx_date, bucket)
      const entry = groups.get(key) ?? { label: bucketLabel(key, bucket, lang), qty: 0 }
      entry.qty += Number(row.qty) || 0
      groups.set(key, entry)
    })
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, entry]) => entry)
  }, [history, bucket, lang])

  const productTitle = lang === 'ar'
    ? (product.name_ar || product.name_en || '—')
    : (product.name_en || product.name_ar || '—')

  const applyPreset = (next: AnalyticsPreset) => {
    setPreset(next)
    if (next === 'custom') return
    const range = rangeForPreset(next)
    setFrom(range.from)
    setTo(range.to)
  }

  const handleExportCsv = () => {
    if (!breakdown.length && !history.length) return
    const headers = lang === 'ar'
      ? ['القسم', 'العميل', 'الهاتف', 'المندوب', 'عدد الفواتير', 'الكمية', 'النسبة %', 'الإيراد', 'آخر شراء', 'التاريخ', 'رقم الفاتورة', 'النوع', 'سعر الوحدة', 'الإجمالي']
      : ['Section', 'Customer', 'Phone', 'Rep', 'Invoices', 'Qty', 'Share %', 'Revenue', 'Last purchase', 'Date', 'Invoice no.', 'Type', 'Unit price', 'Total']

    const rows: Record<string, string | number>[] = [
      ...breakdown.map((row) => ({
        [headers[0]]: t(lang, 'العملاء', 'Customers'),
        [headers[1]]: row.customer_name,
        [headers[2]]: row.customer_phone || '',
        [headers[3]]: row.rep_name || '',
        [headers[4]]: row.order_count,
        [headers[5]]: row.total_qty,
        [headers[6]]: row.share_pct,
        [headers[7]]: row.total_revenue,
        [headers[8]]: row.last_purchase_date,
      })),
      ...history.map((row) => ({
        [headers[0]]: t(lang, 'الفواتير', 'Invoices'),
        [headers[1]]: row.customer_name,
        [headers[2]]: '',
        [headers[3]]: row.rep_name || '',
        [headers[9]]: row.tx_date,
        [headers[10]]: row.invoice_no,
        [headers[11]]: row.invoice_type === 'cash' ? t(lang, 'كاش', 'Cash') : t(lang, 'آجل', 'Credit'),
        [headers[12]]: row.unit_price,
        [headers[13]]: row.line_total,
        [headers[5]]: row.qty,
      })),
    ]
    exportCSV(
      `product-analytics-${(product.sku || product.name_ar).replace(/[^\p{L}\p{N}_-]+/gu, '_')}.csv`,
      rows,
      headers,
    )
  }

  const handleSharePdf = async () => {
    setSharing(true)
    setShareError('')
    try {
      await shareProductConsumptionReportWhatsApp({
        product,
        from,
        to,
        summary,
        breakdown,
        history,
        companyName: settings?.title || (lang === 'ar' ? 'شركة توريد' : 'Tawreed'),
        lang,
      })
    } catch (err) {
      setShareError(friendlyError(err, t(lang, 'تعذّر إنشاء ملف PDF للمشاركة.', 'Could not create the PDF for sharing.')))
    } finally {
      setSharing(false)
    }
  }

  const presets: { id: AnalyticsPreset; ar: string; en: string }[] = [
    { id: 'month', ar: 'هذا الشهر', en: 'This month' },
    { id: '3months', ar: 'آخر 3 شهور', en: 'Last 3 months' },
    { id: 'year', ar: 'هذا العام', en: 'This year' },
    { id: 'custom', ar: 'مخصص', en: 'Custom' },
  ]

  return (
    <Modal
      wide
      onClose={onClose}
      title={t(lang, 'تحليل مبيعات الصنف', 'Product sales analytics')}
      subtitle={`${productTitle}${product.sku ? ` · ${product.sku}` : ''}`}
    >
      <div className="space-y-5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {/* Header identity + current stock */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h3 className="text-base sm:text-xl font-extrabold text-slate-900">{productTitle}</h3>
              {lang === 'ar' && product.name_en && (
                <p className="text-xs text-slate-400 font-sans" dir="ltr">{product.name_en}</p>
              )}
              {lang === 'en' && product.name_ar && (
                <p className="text-xs text-slate-500" dir="rtl">{product.name_ar}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {product.sku && <span className="font-mono rounded bg-slate-100 border border-slate-200 px-2 py-0.5" dir="ltr">{product.sku}</span>}
                <span>{t(lang, 'الوحدة', 'Unit')}: {product.unit || '—'}</span>
                <span>{t(lang, 'سعر البيع', 'Price')}: <b className="tabular-nums text-slate-700">{formatLocalNumber(product.price, lang)}</b></span>
              </div>
            </div>
            <div className="text-end shrink-0">
              <p className="text-[11px] text-slate-500 font-semibold">{t(lang, 'المخزون الحالي', 'On-hand stock')}</p>
              <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 text-sm font-extrabold tabular-nums">
                {stockQty === null || stockQty === undefined ? '—' : formatLocalNumber(stockQty, lang, 4)}
                {stockQty !== null && stockQty !== undefined && <span className="text-xs font-semibold ms-1">{product.unit || ''}</span>}
              </span>
            </div>
          </div>
        </div>

        {/* Date presets + actions */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {presets.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => applyPreset(item.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  preset === item.id
                    ? 'bg-primary-700 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t(lang, item.ar, item.en)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0">
              <label className="block text-xs font-bold text-slate-600 mb-1">{t(lang, 'من', 'From')}</label>
              <input
                type="date"
                value={from}
                dir="ltr"
                onChange={(e) => { setPreset('custom'); setFrom(e.target.value) }}
                className="app-input text-xs py-2"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-xs font-bold text-slate-600 mb-1">{t(lang, 'إلى', 'To')}</label>
              <input
                type="date"
                value={to}
                dir="ltr"
                onChange={(e) => { setPreset('custom'); setTo(e.target.value) }}
                className="app-input text-xs py-2"
              />
            </div>
            {canExportPrint && (
            <div className="flex flex-wrap gap-2 ms-auto">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={isLoading || (!breakdown.length && !history.length)}
                className="app-btn app-btn-ghost text-xs py-2 disabled:opacity-50"
              >
                {t(lang, 'تصدير CSV', 'Export CSV')}
              </button>
              <button
                type="button"
                onClick={handleSharePdf}
                disabled={isLoading || sharing}
                className="app-btn app-btn-primary text-xs py-2 disabled:opacity-50"
              >
                {sharing ? t(lang, 'جاري الإعداد...', 'Preparing...') : t(lang, 'مشاركة PDF واتساب', 'Share PDF on WhatsApp')}
              </button>
            </div>
            )}
          </div>
          {shareError && (
            <p className="text-xs font-semibold text-rose-700 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2">{shareError}</p>
          )}
        </div>

        {isError && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-800">
            <span>{error || t(lang, 'تعذّر تحميل بيانات التحليل.', 'Could not load analytics data.')}</span>
            <button type="button" onClick={() => void refetch()} className="app-btn app-btn-ghost text-xs py-1.5">
              {t(lang, 'إعادة المحاولة', 'Retry')}
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">
            <div className="inline-flex items-center gap-2">
              <span className="h-4 w-4 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
              {t(lang, 'جاري تحميل تحليل المبيعات...', 'Loading sales analytics...')}
            </div>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                label={t(lang, 'إجمالي الكمية المباعة', 'Total quantity sold')}
                value={`${formatLocalNumber(summary.total_qty, lang, 4)} ${product.unit || ''}`}
                hint={t(lang, 'خلال الفترة المحددة', 'Within selected range')}
                numeric
              />
              <KpiCard
                label={t(lang, 'إجمالي المبيعات (الإيرادات)', 'Total revenue')}
                value={formatLocalNumber(summary.total_revenue, lang)}
                hint={lang === 'ar' ? 'ج.م' : 'EGP'}
                numeric
              />
              <KpiCard
                label={t(lang, 'عدد العملاء المشترين', 'Buying customers')}
                value={formatLocalNumber(summary.unique_customers, lang, 0)}
                hint={`${t(lang, 'عدد الفواتير', 'Invoices')}: ${formatLocalNumber(summary.invoice_count, lang, 0)}`}
              />
              <KpiCard
                label={t(lang, 'متوسط سعر البيع', 'Average unit price')}
                value={formatLocalNumber(summary.avg_unit_price, lang)}
                hint={lang === 'ar' ? 'ج.م / وحدة' : 'EGP / unit'}
                numeric
              />
            </div>

            {/* Customer breakdown */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm sm:text-base font-extrabold text-slate-800">
                  {t(lang, 'تحليل العملاء الأكثر شراءً', 'Top buying customers')}
                </h4>
                <span className="text-xs text-slate-400">{breakdown.length} {t(lang, 'عميل', 'customers')}</span>
              </div>

              {breakdown.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-400">
                  {t(lang, 'لا يوجد عملاء اشتروا هذا الصنف في الفترة المحددة.', 'No customers bought this product in the selected range.')}
                </div>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto rounded-2xl border border-border">
                    <table className="app-table">
                      <thead>
                        <tr>
                          <th className="text-start">{t(lang, 'العميل', 'Customer')}</th>
                          <th className="text-center">{t(lang, 'المندوب', 'Rep')}</th>
                          <th className="text-center">{t(lang, 'الفواتير', 'Invoices')}</th>
                          <th className="text-center">{t(lang, 'الكمية', 'Qty')}</th>
                          <th className="text-center min-w-32">{t(lang, 'النسبة', 'Share')}</th>
                          <th className="text-center">{t(lang, 'الإيراد', 'Revenue')}</th>
                          <th className="text-center">{t(lang, 'آخر شراء', 'Last purchase')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdown.map((row, index) => (
                          <tr
                            key={row.customer_id ?? `guest-${index}`}
                            onClick={() => { if (row.customer_id) setSelectedCustomer(row) }}
                            className={`${row.customer_id ? 'cursor-pointer hover:bg-primary-50/50' : 'cursor-default'} transition-colors`}
                            title={row.customer_id ? t(lang, 'فتح كشف حساب العميل', 'Open customer statement') : undefined}
                          >
                            <td>
                              <div className="font-bold text-slate-800 text-sm">{row.customer_name || '—'}</div>
                              <div className="text-xs text-slate-400 font-mono" dir="ltr">{row.customer_phone || '—'}</div>
                            </td>
                            <td className="text-center text-xs text-slate-600">{row.rep_name || '—'}</td>
                            <td className="text-center text-xs tabular-nums">{formatLocalNumber(row.order_count, lang, 0)}</td>
                            <td className="text-center text-sm font-bold tabular-nums">{formatLocalNumber(row.total_qty, lang, 4)}</td>
                            <td className="text-center">
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-primary-600"
                                    style={{ width: `${Math.min(100, Math.max(0, Number(row.share_pct) || 0))}%` }}
                                  />
                                </div>
                                <span className="text-xs tabular-nums text-slate-600 w-14 text-end">{formatLocalNumber(row.share_pct, lang)}%</span>
                              </div>
                            </td>
                            <td className="text-center text-sm font-bold tabular-nums">{formatLocalNumber(row.total_revenue, lang)}</td>
                            <td className="text-center text-xs tabular-nums text-slate-500">{formatLocalDate(row.last_purchase_date, lang)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="md:hidden space-y-2.5">
                    {breakdown.map((row, index) => (
                      <button
                        key={row.customer_id ?? `guest-${index}`}
                        type="button"
                        onClick={() => { if (row.customer_id) setSelectedCustomer(row) }}
                        disabled={!row.customer_id}
                        className="w-full text-start rounded-2xl border border-border bg-white p-3.5 space-y-2.5 shadow-xs disabled:cursor-default"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-slate-800 truncate">{row.customer_name || '—'}</div>
                            <div className="text-xs text-slate-400 font-mono truncate" dir="ltr">{row.customer_phone || '—'}</div>
                          </div>
                          <div className="text-end shrink-0">
                            <div className="text-sm font-extrabold text-primary-800 tabular-nums">{formatLocalNumber(row.total_revenue, lang)}</div>
                            <div className="text-[10px] text-slate-400">{t(lang, 'إيراد', 'Revenue')}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs bg-slate-50 rounded-xl p-2">
                          <div>
                            <div className="text-[10px] text-slate-400">{t(lang, 'الفواتير', 'Invoices')}</div>
                            <div className="font-bold tabular-nums">{formatLocalNumber(row.order_count, lang, 0)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-400">{t(lang, 'الكمية', 'Qty')}</div>
                            <div className="font-bold tabular-nums">{formatLocalNumber(row.total_qty, lang, 4)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-400">{t(lang, 'النسبة', 'Share')}</div>
                            <div className="font-bold tabular-nums">{formatLocalNumber(row.share_pct, lang)}%</div>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary-600"
                            style={{ width: `${Math.min(100, Math.max(0, Number(row.share_pct) || 0))}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span>{row.rep_name || '—'}</span>
                          <span className="tabular-nums">{t(lang, 'آخر شراء', 'Last')}: {formatLocalDate(row.last_purchase_date, lang)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* Trend chart */}
            <section className="space-y-3">
              <h4 className="text-sm sm:text-base font-extrabold text-slate-800">
                {t(lang, 'اتجاه المبيعات والاستهلاك', 'Sales & consumption trend')}
                <span className="text-xs font-medium text-slate-400 ms-2">
                  ({bucket === 'day' ? t(lang, 'يومي', 'Daily') : bucket === 'week' ? t(lang, 'أسبوعي', 'Weekly') : t(lang, 'شهري', 'Monthly')})
                </span>
              </h4>
              {chartData.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-400">
                  {t(lang, 'لا توجد مبيعات لرسم الاتجاه في هذه الفترة.', 'No sales to chart in this period.')}
                </div>
              ) : (
                <div className="h-64 sm:h-80 w-full rounded-2xl border border-slate-200 bg-white p-2 sm:p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={24} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} width={48} allowDecimals={false} />
                      <Tooltip cursor={{ fill: '#f1f5f9' }} />
                      <Bar dataKey="qty" name={t(lang, 'الكمية', 'Qty')} fill="#1a4971" radius={[4, 4, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            {/* Detailed invoice log */}
            <section className="space-y-3">
              <button
                type="button"
                onClick={() => setShowHistory((open) => !open)}
                className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-start"
              >
                <span className="text-sm font-extrabold text-slate-800">
                  {t(lang, 'سجل الفواتير التفصيلي', 'Detailed invoice lines log')}
                  <span className="text-xs font-medium text-slate-400 ms-2">({history.length})</span>
                </span>
                <span className="text-xs font-bold text-primary-700">{showHistory ? '−' : '+'}</span>
              </button>

              {showHistory && (
                history.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-400">
                    {t(lang, 'لا توجد فواتير تحتوي على هذا الصنف في الفترة المحددة.', 'No invoices contain this product in the selected range.')}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="hidden md:block max-h-96 overflow-y-auto">
                      <table className="app-table">
                        <thead className="sticky top-0 z-10">
                          <tr>
                            <th className="text-center">{t(lang, 'التاريخ', 'Date')}</th>
                            <th className="text-center">{t(lang, 'رقم الفاتورة', 'Invoice no.')}</th>
                            <th className="text-center">{t(lang, 'النوع', 'Type')}</th>
                            <th className="text-start">{t(lang, 'العميل', 'Customer')}</th>
                            <th className="text-center">{t(lang, 'المندوب', 'Rep')}</th>
                            <th className="text-center">{t(lang, 'الكمية', 'Qty')}</th>
                            <th className="text-center">{t(lang, 'سعر الوحدة', 'Unit price')}</th>
                            <th className="text-center">{t(lang, 'الإجمالي', 'Total')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((row, index) => (
                            <tr key={`${row.invoice_id}-${row.invoice_type}-${index}`}>
                              <td className="text-center text-xs tabular-nums">{formatLocalDate(row.tx_date, lang)}</td>
                              <td className="text-center text-xs font-mono" dir="ltr">{row.invoice_no}</td>
                              <td className="text-center text-xs">
                                <span className={`badge text-[10px] ${row.invoice_type === 'cash' ? 'badge-success' : 'badge-primary'}`}>
                                  {row.invoice_type === 'cash' ? t(lang, 'كاش', 'Cash') : t(lang, 'آجل', 'Credit')}
                                </span>
                              </td>
                              <td className="text-xs text-slate-600">{row.customer_name || '—'}</td>
                              <td className="text-center text-xs text-slate-500">{row.rep_name || '—'}</td>
                              <td className="text-center text-xs font-bold tabular-nums">{formatLocalNumber(row.qty, lang, 4)}</td>
                              <td className="text-center text-xs tabular-nums">{formatLocalNumber(row.unit_price, lang)}</td>
                              <td className="text-center text-xs font-bold tabular-nums">{formatLocalNumber(row.line_total, lang)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="md:hidden max-h-[28rem] overflow-y-auto divide-y divide-slate-100">
                      {history.map((row, index) => (
                        <div key={`${row.invoice_id}-${row.invoice_type}-${index}`} className="p-3 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-slate-800 truncate">{row.customer_name || '—'}</div>
                              <div className="text-[10px] text-slate-400 font-mono" dir="ltr">{row.invoice_no} · {formatLocalDate(row.tx_date, lang)}</div>
                            </div>
                            <div className="text-sm font-extrabold tabular-nums text-primary-800 shrink-0">{formatLocalNumber(row.line_total, lang)}</div>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>{row.invoice_type === 'cash' ? t(lang, 'كاش', 'Cash') : t(lang, 'آجل', 'Credit')} · {row.rep_name || '—'}</span>
                            <span className="tabular-nums">{formatLocalNumber(row.qty, lang, 4)} × {formatLocalNumber(row.unit_price, lang)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </section>
          </>
        )}
      </div>

      {selectedCustomer?.customer_id && (
        <CumulativeCustomerStatementModal
          customer={{
            id: selectedCustomer.customer_id,
            name: selectedCustomer.customer_name,
            phone: selectedCustomer.customer_phone,
            representative_name: selectedCustomer.rep_name,
          }}
          onClose={() => setSelectedCustomer(null)}
        />
      )}
    </Modal>
  )
}
