import { useState, useMemo } from 'react'
import Modal from './Modal'
import {
  useCashInvoices,
  useCreditInvoices,
  usePayments,
} from '../hooks/useInvoices'
import { useReps, useSettings } from '../hooks/useData'
import { formatNumber } from '../lib/format'
import { buildReport, printReport, exportReportCsv } from '../lib/report'

interface CustomerStatementModalProps {
  customer: {
    id: string
    name: string
    phone?: string | null
    representative_id?: string | null
    representative_name?: string | null
  }
  onClose: () => void
}

type TabType = 'all' | 'credit' | 'cash' | 'payments'

export default function CustomerStatementModal({
  customer,
  onClose,
}: CustomerStatementModalProps) {
  const { data: allCashInvoices = [], isLoading: loadingCash } = useCashInvoices()
  const { data: allCreditInvoices = [], isLoading: loadingCredit } = useCreditInvoices()
  const { data: allPayments = [], isLoading: loadingPayments } = usePayments()
  const { data: reps = [] } = useReps()
  const { data: settings } = useSettings()

  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [filterMonth, setFilterMonth] = useState<string>('')

  // Filter for this customer only
  const customerCash = useMemo(() => {
    return allCashInvoices.filter(
      (inv: any) =>
        inv.customer_id === customer.id ||
        (inv.customers && inv.customers.name === customer.name)
    )
  }, [allCashInvoices, customer.id, customer.name])

  const customerCredit = useMemo(() => {
    return allCreditInvoices.filter(
      (inv: any) =>
        inv.customer_id === customer.id ||
        (inv.customer === customer.name)
    )
  }, [allCreditInvoices, customer.id, customer.name])

  const customerPayments = useMemo(() => {
    return allPayments.filter(
      (p: any) =>
        p.customer_id === customer.id ||
        (p.customers && p.customers.name === customer.name)
    )
  }, [allPayments, customer.id, customer.name])

  // Rep mapping helper
  const getRepName = (repId?: string, repName?: string) => {
    if (repId) {
      const found = reps.find((r: any) => r.id === repId)
      if (found) return found.name
    }
    return repName || '-'
  }

  // Unified timeline items
  const timelineItems = useMemo(() => {
    const list: any[] = []

    customerCash.forEach((inv: any) => {
      list.push({
        id: `cash-${inv.id}`,
        rawDate: inv.date || inv.created_at || '',
        date: inv.date || (inv.created_at ? inv.created_at.slice(0, 10) : ''),
        type: 'cash',
        typeLabel: 'فاتورة نقدية',
        invoiceNo: inv.invoice_no || '-',
        item: inv.item || '-',
        amount: parseFloat(inv.amount || 0),
        paid: parseFloat(inv.amount || 0),
        remaining: 0,
        notes: inv.notes || '-',
        rep: getRepName(inv.rep_id, inv.reps?.name),
        dueDate: null,
      })
    })

    customerCredit.forEach((inv: any) => {
      const amt = parseFloat(inv.amount || 0)
      const downPaid = parseFloat(inv.paid || 0)
      const linked = parseFloat(inv.linked_payments || 0)
      const totalInvoicePaid = downPaid + linked
      const rem = inv.remaining !== undefined ? parseFloat(inv.remaining || 0) : Math.max(0, amt - totalInvoicePaid)

      list.push({
        id: `credit-${inv.id}`,
        rawDate: inv.date || inv.created_at || '',
        date: inv.date || (inv.created_at ? inv.created_at.slice(0, 10) : ''),
        type: 'credit',
        typeLabel: 'فاتورة آجلة',
        invoiceNo: inv.invoice_no || '-',
        item: inv.item || '-',
        amount: amt,
        paid: totalInvoicePaid,
        remaining: Math.max(0, rem),
        notes: inv.notes || '-',
        rep: getRepName(inv.rep_id, inv.reps?.name),
        dueDate: inv.due_date || null,
      })
    })

    customerPayments.forEach((p: any) => {
      list.push({
        id: `pay-${p.id}`,
        rawDate: p.date || p.created_at || '',
        date: p.date || (p.created_at ? p.created_at.slice(0, 10) : ''),
        type: 'payment',
        typeLabel: 'دفعة سداد',
        invoiceNo: p.credit_invoices?.invoice_no || '-',
        item: `سداد (${p.method || 'نقدي'})`,
        amount: 0,
        paid: parseFloat(p.amount || 0),
        remaining: 0,
        notes: p.notes || '-',
        rep: getRepName(p.rep_id, p.reps?.name),
        dueDate: null,
      })
    })

    // Sort descending by date
    list.sort((a, b) => (b.rawDate || '').localeCompare(a.rawDate || ''))
    return list
  }, [customerCash, customerCredit, customerPayments, reps])

  // Summary statistics (matching v_customer_statement logic)
  const summary = useMemo(() => {
    const totalCash = customerCash.reduce(
      (sum: number, inv: any) => sum + parseFloat(inv.amount || 0),
      0
    )
    const totalCredit = customerCredit.reduce(
      (sum: number, inv: any) => sum + parseFloat(inv.amount || 0),
      0
    )
    const totalDownPayments = customerCredit.reduce(
      (sum: number, inv: any) => sum + parseFloat(inv.paid || 0),
      0
    )
    const totalPaymentsReceived = customerPayments.reduce(
      (sum: number, p: any) => sum + parseFloat(p.amount || 0),
      0
    )
    // Total paid towards credit is down-payments directly on invoices + separate payments recorded
    const totalPaidOnCredit = totalDownPayments + totalPaymentsReceived
    // The credit debt remaining
    const totalRemaining = Math.max(0, totalCredit - totalPaidOnCredit)

    return {
      totalCash,
      totalCredit,
      totalDownPayments,
      totalPaymentsReceived,
      totalPaidOnCredit,
      totalRemaining,
      cashCount: customerCash.length,
      creditCount: customerCredit.length,
      paymentsCount: customerPayments.length,
    }
  }, [customerCash, customerCredit, customerPayments])

  // Filtered rows for current tab & month filter
  const displayedItems = useMemo(() => {
    return timelineItems.filter((item) => {
      if (activeTab === 'cash' && item.type !== 'cash') return false
      if (activeTab === 'credit' && item.type !== 'credit') return false
      if (activeTab === 'payments' && item.type !== 'payment') return false

      if (filterMonth && !item.date.startsWith(filterMonth)) return false

      return true
    })
  }, [timelineItems, activeTab, filterMonth])

  // Print customer statement
  const handlePrint = () => {
    const company = settings?.title || 'المؤسسة المصرية لتوزيع المواد الغذائية'
    const report = buildReport(
      {
        sections: ['statement', 'credit', 'cash', 'payments'],
        customerId: customer.id,
        repId: '',
        from: '',
        to: '',
        company,
      },
      {
        cashInvoices: customerCash,
        creditInvoices: customerCredit,
        payments: customerPayments,
        customers: [customer],
        reps,
      }
    )
    report.title = `كشف حساب تفصيلي - ${customer.name}`
    printReport(report, company)
  }

  // Export CSV
  const handleExportCsv = () => {
    const company = settings?.title || 'المؤسسة المصرية لتوزيع المواد الغذائية'
    const report = buildReport(
      {
        sections: ['statement', 'credit', 'cash', 'payments'],
        customerId: customer.id,
        repId: '',
        from: '',
        to: '',
        company,
      },
      {
        cashInvoices: customerCash,
        creditInvoices: customerCredit,
        payments: customerPayments,
        customers: [customer],
        reps,
      }
    )
    report.title = `كشف حساب تفصيلي - ${customer.name}`
    exportReportCsv(report, `كشف-حساب-${customer.name}.csv`, company)
  }

  const isLoading = loadingCash || loadingCredit || loadingPayments

  return (
    <Modal
      title={`كشف حساب تفصيلي: ${customer.name}`}
      onClose={onClose}
      wide
      footer={
        <div className="flex w-full items-center justify-between flex-wrap gap-2">
          <div className="text-xs text-gray-500">
            إجمالي الحركات: <span className="font-bold text-gray-800">{displayedItems.length}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportCsv}
              className="rounded-lg border border-primary px-3 py-1.5 text-xs text-primary hover:bg-primary/5 font-semibold"
            >
              تصدير CSV
            </button>
            <button
              onClick={handlePrint}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary-2 font-semibold"
            >
              طباعة كشف الحساب
            </button>
            <button
              onClick={onClose}
              className="rounded-lg bg-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-300"
            >
              إغلاق
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Customer Header Info Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5">
            <div className="text-xs text-blue-600 font-medium">إجمالي النقدي</div>
            <div className="text-base font-bold text-blue-900 mt-0.5">
              {formatNumber(summary.totalCash)} <span className="text-xs font-normal">جنيه</span>
            </div>
            <div className="text-[11px] text-blue-500 mt-0.5">
              {summary.cashCount} فاتورة
            </div>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5">
            <div className="text-xs text-amber-600 font-medium">إجمالي الآجل</div>
            <div className="text-base font-bold text-amber-900 mt-0.5">
              {formatNumber(summary.totalCredit)} <span className="text-xs font-normal">جنيه</span>
            </div>
            <div className="text-[11px] text-amber-500 mt-0.5">
              {summary.creditCount} فاتورة
            </div>
          </div>

          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5">
            <div className="text-xs text-emerald-600 font-medium">المدفوع من الآجل</div>
            <div className="text-base font-bold text-emerald-900 mt-0.5">
              {formatNumber(summary.totalPaidOnCredit)} <span className="text-xs font-normal">جنيه</span>
            </div>
            <div className="text-[11px] text-emerald-700 mt-0.5">
              {summary.paymentsCount > 0 ? `${summary.paymentsCount} دفعة مسجلة` : 'سداد مباشر'}
              {summary.totalDownPayments > 0 && ` (+ ${formatNumber(summary.totalDownPayments)} مقدم)`}
            </div>
          </div>

          <div
            className={`rounded-lg border p-2.5 ${
              summary.totalRemaining > 0
                ? 'bg-rose-50 border-rose-300'
                : 'bg-green-50 border-green-200'
            }`}
          >
            <div
              className={`text-xs font-medium ${
                summary.totalRemaining > 0 ? 'text-rose-600' : 'text-green-600'
              }`}
            >
              المتبقي طرف العميل
            </div>
            <div
              className={`text-base font-extrabold mt-0.5 ${
                summary.totalRemaining > 0 ? 'text-rose-700' : 'text-green-700'
              }`}
            >
              {formatNumber(summary.totalRemaining)} <span className="text-xs font-normal">جنيه</span>
            </div>
            <div className="text-[11px] mt-0.5 font-bold">
              {summary.totalRemaining > 0 ? (
                <span className="text-rose-600">عليه مديونية</span>
              ) : (
                <span className="text-green-600">خالص تماماً</span>
              )}
            </div>
          </div>
        </div>

        {/* Customer Contact & Rep Details */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 p-2.5 rounded-lg border border-border text-xs text-gray-600">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-gray-400">الهاتف:</span>{' '}
              <span className="font-semibold text-gray-800" dir="ltr">
                {customer.phone || 'غير مسجل'}
              </span>
            </div>
            {customer.representative_name && (
              <div>
                <span className="text-gray-400">المندوب المخصص:</span>{' '}
                <span className="font-semibold text-gray-800">
                  {customer.representative_name}
                </span>
              </div>
            )}
          </div>
          <div>
            <label className="inline-flex items-center gap-1.5">
              <span className="text-gray-500">فلترة بالشهر:</span>
              <input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="border border-border rounded px-2 py-0.5 text-xs bg-white"
              />
              {filterMonth && (
                <button
                  onClick={() => setFilterMonth('')}
                  className="text-xs text-red-500 hover:underline"
                >
                  إلغاء
                </button>
              )}
            </label>
          </div>
        </div>

        {/* Filter Navigation Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 text-xs font-bold transition-colors border-b-2 -mb-px ${
              activeTab === 'all'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            كل الحركات ({timelineItems.length})
          </button>
          <button
            onClick={() => setActiveTab('credit')}
            className={`px-4 py-2 text-xs font-bold transition-colors border-b-2 -mb-px ${
              activeTab === 'credit'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            الفواتير الآجلة ({customerCredit.length})
          </button>
          <button
            onClick={() => setActiveTab('cash')}
            className={`px-4 py-2 text-xs font-bold transition-colors border-b-2 -mb-px ${
              activeTab === 'cash'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            الفواتير النقدية ({customerCash.length})
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2 text-xs font-bold transition-colors border-b-2 -mb-px ${
              activeTab === 'payments'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            الدفعات المسددة ({customerPayments.length})
          </button>
        </div>

        {/* Invoices & Transactions Table */}
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto border border-border rounded-lg">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-gray-500">
              جاري تحميل الفواتير...
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">
              لا توجد فواتير أو حركات مسجلة لهذا العميل{' '}
              {filterMonth && 'في هذا الشهر'}
            </div>
          ) : (
            <table className="w-full border-collapse text-right text-xs">
              <thead className="bg-gray-100 sticky top-0 z-10">
                <tr>
                  <th className="border-b border-border p-2">التاريخ</th>
                  <th className="border-b border-border p-2">النوع</th>
                  <th className="border-b border-border p-2">رقم الفاتورة</th>
                  <th className="border-b border-border p-2">البيان</th>
                  <th className="border-b border-border p-2">المندوب</th>
                  <th className="border-b border-border p-2 text-center">المبلغ الإجمالي</th>
                  <th className="border-b border-border p-2 text-center">المدفوع</th>
                  <th className="border-b border-border p-2 text-center">المتبقي</th>
                  <th className="border-b border-border p-2 text-center">تاريخ الاستحقاق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayedItems.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="p-2 whitespace-nowrap font-medium" dir="ltr">
                      {item.date ? new Date(item.date).toLocaleDateString('ar-EG') : '-'}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {item.type === 'cash' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-800 font-semibold">
                          نقدي
                        </span>
                      )}
                      {item.type === 'credit' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 font-semibold">
                          آجل
                        </span>
                      )}
                      {item.type === 'payment' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-semibold">
                          دفعة
                        </span>
                      )}
                    </td>
                    <td className="p-2 whitespace-nowrap font-mono font-medium">
                      {item.invoiceNo}
                    </td>
                    <td className="p-2 max-w-[200px] truncate" title={item.item}>
                      {item.item}
                    </td>
                    <td className="p-2 whitespace-nowrap text-gray-600">
                      {item.rep}
                    </td>
                    <td className="p-2 whitespace-nowrap text-center font-semibold">
                      {item.amount > 0 ? `${formatNumber(item.amount)} ج` : '-'}
                    </td>
                    <td className="p-2 whitespace-nowrap text-center text-emerald-700 font-semibold">
                      {item.paid > 0 ? `${formatNumber(item.paid)} ج` : '-'}
                    </td>
                    <td className="p-2 whitespace-nowrap text-center font-bold">
                      {item.type === 'credit' ? (
                        <span
                          className={
                            item.remaining > 0 ? 'text-rose-600' : 'text-green-600'
                          }
                        >
                          {formatNumber(item.remaining)} ج
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-2 whitespace-nowrap text-center text-gray-500" dir="ltr">
                      {item.dueDate
                        ? new Date(item.dueDate).toLocaleDateString('ar-EG')
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  )
}
