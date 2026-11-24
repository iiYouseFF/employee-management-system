import { useState, useMemo } from 'react'
import { getTodayISO, formatNumber } from '@/shared/lib/format'
import Modal from '@/shared/ui/Modal'
import SearchableSelect from '@/shared/ui/SearchableSelect'
import { toSearchableOptions } from '@/shared/ui/searchableSelectUtils'
import Pagination from '@/shared/ui/Pagination'
import PageHeader from '@/shared/ui/PageHeader'
import FilterToolbar from '@/shared/ui/FilterToolbar'
import ResponsiveDataView from '@/shared/ui/ResponsiveDataView'
import { useDatePreset } from '@/shared/hooks/useDatePreset'
import BulkProductMatrixModal, { type BulkMatrixLine } from '@/features/sales/BulkProductMatrixModal'
import {
  useSalesReturns,
  useProcessSalesReturn,
  useSaveSalesReturn,
  useDeleteSalesReturn,
  useSalesReturnLines,
  type SalesReturnWithDetails,
} from '@/features/sales/useSalesReturns'
import { useCustomers } from '@/features/sales/useInvoices'

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString('ar-EG') : '-'

export default function ReturnsTab({
  repFilter,
  reps,
  showToast,
  isReadOnly = false,
}: {
  repFilter: string
  reps: { id: string; name: string }[]
  showToast: (msg: string) => void
  isReadOnly?: boolean
}) {
  const { data: returns = [], isLoading, error } = useSalesReturns(repFilter)
  const { data: customers = [] } = useCustomers()
  const processReturn = useProcessSalesReturn()
  const saveReturn = useSaveSalesReturn()
  const deleteReturn = useDeleteSalesReturn()

  const [matrixOpen, setMatrixOpen] = useState(false)
  const [returnHeaderModalOpen, setReturnHeaderModalOpen] = useState(false)
  const [selectedLines, setSelectedLines] = useState<BulkMatrixLine[]>([])
  const [editingReturn, setEditingReturn] = useState<SalesReturnWithDetails | null>(null)
  const { data: editingLines = [], isLoading: editingLinesLoading } = useSalesReturnLines(editingReturn?.id || null)

  const [headerForm, setHeaderForm] = useState({
    customer_id: '',
    rep_id: repFilter !== 'all' ? repFilter : reps[0]?.id || '',
    return_date: getTodayISO(),
    refund_method: 'credit_balance' as 'credit_balance' | 'cash_refund',
    notes: '',
  })
  const [err, setErr] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const { preset, from, to, setPreset, setFrom, setTo, reset } = useDatePreset('all')

  const customerMap = useMemo(() => {
    const map = new Map<string, string>()
    customers.forEach((c) => map.set(c.id, c.name))
    return map
  }, [customers])

  const repMap = useMemo(() => {
    const map = new Map<string, string>()
    reps.forEach((r) => map.set(r.id, r.name))
    return map
  }, [reps])

  const filteredReturns = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return returns.filter((ret) => {
      const date = String(ret.return_date || '')
      if (from && date < from) return false
      if (to && date > to) return false
      if (!term) return true
      return [
        customerMap.get(ret.customer_id),
        ret.rep_id ? repMap.get(ret.rep_id) : '',
        ret.notes,
      ].some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [returns, from, to, searchTerm, customerMap, repMap])

  const totalReturnAmount = useMemo(
    () => filteredReturns.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0),
    [filteredReturns]
  )

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  const totalPages = Math.ceil(filteredReturns.length / pageSize) || 1
  const paginatedReturns = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredReturns.slice(start, start + pageSize)
  }, [filteredReturns, currentPage, pageSize])

  const hasActiveFilters = !!searchTerm.trim() || !!from || !!to
  const resetFilters = () => {
    setSearchTerm('')
    reset()
    setCurrentPage(1)
  }

  const resetForm = () => {
    setSelectedLines([])
    setEditingReturn(null)
    setHeaderForm({
      customer_id: '',
      rep_id: repFilter !== 'all' ? repFilter : reps[0]?.id || '',
      return_date: getTodayISO(),
      refund_method: 'credit_balance',
      notes: '',
    })
    setErr('')
  }

  const openNew = () => {
    resetForm()
    setMatrixOpen(true)
  }

  const handleEdit = (ret: SalesReturnWithDetails) => {
    setEditingReturn(ret)
    setHeaderForm({
      customer_id: ret.customer_id,
      rep_id: ret.rep_id || (repFilter !== 'all' ? repFilter : reps[0]?.id || ''),
      return_date: ret.return_date,
      refund_method: ret.refund_method as 'credit_balance' | 'cash_refund',
      notes: ret.notes || '',
    })
    setErr('')
  }

  const startEditWithLines = () => {
    if (!editingReturn || editingLinesLoading) return
    const lines: BulkMatrixLine[] = editingLines.map((l: any) => ({
      product_id: l.product_id,
      product_name: '',
      sku: null,
      unit: '',
      qty: Number(l.qty) || 0,
      unit_price: Number(l.unit_price) || 0,
      line_total: (Number(l.qty) || 0) * (Number(l.unit_price) || 0),
      condition: (l.condition === 'damaged' ? 'damaged' : 'salable') as 'salable' | 'damaged',
      available_qty: 0,
      reserved_qty: 0,
      on_hand: 0,
    }))
    setSelectedLines(lines)
    setMatrixOpen(true)
  }

  const handleMatrixCommit = (lines: BulkMatrixLine[]) => {
    setSelectedLines(lines)
    setMatrixOpen(false)
    setReturnHeaderModalOpen(true)
  }

  const handleDelete = (ret: SalesReturnWithDetails) => {
    if (!confirm('هل أنت متأكد من حذف هذا المرتجع؟ سيتم عكس أثره على المخزون والحسابات.')) return
    deleteReturn.mutate(ret.id, {
      onSuccess: () => showToast('تم حذف المرتجع وعكس أثره على المخزون والحسابات'),
      onError: (e) => showToast((e as Error).message),
    })
  }

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (!headerForm.customer_id) {
      setErr('يرجى اختيار العميل')
      return
    }
    if (!headerForm.rep_id) {
      setErr('يرجى اختيار المندوب')
      return
    }
    if (selectedLines.length === 0) {
      setErr('يرجى تحديد أصناف المرتجع')
      return
    }

    try {
      const payload = {
        returnHeader: {
          ...(editingReturn?.id ? { id: editingReturn.id } : {}),
          customer_id: headerForm.customer_id,
          rep_id: headerForm.rep_id,
          return_date: headerForm.return_date,
          refund_method: headerForm.refund_method,
          notes: headerForm.notes || undefined,
        },
        lines: selectedLines.map((l) => ({
          product_id: l.product_id,
          qty: l.qty,
          unit_price: l.unit_price,
          condition: l.condition || 'salable',
        })),
      }

      if (editingReturn?.id) {
        await saveReturn.mutateAsync(payload)
        showToast('تم تحديث مرتجع المبيعات وتعديل المخزون والحسابات بنجاح')
      } else {
        await processReturn.mutateAsync(payload)
        showToast('تم تسجيل مرتجع المبيعات وتحديث المخزون والحسابات بنجاح')
      }

      setReturnHeaderModalOpen(false)
      resetForm()
    } catch (e: unknown) {
      setErr((e as Error).message)
    }
  }

  const linesTotal = selectedLines.reduce((s, l) => s + (l.line_total || 0), 0)

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <PageHeader
        title="مرتجعات المبيعات"
        count={`${filteredReturns.length} مرتجع`}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-2 bg-rose-50 border border-rose-200/80 rounded-xl px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-rose-800 shadow-sm">
              <span>إجمالي المرتجعات:</span>
              <span className="font-extrabold text-rose-950 font-mono text-sm sm:text-base">
                {formatNumber(totalReturnAmount)} ج.م
              </span>
            </div>

            {!isReadOnly && (
              <button
                onClick={openNew}
                className="app-btn app-btn-primary py-2 text-xs sm:text-sm shadow-sm"
              >
                <span>+</span>
                <span>مرتجع مبيعات متعدد (Matrix)</span>
              </button>
            )}
          </div>
        }
      />

      <FilterToolbar
        search={searchTerm}
        onSearchChange={(v) => { setSearchTerm(v); setCurrentPage(1) }}
        searchPlaceholder="بحث بالعميل أو الملاحظات..."
        preset={preset}
        onPresetChange={(p) => { setPreset(p); setCurrentPage(1) }}
        from={from}
        to={to}
        onFromChange={(v) => { setFrom(v); setCurrentPage(1) }}
        onToChange={(v) => { setTo(v); setCurrentPage(1) }}
        onReset={resetFilters}
        hasActiveFilters={hasActiveFilters}
      />

      <ResponsiveDataView
        loading={isLoading}
        error={error ? 'تعذّر تحميل المرتجعات. أعد المحاولة لاحقاً.' : undefined}
        hasData={filteredReturns.length > 0}
        empty="لا توجد مرتجعات مسجلة حتى الآن"
        table={(
          <>
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
        <table className="app-table">
          <thead>
            <tr>
              <th className="w-12 text-center">#</th>
              <th className="text-center w-28">التاريخ</th>
              <th>العميل</th>
              <th className="text-center">المندوب</th>
              <th className="text-center w-36">طريقة التسوية</th>
              <th>ملاحظات</th>
              <th className="text-center w-36 font-bold">الإجمالي (ج.م)</th>
              {!isReadOnly && <th className="text-center w-28">الإجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={!isReadOnly ? 8 : 7} className="text-center py-10 text-slate-500">
                  جاري تحميل المرتجعات...
                </td>
              </tr>
            ) : paginatedReturns.length === 0 ? (
              <tr>
                <td colSpan={!isReadOnly ? 8 : 7} className="text-center py-10 text-slate-400">
                  لا توجد مرتجعات مسجلة حتى الآن
                </td>
              </tr>
            ) : (
              paginatedReturns.map((ret, idx) => (
                <tr key={ret.id}>
                  <td className="text-center text-xs text-slate-400 font-mono">
                    {returns.length - ((currentPage - 1) * pageSize + idx)}
                  </td>
                  <td className="text-center text-xs text-slate-600 font-medium whitespace-nowrap">
                    {formatDate(ret.return_date)}
                  </td>
                  <td className="font-semibold text-slate-800">
                    {customerMap.get(ret.customer_id) || '-'}
                  </td>
                  <td className="text-center text-xs">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {(ret.rep_id && repMap.get(ret.rep_id)) || '-'}
                    </span>
                  </td>
                  <td className="text-center text-xs">
                    {ret.refund_method === 'credit_balance' ? (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 font-medium text-[11px]">
                        إضافة لرصيد العميل (دائن)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-medium text-[11px]">
                        صرف نقدي من الخزينة
                      </span>
                    )}
                  </td>
                  <td className="text-xs text-slate-500">{ret.notes || '-'}</td>
                  <td className="text-center font-bold text-rose-700 font-mono text-sm whitespace-nowrap">
                    {formatNumber(ret.total_amount)}
                  </td>
                  {!isReadOnly && (
                    <td>
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => handleEdit(ret)}
                          className="app-btn app-btn-sm app-btn-ghost text-xs hover:border-blue-400 hover:text-blue-700"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => handleDelete(ret)}
                          className="app-btn app-btn-sm app-btn-ghost text-xs text-rose-600 hover:bg-rose-50 hover:border-rose-300"
                          disabled={deleteReturn.isPending}
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {paginatedReturns.map((ret) => (
          <div key={ret.id} className="app-card p-3.5 shadow-sm space-y-2.5">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <span className="font-extrabold text-slate-800 text-sm block">
                  {customerMap.get(ret.customer_id) || '-'}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {formatDate(ret.return_date)}
                </span>
              </div>
              <div className="text-end">
                <span className="font-mono font-black text-rose-700 text-base block">
                  {formatNumber(ret.total_amount)}
                </span>
                <span className="text-[10px] text-slate-400">ج.م</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px]">
                المندوب: {(ret.rep_id && repMap.get(ret.rep_id)) || '-'}
              </span>
              <span className="text-[11px] text-slate-500">
                {ret.refund_method === 'credit_balance' ? 'رصيد دائن' : 'نقداً'}
              </span>
            </div>

            {!isReadOnly && (
              <div className="flex gap-2 pt-1 border-t border-slate-100">
                <button
                  onClick={() => handleEdit(ret)}
                  className="app-btn app-btn-ghost app-btn-sm flex-1 py-1.5 text-xs font-semibold text-blue-700 border-blue-200 hover:bg-blue-50"
                >
                  تعديل
                </button>
                <button
                  onClick={() => handleDelete(ret)}
                  className="app-btn app-btn-ghost app-btn-sm px-3 py-1.5 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                  disabled={deleteReturn.isPending}
                >
                  حذف
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

          </>
        )}
        footer={
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredReturns.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        }
      />

      {/* Edit loader modal */}
      {editingReturn && !returnHeaderModalOpen && !matrixOpen && (
        <Modal
          title="تعديل مرتجع المبيعات"
          onClose={resetForm}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {editingLinesLoading ? 'جاري تحميل أصناف المرتجع...' : `تم تحميل ${editingLines.length} صنف. يمكنك تعديل الأصناف ثم حفظ التغييرات.`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={startEditWithLines}
                disabled={editingLinesLoading}
                className="app-btn app-btn-primary flex-1 py-2 text-xs font-bold"
              >
                {editingLinesLoading ? 'جاري التحميل...' : 'تعديل الأصناف والتفاصيل'}
              </button>
              <button type="button" onClick={resetForm} className="app-btn app-btn-ghost px-5 py-2 text-xs">
                إلغاء
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Step 1: Bulk Matrix */}
      {matrixOpen && (
        <BulkProductMatrixModal
          isOpen={matrixOpen}
          mode="return"
          initialLines={selectedLines.map((l) => ({
            product_id: l.product_id,
            qty: l.qty,
            unit_price: l.unit_price,
            condition: l.condition,
          }))}
          onClose={() => {
            setMatrixOpen(false)
            if (editingReturn && selectedLines.length === 0) resetForm()
          }}
          onCommit={handleMatrixCommit}
        />
      )}

      {/* Step 2: Return Details Header Modal */}
      {returnHeaderModalOpen && (
        <Modal
          title={editingReturn ? 'تعديل مرتجع المبيعات' : 'تفاصيل وتأكيد مرتجع المبيعات'}
          onClose={() => {
            setReturnHeaderModalOpen(false)
            if (!editingReturn) resetForm()
          }}
        >
          <form onSubmit={handleFinalSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ المرتجع *</label>
                <input
                  type="date"
                  value={headerForm.return_date}
                  onChange={(e) => setHeaderForm((f) => ({ ...f, return_date: e.target.value }))}
                  className="app-input text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المندوب *</label>
                <SearchableSelect
                  options={toSearchableOptions(reps)}
                  value={headerForm.rep_id || ''}
                  onChange={(id) => setHeaderForm((f) => ({ ...f, rep_id: id }))}
                  placeholder="اختر المندوب"
                  searchPlaceholder="ابحث عن مندوب..."
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">العميل *</label>
                <SearchableSelect
                  options={toSearchableOptions(customers)}
                  value={headerForm.customer_id || ''}
                  onChange={(id) => setHeaderForm((f) => ({ ...f, customer_id: id }))}
                  placeholder="ابحث عن عميل بالاسم أو الهاتف..."
                  searchPlaceholder="ابحث عن عميل بالاسم أو الهاتف..."
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">طريقة معالجة القيمة *</label>
                <select
                  value={headerForm.refund_method}
                  onChange={(e) =>
                    setHeaderForm((f) => ({
                      ...f,
                      refund_method: e.target.value as 'credit_balance' | 'cash_refund',
                    }))
                  }
                  className="app-select text-xs"
                >
                  <option value="credit_balance">
                    إيداع رصيد دائن بحساب العميل (يقلل من مديونية العميل في كشف الحساب)
                  </option>
                  <option value="cash_refund">صرف القيمة نقداً للعميل مباشرة من الخزينة</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات / سبب الإرجاع</label>
                <input
                  type="text"
                  value={headerForm.notes}
                  onChange={(e) => setHeaderForm((f) => ({ ...f, notes: e.target.value }))}
                  className="app-input text-xs"
                  placeholder="سبب المرتجع، رقم الفاتورة الأصلية..."
                />
              </div>
            </div>

            {/* Selected Items Summary */}
            <div className="rounded-xl border border-border p-3 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 border-b border-slate-200 pb-1.5">
                <span>الأصناف المحددة ({selectedLines.length})</span>
                <button
                  type="button"
                  onClick={() => {
                    setReturnHeaderModalOpen(false)
                    setMatrixOpen(true)
                  }}
                  className="text-primary-700 hover:underline text-[11px]"
                >
                  تعديل الأصناف
                </button>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1">
                {selectedLines.map((l) => (
                  <div key={l.product_id} className="flex justify-between items-center text-xs">
                    <span className="text-slate-700 font-medium">{l.product_name}</span>
                    <span className="text-slate-500 font-mono">
                      {l.qty} {l.unit} × {formatNumber(l.unit_price)} = {formatNumber(l.line_total)} ج.م (
                      <span className={l.condition === 'salable' ? 'text-emerald-700' : 'text-rose-700 font-bold'}>
                        {l.condition === 'salable' ? 'سليم للمخزن' : 'تالف / هالك'}
                      </span>
                      )
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-bold text-sm">
                <span>إجمالي قيمة المرتجع:</span>
                <span className="font-mono text-rose-700 text-base">{formatNumber(linesTotal)} ج.م</span>
              </div>
            </div>

            {err && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 font-medium">
                {err}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={processReturn.isPending || saveReturn.isPending}
                className="app-btn app-btn-primary flex-1 py-2 text-xs font-bold"
              >
                {(processReturn.isPending || saveReturn.isPending)
                  ? 'جاري الحفظ...'
                  : editingReturn ? 'حفظ تعديلات المرتجع' : 'تأكيد وحفظ المرتجع'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setReturnHeaderModalOpen(false)
                  if (!editingReturn) resetForm()
                }}
                disabled={processReturn.isPending || saveReturn.isPending}
                className="app-btn app-btn-ghost px-5 py-2 text-xs"
              >
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
