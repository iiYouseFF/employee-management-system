import { useState } from 'react'
import { useCashInvoices, useCreditInvoices, usePayments } from '@/features/sales/useInvoices'
import { formatMoney, formatNumber, monthNames } from '@/shared/lib/format'
import PageHeader from '@/shared/ui/PageHeader'
import FilterToolbar from '@/shared/ui/FilterToolbar'
import ResponsiveDataView from '@/shared/ui/ResponsiveDataView'

const emptyMonth = () => ({
  cashM: 0,
  creditM: 0,
  payM: 0,
  paidM: 0,
  collections: 0,
  totalSales: 0,
  remainM: 0,
  invoiceCount: 0,
})

function monthlyFor(cashInvoices: any[], creditInvoices: any[], payments: any[], year: number) {
  return monthNames.map((monthName, monthIdx) => {
    const inMonth = (row: any) => {
      const d = new Date(row.date)
      return d.getMonth() === monthIdx && d.getFullYear() === year
    }

    const cashRows = cashInvoices.filter(inMonth)
    const creditRows = creditInvoices.filter(inMonth)
    const payRows = payments.filter(inMonth)

    const cashM = cashRows.reduce((s: number, r: any) => s + parseFloat(r.amount || 0), 0)
    const creditM = creditRows.reduce((s: number, r: any) => s + parseFloat(r.amount || 0), 0)
    const payM = payRows.reduce((s: number, r: any) => s + parseFloat(r.amount || 0), 0)
    const paidM = creditRows.reduce((s: number, r: any) => s + parseFloat(r.paid || 0), 0)
    const collections = payM + paidM
    const totalSales = cashM + creditM
    const remainM = creditM - collections
    const invoiceCount = cashRows.length + creditRows.length

    return {
      monthIdx,
      monthName,
      cashM,
      creditM,
      payM,
      paidM,
      collections,
      totalSales,
      remainM,
      invoiceCount,
    }
  })
}

function sumMonths(months: any[]) {
  return months.reduce((acc: any, m: any) => {
    acc.cashM += m.cashM
    acc.creditM += m.creditM
    acc.payM += m.payM
    acc.paidM += m.paidM
    acc.collections += m.collections
    acc.totalSales += m.totalSales
    acc.remainM += m.remainM
    acc.invoiceCount += m.invoiceCount
    return acc
  }, emptyMonth())
}

