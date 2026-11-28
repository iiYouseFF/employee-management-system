import { useState } from 'react'
import Modal from '@/shared/ui/Modal'
import { formatMoney, formatNumber } from '@/shared/lib/format'
import { useAuth } from '@/features/auth/useAuth'
import { useSettings } from '@/features/settings/useSettings'
import { printSupplierPurchase } from '@/features/reporting/supplierPurchasePrint'
import {
  useSupplierPurchaseLines,
  type SupplierPurchase,
} from '@/features/suppliers/useSuppliers'

interface Props {
  purchase: SupplierPurchase
  supplierName: string
  onClose: () => void
}

function displayDate(value: string | null | undefined, dir: 'rtl' | 'ltr'): string {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(dir === 'ltr' ? 'en-US' : 'ar-EG')
}

function Info({
  label,
  value,
  mono = false,
  dir,
}: {
  label: string
  value: string
  mono?: boolean
  dir?: 'ltr' | 'rtl'
}) {
  return (
    <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2">
      <div className="text-[11px] font-bold text-slate-500">{label}</div>
      <div
        className={`mt-0.5 text-sm font-extrabold text-slate-800 ${mono ? 'font-mono tabular-nums' : ''}`}
        dir={dir}
      >
        {value}
      </div>
    </div>
  )
}

/** Read-only supplier-purchase invoice with a print action; never mutates the purchase. */
export default function SupplierPurchaseDetailsModal({ purchase, supplierName, onClose }: Props) {
  const { data: lines = [], isPending, isError, refetch } = useSupplierPurchaseLines(purchase.id)
  const { data: settings } = useSettings()
  const { can } = useAuth()
  const canPrint = can('export_print')
  const [printing, setPrinting] = useState(false)
  const [actionError, setActionError] = useState('')

  const dir: 'rtl' | 'ltr' = typeof document !== 'undefined' && document.documentElement.dir === 'ltr' ? 'ltr' : 'rtl'
  const companyName = settings?.title || 'المؤسسة المصرية لتوزيع المواد الغذائية'
  const total = Number(purchase.total_amount || 0)

  const handlePrint = async () => {
    if (printing || isPending || isError) return
    setPrinting(true)
    setActionError('')
    try {
      const printed = await printSupplierPurchase({
        companyName,
        supplierName,
        purchaseDate: purchase.purchase_date,
        invoiceNo: purchase.invoice_no,
        paymentType: purchase.payment_type,
        notes: purchase.notes,
        total,
        lines,
        dir,
      })
      if (!printed) setActionError('يرجى السماح بالنوافذ المنبثقة للطباعة')
    } catch (err) {
      setActionError((err as Error)?.message || 'تعذر طباعة فاتورة المشتريات')
    } finally {
      setPrinting(false)
    }
  }

  const title = (
    <span className="flex flex-wrap items-center gap-2">
      <span className="rounded-lg bg-[#e0eefb] px-2.5 py-1 text-xs font-extrabold text-[#103352] ring-1 ring-inset ring-[#1a4971]/30">
        فاتورة مشتريات
      </span>
      <span className="font-mono text-sm font-extrabold tracking-tight text-slate-800" dir="ltr">
        #{purchase.invoice_no || '—'}
      </span>
    </span>
  )

  return (
    <Modal
      title={title}
      subtitle={`المورد: ${supplierName}`}
      size="full"
      overlayClassName="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 md:p-6 animate-fade-in"
      panelClassName="bg-white border border-slate-200/80 shadow-2xl w-screen h-dvh rounded-none md:w-[95vw] md:max-w-[1100px] md:h-[90vh] md:rounded-2xl overflow-hidden animate-scale-in flex flex-col"
      onClose={onClose}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-xs text-slate-500">
            {actionError ? (
              <span className="font-semibold text-rose-700">{actionError}</span>
            ) : (
              <span>
                الإجمالي: <span className="font-mono font-extrabold text-slate-900" dir="ltr">{formatMoney(total)}</span>
              </span>
            )}
          </div>
          {canPrint && (
            <button
              type="button"
              disabled={printing || isPending || isError}
              onClick={() => void handlePrint()}
              className="app-btn app-btn-primary text-xs font-bold disabled:opacity-50"
            >
              {printing ? 'جاري الطباعة...' : 'طباعة الفاتورة'}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <section className="grid grid-cols-1 gap-3 rounded-2xl border border-[#cfe0f2] bg-[#f0f6fc] p-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="المورد" value={supplierName} />
          <Info label="تاريخ الفاتورة" value={displayDate(purchase.purchase_date, dir)} />
          <Info label="نوع الدفع" value={purchase.payment_type === 'cash' ? 'نقدي' : 'آجل'} />
          <Info label="رقم الفاتورة" value={purchase.invoice_no || '-'} mono dir="ltr" />
          {purchase.notes && (
            <div className="sm:col-span-2 lg:col-span-4">
              <div className="text-[11px] font-bold text-slate-500">ملاحظات</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-800">{purchase.notes}</div>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-extrabold text-slate-800">
            أصناف الفاتورة
          </div>
          {isPending ? (
            <div className="py-14 text-center text-sm font-semibold text-slate-500">جاري تحميل أصناف الفاتورة...</div>
          ) : isError ? (
            <div className="p-4 text-center text-sm font-semibold text-rose-700">
              تعذر تحميل أصناف الفاتورة.
              <button type="button" onClick={() => void refetch()} className="app-btn app-btn-sm app-btn-ghost mt-3">
                إعادة المحاولة
              </button>
            </div>
          ) : lines.length === 0 ? (
            <div className="py-14 text-center text-sm font-semibold text-slate-500">لا توجد أصناف مسجلة لهذه الفاتورة.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="app-table">
                <thead>
                  <tr>
                    <th className="w-12 text-center">#</th>
                    <th>الصنف</th>
                    <th className="w-24">الكود</th>
                    <th className="w-24">التشغيلة</th>
                    <th className="w-28">الانتهاء</th>
                    <th className="w-20 text-end">الكمية</th>
                    <th className="w-28 text-end">سعر الوحدة</th>
                    <th className="w-32 text-end">إجمالي السطر</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={line.id}>
                      <td className="text-center font-mono text-xs text-slate-500">{index + 1}</td>
                      <td className="font-semibold text-slate-800">{line.products?.name_ar || line.product_id}</td>
                      <td className="font-mono text-[11px] text-slate-500" dir="ltr">{line.products?.sku || '-'}</td>
                      <td className="font-mono text-[11px] text-slate-600" dir="ltr">{line.batch_number || '-'}</td>
                      <td className="text-xs text-slate-600">{displayDate(line.expiry_date, dir)}</td>
                      <td className="text-end font-mono tabular-nums">{formatNumber(line.qty)}</td>
                      <td className="text-end font-mono tabular-nums">{formatMoney(line.unit_cost)}</td>
                      <td className="text-end font-mono font-bold tabular-nums">
                        {formatMoney(line.line_total ?? Number(line.qty) * Number(line.unit_cost))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#e0eefb]">
                  <tr className="font-extrabold text-[#103352]">
                    <td colSpan={7} className="text-end">الإجمالي الكلي</td>
                    <td className="text-end font-mono text-base font-extrabold tabular-nums" dir="ltr">
                      {formatMoney(total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
