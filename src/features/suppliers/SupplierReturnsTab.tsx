import { useMemo, useState } from 'react'
import PageHeader from '@/shared/ui/PageHeader'
import FilterToolbar from '@/shared/ui/FilterToolbar'
import ResponsiveDataView from '@/shared/ui/ResponsiveDataView'
import Pagination from '@/shared/ui/Pagination'
import { useDatePreset } from '@/shared/hooks/useDatePreset'
import { formatMoney } from '@/shared/lib/format'
import { useProducts } from '@/features/products/useProducts'
import {
  useSupplierPurchases,
  useSuppliers,
} from '@/features/suppliers/useSuppliers'
import SupplierReturnModal from '@/features/suppliers/SupplierReturnModal'
import {
  useDeleteSupplierReturn,
  useSupplierReturnLines,
  useSupplierReturns,
  type SupplierReturnWithDetails,
} from '@/features/suppliers/useSupplierReturns'

interface Props {
  showToast: (msg: string) => void
}

const EMPTY_LIST: never[] = []

const settlementLabel = (method: string) =>
  method === 'cash_refund' ? 'استرداد نقدي' : 'تقليل الدين'

export default function SupplierReturnsTab({ showToast }: Props) {
  const returnsQuery = useSupplierReturns()
  const suppliersQuery = useSuppliers()
  const purchasesQuery = useSupplierPurchases()
  const productsQuery = useProducts()
  const deleteReturn = useDeleteSupplierReturn()

  const returns = returnsQuery.data ?? EMPTY_LIST
  const suppliers = suppliersQuery.data ?? EMPTY_LIST
  const purchases = purchasesQuery.data ?? EMPTY_LIST
  const products = productsQuery.data ?? EMPTY_LIST

  const [isModalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const linesQuery = useSupplierReturnLines(editingId)
  const [searchTerm, setSearchTerm] = useState('')
  const { preset, from, to, setPreset, setFrom, setTo, reset } = useDatePreset('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name || '-'

  const editingReturn = useMemo(
    () => returns.find((ret) => ret.id === editingId) || null,
    [returns, editingId],
  )

  const filteredReturns = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return returns.filter((ret) => {
      const date = String(ret.return_date || '')
      if (from && date < from) return false
      if (to && date > to) return false
      if (!term) return true
      return [
        suppliers.find((s) => s.id === ret.supplier_id)?.name || '-',
        ret.supplier_purchases?.invoice_no,
        settlementLabel(ret.settlement_method),
        ret.notes,
      ].some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [returns, suppliers, searchTerm, from, to])

  const totalReturnAmount = useMemo(
    () => filteredReturns.reduce((sum, ret) => sum + (Number(ret.total_amount) || 0), 0),
    [filteredReturns],
  )

  const hasActiveFilters = !!searchTerm.trim() || !!from || !!to
  const resetFilters = () => {
    setSearchTerm('')
    reset()
    setCurrentPage(1)
  }

  const totalPages = Math.ceil(filteredReturns.length / pageSize) || 1
  const safePage = Math.min(currentPage, totalPages)
  const paginated = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredReturns.slice(start, start + pageSize)
  }, [filteredReturns, safePage, pageSize])

  const openNew = () => {
    setEditingId(null)
    setModalOpen(true)
  }

  const openEdit = (id: string) => {
    setEditingId(id)
    setModalOpen(true)
  }

  const handleDelete = async (ret: SupplierReturnWithDetails) => {
    if (!confirm('هل أنت متأكد من حذف مرتجع المشتريات؟ سيتم إعادة الأصناف إلى المخزون وعكس أثره على الحسابات.')) return
    try {
      await deleteReturn.mutateAsync(ret.id)
      showToast('تم حذف المرتجع وإعادة الأصناف إلى المخزون بنجاح')
    } catch (err) {
      showToast(`تعذر حذف المرتجع: ${(err as Error)?.message || 'خطأ غير معروف'}`)
    }
  }

  return (
    <div className="app-page space-y-5">
      <PageHeader
        title="مرتجعات المشتريات"
        count={`${filteredReturns.length} مرتجع`}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-800 sm:text-sm">
              <span>إجمالي المرتجعات:</span>
              <span className="font-num text-sm font-extrabold text-rose-950 sm:text-base" dir="ltr">
                {formatMoney(totalReturnAmount)}
              </span>
            </div>
            <button
              type="button"
              onClick={openNew}
              className="app-btn app-btn-primary py-2 text-xs sm:text-sm"
            >
              + تسجيل مرتجع مشتريات
            </button>
          </div>
        }
      />

      <FilterToolbar
        search={searchTerm}
        onSearchChange={(v) => { setSearchTerm(v); setCurrentPage(1) }}
        searchPlaceholder="بحث بالمورد أو رقم الفاتورة..."
        preset={preset}
        onPresetChange={(p) => { setPreset(p); setCurrentPage(1) }}
        from={from}
        to={to}
        onFromChange={(v) => { setFrom(v); setCurrentPage(1) }}
        onToChange={(v) => { setTo(v); setCurrentPage(1) }}
        onReset={resetFilters}
        hasActiveFilters={hasActiveFilters}
      />

      <p className="mb-3 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-[11px] text-blue-800">
        المرتجع الذي يقلّل الدين يُقيّد مديناً في كشف المورد، والاسترداد النقدي يقلّل المصروفات النقدية. في الحالتين تُخصم الكميات من المخزون.
      </p>

      <ResponsiveDataView
        loading={returnsQuery.isPending}
        error={returnsQuery.isError ? (
          <div>
            <p className="text-sm font-bold text-rose-700">تعذر تحميل مرتجعات المشتريات</p>
            <button
              type="button"
              onClick={() => returnsQuery.refetch()}
              className="app-btn app-btn-sm app-btn-ghost mt-3"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : undefined}
        hasData={filteredReturns.length > 0}
        empty={
          <div>
            <h3 className="mb-1 text-base font-bold text-slate-700">
              {hasActiveFilters ? 'لا توجد نتائج مطابقة للبحث' : 'لا توجد مرتجعات مسجلة'}
            </h3>
            <p className="mx-auto max-w-sm text-xs text-slate-500">
              {hasActiveFilters
                ? 'جرّب تعديل كلمات البحث أو النطاق الزمني أو إعادة تعيين الفلاتر.'
                : 'سجّل مرتجع مشتريات لخصم الأصناف من المخزون وتحديث كشف المورد.'}
            </p>
          </div>
        }
        table={
          <div className="hidden overflow-x-auto rounded-2xl border border-border shadow-sm md:block">
            <table className="app-table">
              <thead>
                <tr>
                  <th className="w-12 text-center">#</th>
                  <th className="text-center">التاريخ</th>
                  <th>المورد</th>
                  <th className="text-center">رقم الفاتورة</th>
                  <th className="text-center">المعالجة</th>
                  <th className="text-center">الإجمالي</th>
                  <th>ملاحظات</th>
                  <th className="w-36 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((ret, idx) => (
                  <tr key={ret.id}>
                    <td className="text-center font-mono text-xs text-slate-400">
                      {filteredReturns.length - ((safePage - 1) * pageSize + idx)}
                    </td>
                    <td className="text-center font-mono text-xs text-slate-600">
                      {new Date(ret.return_date).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="font-semibold text-slate-800">{supplierName(ret.supplier_id)}</td>
                    <td className="text-center font-mono text-xs" dir="ltr">
                      {ret.supplier_purchases?.invoice_no || '-'}
                    </td>
                    <td className="text-center">
                      <span className={`badge ${ret.settlement_method === 'cash_refund' ? 'badge-success' : 'badge-warning'}`}>
                        {settlementLabel(ret.settlement_method)}
                      </span>
                    </td>
                    <td className="text-center font-num font-extrabold tabular-nums" dir="ltr">
                      {formatMoney(Number(ret.total_amount || 0))}
                    </td>
                    <td className="text-xs text-slate-500">{ret.notes || '-'}</td>
                    <td>
                      <div className="flex justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(ret.id)}
                          className="app-btn app-btn-sm app-btn-ghost text-xs"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(ret)}
                          disabled={deleteReturn.isPending}
                          className="app-btn app-btn-sm app-btn-danger text-xs"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
        cards={paginated.map((ret) => (
          <div key={ret.id} className="app-card space-y-2 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-slate-800">{supplierName(ret.supplier_id)}</div>
                <div className="font-mono text-[11px] text-slate-400">
                  {new Date(ret.return_date).toLocaleDateString('ar-EG')}
                </div>
              </div>
              <div className="text-end">
                <div className="font-num font-extrabold tabular-nums text-slate-950" dir="ltr">
                  {formatMoney(Number(ret.total_amount || 0))}
                </div>
                <span className={`badge mt-1 ${ret.settlement_method === 'cash_refund' ? 'badge-success' : 'badge-warning'}`}>
                  {settlementLabel(ret.settlement_method)}
                </span>
              </div>
            </div>
            {ret.supplier_purchases?.invoice_no && (
              <div className="text-xs text-slate-500">
                رقم الفاتورة: <span className="font-mono" dir="ltr">{ret.supplier_purchases.invoice_no}</span>
              </div>
            )}
            {ret.notes && <div className="text-xs text-slate-500">{ret.notes}</div>}
            <div className="flex gap-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => openEdit(ret.id)}
                className="app-btn app-btn-ghost app-btn-sm flex-1 py-1.5 text-xs"
              >
                تعديل
              </button>
              <button
                type="button"
                onClick={() => handleDelete(ret)}
                disabled={deleteReturn.isPending}
                className="app-btn app-btn-danger app-btn-sm flex-1 py-1.5 text-xs"
              >
                حذف
              </button>
            </div>
          </div>
        ))}
        footer={
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={filteredReturns.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1) }}
          />
        }
      />

      {isModalOpen && editingId && linesQuery.isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 text-sm font-bold text-white">
          جارٍ تحميل أصناف المرتجع...
        </div>
      )}

      {isModalOpen && editingId && linesQuery.isError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="rounded-2xl bg-white p-6 text-center shadow-xl">
            <p className="text-sm font-bold text-rose-700">تعذر تحميل أصناف المرتجع</p>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="app-btn app-btn-ghost app-btn-sm mt-3"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {isModalOpen && (!editingId || (linesQuery.data && editingReturn)) && (
        <SupplierReturnModal
          supplierReturn={editingReturn}
          lines={linesQuery.data || []}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          purchases={purchases.map((p) => ({
            id: p.id,
            supplier_id: p.supplier_id,
            invoice_no: p.invoice_no,
            purchase_date: p.purchase_date,
          }))}
          products={products.map((p) => ({ id: p.id, name_ar: p.name_ar, sku: p.sku, unit: p.unit }))}
          onClose={() => setModalOpen(false)}
          onSaved={showToast}
        />
      )}
    </div>
  )
}
