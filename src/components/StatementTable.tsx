import { formatNumber } from '../lib/format'
import type { StatementRow } from '../hooks/useStatements'

interface StatementTableProps {
  rows: StatementRow[]
  loading?: boolean
  accountName?: string
  accountType: 'customer' | 'supplier'
}

export default function StatementTable({
  rows,
  loading = false,
  accountType,
}: StatementTableProps) {
  if (loading) {
    return (
      <div className="py-14 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
        <div className="h-9 w-9 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        <span className="text-sm font-semibold">جاري حساب كشف الحساب التراكمي وجلب الحركات...</span>
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="py-14 text-center text-slate-400 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200 my-2">
        <svg className="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        <p className="font-semibold text-slate-600 text-sm">لا توجد حركات مسجلة لهذا الحساب في الفترة المحددة.</p>
        <p className="text-xs text-slate-400 mt-1">جرب توسيع نطاق التاريخ لعرض المعاملات السابقة.</p>
      </div>
    )
  }

  // Calculate totals
  const totalDebit = rows.reduce((acc, r) => acc + (r.debit || 0), 0)
  const totalCredit = rows.reduce((acc, r) => acc + (r.credit || 0), 0)
  const finalBalance = rows[rows.length - 1]?.balance ?? 0

  return (
    <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
      <table className="app-table" dir="rtl">
        <thead>
          <tr>
            <th className="w-12 text-center">#</th>
            <th className="text-center w-28">التاريخ</th>
            <th>البيان والتفاصيل</th>
            <th className="text-center w-28">المرجع</th>
            <th className="text-center font-bold w-32 text-blue-800">مدين (+)</th>
            <th className="text-center font-bold w-32 text-emerald-800">دائن (-)</th>
            <th className="text-center font-bold w-36 text-primary-900">الرصيد التراكمي</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const isOpening = row.tx_type === 'opening'
            return (
              <tr
                key={idx}
                className={
                  isOpening
                    ? 'bg-amber-50/70 font-semibold text-amber-950 border-b-2 border-amber-200'
                    : ''
                }
              >
                <td className="text-center text-xs text-slate-400 font-mono">
                  {row.row_no === 0 ? '—' : row.row_no}
                </td>
                <td className="text-center font-mono text-xs text-slate-600 whitespace-nowrap">
                  {row.tx_date}
                </td>
                <td>
                  <span className={isOpening ? 'font-bold text-amber-900' : 'font-medium text-slate-800'}>
                    {row.description}
                  </span>
                  {isOpening && (
                    <span className="ms-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold">
                      افتتاحي
                    </span>
                  )}
                </td>
                <td className="text-center font-mono text-xs text-slate-500" dir="ltr">
                  {row.ref ? (
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                      {row.ref}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="text-center font-mono font-semibold text-blue-700 tabular-nums whitespace-nowrap">
                  {row.debit !== null ? formatNumber(row.debit) : '-'}
                </td>
                <td className="text-center font-mono font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                  {row.credit !== null ? formatNumber(row.credit) : '-'}
                </td>
                <td className="text-center font-mono font-bold text-primary-950 text-sm tabular-nums whitespace-nowrap">
                  {formatNumber(row.balance)} <span className="text-[11px] font-normal text-slate-400">ج.م</span>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-100/95 border-t-2 border-slate-300 font-bold text-xs text-slate-900">
            <td colSpan={4} className="px-3.5 py-3.5 text-slate-800 font-extrabold text-sm">
              إجمالي حركات الفترة والرصيد التراكمي الختامي
            </td>
            <td className="px-3.5 py-3.5 text-center font-mono text-blue-900 font-extrabold text-sm whitespace-nowrap">
              {formatNumber(totalDebit)}
            </td>
            <td className="px-3.5 py-3.5 text-center font-mono text-emerald-900 font-extrabold text-sm whitespace-nowrap">
              {formatNumber(totalCredit)}
            </td>
            <td className="px-3.5 py-3.5 text-center font-mono text-base font-black text-primary-950 whitespace-nowrap">
              {formatNumber(finalBalance)} ج.م
              <span className="text-[10px] text-slate-500 font-normal ms-1">
                ({accountType === 'customer' ? 'رصيد العميل' : 'مستحق للمورد'})
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
