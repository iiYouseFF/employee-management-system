import { useQuery } from '@tanstack/react-query'
import Modal from '@/shared/ui/Modal'
import { supabase } from '@/shared/lib/supabase'
import { formatNumber } from '@/shared/lib/format'
import { paymentMethodLabel } from '@/shared/lib/paymentMethods'
import InvoiceDetailsModal from '@/features/statements/InvoiceDetailsModal'
import type { StatementRow } from '@/features/statements/useStatements'
import { getStatementReference } from '@/features/statements/statementReference'

interface Props {
  row: StatementRow
  onClose: () => void
}

export default function StatementReferenceModal({ row, onClose }: Props) {
  const target = getStatementReference(row)
  if (target?.kind === 'invoice') {
    return <InvoiceDetailsModal invoiceId={target.id} invoiceType={target.type} onClose={onClose} />
  }

  return (
    <Modal
      title={target?.kind === 'customer_payment' ? 'تفاصيل السداد' : target?.kind === 'supplier_purchase' ? 'تفاصيل مشتريات مورد' : target?.kind === 'supplier_payment' ? 'تفاصيل سداد مورد' : 'تفاصيل المرجع'}
      onClose={onClose}
    >
      {!target ? (
        <div className="py-8 text-center text-sm text-slate-500">لا يوجد مرجع مرتبط.</div>
      ) : target.kind === 'customer_payment' ? (
        <CustomerPaymentDetails id={target.id} />
      ) : target.kind === 'supplier_purchase' ? (
        <SupplierPurchaseDetails id={target.id} />
      ) : (
        <SupplierPaymentDetails id={target.id} />
      )}
    </Modal>
  )
}

function CustomerPaymentDetails({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ['payment-details', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('id,date,amount,method,credit_invoice_id,customers(name),reps(name),credit_invoices(invoice_no)')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return data as Record<string, unknown> | null
    },
  })
  if (q.isLoading) return <Loading />
  if (q.error) return <Err error={q.error as Error} />
  if (!q.data) return <Empty />
  const d = q.data
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Info label="التاريخ" value={String(d.date || '-')} />
      <Info label="العميل" value={String((d.customers as Record<string, unknown> | null)?.name || '-')} />
      <Info label="المندوب" value={String((d.reps as Record<string, unknown> | null)?.name || '-')} />
      <Info label="المبلغ" value={`${formatNumber(Number(d.amount || 0))} ج.م`} mono />
      <Info label="طريقة السداد" value={paymentMethodLabel(String(d.method || ''))} />
      <Info label="فاتورة آجلة مرتبطة" value={String((d.credit_invoices as Record<string, unknown> | null)?.invoice_no || '-')} mono />
    </div>
  )
}

function SupplierPaymentDetails({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ['supplier-payment-details', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_payments')
        .select('id,payment_date,amount,method,reference,notes,suppliers(name)')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return data as Record<string, unknown> | null
    },
  })
  if (q.isLoading) return <Loading />
  if (q.error) return <Err error={q.error as Error} />
  if (!q.data) return <Empty />
  const d = q.data
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Info label="التاريخ" value={String(d.payment_date || '-')} />
        <Info label="المورد" value={String((d.suppliers as Record<string, unknown> | null)?.name || '-')} />
        <Info label="المبلغ" value={`${formatNumber(Number(d.amount || 0))} ج.م`} mono />
        <Info label="طريقة السداد" value={paymentMethodLabel(String(d.method || ''))} />
        <Info label="المرجع" value={String(d.reference || '-')} mono />
      </div>
      {d.notes ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"><span className="font-bold text-slate-600">ملاحظات: </span>{String(d.notes)}</div> : null}
    </div>
  )
}

function SupplierPurchaseDetails({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ['supplier-purchase-details', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_purchases')
        .select('id,purchase_date,invoice_no,total_amount,payment_type,notes,suppliers(name)')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return data as Record<string, unknown> | null
    },
  })
  if (q.isLoading) return <Loading />
  if (q.error) return <Err error={q.error as Error} />
  if (!q.data) return <Empty />
  const d = q.data
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Info label="التاريخ" value={String(d.purchase_date || '-')} />
        <Info label="المورد" value={String((d.suppliers as Record<string, unknown> | null)?.name || '-')} />
        <Info label="رقم الفاتورة/المرجع" value={String(d.invoice_no || '-')} mono />
        <Info label="الإجمالي" value={`${formatNumber(Number(d.total_amount || 0))} ج.م`} mono />
        <Info label="نوع العملية" value={d.payment_type === 'credit' ? 'آجل' : 'نقدي'} />
      </div>
      {d.notes ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"><span className="font-bold text-slate-600">ملاحظات: </span>{String(d.notes)}</div> : null}
    </div>
  )
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-bold text-slate-500 mb-0.5">{label}</div>
      <div className={`text-sm font-semibold text-slate-800 ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</div>
    </div>
  )
}

function Loading() { return <div className="py-8 text-center text-sm text-slate-500">جاري تحميل التفاصيل...</div> }
function Empty() { return <div className="py-8 text-center text-sm text-slate-500">لم يتم العثور على السجل.</div> }
function Err({ error }: { error: Error }) { return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">تعذر تحميل التفاصيل: {error.message}</div> }
