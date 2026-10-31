import { useState, useMemo } from 'react'
import { useCustomerStatement } from '../../hooks/useInvoices'
import { formatNumber } from '../../lib/format'
import CumulativeCustomerStatementModal from '../CumulativeCustomerStatementModal'

export default function StatementTab({ repFilter }: any) {
  const { data: statement = [] } = useCustomerStatement(repFilter)
  const [searchTerm, setSearchTerm] = useState('')
  const [statementCustomer, setStatementCustomer] = useState<any | null>(null)

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return statement
    const term = searchTerm.toLowerCase().trim()
    return statement.filter(
      (c: any) =>
        (c.customer || '').toLowerCase().includes(term) ||
        (c.phone || '').includes(term)
    )
  }, [statement, searchTerm])

  const totals = filtered.reduce(
    (acc: any, cust: any) => {
      acc.cashTot += parseFloat(cust.cash_tot || 0)
      acc.creditTot += parseFloat(cust.credit_tot || 0)
      acc.payTot += parseFloat(cust.pay_tot || 0)
      acc.remaining += parseFloat(cust.remaining || 0)
      return acc
    },
    { cashTot: 0, creditTot: 0, payTot: 0, remaining: 0 }
  )

  return (
    <div>
      {/* Header Controls & Search */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-800">كشف أرصدة وحسابات العملاء المجمعة</h2>
          <span className="badge badge-primary">{filtered.length} عميل</span>
        </div>

        <div className="relative min-w-[240px] sm:w-72">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث باسم العميل أو رقم الهاتف..."
            className="app-input py-2 text-xs sm:text-sm"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold block mb-1">إجمالي النقدي</span>
          <span className="text-base sm:text-lg font-extrabold text-slate-900 font-mono">
            {formatNumber(totals.cashTot)} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </span>
        </div>

        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 shadow-sm">
          <span className="text-xs text-amber-700 font-semibold block mb-1">إجمالي مبيعات الآجل</span>
          <span className="text-base sm:text-lg font-extrabold text-amber-800 font-mono">
            {formatNumber(totals.creditTot)} <span className="text-xs font-normal text-amber-600">ج.م</span>
          </span>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3.5 shadow-sm">
          <span className="text-xs text-emerald-700 font-semibold block mb-1">إجمالي المدفوعات</span>
          <span className="text-base sm:text-lg font-extrabold text-emerald-800 font-mono">
            {formatNumber(totals.payTot)} <span className="text-xs font-normal text-emerald-600">ج.م</span>
          </span>
        </div>

        <div className="bg-rose-50/70 border border-rose-200/80 rounded-2xl p-3.5 shadow-sm">
          <span className="text-xs text-rose-700 font-semibold block mb-1">إجمالي الرصيد المتبقي</span>
          <span className="text-base sm:text-lg font-extrabold text-rose-800 font-mono">
            {formatNumber(totals.remaining)} <span className="text-xs font-normal text-rose-600">ج.م</span>
          </span>
        </div>
      </div>

      {/* Modern Table */}
      <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
        <table className="app-table">
          <thead>
            <tr>
              <th className="w-12 text-center">#</th>
              <th>العميل</th>
              <th className="text-center">الهاتف</th>
              <th>المناديب المسندين</th>
              <th className="text-center">إجمالي نقدي</th>
              <th className="text-center">إجمالي آجل</th>
              <th className="text-center">إجمالي المدفوعات</th>
              <th className="text-center font-bold">الرصيد المتبقي</th>
              <th className="text-center">الحالة</th>
              <th className="text-center w-32">كشف تراكمي</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((customer: any, idx: number) => {
              const remaining = parseFloat(customer.remaining || 0)
              const custObj = {
                id: customer.customer_id,
                name: customer.customer,
                phone: customer.phone,
                representative_name: customer.reps_list,
              }
              return (
                <tr key={customer.customer_id}>
                  <td className="text-center text-xs text-slate-400 font-mono">
                    {filtered.length - idx}
                  </td>
                  <td className="font-semibold text-slate-900">
                    <button
                      onClick={() => setStatementCustomer(custObj)}
                      className="text-start font-bold text-primary-700 hover:text-primary-800 hover:underline flex items-center gap-1.5"
                      title="انقر لفتح كشف الحساب التراكمي للعميل"
                    >
                      <span>{customer.customer}</span>
                    </button>
                  </td>
                  <td className="text-center text-xs text-slate-600 font-mono" dir="ltr">
                    {customer.phone || '-'}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {customer.reps_list ? (
                        customer.reps_list.split('، ').map((rep: string, i: number) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium"
                          >
                            <span>{rep}</span>
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 text-xs">غير محدد</span>
                      )}
                    </div>
                  </td>
                  <td className="text-center font-mono text-xs text-slate-700 whitespace-nowrap">
                    {formatNumber(customer.cash_tot)}
                  </td>
                  <td className="text-center font-mono text-xs text-slate-700 whitespace-nowrap">
                    {formatNumber(customer.credit_tot)}
                  </td>
                  <td className="text-center font-mono text-xs text-emerald-700 font-semibold whitespace-nowrap">
                    {formatNumber(customer.pay_tot)}
                  </td>
                  <td className="text-center font-bold font-mono text-sm whitespace-nowrap">
                    <span className={remaining > 0 ? 'text-rose-600 font-extrabold' : 'text-emerald-600'}>
                      {formatNumber(remaining)} ج.م
                    </span>
                  </td>
                  <td className="text-center whitespace-nowrap">
                    {remaining <= 0 ? (
                      <span className="badge badge-success">مسدد</span>
                    ) : (
                      <span className="badge badge-danger">مدين</span>
                    )}
                  </td>
                  <td className="text-center">
                    <button
                      onClick={() => setStatementCustomer(custObj)}
                      className="app-btn app-btn-sm app-btn-primary text-xs"
                      title="عرض كشف الحساب التراكمي الدوري"
                    >
                      <span>كشف حساب</span>
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-200">
                <td className="px-3.5 py-3 text-center text-slate-700 font-extrabold" colSpan={4}>
                  الإجمالي العام
                </td>
                <td className="px-3.5 py-3 text-center text-slate-900 font-mono text-xs font-bold whitespace-nowrap">
                  {formatNumber(totals.cashTot)}
                </td>
                <td className="px-3.5 py-3 text-center text-slate-900 font-mono text-xs font-bold whitespace-nowrap">
                  {formatNumber(totals.creditTot)}
                </td>
                <td className="px-3.5 py-3 text-center text-emerald-800 font-mono text-xs font-bold whitespace-nowrap">
                  {formatNumber(totals.payTot)}
                </td>
                <td className="px-3.5 py-3 text-center text-rose-800 font-mono text-sm font-extrabold whitespace-nowrap">
                  {formatNumber(totals.remaining)} ج.م
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 mt-4">
          <h3 className="text-slate-700 font-bold text-base mb-1">
            {searchTerm ? 'لا توجد نتائج مطابقة لبحثك' : 'لا توجد بيانات حسابات مسجلة'}
          </h3>
          <p className="text-slate-500 text-xs max-w-sm mx-auto">
            ستظهر هنا أرصدة العملاء التراكمية وحركات البيع والسداد فور تسجيلها.
          </p>
        </div>
      )}

      {statementCustomer && (
        <CumulativeCustomerStatementModal
          customer={statementCustomer}
          onClose={() => setStatementCustomer(null)}
        />
      )}
    </div>
  )
}
