import { useState } from 'react'
import { useCashInvoices, useCreditInvoices, usePayments } from '../../hooks/useInvoices'
import { formatNumber, monthNames } from '../../lib/format'

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

  const { data: cashInvoices = [] } = useCashInvoices(repFilter)
  const { data: creditInvoices = [] } = useCreditInvoices(repFilter)
  const { data: payments = [] } = usePayments(repFilter)

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
    <div>
      {/* Tab Header Controls */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">الملخص والتقرير المالي الشهري - {currentYear}</h2>
          <p className="text-xs text-slate-500 mt-0.5">مقارنة المبيعات النقدية والآجلة ونسب التحصيل على مدار العام</p>
        </div>

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
      </div>

      {/* View 1: Detailed Monthly Table */}
      {view === 'detailed' && (
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
                    <td className="text-center font-mono text-xs text-slate-700 whitespace-nowrap">
                      {formatNumber(month.cashM)}
                    </td>
                    <td className="text-center font-mono text-xs text-slate-700 whitespace-nowrap">
                      {formatNumber(month.creditM)}
                    </td>
                    <td className="text-center font-mono text-xs text-emerald-700 font-semibold whitespace-nowrap">
                      {formatNumber(month.collections)}
                    </td>
                    <td className="text-center font-mono text-sm font-bold text-slate-900 whitespace-nowrap">
                      {formatNumber(month.totalSales)}
                    </td>
                    <td className="text-center font-mono text-xs whitespace-nowrap">
                      <span className={month.remainM > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600'}>
                        {formatNumber(month.remainM)}
                      </span>
                    </td>
                    <td className="text-center font-mono text-sm whitespace-nowrap">
                      <span
                        className={
                          month.carried > 0 ? 'text-rose-700 font-extrabold' : 'text-emerald-700 font-bold'
                        }
                      >
                        {formatNumber(month.carried)} ج.م
                      </span>
                    </td>
                    <td className="text-center font-mono text-xs text-slate-500">
                      {month.invoiceCount}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-200">
                <td className="px-3.5 py-3 text-slate-900 font-extrabold">الإجمالي السنوي</td>
                <td className="px-3.5 py-3 text-center text-slate-900 font-mono text-xs font-bold whitespace-nowrap">
                  {formatNumber(yearlyTotals.cashM)}
                </td>
                <td className="px-3.5 py-3 text-center text-slate-900 font-mono text-xs font-bold whitespace-nowrap">
                  {formatNumber(yearlyTotals.creditM)}
                </td>
                <td className="px-3.5 py-3 text-center text-emerald-800 font-mono text-xs font-bold whitespace-nowrap">
                  {formatNumber(yearlyTotals.collections)}
                </td>
                <td className="px-3.5 py-3 text-center text-slate-900 font-mono text-sm font-extrabold whitespace-nowrap">
                  {formatNumber(yearlyTotals.totalSales)}
                </td>
                <td className="px-3.5 py-3 text-center text-rose-800 font-mono text-sm font-extrabold whitespace-nowrap">
                  {formatNumber(yearlyTotals.remainM)}
                </td>
                <td className="px-3.5 py-3 text-center text-slate-700 font-mono text-sm font-extrabold whitespace-nowrap">
                  {formatNumber(yearlyTotals.remainM)} ج.م
                </td>
                <td className="px-3.5 py-3 text-center font-mono text-xs text-slate-700">
                  {yearlyTotals.invoiceCount}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* View 2: Rep Matrix Table */}
      {view === 'matrix' && (
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
                    <td key={m.monthIdx} className="text-center font-mono whitespace-nowrap px-2">
                      {m.totalSales ? formatNumber(m.totalSales) : '-'}
                    </td>
                  ))}
                  <td className="text-center font-mono font-bold text-slate-900 bg-slate-50 whitespace-nowrap">
                    {formatNumber(totals.totalSales)} ج.م
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-200">
                <td className="sticky start-0 bg-slate-100 z-10 font-extrabold">الإجمالي الشهري</td>
                {monthNames.map((_, idx) => (
                  <td key={idx} className="text-center font-mono font-bold text-slate-900 whitespace-nowrap px-2">
                    {formatNumber(detailedData[idx].totalSales)}
                  </td>
                ))}
                <td className="text-center font-mono text-sm font-extrabold text-primary-900 bg-slate-200/80 whitespace-nowrap">
                  {formatNumber(yearlyTotals.totalSales)} ج.م
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* View 3: Separate Rep Cards */}
      {view === 'separate' && (
        <div className="space-y-6">
          {repRows.length === 0 && (
            <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
              <svg className="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              <h3 className="text-slate-700 font-bold text-base mb-1">لا يوجد مناديب مسجلين</h3>
            </div>
          )}
          {repRows.map(({ rep, months, totals }) => (
            <div key={rep.id} className="rounded-2xl border border-border shadow-sm overflow-hidden bg-white">
              <div className="bg-gradient-to-r from-slate-50 via-primary-50/30 to-white px-5 py-3.5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  <h3 className="font-bold text-slate-800 text-base">{rep.name}</h3>
                </div>
                <div className="flex items-center gap-3 text-xs flex-wrap font-medium">
                  <span className="bg-white border border-slate-200 rounded-lg px-2.5 py-1">
                    المبيعات: <b className="font-mono text-slate-900">{formatNumber(totals.totalSales)} ج.م</b>
                  </span>
                  <span className="bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1 text-emerald-800">
                    التحصيلات: <b className="font-mono">{formatNumber(totals.collections)} ج.م</b>
                  </span>
                  <span className="bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1 text-rose-800">
                    المتبقي: <b className="font-mono">{formatNumber(totals.remainM)} ج.م</b>
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
                        <td className="font-semibold text-slate-800">{m.monthName}</td>
                        <td className="text-center font-mono">{formatNumber(m.cashM)}</td>
                        <td className="text-center font-mono">{formatNumber(m.creditM)}</td>
                        <td className="text-center font-mono text-emerald-700 font-semibold">
                          {formatNumber(m.collections)}
                        </td>
                        <td className="text-center font-mono font-bold text-slate-900">
                          {formatNumber(m.totalSales)}
                        </td>
                        <td className="text-center font-mono">
                          <span className={m.remainM > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600'}>
                            {formatNumber(m.remainM)}
                          </span>
                        </td>
                        <td className="text-center font-mono text-slate-500">{m.invoiceCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
