import { useState } from 'react'
import Modal from './Modal'
import StatementTable from './StatementTable'
import { useSupplierStatement } from '../hooks/useStatements'
import { exportCSV } from '../lib/csv'
import { formatNumber } from '../lib/format'

interface SupplierStatementModalProps {
  supplier: {
    id: string
    name: string
    phone?: string | null
    opening_balance?: number | null
  }
  onClose: () => void
}

export default function SupplierStatementModal({
  supplier,
  onClose,
}: SupplierStatementModalProps) {
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  const { data: statementRows = [], isLoading } = useSupplierStatement(
    supplier.id,
    fromDate || undefined,
    toDate || undefined
  )

  const handlePrint = () => {
    window.print()
  }

  const handleExportCsv = () => {
    const csvData = statementRows.map((r) => ({
      '#': r.row_no === 0 ? 'رصيد أول المدة' : r.row_no.toString(),
      'التاريخ': r.tx_date,
      'البيان': r.description,
      'المرجع': r.ref || '-',
      'مدين (+)': r.debit !== null ? r.debit : 0,
      'دائن (-)': r.credit !== null ? r.credit : 0,
      'الرصيد التراكمي': r.balance,
    }))

    const headers = [
      '#',
      'التاريخ',
      'البيان',
      'المرجع',
      'مدين (+)',
      'دائن (-)',
      'الرصيد التراكمي',
    ]

    exportCSV(
      `كشف_حساب_${supplier.name}_${new Date().toISOString().slice(0, 10)}.csv`,
      csvData,
      headers
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={`كشف حساب تراكمي تفصيلي: ${supplier.name}`}
      wide={true}
    >
      <div className="space-y-4" dir="rtl">
        {/* Supplier Header Info */}
        <div className="bg-gradient-to-r from-slate-50 via-primary-50/40 to-slate-50 p-4.5 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm12 0a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8h5l2 3v5h-1" /></svg>
              <h3 className="text-lg font-extrabold text-slate-800">{supplier.name}</h3>
            </div>
            <div className="text-xs text-slate-500 flex gap-4 mt-1 font-medium flex-wrap">
              <span>رقم الهاتف: <b className="font-mono text-slate-700" dir="ltr">{supplier.phone || 'غير مسجل'}</b></span>
              <span>رصيد أول المدة: <b className="font-mono text-slate-700">{formatNumber(Number(supplier.opening_balance || 0))} ج.م</b></span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="app-btn app-btn-ghost py-2 text-xs font-semibold"
            >
              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              <span>طباعة كشف الحساب</span>
            </button>
            <button
              onClick={handleExportCsv}
              className="app-btn app-btn-primary py-2 text-xs font-semibold shadow-sm"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              <span>تصدير Excel (CSV)</span>
            </button>
          </div>
        </div>

        {/* Date Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
          <span className="font-bold text-slate-700">تحديد فترة الكشف:</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">من تاريخ:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="app-input py-1 px-2.5 text-xs w-auto font-mono"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">إلى تاريخ:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="app-input py-1 px-2.5 text-xs w-auto font-mono"
            />
          </div>
          {(fromDate || toDate) && (
            <button
              onClick={() => {
                setFromDate('')
                setToDate('')
              }}
              className="text-xs font-bold text-primary-600 hover:text-primary-800 hover:underline ms-2"
            >
              إعادة ضبط الفترة (عرض الكل)
            </button>
          )}
        </div>

        {/* Ledger Table */}
        <StatementTable
          rows={statementRows}
          loading={isLoading}
          accountName={supplier.name}
          accountType="supplier"
        />
      </div>
    </Modal>
  )
}
