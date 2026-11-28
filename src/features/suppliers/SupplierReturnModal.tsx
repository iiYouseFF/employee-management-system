import { useMemo, useState, type FormEvent } from 'react'
import Modal from '@/shared/ui/Modal'
import SearchableSelect from '@/shared/ui/SearchableSelect'
import { toSearchableOptions, type SearchableOption } from '@/shared/ui/searchableSelectUtils'
import { formatMoney, formatNumber, getTodayISO } from '@/shared/lib/format'
import { useProductStock, type ProductStockRow } from '@/features/inventory/useInventory'
import { useSupplierPurchaseLines } from '@/features/suppliers/useSuppliers'
import {
  useSaveSupplierReturn,
  type SupplierReturnLine,
  type SupplierReturnWithDetails,
} from '@/features/suppliers/useSupplierReturns'

interface Props {
  supplierReturn: SupplierReturnWithDetails | null
  lines: SupplierReturnLine[]
  suppliers: { id: string; name: string }[]
  purchases: { id: string; supplier_id: string; invoice_no: string | null; purchase_date: string }[]
  products: { id: string; name_ar: string; sku: string | null; unit: string | null }[]
  onClose: () => void
  onSaved: (message: string) => void
}

interface LineDraft {
  key: string
  product_id: string
  qty: string
  unit_cost: string
}

const emptyLine = (): LineDraft => ({
  key: `${Date.now()}-${Math.random()}`,
  product_id: '',
  qty: '',
  unit_cost: '',
})

