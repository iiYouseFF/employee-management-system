import { useEffect, useMemo, useState } from 'react'
import Pagination from '@/shared/ui/Pagination'
import PageHeader from '@/shared/ui/PageHeader'
import FilterToolbar from '@/shared/ui/FilterToolbar'
import ResponsiveDataView from '@/shared/ui/ResponsiveDataView'
import { useDatePreset } from '@/shared/hooks/useDatePreset'
import { formatMoney } from '@/shared/lib/format'
import SupplierPurchaseModal from '@/features/suppliers/SupplierPurchaseModal'
import SupplierPurchaseDetailsModal from '@/features/suppliers/SupplierPurchaseDetailsModal'
import { useProducts } from '@/features/products/useProducts'
import { useAuth } from '@/features/auth/useAuth'
import { useSettings } from '@/features/settings/useSettings'
import { printGenericDocument } from '@/features/reporting/printableDocuments'
import {
  printSupplierPurchase,
  printSupplierPurchasesBatch,
} from '@/features/reporting/supplierPurchasePrint'
import { useRowSelection } from '@/shared/hooks/useRowSelection'
import { BulkActionBar } from '@/shared/ui/BulkActionBar'
import {
  fetchSupplierPurchaseLines,
  useDeleteSupplierPurchase,
  useSupplierPurchaseLines,
  useSupplierPurchases,
  useSuppliers,
  type SupplierPurchase,
} from '@/features/suppliers/useSuppliers'

interface Props { showToast: (msg: string) => void; createSignal?: number; onSignalHandled?: () => void }

const EMPTY_LIST: never[] = []

