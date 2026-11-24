import { useMemo, useState } from 'react'
import StatementTable from '@/features/statements/StatementTable'
import StatementReferenceModal from '@/features/statements/StatementReferenceModal'
import { useSupplierStatement, type StatementRow } from '@/features/statements/useStatements'
import { useSuppliers } from '@/features/suppliers/useSuppliers'
import PageHeader from '@/shared/ui/PageHeader'
import FilterToolbar from '@/shared/ui/FilterToolbar'
import ResponsiveDataView from '@/shared/ui/ResponsiveDataView'
import { useDatePreset } from '@/shared/hooks/useDatePreset'
import SearchableSelect from '@/shared/ui/SearchableSelect'
import { toSearchableOptions } from '@/shared/ui/searchableSelectUtils'

export default function SupplierStatementTab() {
  const { data: suppliers = [] } = useSuppliers()
  const [supplierId, setSupplierId] = useState('')
  const [selectedRef, setSelectedRef] = useState<StatementRow | null>(null)
  const { preset, from, to, setPreset, setFrom, setTo, reset } = useDatePreset('all')

  const selectedSupplier = useMemo(() => suppliers.find((s) => s.id === supplierId), [suppliers, supplierId])
  const { data: rows = [], isLoading, isError: statementError, refetch } = useSupplierStatement(
    supplierId || undefined,
    from || undefined,
    to || undefined
  )

  const hasActiveFilters = !!supplierId || !!from || !!to
  const resetFilters = () => {
    setSupplierId('')
    reset()
  }

  return (
    <div className="app-page space-y-5">
      <PageHeader
        title="كشف حساب مورد"
        count="تراكمي"
      />

      <FilterToolbar
        preset={preset}
        onPresetChange={setPreset}
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onReset={resetFilters}
        hasActiveFilters={hasActiveFilters}
      >
        <div className="w-full sm:w-72">
          <label className="mb-1.5 block text-xs font-bold text-slate-700">المورد</label>
          <SearchableSelect
            options={toSearchableOptions(suppliers)}
            value={supplierId}
            onChange={setSupplierId}
            placeholder="اختر المورد لعرض كشف الحساب"
            searchPlaceholder="ابحث عن مورد بالاسم أو الهاتف..."
          />
        </div>
      </FilterToolbar>

      <ResponsiveDataView
        loading={isLoading}
        error={statementError ? (
          <div>
            <p className="text-sm font-bold text-rose-700">تعذر تحميل كشف الحساب</p>
            <button type="button" onClick={() => refetch()} className="app-btn app-btn-sm app-btn-ghost mt-3">
              إعادة المحاولة
            </button>
          </div>
        ) : undefined}
        hasData={rows.length > 0}
        empty={!supplierId ? (
          <div>
            <h3 className="text-slate-700 font-bold text-base mb-1">اختر مورداً لعرض كشف الحساب</h3>
            <p className="text-slate-500 text-xs max-w-sm mx-auto">سيظهر هنا كشف الحساب التراكمي للمورد مع الرصيد الافتتاحي والحركات والرصيد الختامي.</p>
          </div>
        ) : (
          <div>
            <p className="font-semibold text-slate-600 text-sm">لا توجد حركات مسجلة لهذا الحساب في الفترة المحددة.</p>
            <p className="text-xs text-slate-400 mt-1">جرب توسيع نطاق التاريخ لعرض المعاملات السابقة.</p>
          </div>
        )}
        table={
          <StatementTable
            rows={rows}
            loading={isLoading}
            accountName={selectedSupplier?.name}
            accountType="supplier"
            onReferenceClick={(row) => setSelectedRef(row)}
          />
        }
      />
      {selectedRef && <StatementReferenceModal row={selectedRef} onClose={() => setSelectedRef(null)} />}
    </div>
  )
}