export default function MonthlyTab({ repFilter, reps = [] }: any) {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth()
  const [view, setView] = useState<'detailed' | 'matrix' | 'separate'>('detailed')

  const { data: cashInvoices = [], isLoading: loadingCash, error: cashError } = useCashInvoices(repFilter)
  const { data: creditInvoices = [], isLoading: loadingCredit, error: creditError } = useCreditInvoices(repFilter)
  const { data: payments = [], isLoading: loadingPayments, error: paymentsError } = usePayments(repFilter)

  const loading = loadingCash || loadingCredit || loadingPayments
  const error = cashError || creditError || paymentsError
    ? 'تعذّر تحميل بيانات التقرير المالي.'
    : undefined

  const visibleReps =
    repFilter && repFilter !== 'all' ? reps.filter((r: any) => r.id === repFilter) : reps

  const detailedData = monthlyFor(cashInvoices, creditInvoices, payments, currentYear)
  const yearlyTotals = sumMonths(detailedData)

  let carried = 0
  const detailedWithCarry = detailedData.map((m) => {
    carried += m.remainM
    return { ...m, carried }
  })

  const repRows: Array<{ rep: any; months: any[]; totals: any }> = visibleReps.map((rep: any) => {
    const months = monthlyFor(
      cashInvoices.filter((inv: any) => inv.rep_id === rep.id),
      creditInvoices.filter((inv: any) => inv.rep_id === rep.id),
      payments.filter((p: any) => p.rep_id === rep.id),
      currentYear
    )
    return { rep, months, totals: sumMonths(months) }
  })

  return (
    <div className="app-page space-y-5">
      {/* Header */}
      <PageHeader
        title={`الملخص والتقرير المالي الشهري - ${currentYear}`}
        subtitle="مقارنة المبيعات النقدية والآجلة ونسب التحصيل على مدار العام"
      />

      {/* Tab Controls */}
      <FilterToolbar>
        {/* View Mode Switcher */}
        <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
          <button
            onClick={() => setView('detailed')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              view === 'detailed'
                ? 'bg-white text-primary-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            تفصيلي شهري
          </button>
          <button
            onClick={() => setView('matrix')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              view === 'matrix'
                ? 'bg-white text-primary-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            مصفوفة المناديب
          </button>
          <button
            onClick={() => setView('separate')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              view === 'separate'
                ? 'bg-white text-primary-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            منفصل لكل مندوب
          </button>
        </div>
      </FilterToolbar>

      {/* View 1: Detailed Monthly Table */}
      {view === 'detailed' && (
        <ResponsiveDataView
          loading={loading}
          error={error}
          hasData={detailedWithCarry.length > 0}
          table={(
        <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
          <table className="app-table">
            <thead>
              <tr>
                <th className="w-36">الشهر</th>
                <th className="text-center">نقدي (ج.م)</th>
                <th className="text-center">آجل (ج.م)</th>
                <th className="text-center">تحصيلات (ج.م)</th>
                <th className="text-center font-bold">إجمالي المبيعات</th>
                <th className="text-center">متبقي للشهر</th>
                <th className="text-center font-bold">المتبقي التراكمي</th>
                <th className="text-center w-24">الفواتير</th>
              </tr>
            </thead>
            <tbody>
              {detailedWithCarry.map((month) => {
                const isCurrent = month.monthIdx === currentMonth
                return (
                  <tr
                    key={month.monthIdx}
                    className={isCurrent ? 'bg-amber-50/50 border-amber-200' : ''}
                  >
                    <td className="font-semibold text-slate-800 whitespace-nowrap">
                      <span>{month.monthName}</span>
                      {isCurrent && (
                        <span className="ms-2 px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-full text-[10px] font-bold">
                          الشهر الحالي
                        </span>
                      )}
                    </td>
                    <td className="text-center font-num text-xs font-bold text-slate-800 whitespace-nowrap" dir="ltr">
                      {formatMoney(month.cashM, { withCurrency: false })}
                    </td>
                    <td className="text-center font-num text-xs font-bold text-slate-800 whitespace-nowrap" dir="ltr">
                      {formatMoney(month.creditM, { withCurrency: false })}
                    </td>
                    <td className="text-center font-num text-xs text-emerald-700 font-bold whitespace-nowrap" dir="ltr">
                      {formatMoney(month.collections, { withCurrency: false })}
                    </td>
                    <td className="text-center font-num text-sm font-extrabold text-slate-950 whitespace-nowrap" dir="ltr">
                      {formatMoney(month.totalSales, { withCurrency: false })}
                    </td>
                    <td className="text-center font-num text-xs font-bold whitespace-nowrap" dir="ltr">
                      <span className={month.remainM > 0 ? 'text-rose-600 font-extrabold' : 'text-emerald-600 font-bold'}>
                        {formatMoney(month.remainM, { withCurrency: false })}
                      </span>
                    </td>
                    <td className="text-center font-num text-sm whitespace-nowrap" dir="ltr">
                      <span
                        className={
                          month.carried > 0 ? 'text-rose-700 font-extrabold' : 'text-emerald-700 font-bold'
                        }
                      >
                        {formatMoney(month.carried)}
                      </span>
                    </td>
                    <td className="text-center font-num text-xs font-bold text-slate-600" dir="ltr">
                      {formatNumber(month.invoiceCount)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-200">
                <td className="px-3.5 py-3 text-slate-950 font-extrabold">الإجمالي السنوي</td>
                <td className="px-3.5 py-3 text-center text-slate-950 font-num text-xs font-extrabold whitespace-nowrap" dir="ltr">
                  {formatMoney(yearlyTotals.cashM, { withCurrency: false })}
                </td>
                <td className="px-3.5 py-3 text-center text-slate-950 font-num text-xs font-extrabold whitespace-nowrap" dir="ltr">
                  {formatMoney(yearlyTotals.creditM, { withCurrency: false })}
                </td>
                <td className="px-3.5 py-3 text-center text-emerald-800 font-num text-xs font-extrabold whitespace-nowrap" dir="ltr">
                  {formatMoney(yearlyTotals.collections, { withCurrency: false })}
                </td>
                <td className="px-3.5 py-3 text-center text-slate-950 font-num text-sm font-extrabold whitespace-nowrap" dir="ltr">
                  {formatMoney(yearlyTotals.totalSales, { withCurrency: false })}
                </td>
                <td className="px-3.5 py-3 text-center text-rose-800 font-num text-sm font-extrabold whitespace-nowrap" dir="ltr">
                  {formatMoney(yearlyTotals.remainM, { withCurrency: false })}
                </td>
                <td className="px-3.5 py-3 text-center text-slate-800 font-num text-sm font-extrabold whitespace-nowrap" dir="ltr">
                  {formatMoney(yearlyTotals.remainM)}
                </td>
                <td className="px-3.5 py-3 text-center font-num text-xs font-bold text-slate-800" dir="ltr">
                  {formatNumber(yearlyTotals.invoiceCount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
          )}
        />
      )}

      {/* View 2: Rep Matrix Table */}
      {view === 'matrix' && (
        <ResponsiveDataView
          loading={loading}
          error={error}
          hasData={detailedData.length > 0}
          table={(
        <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
          <table className="app-table text-xs">
            <thead>
              <tr>
                <th className="sticky start-0 bg-slate-50/95 z-10 w-40">المندوب</th>
                {monthNames.map((m: string, idx: number) => (
                  <th
                    key={m}
                    className={`text-center whitespace-nowrap px-2 ${
                      idx === currentMonth ? 'bg-amber-100 text-amber-900' : ''
                    }`}
                  >
                    {m}
                  </th>
                ))}
                <th className="text-center font-bold bg-slate-100 w-32">إجمالي العام</th>
              </tr>
            </thead>
            <tbody>
              {repRows.map(({ rep, months, totals }) => (
                <tr key={rep.id}>
                  <td className="font-bold text-slate-800 sticky start-0 bg-white z-10 shadow-sm whitespace-nowrap">
                    {rep.name}
                  </td>
                  {months.map((m: any) => (
                    <td key={m.monthIdx} className="text-center font-num font-bold whitespace-nowrap px-2" dir="ltr">
                      {m.totalSales ? formatMoney(m.totalSales, { withCurrency: false }) : '-'}
                    </td>
                  ))}
                  <td className="text-center font-num font-extrabold text-slate-950 bg-slate-50 whitespace-nowrap" dir="ltr">
                    {formatMoney(totals.totalSales)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-200">
                <td className="sticky start-0 bg-slate-100 z-10 font-extrabold">الإجمالي الشهري</td>
                {monthNames.map((_, idx) => (
                  <td key={idx} className="text-center font-num font-extrabold text-slate-950 whitespace-nowrap px-2" dir="ltr">
                    {formatMoney(detailedData[idx].totalSales, { withCurrency: false })}
                  </td>
                ))}
                <td className="text-center font-num text-sm font-extrabold text-primary-900 bg-slate-200/80 whitespace-nowrap" dir="ltr">
                  {formatMoney(yearlyTotals.totalSales)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
          )}
        />
      )}

      {/* View 3: Separate Rep Cards */}
      {view === 'separate' && (
        <ResponsiveDataView
          loading={loading}
          error={error}
          hasData={repRows.length > 0}
          empty={
            <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
              <svg className="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              <h3 className="text-slate-700 font-bold text-base mb-1">لا يوجد مناديب مسجلين</h3>
            </div>
          }
          table={(
        <div className="space-y-6">
          {repRows.map(({ rep, months, totals }) => (
            <div key={rep.id} className="rounded-2xl border border-border shadow-sm overflow-hidden bg-white">
              <div className="bg-gradient-to-r from-slate-50 via-primary-50/30 to-white px-5 py-3.5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  <h3 className="font-bold text-slate-800 text-base">{rep.name}</h3>
                </div>
                <div className="flex items-center gap-3 text-xs flex-wrap font-semibold">
                  <span className="bg-white border border-slate-200 rounded-lg px-2.5 py-1">
                    المبيعات: <b className="font-num font-extrabold text-slate-950" dir="ltr">{formatMoney(totals.totalSales)}</b>
                  </span>
                  <span className="bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1 text-emerald-800">
                    التحصيلات: <b className="font-num font-extrabold" dir="ltr">{formatMoney(totals.collections)}</b>
                  </span>
                  <span className="bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1 text-rose-800">
                    المتبقي: <b className="font-num font-extrabold" dir="ltr">{formatMoney(totals.remainM)}</b>
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="app-table text-xs">
                  <thead>
                    <tr>
                      <th className="w-28">الشهر</th>
                      <th className="text-center">نقدي</th>
                      <th className="text-center">آجل</th>
                      <th className="text-center">تحصيلات</th>
                      <th className="text-center font-bold">المبيعات</th>
                      <th className="text-center">المتبقي</th>
                      <th className="text-center w-20">الفواتير</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m: any) => (
                      <tr
                        key={m.monthIdx}
                        className={m.monthIdx === currentMonth ? 'bg-amber-50/40' : ''}
                      >
                        <td className="font-bold text-slate-900">{m.monthName}</td>
                        <td className="text-center font-num font-bold" dir="ltr">{formatMoney(m.cashM, { withCurrency: false })}</td>
                        <td className="text-center font-num font-bold" dir="ltr">{formatMoney(m.creditM, { withCurrency: false })}</td>
                        <td className="text-center font-num text-emerald-700 font-bold" dir="ltr">
                          {formatMoney(m.collections, { withCurrency: false })}
                        </td>
                        <td className="text-center font-num font-extrabold text-slate-950" dir="ltr">
                          {formatMoney(m.totalSales, { withCurrency: false })}
                        </td>
                        <td className="text-center font-num font-bold" dir="ltr">
                          <span className={m.remainM > 0 ? 'text-rose-600 font-extrabold' : 'text-emerald-600 font-bold'}>
                            {formatMoney(m.remainM, { withCurrency: false })}
                          </span>
                        </td>
                        <td className="text-center font-num font-bold text-slate-600" dir="ltr">{formatNumber(m.invoiceCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
          )}
        />
      )}
    </div>
  )
}