export default function SupplierPurchasesTab({ showToast, createSignal, onSignalHandled }: Props) {
  const suppliersQuery = useSuppliers()
  const purchasesQuery = useSupplierPurchases()
  const productsQuery = useProducts()
  const deletePurchase = useDeleteSupplierPurchase()

  const suppliers = suppliersQuery.data ?? EMPTY_LIST
  const purchases = purchasesQuery.data ?? EMPTY_LIST
  const products = productsQuery.data ?? EMPTY_LIST

  const [isModalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailsPurchase, setDetailsPurchase] = useState<SupplierPurchase | null>(null)
  const linesQuery = useSupplierPurchaseLines(editingId)
  const [searchTerm, setSearchTerm] = useState('')
  const { preset, from, to, setPreset, setFrom, setTo, reset } = useDatePreset('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const { data: settings } = useSettings()
  const { can } = useAuth()
  const canPrint = can('export_print')
  const companyName = settings?.title || 'المؤسسة المصرية لتوزيع المواد الغذائية'
  const dir = document.documentElement.dir === 'ltr' ? 'ltr' : 'rtl'
  const [printingId, setPrintingId] = useState<string | null>(null)
  const [bulkPrinting, setBulkPrinting] = useState(false)
  useEffect(() => { if (createSignal) { openNew(); onSignalHandled?.() } }, [createSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name || '-'
  const formatDate = (value: string) => new Date(value).toLocaleDateString('ar-EG')
  const editingPurchase = useMemo(
    () => purchases.find((p) => p.id === editingId) || null,
    [purchases, editingId],
  )

  const filteredPurchases = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return purchases.filter((p) => {
      const date = String(p.purchase_date || '')
      if (from && date < from) return false
      if (to && date > to) return false
      if (!term) return true
      const supplier = suppliers.find((s) => s.id === p.supplier_id)
      return [supplier?.name || '-', p.invoice_no, p.payment_type === 'cash' ? 'نقدي' : 'آجل', p.notes]
        .some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [purchases, suppliers, searchTerm, from, to])

  const hasActiveFilters = !!searchTerm.trim() || !!from || !!to
  const resetFilters = () => {
    setSearchTerm('')
    reset()
    setCurrentPage(1)
  }

  const totalPages = Math.ceil(filteredPurchases.length / pageSize) || 1
  const safePage = Math.min(currentPage, totalPages)
  const paginated = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredPurchases.slice(start, start + pageSize)
  }, [filteredPurchases, safePage, pageSize])
  const selection = useRowSelection(paginated, (purchase) => purchase.id)

  const openNew = () => {
    setEditingId(null)
    setModalOpen(true)
  }

  const openEdit = (id: string) => {
    setEditingId(id)
    setModalOpen(true)
  }

  const handleDelete = async (purchase: SupplierPurchase) => {
    if (!confirm(`هل أنت متأكد من حذف فاتورة المشتريات${purchase.invoice_no ? ` رقم ${purchase.invoice_no}` : ''}؟ سيتم خصم الأصناف من المخزون.`)) return
    try {
      await deletePurchase.mutateAsync(purchase.id)
      showToast('تم حذف فاتورة المشتريات وخصم الأصناف من المخزون بنجاح')
    } catch (err) {
      showToast(`تعذر حذف فاتورة المشتريات: ${(err as Error)?.message || 'خطأ غير معروف'}`)
    }
  }

  const toPrintRef = (purchase: SupplierPurchase) => ({
    id: purchase.id,
    supplierName: supplierName(purchase.supplier_id),
    purchaseDate: purchase.purchase_date,
    invoiceNo: purchase.invoice_no,
    paymentType: purchase.payment_type,
    notes: purchase.notes,
    total: Number(purchase.total_amount || 0),
  })

  const handlePrintList = async () => {
    const printed = await printGenericDocument({
      companyName,
      title: 'مشتريات الموردين',
      subtitle: hasActiveFilters ? 'النتائج المطابقة للفلاتر الحالية' : undefined,
      columns: [
        { label: '#', numeric: true },
        { label: 'التاريخ' },
        { label: 'المورد' },
        { label: 'رقم الفاتورة' },
        { label: 'النوع' },
        { label: 'الإجمالي', numeric: true },
        { label: 'ملاحظات' },
      ],
      rows: filteredPurchases.map((purchase, index) => [
        String(filteredPurchases.length - index),
        formatDate(purchase.purchase_date),
        supplierName(purchase.supplier_id),
        purchase.invoice_no || '-',
        purchase.payment_type === 'cash' ? 'نقدي' : 'آجل',
        formatMoney(Number(purchase.total_amount || 0), { withCurrency: false }),
        purchase.notes || '-',
      ]),
      dir,
    })
    if (!printed) showToast('يرجى السماح بالنوافذ المنبثقة للطباعة')
  }

  const handlePrintPurchase = async (purchase: SupplierPurchase) => {
    if (printingId) return
    setPrintingId(purchase.id)
    try {
      const lines = await fetchSupplierPurchaseLines(purchase.id)
      const printed = await printSupplierPurchase({ ...toPrintRef(purchase), companyName, lines, dir })
      if (!printed) showToast('يرجى السماح بالنوافذ المنبثقة للطباعة')
    } catch (err) {
      showToast(`تعذر طباعة فاتورة المشتريات: ${(err as Error)?.message || 'خطأ غير معروف'}`)
    } finally {
      setPrintingId(null)
    }
  }

  const handleBulkPrint = async () => {
    if (bulkPrinting) return
    setBulkPrinting(true)
    try {
      const result = await printSupplierPurchasesBatch({
        purchases: selection.selectedRows.map(toPrintRef),
        companyName,
        dir,
      })
      if (result.printed && result.failed === 0) selection.clear()
      if (!result.printed) showToast('يرجى السماح بالنوافذ المنبثقة للطباعة')
      if (result.failed) {
        showToast(result.printed
          ? `تعذّر تحميل ${result.failed} فاتورة؛ تمت طباعة الباقي. لم يتم إلغاء التحديد`
          : `تعذّر تحميل ${result.failed} فاتورة؛ لم تتم الطباعة`)
      }
    } finally {
      setBulkPrinting(false)
    }
  }

  return (
    <div className="app-page space-y-5">
      <PageHeader
        title="مشتريات الموردين"
        count={`${filteredPurchases.length} عملية`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canPrint && (
              <button type="button" onClick={() => void handlePrintList()} className="app-btn app-btn-secondary py-2 text-xs sm:text-sm">
                طباعة القائمة
              </button>
            )}
            <button type="button" onClick={openNew} className="app-btn app-btn-primary py-2 text-xs sm:text-sm">
              + تسجيل فاتورة مشتريات
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
        تسجيل الفاتورة هنا يضيف الأصناف إلى المخزون تلقائياً. لا تستخدم «استلام بضاعة» في المخزون إلا للبضاعة غير المرتبطة بفاتورة مورد.
      </p>

      {canPrint && (
        <BulkActionBar
          count={selection.count}
          onPrint={() => void handleBulkPrint()}
          onClear={selection.clear}
          printLabel="طباعة المشتريات المحددة"
          busy={bulkPrinting}
        />
      )}

      <ResponsiveDataView
        loading={purchasesQuery.isPending}
        error={purchasesQuery.isError ? (
          <div>
            <p className="text-sm font-bold text-rose-700">تعذر تحميل مشتريات الموردين</p>
            <button
              type="button"
              onClick={() => purchasesQuery.refetch()}
              className="app-btn app-btn-sm app-btn-ghost mt-3"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : undefined}
        hasData={filteredPurchases.length > 0}
        empty={
          <div>
            <h3 className="text-slate-700 font-bold text-base mb-1">لا توجد مشتريات مسجلة</h3>
            <p className="text-slate-500 text-xs max-w-sm mx-auto">سجل فاتورة مشتريات بأصنافها، وسيتم إضافة الكميات إلى المخزون تلقائياً.</p>
          </div>
        }
        table={
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
            <table className="app-table">
              <thead>
                <tr>
                  {canPrint && (
                    <th className="w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selection.allCurrentPageSelected}
                        onChange={selection.toggleCurrentPage}
                        aria-label="تحديد كل مشتريات الصفحة"
                        className="h-4 w-4 accent-[var(--primary)] cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="w-12 text-center">#</th>
                  <th className="text-center">التاريخ</th>
                  <th>المورد</th>
                  <th className="text-center">رقم الفاتورة</th>
                  <th className="text-center">النوع</th>
                  <th className="text-center">الإجمالي</th>
                  <th>ملاحظات</th>
                  <th className="text-center w-56">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((p, idx) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer hover:bg-slate-50/80"
                    onClick={() => setDetailsPurchase(p)}
                  >
                    {canPrint && (
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selection.isSelected(p.id)}
                          onChange={() => selection.toggle(p.id)}
                          aria-label="تحديد فاتورة المشتريات"
                          className="h-4 w-4 accent-[var(--primary)] cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="text-center text-xs text-slate-400 font-mono">{filteredPurchases.length - ((safePage - 1) * pageSize + idx)}</td>
                    <td className="text-center text-xs font-mono text-slate-600">{new Date(p.purchase_date).toLocaleDateString('ar-EG')}</td>
                    <td className="font-semibold text-slate-800">{supplierName(p.supplier_id)}</td>
                    <td className="text-center font-mono text-xs" dir="ltr">{p.invoice_no || '-'}</td>
                    <td className="text-center">
                      <span className={`badge ${p.payment_type === 'cash' ? 'badge-success' : 'badge-warning'}`}>
                        {p.payment_type === 'cash' ? 'نقدي' : 'آجل'}
                      </span>
                    </td>
                    <td className="text-center font-num font-extrabold tabular-nums" dir="ltr">{formatMoney(Number(p.total_amount || 0))}</td>
                    <td className="text-xs text-slate-500">{p.notes || '-'}</td>
                    <td>
                      <div className="flex gap-1.5 justify-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setDetailsPurchase(p)}
                          className="app-btn app-btn-sm app-btn-ghost text-xs"
                        >
                          تفاصيل
                        </button>
                        {canPrint && (
                          <button
                            type="button"
                            onClick={() => void handlePrintPurchase(p)}
                            disabled={printingId === p.id}
                            className="app-btn app-btn-sm app-btn-ghost text-xs"
                          >
                            {printingId === p.id ? 'جاري الطباعة...' : 'طباعة'}
                          </button>
                        )}
                        <button type="button" onClick={() => openEdit(p.id)} className="app-btn app-btn-sm app-btn-ghost text-xs">تعديل</button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p)}
                          disabled={deletePurchase.isPending}
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
        cards={paginated.map((p) => (
          <div
            key={p.id}
            className="app-card cursor-pointer p-3.5 space-y-2 hover:border-[var(--primary)]/40"
            role="group"
            aria-label={`تفاصيل فاتورة المشتريات ${p.invoice_no || p.id}`}
            onClick={() => setDetailsPurchase(p)}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-slate-800 text-sm">{supplierName(p.supplier_id)}</div>
                <div className="text-[11px] text-slate-400 font-mono">{new Date(p.purchase_date).toLocaleDateString('ar-EG')}</div>
              </div>
              <div className="text-end">
                <div className="font-num font-extrabold text-slate-950 tabular-nums" dir="ltr">{formatMoney(Number(p.total_amount || 0))}</div>
                <span className={`badge mt-1 ${p.payment_type === 'cash' ? 'badge-success' : 'badge-warning'}`}>{p.payment_type === 'cash' ? 'نقدي' : 'آجل'}</span>
              </div>
            </div>
            {p.invoice_no && <div className="text-xs text-slate-500">رقم الفاتورة: <span className="font-mono" dir="ltr">{p.invoice_no}</span></div>}
            {p.notes && <div className="text-xs text-slate-500">{p.notes}</div>}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setDetailsPurchase(p)}
                className="app-btn app-btn-ghost app-btn-sm flex-1 py-1.5 text-xs"
              >
                تفاصيل
              </button>
              {canPrint && (
                <button
                  type="button"
                  onClick={() => void handlePrintPurchase(p)}
                  disabled={printingId === p.id}
                  className="app-btn app-btn-ghost app-btn-sm flex-1 py-1.5 text-xs"
                >
                  {printingId === p.id ? 'جاري الطباعة...' : 'طباعة'}
                </button>
              )}
              <button type="button" onClick={() => openEdit(p.id)} className="app-btn app-btn-ghost app-btn-sm flex-1 py-1.5 text-xs">تعديل</button>
              <button
                type="button"
                onClick={() => handleDelete(p)}
                disabled={deletePurchase.isPending}
                className="app-btn app-btn-danger app-btn-sm flex-1 py-1.5 text-xs"
              >
                حذف
              </button>
            </div>
          </div>
        ))}
        footer={<Pagination currentPage={safePage} totalPages={totalPages} totalItems={filteredPurchases.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1) }} />}
      />

      {isModalOpen && editingId && linesQuery.isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 text-sm font-bold text-white">
          جارٍ تحميل أصناف الفاتورة...
        </div>
      )}

      {isModalOpen && editingId && linesQuery.isError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="rounded-2xl bg-white p-6 text-center shadow-xl">
            <p className="text-sm font-bold text-rose-700">تعذر تحميل أصناف الفاتورة</p>
            <button type="button" onClick={() => setModalOpen(false)} className="app-btn app-btn-ghost app-btn-sm mt-3">إغلاق</button>
          </div>
        </div>
      )}

      {isModalOpen && (!editingId || linesQuery.data) && (
        <SupplierPurchaseModal
          purchase={editingPurchase}
          lines={linesQuery.data || []}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          products={products.map((p) => ({ id: p.id, name_ar: p.name_ar, sku: p.sku, unit: p.unit }))}
          onClose={() => setModalOpen(false)}
          onSaved={showToast}
        />
      )}

      {detailsPurchase && (
        <SupplierPurchaseDetailsModal
          purchase={detailsPurchase}
          supplierName={supplierName(detailsPurchase.supplier_id)}
          onClose={() => setDetailsPurchase(null)}
        />
      )}
    </div>
  )
}

