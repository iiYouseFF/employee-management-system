import { useMemo, useState } from 'react'
import StatementTable from '@/features/statements/StatementTable'
import StatementReferenceModal from '@/features/statements/StatementReferenceModal'
import { useSupplierStatement, type StatementRow } from '@/features/statements/useStatements'
import { useSuppliers } from '@/features/suppliers/useSuppliers'

export default function SupplierStatementTab() {
  const { data: suppliers = [] } = useSuppliers()
  const [supplierId, setSupplierId] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selectedRef, setSelectedRef] = useState<StatementRow | null>(null)

  const selectedSupplier = useMemo(() => suppliers.find((s) => s.id === supplierId), [suppliers, supplierId])
  const { data: rows = [], isLoading } = useSupplierStatement(supplierId || undefined, fromDate || undefined, toDate || undefined)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-base sm:text-lg font-bold text-slate-800">كشف حساب مورد</h3>
          <span className="badge badge-primary">تراكمي</span>
        </div>
      </div>

      <div className="app-card p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">المورد</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="app-select">
              <option value="">اختر المورد لعرض كشف الحساب</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">من تاريخ</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="app-input font-mono" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">إلى تاريخ</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="app-input font-mono" />
          </div>
        </div>

        {(fromDate || toDate) && (
          <button
            type="button"
            onClick={() => { setFromDate(''); setToDate('') }}
            className="text-xs font-bold text-primary-600 hover:text-primary-800 hover:underline"
          >
            إعادة ضبط الفترة
          </button>
        )}
      </div>

      {!supplierId ? (
        <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
          <h3 className="text-slate-700 font-bold text-base mb-1">اختر مورداً لعرض كشف الحساب</h3>
          <p className="text-slate-500 text-xs max-w-sm mx-auto">سيظهر هنا كشف الحساب التراكمي للمورد مع الرصيد الافتتاحي والحركات والرصيد الختامي.</p>
        </div>
      ) : (
        <StatementTable
          rows={rows}
          loading={isLoading}
          accountName={selectedSupplier?.name}
          accountType="supplier"
          onReferenceClick={(row) => setSelectedRef(row)}
        />
      )}
      {selectedRef && <StatementReferenceModal row={selectedRef} onClose={() => setSelectedRef(null)} />}
    </div>
  )
}
