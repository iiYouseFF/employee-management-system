import { useMemo, useState } from 'react'
import PageHeader from '@/shared/ui/PageHeader'
import FilterToolbar from '@/shared/ui/FilterToolbar'
import ResponsiveDataView from '@/shared/ui/ResponsiveDataView'
import Pagination from '@/shared/ui/Pagination'
import InvoiceDetailsModal from '@/features/statements/InvoiceDetailsModal'
import { useSettings } from '@/features/settings/useSettings'
import {
  useUnpaidCreditInvoices,
  type UnpaidCreditInvoice,
} from '@/features/sales/useInvoices'
import { getTodayISO } from '@/shared/lib/format'
import {
  formatLocalDate,
  formatLocalNumber,
  getUiLang,
  t,
  type UiLang,
} from '@/shared/lib/bilingual'
import { exportCSV } from '@/features/reporting/csv'
import { buildUnifiedReportTemplate } from '@/features/reporting/pdfGenerators'
import { generatePdfFromHtml, sharePdfBlobViaWhatsApp } from '@/shared/lib/pdfShare'
import { useAuth } from '@/features/auth/useAuth'

type StatusFilter = 'all' | 'overdue' | 'within'

interface OverdueInvoicesTabProps {
  repFilter: string
  reps: { id: string; name: string }[]
  showToast: (msg: string) => void
}

