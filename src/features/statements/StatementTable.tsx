import { formatMoney, formatNumber } from '@/shared/lib/format'
import type { StatementRow } from '@/features/statements/useStatements'
import { getStatementReference, statementReferenceLabel } from '@/features/statements/statementReference'
import ResponsiveDataView from '@/shared/ui/ResponsiveDataView'
import { MobileCard, MobileCardRow } from '@/shared/ui/MobileCards'

interface StatementTableProps {
  rows: StatementRow[]
  loading?: boolean
  accountName?: string
  accountType: 'customer' | 'supplier'
  onReferenceClick?: (row: StatementRow) => void
}

export default function StatementTable({
  rows,
  loading = false,
  accountType,
  onReferenceClick,
}: StatementTableProps) {
  if (loading) {
    return (
      <div className="py-14 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
        <div className="h-9 w-9 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        <span className="text-sm font-semibold">جاري حساب كشف الحساب التراكمي وجلب الحركات...</span>
      </div>
    )
  }

  const safeRows = rows || []
  // For suppliers, debit settles (reduces) and credit increases the balance —
  // the opposite sign convention from customer statements.
  const debitSign = accountType === 'supplier' ? '(-)' : '(+)'
  const creditSign = accountType === 'supplier' ? '(+)' : '(-)'

  // Calculate totals
  const totalDebit = safeRows.reduce((acc, r) => acc + (r.debit || 0), 0)
  const totalCredit = safeRows.reduce((acc, r) => acc + (r.credit || 0), 0)
  const finalBalance = safeRows[safeRows.length - 1]?.balance ?? 0

  return (
    <ResponsiveDataView
      hasData={safeRows.length > 0}
      empty={
        <>
          <svg className="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          <p className="font-semibold text-slate-600 text-sm">لا توجد حركات مسجلة لهذا الحساب في الفترة المحددة.</p>
          <p className="text-xs text-slate-400 mt-1">جرب توسيع نطاق التاريخ لعرض المعاملات السابقة.</p>
        </>
      }
      cards={safeRows.map((row, idx) => {
        const isOpening = row.tx_type === 'opening'
        const target = getStatementReference(row)
        const label = statementReferenceLabel(row)
        return (
          <MobileCard key={idx} className={isOpening ? 'bg-amber-50/70 border-amber-200' : ''}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className={isOpening ? 'font-bold text-amber-900' : 'font-semibold text-slate-800'}>
                  {row.description}
                </span>
                <div className="text-xs text-slate-600 font-num font-semibold mt-0.5" dir="ltr">
                  {row.tx_date}
                </div>
              </div>
              <span className="text-xs text-slate-500 font-num font-bold shrink-0" dir="ltr">
                {row.row_no === 0 ? '—' : formatNumber(row.row_no)}
              </span>
            </div>
            {isOpening && (
              <span className="ms-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold">
                افتتاحي
              </span>
            )}
            <MobileCardRow
              label="المرجع"
              value={
                target && onReferenceClick ? (
                  <button
                    type="button"
                    onClick={() => onReferenceClick(row)}
                    className="px-2 py-0.5 rounded-lg bg-primary-50 text-primary-700 border border-primary-200 font-bold hover:bg-primary-100 hover:text-primary-900 transition-colors underline-offset-2 hover:underline"
                    title="عرض تفاصيل المرجع"
                  >
                    {label}
                  </button>
                ) : row.ref ? (
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">{row.ref}</span>
                ) : (
                  '-'
                )
              }
            />
            <MobileCardRow label={`مدين ${debitSign}`} value={<span className="num font-bold text-blue-700">{row.debit !== null ? formatMoney(row.debit, { withCurrency: false }) : '-'}</span>} />
            <MobileCardRow label={`دائن ${creditSign}`} value={<span className="num font-bold text-emerald-700">{row.credit !== null ? formatMoney(row.credit, { withCurrency: false }) : '-'}</span>} />
            <MobileCardRow
              label="الرصيد التراكمي"
              value={<span className="num font-extrabold text-primary-950">{formatMoney(row.balance)}</span>}
            />
          </MobileCard>
        )
      })}
      table={(
        <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
          <table className="app-table" dir="rtl">
            <thead>
              <tr>
                <th className="w-12 text-center">#</th>
                <th className="text-center w-28">التاريخ</th>
                <th>البيان والتفاصيل</th>
                <th className="text-center w-28">المرجع</th>
                <th className="text-center font-bold w-32 text-blue-800">{`مدين ${debitSign}`}</th>
                <th className="text-center font-bold w-32 text-emerald-800">{`دائن ${creditSign}`}</th>
                <th className="text-center font-bold w-36 text-primary-900">الرصيد التراكمي</th>
              </tr>
            </thead>
            <tbody>
              {safeRows.map((row, idx) => {
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
                    <td className="text-center text-xs text-slate-500 font-num font-bold" dir="ltr">
                      {row.row_no === 0 ? '—' : formatNumber(row.row_no)}
                    </td>
                    <td className="text-center font-num text-xs font-semibold text-slate-700 whitespace-nowrap" dir="ltr">
                      {row.tx_date}
                    </td>
                    <td>
                      <span className={isOpening ? 'font-extrabold text-amber-900' : 'font-semibold text-slate-900'}>
                        {row.description}
                      </span>
                      {isOpening && (
                        <span className="ms-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold">
                          افتتاحي
                        </span>
                      )}
                    </td>
                    <td className="text-center font-num text-xs font-semibold text-slate-600" dir="ltr">
                      {(() => {
                        const target = getStatementReference(row)
                        const label = statementReferenceLabel(row)
                        if (target && onReferenceClick) {
                          return (
                            <button
                              type="button"
                              onClick={() => onReferenceClick(row)}
                              className="px-2 py-0.5 rounded-lg bg-primary-50 text-primary-700 border border-primary-200 font-bold hover:bg-primary-100 hover:text-primary-900 transition-colors underline-offset-2 hover:underline"
                              title="عرض تفاصيل المرجع"
                            >
                              {label}
                            </button>
                          )
                        }
                        if (row.ref) {
                          return <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">{row.ref}</span>
                        }
                        return '-'
                      })()}
                    </td>
                    <td className="text-center font-num font-bold text-blue-700 tabular-nums whitespace-nowrap" dir="ltr">
                      {row.debit !== null ? formatMoney(row.debit, { withCurrency: false }) : '-'}
                    </td>
                    <td className="text-center font-num font-bold text-emerald-700 tabular-nums whitespace-nowrap" dir="ltr">
                      {row.credit !== null ? formatMoney(row.credit, { withCurrency: false }) : '-'}
                    </td>
                    <td className="text-center font-num font-extrabold text-primary-950 text-sm tabular-nums whitespace-nowrap" dir="ltr">
                      {formatMoney(row.balance)}
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
                <td className="px-3.5 py-3.5 text-center font-num text-blue-900 font-extrabold text-sm whitespace-nowrap" dir="ltr">
                  {formatMoney(totalDebit, { withCurrency: false })}
                </td>
                <td className="px-3.5 py-3.5 text-center font-num text-emerald-900 font-extrabold text-sm whitespace-nowrap" dir="ltr">
                  {formatMoney(totalCredit, { withCurrency: false })}
                </td>
                <td className="px-3.5 py-3.5 text-center font-num text-base font-extrabold text-primary-950 whitespace-nowrap" dir="ltr">
                  {formatMoney(finalBalance)}
                  <span className="text-[10px] text-slate-500 font-semibold ms-1" dir="rtl">
                    ({accountType === 'customer' ? 'رصيد العميل' : 'مستحق للمورد'})
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    />
  )
}