export default function SupplierReturnModal({
  supplierReturn,
  lines,
  suppliers,
  purchases,
  products,
  onClose,
  onSaved,
}: Props) {
  const saveReturn = useSaveSupplierReturn()
  const isEdit = !!supplierReturn?.id
  const { data: stockRows = [] } = useProductStock()

  const [form, setForm] = useState({
    supplier_id: String(supplierReturn?.supplier_id || ''),
    purchase_id: String(supplierReturn?.purchase_id || ''),
    return_date: String(supplierReturn?.return_date || getTodayISO()),
    settlement_method: String(
      supplierReturn?.settlement_method || 'reduce_payable',
    ) as 'reduce_payable' | 'cash_refund',
    notes: String(supplierReturn?.notes || ''),
  })
  const [draftLines, setDraftLines] = useState<LineDraft[]>(() =>
    lines.length
      ? lines.map((line) => ({
          key: line.id,
          product_id: line.product_id,
          qty: String(line.qty),
          unit_cost: String(line.unit_cost),
        }))
      : [emptyLine()],
  )
  const [error, setError] = useState('')

  const purchaseLinesQuery = useSupplierPurchaseLines(form.purchase_id || null)
  const stockByProduct = useMemo(() => {
    const map = new Map<string, ProductStockRow>()
    stockRows.forEach((row) => map.set(row.product_id, row))
    return map
  }, [stockRows])

  const purchaseOptions = useMemo<SearchableOption[]>(
    () =>
      purchases
        .filter((purchase) => !form.supplier_id || purchase.supplier_id === form.supplier_id)
        .map((purchase) => ({
          value: purchase.id,
          label: purchase.invoice_no || 'فاتورة بدون رقم',
          meta: new Date(purchase.purchase_date).toLocaleDateString('ar-EG'),
          searchText: purchase.purchase_date,
        })),
    [purchases, form.supplier_id],
  )

  const total = draftLines.reduce(
    (sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unit_cost) || 0),
    0,
  )

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setError('')
    setDraftLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  const handleProductChange = (key: string, productId: string) => {
    const purchaseCost = (purchaseLinesQuery.data || []).find(
      (line) => line.product_id === productId,
    )?.unit_cost
    const avgCost = stockByProduct.get(productId)?.avg_cost
    updateLine(key, {
      product_id: productId,
      unit_cost: purchaseCost != null ? String(purchaseCost) : avgCost ? String(avgCost) : '',
    })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.supplier_id) {
      setError('اختر المورد')
      return
    }
    for (const [index, line] of draftLines.entries()) {
      if (!line.product_id) {
        setError(`اختر المنتج للصنف ${index + 1}`)
        return
      }
      if (!line.qty || Number(line.qty) <= 0) {
        setError(`الكمية للصنف ${index + 1} يجب أن تكون أكبر من صفر`)
        return
      }
      if (line.unit_cost !== '' && Number(line.unit_cost) < 0) {
        setError(`تكلفة الوحدة للصنف ${index + 1} لا يمكن أن تكون سالبة`)
        return
      }
    }

    try {
      await saveReturn.mutateAsync({
        returnHeader: {
          ...(isEdit ? { id: String(supplierReturn.id) } : {}),
          supplier_id: form.supplier_id,
          purchase_id: form.purchase_id || null,
          return_date: form.return_date,
          settlement_method: form.settlement_method,
          notes: form.notes.trim() || null,
        },
        lines: draftLines.map((line) => ({
          product_id: line.product_id,
          qty: Number(line.qty),
          unit_cost: Number(line.unit_cost || 0),
        })),
      })
      onSaved(
        isEdit
          ? 'تم تحديث مرتجع المشتريات وتعديل المخزون والحسابات بنجاح'
          : 'تم تسجيل مرتجع المشتريات وخصم الأصناف من المخزون بنجاح',
      )
      onClose()
    } catch (err) {
      setError((err as Error)?.message || 'تعذر حفظ مرتجع المشتريات')
    }
  }

  return (
    <Modal
      title={isEdit ? 'تعديل مرتجع مشتريات' : 'تسجيل مرتجع مشتريات'}
      subtitle="سيتم خصم الأصناف المرتجعة من المخزون تلقائياً وتحديث كشف المورد حسب طريقة المعالجة."
      size="full"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saveReturn.isPending}
            className="app-btn app-btn-ghost px-5"
          >
            إلغاء
          </button>
          <button
            type="submit"
            form="supplier-return-form"
            disabled={saveReturn.isPending}
            className="app-btn app-btn-primary px-6 font-bold"
          >
            {saveReturn.isPending ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'تسجيل المرتجع'}
          </button>
        </>
      }
    >
      <form id="supplier-return-form" onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">المورد *</label>
            <SearchableSelect
              options={toSearchableOptions(suppliers)}
              value={form.supplier_id}
              onChange={(id) => {
                setError('')
                setForm((f) => ({ ...f, supplier_id: id, purchase_id: '' }))
              }}
              placeholder="— اختر المورد —"
              searchPlaceholder="ابحث عن مورد بالاسم أو الهاتف..."
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">تاريخ المرتجع *</label>
            <input
              type="date"
              value={form.return_date}
              onChange={(e) => setForm((f) => ({ ...f, return_date: e.target.value }))}
              className="app-input text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-bold text-slate-700">فاتورة المشتريات الأصلية (اختياري)</label>
            <SearchableSelect
              options={purchaseOptions}
              value={form.purchase_id}
              onChange={(id) => {
                setError('')
                setForm((f) => ({ ...f, purchase_id: id }))
              }}
              placeholder="— بدون ربط بفاتورة —"
              searchPlaceholder="ابحث برقم الفاتورة..."
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-bold text-slate-700">طريقة المعالجة *</label>
            <select
              value={form.settlement_method}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  settlement_method: e.target.value as 'reduce_payable' | 'cash_refund',
                }))
              }
              className="app-select"
            >
              <option value="reduce_payable">تقليل دين المورد (قيد مدين في الكشف)</option>
              <option value="cash_refund">استرداد نقدي من المورد</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-bold text-slate-700">ملاحظات</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="app-input text-xs"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-800">الأصناف المرتجعة</h3>
          <button
            type="button"
            onClick={() => setDraftLines((prev) => [...prev, emptyLine()])}
            className="app-btn app-btn-sm app-btn-primary"
          >
            + إضافة صنف
          </button>
        </div>

        <div className="space-y-3">
          {draftLines.map((line, index) => {
            const available = stockByProduct.get(line.product_id)?.available_qty
            return (
              <div key={line.key} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-600">الصنف {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => setDraftLines((prev) => prev.filter((item) => item.key !== line.key))}
                    disabled={draftLines.length === 1}
                    className="app-btn app-btn-sm app-btn-danger disabled:opacity-40"
                  >
                    حذف الصنف
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-700">المنتج *</label>
                    <SearchableSelect
                      options={toSearchableOptions(products)}
                      value={line.product_id}
                      onChange={(id) => handleProductChange(line.key, id)}
                      placeholder="— اختر منتجاً —"
                      searchPlaceholder="ابحث باسم المنتج أو SKU..."
                      className="text-xs"
                    />
                    {available !== undefined && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        المتاح في المخزون: <span className="font-mono font-bold">{formatNumber(available)}</span>
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-700">الكمية *</label>
                    <input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      dir="ltr"
                      value={line.qty}
                      onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                      placeholder="0"
                      className="app-input font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-700">تكلفة الوحدة (ج.م)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      dir="ltr"
                      value={line.unit_cost}
                      onChange={(e) => updateLine(line.key, { unit_cost: e.target.value })}
                      placeholder="0.00"
                      className="app-input font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="mt-2 text-start text-[11px] text-slate-500">
                  إجمالي الصنف: <span className="font-mono font-bold text-slate-800">{formatNumber((Number(line.qty) || 0) * (Number(line.unit_cost) || 0))}</span> ج.م
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50/70 px-4 py-3">
          <span className="text-sm font-bold text-slate-700">إجمالي المرتجع</span>
          <span className="font-mono text-lg font-black text-primary-800 tabular-nums">
            {formatMoney(total)} <span className="text-xs font-normal">ج.م</span>
          </span>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}
      </form>
    </Modal>
  )
}