function esc(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function delayLabel(row: UnpaidCreditInvoice, lang: UiLang): string {
  if (row.is_overdue) {
    return lang === 'ar'
      ? `متأخرة ${row.days_diff} يوم`
      : `Overdue ${row.days_diff} day${row.days_diff === 1 ? '' : 's'}`
  }
  if (row.days_diff === 0) return t(lang, 'مستحقة اليوم', 'Due today')
  const remaining = Math.abs(row.days_diff)
  return lang === 'ar'
    ? `متبقي ${remaining} يوم`
    : `${remaining} day${remaining === 1 ? '' : 's'} left`
}

function buildReportHtml(
  rows: UnpaidCreditInvoice[],
  lang: UiLang,
  companyName: string,
  totals: { overdue: number; within: number; count: number },
): string {
  const num = (value: number | string, digits = 2) => esc(formatLocalNumber(value, lang, digits))
  const date = (value: string) => esc(formatLocalDate(value, lang))
  const tableRows = rows.slice(0, 100).map((row) => `
    <tr>
      <td dir="ltr">${esc(row.invoice_no)}</td>
      <td>${esc(row.customer_name || '—')}</td>
      <td dir="ltr">${esc(row.customer_phone || '—')}</td>
      <td>${esc(row.rep_name || '—')}</td>
      <td class="num">${date(row.invoice_date)}</td>
      <td class="num">${date(row.due_date)}</td>
      <td>${esc(delayLabel(row, lang))}</td>
      <td class="num">${num(row.total_amount)}</td>
      <td class="num">${num(row.paid_amount)}</td>
      <td class="num">${num(row.remaining_amount)}</td>
    </tr>`).join('')
  const emptyRow = `<tr><td colspan="10" class="pdf-empty">${t(lang, 'لا توجد فواتير غير مسددة', 'No unpaid invoices')}</td></tr>`

  return buildUnifiedReportTemplate({
    companyName,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    docBadge: t(lang, 'تقرير الفواتير غير المسددة والمتأخرة', 'Unpaid & overdue invoices report'),
    entityTitle: t(lang, 'الذمم المدينة — فواتير آجل غير مسددة', 'Receivables — unpaid credit invoices'),
    entitySubtitle: `${t(lang, 'تاريخ التقرير', 'Report date')}: ${date(getTodayISO())}`,
    meta: [
      { label: t(lang, 'إجمالي المتأخرات', 'Total overdue'), value: num(totals.overdue) },
      { label: t(lang, 'مستحقات خلال 15 يوم', 'Due within 15 days'), value: num(totals.within) },
      { label: t(lang, 'عدد الفواتير غير المسددة', 'Unpaid invoice count'), value: num(totals.count, 0) },
    ],
    bodyHtml: `
      <section class="pdf-section">
        <h3 class="pdf-section-title">${t(lang, 'تفاصيل الفواتير', 'Invoice details')}</h3>
        <div class="pdf-table-wrap"><table class="pdf-table">
          <thead><tr>
            <th>${t(lang, 'رقم الفاتورة', 'Invoice no.')}</th>
            <th>${t(lang, 'العميل', 'Customer')}</th>
            <th>${t(lang, 'الهاتف', 'Phone')}</th>
            <th>${t(lang, 'المندوب', 'Rep')}</th>
            <th class="num">${t(lang, 'تاريخ الفاتورة', 'Invoice date')}</th>
            <th class="num">${t(lang, 'تاريخ الاستحقاق', 'Due date')}</th>
            <th>${t(lang, 'حالة التأخير', 'Delay status')}</th>
            <th class="num">${t(lang, 'الإجمالي', 'Total')}</th>
            <th class="num">${t(lang, 'المسدد', 'Paid')}</th>
            <th class="num">${t(lang, 'المتبقي', 'Remaining')}</th>
          </tr></thead>
          <tbody>${tableRows || emptyRow}</tbody>
        </table></div>
      </section>`,
    notes: rows.length > 100
      ? t(lang, `تم عرض أول 100 فاتورة من أصل ${rows.length} في ملف PDF.`, `Showing the first 100 of ${rows.length} invoices in this PDF.`)
      : undefined,
  })
}

export default function OverdueInvoicesTab({ repFilter, reps, showToast }: OverdueInvoicesTabProps) {
  const lang = getUiLang()
  const { data: rows = [], isLoading, error } = useUnpaidCreditInvoices()
  const { data: settings } = useSettings()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [rep, setRep] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const { can } = useAuth()
  const canExportPrint = can('export_print')

  const scopedRows = useMemo(
    () => (repFilter !== 'all' ? rows.filter((r) => r.rep_id === repFilter) : rows),
    [rows, repFilter],
  )

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return scopedRows.filter((row) => {
      if (statusFilter === 'overdue' && !row.is_overdue) return false
      if (statusFilter === 'within' && row.is_overdue) return false
      if (rep !== 'all' && row.rep_id !== rep) return false
      if (!term) return true
      return [row.invoice_no, row.customer_name, row.customer_phone]
        .some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [scopedRows, statusFilter, rep, search])

  // KPI cards and the PDF header must describe exactly the rows being listed/exported.
  const totals = useMemo(() => {
    const overdue = filteredRows
      .filter((r) => r.is_overdue)
      .reduce((sum, r) => sum + Number(r.remaining_amount || 0), 0)
    const within = filteredRows
      .filter((r) => !r.is_overdue)
      .reduce((sum, r) => sum + Number(r.remaining_amount || 0), 0)
    return { overdue, within, count: filteredRows.length }
  }, [filteredRows])

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1
  const visibleRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize],
  )

  const filters: { id: StatusFilter; ar: string; en: string }[] = [
    { id: 'all', ar: 'الكل', en: 'All unpaid' },
    { id: 'overdue', ar: 'متأخرة فقط', en: 'Overdue only' },
    { id: 'within', ar: 'غير متأخرة', en: 'Within 15 days' },
  ]

  const resetFilters = () => {
    setStatusFilter('all')
    setSearch('')
    setRep('all')
    setPage(1)
  }
  const hasActiveFilters = statusFilter !== 'all' || !!search.trim() || rep !== 'all'

  const handleExportCsv = () => {
    if (!filteredRows.length) {
      showToast(t(lang, 'لا توجد بيانات للتصدير', 'No data to export'))
      return
    }
    const headers = lang === 'ar'
      ? ['رقم الفاتورة', 'العميل', 'الهاتف', 'المندوب', 'تاريخ الفاتورة', 'تاريخ الاستحقاق', 'حالة التأخير', 'الإجمالي', 'المسدد', 'المتبقي']
      : ['Invoice no.', 'Customer', 'Phone', 'Rep', 'Invoice date', 'Due date', 'Delay status', 'Total', 'Paid', 'Remaining']
    const data = filteredRows.map((row) => Object.fromEntries([
      [headers[0], row.invoice_no],
      [headers[1], row.customer_name || ''],
      [headers[2], row.customer_phone || ''],
      [headers[3], row.rep_name || ''],
      [headers[4], row.invoice_date],
      [headers[5], row.due_date],
      [headers[6], delayLabel(row, lang)],
      [headers[7], Number(row.total_amount)],
      [headers[8], Number(row.paid_amount)],
      [headers[9], Number(row.remaining_amount)],
    ]))
    exportCSV(`unpaid-overdue-${getTodayISO()}.csv`, data, headers)
  }

  const handleSharePdf = async () => {
    if (!filteredRows.length) {
      showToast(t(lang, 'لا توجد بيانات للمشاركة', 'No data to share'))
      return
    }
    setSharing(true)
    try {
      const html = buildReportHtml(filteredRows, lang, settings?.title || t(lang, 'نظام المبيعات', 'Sales system'), totals)
      const blob = await generatePdfFromHtml(html)
      await sharePdfBlobViaWhatsApp({
        blob,
        filename: `unpaid-overdue-${getTodayISO()}.pdf`,
        message: t(lang, 'تقرير الفواتير غير المسددة والمتأخرة', 'Unpaid & overdue invoices report'),
      })
    } catch (e) {
      showToast((e as Error).message || t(lang, 'تعذّر إنشاء التقرير', 'Could not generate the report'))
    } finally {
      setSharing(false)
    }
  }

  const delayBadge = (row: UnpaidCreditInvoice) => (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${
      row.is_overdue
        ? 'bg-rose-100 text-rose-900 border-rose-300'
        : 'bg-amber-100 text-amber-900 border-amber-300'
    }`}>
      {delayLabel(row, lang)}
    </span>
  )

  return (
    <div className="app-page space-y-5">
      <PageHeader
        title={t(lang, 'الفواتير المتأخرة وغير المسددة', 'Unpaid & overdue invoices')}
        subtitle={t(lang, 'متابعة الذمم المدينة حسب أجل سداد 15 يوماً من تاريخ الفاتورة.', 'Track receivables with a 15-day payment term from the invoice date.')}
        count={`${filteredRows.length} ${t(lang, 'فاتورة', 'invoices')}`}
        actions={
          canExportPrint ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={handleExportCsv} className="app-btn app-btn-ghost text-xs">{t(lang, 'تصدير CSV', 'Export CSV')}</button>
              <button type="button" onClick={() => { void handleSharePdf() }} disabled={sharing} className="app-btn app-btn-primary text-xs">
                {sharing ? t(lang, 'جارٍ الإعداد...', 'Preparing...') : t(lang, 'مشاركة PDF واتساب', 'Share PDF on WhatsApp')}
              </button>
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5">
          <div className="text-[11px] font-bold text-rose-700">{t(lang, 'إجمالي المتأخرات', 'Total overdue')}</div>
          <div className="mt-1 text-lg font-extrabold text-rose-900 tabular-nums text-end">
            {formatLocalNumber(totals.overdue, lang)} <span className="text-xs font-bold">{t(lang, 'ج.م', 'EGP')}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
          <div className="text-[11px] font-bold text-amber-700">{t(lang, 'مستحقات خلال 15 يوم', 'Due within 15 days')}</div>
          <div className="mt-1 text-lg font-extrabold text-amber-900 tabular-nums text-end">
            {formatLocalNumber(totals.within, lang)} <span className="text-xs font-bold">{t(lang, 'ج.م', 'EGP')}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
          <div className="text-[11px] font-bold text-slate-600">{t(lang, 'عدد الفواتير غير المسددة', 'Unpaid invoice count')}</div>
          <div className="mt-1 text-lg font-extrabold text-slate-900 tabular-nums text-end">
            {formatLocalNumber(totals.count, lang, 0)}
          </div>
        </div>
      </div>

      <FilterToolbar
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder={t(lang, 'بحث برقم الفاتورة أو العميل أو الهاتف...', 'Search by invoice no., customer or phone...')}
        onReset={resetFilters}
        hasActiveFilters={hasActiveFilters}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => { setStatusFilter(f.id); setPage(1) }}
              className={`app-filter-chip ${statusFilter === f.id ? 'app-filter-chip-active' : ''}`}
            >
              {t(lang, f.ar, f.en)}
            </button>
          ))}
        </div>
        <select
          value={rep}
          onChange={(e) => { setRep(e.target.value); setPage(1) }}
          className="app-select text-xs"
          aria-label={t(lang, 'تصفية حسب المندوب', 'Filter by sales rep')}
        >
          <option value="all">{t(lang, 'كل المناديب', 'All reps')}</option>
          {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </FilterToolbar>

      <ResponsiveDataView
        loading={isLoading}
        error={error ? t(lang, 'تعذّر تحميل الفواتير غير المسددة. أعد المحاولة لاحقاً.', 'Could not load unpaid invoices. Please try again.') : undefined}
        hasData={filteredRows.length > 0}
        empty={t(lang, 'لا توجد فواتير غير مسددة مطابقة للفلاتر الحالية.', 'No unpaid invoices match the current filters.')}
        table={(
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
            <table className="app-table">
              <thead>
                <tr>
                  <th className="text-start">{t(lang, 'رقم الفاتورة', 'Invoice no.')}</th>
                  <th className="text-start">{t(lang, 'العميل', 'Customer')}</th>
                  <th className="text-start">{t(lang, 'المندوب', 'Sales rep')}</th>
                  <th className="text-center">{t(lang, 'تاريخ الفاتورة', 'Invoice date')}</th>
                  <th className="text-center">{t(lang, 'تاريخ الاستحقاق (+15 يوم)', 'Due date (+15 days)')}</th>
                  <th className="text-center">{t(lang, 'حالة التأخير', 'Delay status')}</th>
                  <th className="text-end">{t(lang, 'الإجمالي', 'Total')}</th>
                  <th className="text-end">{t(lang, 'المسدد', 'Paid')}</th>
                  <th className="text-end">{t(lang, 'المتبقي', 'Remaining')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.invoice_id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedId(row.invoice_id)}>
                    <td>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedId(row.invoice_id) }}
                        className="text-[var(--primary)] font-bold hover:underline font-mono"
                        dir="ltr"
                      >
                        {row.invoice_no}
                      </button>
                    </td>
                    <td>
                      <div className="font-semibold text-slate-800">{row.customer_name || '-'}</div>
                      <div className="text-[11px] text-slate-400 font-mono" dir="ltr">{row.customer_phone || '-'}</div>
                    </td>
                    <td>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                        {row.rep_name || '-'}
                      </span>
                    </td>
                    <td className="text-center text-xs text-slate-600 whitespace-nowrap tabular-nums">
                      {formatLocalDate(row.invoice_date, lang)}
                    </td>
                    <td className={`text-center text-xs whitespace-nowrap tabular-nums font-bold ${row.is_overdue ? 'text-rose-700' : 'text-slate-600'}`}>
                      {formatLocalDate(row.due_date, lang)}
                    </td>
                    <td className="text-center">{delayBadge(row)}</td>
                    <td className="text-end font-mono text-xs text-slate-700 tabular-nums">{formatLocalNumber(row.total_amount, lang)}</td>
                    <td className="text-end font-mono text-xs text-emerald-700 tabular-nums">{formatLocalNumber(row.paid_amount, lang)}</td>
                    <td className="text-end font-mono text-sm font-bold text-rose-700 tabular-nums">{formatLocalNumber(row.remaining_amount, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        cards={(
          <div className="space-y-3">
            {visibleRows.map((row) => (
              <button
                key={row.invoice_id}
                type="button"
                onClick={() => setSelectedId(row.invoice_id)}
                className="w-full text-start app-card p-3.5 space-y-2.5 hover:border-[var(--primary)] transition"
              >
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="min-w-0">
                    <span className="text-[var(--primary)] font-bold hover:underline font-mono text-sm block" dir="ltr">
                      {row.invoice_no}
                    </span>
                    <span className="font-semibold text-slate-800 text-sm block">{row.customer_name || '-'}</span>
                    <span className="text-[11px] text-slate-400 font-mono" dir="ltr">{row.customer_phone || '-'}</span>
                  </div>
                  <div className="text-end shrink-0">
                    <span className="font-mono font-black text-rose-700 text-base block tabular-nums">
                      {formatLocalNumber(row.remaining_amount, lang)}
                    </span>
                    <span className="text-[10px] text-slate-400">{t(lang, 'المتبقي ج.م', 'Remaining EGP')}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">{row.rep_name || '-'}</span>
                  {delayBadge(row)}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 tabular-nums">
                  <span>{t(lang, 'الفاتورة', 'Invoice')}: {formatLocalDate(row.invoice_date, lang)}</span>
                  <span className={row.is_overdue ? 'text-rose-700 font-bold' : ''}>
                    {t(lang, 'الاستحقاق', 'Due')}: {formatLocalDate(row.due_date, lang)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
        footer={(
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={filteredRows.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      />

      {selectedId && (
        <InvoiceDetailsModal
          invoiceId={selectedId}
          invoiceType="credit"
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
