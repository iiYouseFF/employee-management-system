import { useState, type FormEvent } from 'react'
import Modal from '@/shared/ui/Modal'
import SearchableSelect from '@/shared/ui/SearchableSelect'
import { toSearchableOptions } from '@/shared/ui/searchableSelectUtils'
import { formatNumber, getTodayISO } from '@/shared/lib/format'
import {
  useSaveSupplierPurchase,
  type SupplierPurchaseLineWithProduct,
} from '@/features/suppliers/useSuppliers'

interface Props {
  purchase: Record<string, unknown> | null
  lines: SupplierPurchaseLineWithProduct[]
  suppliers: { id: string; name: string }[]
  products: { id: string; name_ar: string; sku: string | null; unit: string | null }[]
  onClose: () => void
  onSaved: (message: string) => void
}

interface LineDraft {
  key: string
  product_id: string
  qty: string
  unit_cost: string
  expiry_date: string
  batch_number: string
}

const emptyLine = (): LineDraft => ({
  key: `${Date.now()}-${Math.random()}`,
  product_id: '',
  qty: '',
  unit_cost: '',
  expiry_date: '',
  batch_number: '',
})

export default function SupplierPurchaseModal({
  purchase,
  lines,
  suppliers,
  products,
  onClose,
  onSaved,
}: Props) {
  const savePurchase = useSaveSupplierPurchase()
  const isEdit = !!purchase?.id
  // Older purchases were created before the purchase→stock link existed. Their
  // goods were usually received manually, so editing them must be explicit.
  const isLegacy = isEdit && lines.length === 0

  const [form, setForm] = useState({
    supplier_id: String(purchase?.supplier_id || ''),
    purchase_date: String(purchase?.purchase_date || getTodayISO()),
    invoice_no: String(purchase?.invoice_no || ''),
    payment_type: String(purchase?.payment_type || 'credit'),
    notes: String(purchase?.notes || ''),
  })
  const [draftLines, setDraftLines] = useState<LineDraft[]>(() =>
    lines.length
      ? lines.map((line) => ({
          key: line.id,
          product_id: line.product_id,
          qty: String(line.qty),
          unit_cost: String(line.unit_cost),
          expiry_date: line.expiry_date || '',
          batch_number: line.batch_number || '',
        }))
      : [emptyLine()],
  )
  const [error, setError] = useState('')
  const [legacyAcknowledged, setLegacyAcknowledged] = useState(false)

  const total = draftLines.reduce(
    (sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unit_cost) || 0),
    0,
  )

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setError('')
    setDraftLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.supplier_id) {
      setError('اختر المورد')
      return
    }
    if (draftLines.length === 0) {
      setError('أضف صنفاً واحداً على الأقل')
      return
    }
    if (isLegacy && !legacyAcknowledged) {
      setError('أكّد أن البضاعة لم تُستلم يدوياً من قبل قبل حفظ هذه الفاتورة القديمة')
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
      await savePurchase.mutateAsync({
        purchase: {
          ...(isEdit ? { id: String(purchase.id) } : {}),
          supplier_id: form.supplier_id,
          purchase_date: form.purchase_date,
          invoice_no: form.invoice_no.trim() || null,
          payment_type: form.payment_type,
          notes: form.notes.trim() || null,
        },
        lines: draftLines.map((line) => ({
          product_id: line.product_id,
          qty: Number(line.qty),
          unit_cost: Number(line.unit_cost || 0),
          expiry_date: line.expiry_date || null,
          batch_number: line.batch_number.trim() || null,
        })),
      })
      onSaved(isEdit ? 'تم تحديث فاتورة المشتريات والمخزون بنجاح' : 'تم تسجيل فاتورة المشتريات وإضافة الأصناف للمخزون بنجاح')
      onClose()
    } catch (err) {
      setError((err as Error)?.message || 'تعذر حفظ فاتورة المشتريات')
    }
  }

  return (
    <Modal
      title={isEdit ? 'تعديل فاتورة مشتريات' : 'تسجيل فاتورة مشتريات'}
      subtitle="سيتم إضافة الأصناف إلى المخزون تلقائياً من خلال هذه الفاتورة — لا حاجة لاستلام بضاعة منفصل."
      size="full"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={savePurchase.isPending} className="app-btn app-btn-ghost px-5">
            إلغاء
          </button>
          <button type="submit" form="supplier-purchase-form" disabled={savePurchase.isPending} className="app-btn app-btn-primary px-6 font-bold">
            {savePurchase.isPending ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'تسجيل الفاتورة'}
          </button>
        </>
      }
    >
      <form id="supplier-purchase-form" onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="mb-1.5 block text-xs font-bold text-slate-700">المورد *</label>
            <SearchableSelect
              options={toSearchableOptions(suppliers)}
              value={form.supplier_id}
              onChange={(id) => { setError(''); setForm((f) => ({ ...f, supplier_id: id })) }}
              placeholder="— اختر المورد —"
              searchPlaceholder="ابحث عن مورد بالاسم أو الهاتف..."
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">تاريخ الفاتورة *</label>
            <input
              type="date"
              value={form.purchase_date}
              onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))}
              className="app-input text-xs"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">رقم الفاتورة</label>
            <input
              type="text"
              dir="ltr"
              value={form.invoice_no}
              onChange={(e) => setForm((f) => ({ ...f, invoice_no: e.target.value }))}
              placeholder="INV-1234"
              className="app-input font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">نوع الدفع</label>
            <select
              value={form.payment_type}
              onChange={(e) => setForm((f) => ({ ...f, payment_type: e.target.value }))}
              className="app-select"
            >
              <option value="credit">آجل (على الحساب)</option>
              <option value="cash">نقدي (مدفوع فوراً)</option>
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="mb-1.5 block text-xs font-bold text-slate-700">ملاحظات</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="app-input text-xs"
            />
          </div>
        </div>

        {isLegacy && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-bold mb-1">تنبيه: فاتورة قديمة غير مرتبطة بحركات مخزون</p>
            <p className="leading-relaxed">
              هذه الفاتورة مسجّلة قبل تفعيل الربط بين المشتريات والمخزون. حفظها الآن سيضيف الكميات إلى المخزون
              من جديد. إذا كانت البضاعة مستلمة يدوياً بالفعل، ألغِ التعديل واستخدم «تسوية مخزون» بدلاً من ذلك.
            </p>
            <label className="mt-2 flex items-center gap-2 font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={legacyAcknowledged}
                onChange={(e) => { setError(''); setLegacyAcknowledged(e.target.checked) }}
                className="h-4 w-4 accent-amber-700"
              />
              <span>أؤكد أن هذه الكميات لم تُستلم يدوياً من قبل</span>
            </label>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-800">الأصناف المشتراة</h3>
          <button
            type="button"
            onClick={() => setDraftLines((prev) => [...prev, emptyLine()])}
            className="app-btn app-btn-sm app-btn-primary"
          >
            + إضافة صنف
          </button>
        </div>

        <div className="space-y-3">
          {draftLines.map((line, index) => (
            <div key={line.key} className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <div className="sm:col-span-2 lg:col-span-2">
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">المنتج *</label>
                  <SearchableSelect
                    options={toSearchableOptions(products)}
                    value={line.product_id}
                    onChange={(id) => updateLine(line.key, { product_id: id })}
                    placeholder="— اختر منتجاً —"
                    searchPlaceholder="ابحث باسم المنتج أو SKU..."
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">الكمية *</label>
                  <input
                    type="number"
                    min="0.0001"
                    step="any"
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
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">تاريخ الانتهاء</label>
                  <input
                    type="date"
                    value={line.expiry_date}
                    onChange={(e) => updateLine(line.key, { expiry_date: e.target.value })}
                    className="app-input text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">رقم التشغيلة</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={line.batch_number}
                    onChange={(e) => updateLine(line.key, { batch_number: e.target.value })}
                    placeholder="LOT-1234"
                    className="app-input font-mono text-xs"
                  />
                </div>
              </div>
              <div className="mt-2 text-start text-[11px] text-slate-500">
                إجمالي الصنف: <span className="font-mono font-bold text-slate-800">{formatNumber((Number(line.qty) || 0) * (Number(line.unit_cost) || 0))}</span> ج.م
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50/70 px-4 py-3">
          <span className="text-sm font-bold text-slate-700">إجمالي الفاتورة</span>
          <span className="font-mono text-lg font-black text-primary-800 tabular-nums">{formatNumber(total)} <span className="text-xs font-normal">ج.م</span></span>
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
