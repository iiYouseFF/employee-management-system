import { useState, useMemo } from 'react'
import { useAuditLogs } from '@/features/audit/useAuditLogs'
import type { AuditLogEntry } from '@/features/audit/auditLogs.types'
import Modal from '@/shared/ui/Modal'
import Pagination from '@/shared/ui/Pagination'
import PageHeader from '@/shared/ui/PageHeader'
import FilterToolbar from '@/shared/ui/FilterToolbar'
import ResponsiveDataView from '@/shared/ui/ResponsiveDataView'
import { MobileCard, MobileCardRow } from '@/shared/ui/MobileCards'
import { useDatePreset } from '@/shared/hooks/useDatePreset'

// Table display translation dictionary
const TABLE_LABELS: Record<string, string> = {
  customers: 'العملاء',
  reps: 'المناديب',
  cash_invoices: 'فواتير البيع النقدي',
  credit_invoices: 'فواتير البيع الآجل',
  payments: 'سندات القبض والدفعات',
  suppliers: 'الموردين',
  supplier_purchases: 'مشتريات الموردين',
  supplier_payments: 'دفعات الموردين',
  products: 'قائمة الأصناف والأسعار',
  product_categories: 'تصنيفات الأصناف',
  expenses: 'المصاريف التشغيلية',
  stock_movements: 'حركات المخزون',
  invoice_lines: 'بنود الفواتير التفصيلية',
}

// Action badge configuration
function ActionBadge({ action }: { action: 'INSERT' | 'UPDATE' | 'DELETE' }) {
  if (action === 'INSERT') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
        إضافة (جديد)
      </span>
    )
  }
  if (action === 'UPDATE') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
        تعديل
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
      <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
      حذف
    </span>
  )
}

// Role badge
function RoleBadge({ role }: { role: string | null }) {
  if (role === 'manager') {
    return (
      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
        مدير
      </span>
    )
  }
  if (role === 'sales_rep') {
    return (
      <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[11px] font-medium text-purple-700">
        مندوب
      </span>
    )
  }
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
      نظام
    </span>
  )
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function AuditLogsTab() {
  const [selectedTable, setSelectedTable] = useState<string>('all')
  const [selectedAction, setSelectedAction] = useState<string>('all')
  const [search, setSearch] = useState<string>('')
  const { preset, from, to, setPreset, setFrom, setTo, reset } = useDatePreset('all')

  // Detail Modal
  const [activeLog, setActiveLog] = useState<AuditLogEntry | null>(null)

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(20)

  const { data: logs = [], isLoading, error, refetch, isFetching } = useAuditLogs({
    table_name: selectedTable === 'all' ? undefined : selectedTable,
    action: selectedAction === 'all' ? undefined : (selectedAction as any),
    startDate: from || undefined,
    endDate: to || undefined,
    search: search || undefined,
  })

  const resetPage = () => setCurrentPage(1)

  // Total pages
  const totalPages = Math.ceil(logs.length / pageSize) || 1
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return logs.slice(start, start + pageSize)
  }, [logs, currentPage, pageSize])

  // Summary counts
  const stats = useMemo(() => {
    let ins = 0
    let upd = 0
    let del = 0
    for (const l of logs) {
      if (l.action === 'INSERT') ins++
      else if (l.action === 'UPDATE') upd++
      else if (l.action === 'DELETE') del++
    }
    return { ins, upd, del, total: logs.length }
  }, [logs])

  const hasActiveFilters = selectedTable !== 'all' || selectedAction !== 'all' || !!search || !!from || !!to
  const resetFilters = () => {
    setSelectedTable('all')
    setSelectedAction('all')
    setSearch('')
    reset()
    setCurrentPage(1)
  }

  return (
    <div className="app-page space-y-4" dir="rtl">
      <PageHeader
        title="سجل العمليات والنظام"
        count={stats.total}
      />

      {/* ── Summary KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs font-semibold text-slate-500">إجمالي العمليات</div>
          <div className="mt-1 text-2xl font-black text-slate-800">{stats.total}</div>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3.5 shadow-sm">
          <div className="text-xs font-semibold text-emerald-700">عمليات الإضافة</div>
          <div className="mt-1 text-2xl font-black text-emerald-700">{stats.ins}</div>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3.5 shadow-sm">
          <div className="text-xs font-semibold text-amber-700">عمليات التعديل</div>
          <div className="mt-1 text-2xl font-black text-amber-700">{stats.upd}</div>
        </div>
        <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3.5 shadow-sm">
          <div className="text-xs font-semibold text-rose-700">عمليات الحذف</div>
          <div className="mt-1 text-2xl font-black text-rose-700">{stats.del}</div>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <FilterToolbar
        search={search}
        onSearchChange={(v) => { setSearch(v); resetPage() }}
        searchPlaceholder="ابحث باسم المندوب، الوصف، البريد أو رقم السجل..."
        preset={preset}
        onPresetChange={(p) => { setPreset(p); resetPage() }}
        from={from}
        to={to}
        onFromChange={(v) => { setFrom(v); resetPage() }}
        onToChange={(v) => { setTo(v); resetPage() }}
        onReset={resetFilters}
        hasActiveFilters={hasActiveFilters}
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            القسم / الجدول
          </label>
          <select
            value={selectedTable}
            onChange={(e) => { setSelectedTable(e.target.value); resetPage() }}
            className="app-input w-full sm:w-40"
          >
            <option value="all">كل الأقسام والجداول</option>
            {Object.entries(TABLE_LABELS).map(([tbl, label]) => (
              <option key={tbl} value={tbl}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            نوع العملية
          </label>
          <select
            value={selectedAction}
            onChange={(e) => { setSelectedAction(e.target.value); resetPage() }}
            className="app-input w-full sm:w-40"
          >
            <option value="all">جميع العمليات</option>
            <option value="INSERT">إضافة (INSERT)</option>
            <option value="UPDATE">تعديل (UPDATE)</option>
            <option value="DELETE">حذف (DELETE)</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="app-btn app-btn-ghost app-btn-sm self-end"
        >
          <span className={`inline-block ${isFetching ? 'animate-spin' : ''}`}>🔄</span>
          تحديث السجلات
        </button>
      </FilterToolbar>

      {/* ── Main Logs View ── */}
      <ResponsiveDataView
        loading={isLoading}
        error={error ? 'تعذّر تحميل سجل العمليات والأمان. أعد المحاولة لاحقاً.' : undefined}
        hasData={logs.length > 0}
        empty="لا توجد سجلات مطابقة للبحث أو الفلاتر المحددة."
        cards={paginatedLogs.map((log) => {
          const tableLabel = TABLE_LABELS[log.table_name] || log.table_name
          return (
            <MobileCard key={log.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-slate-800">{log.actor_name || 'غير معروف'}</span>
                    <RoleBadge role={log.actor_role} />
                  </div>
                  {log.actor_email && (
                    <div className="text-[10px] text-slate-400 font-mono" dir="ltr">
                      {log.actor_email}
                    </div>
                  )}
                </div>
                <ActionBadge action={log.action} />
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                {formatDate(log.created_at)}
              </div>
              <MobileCardRow
                label="القسم / الجدول"
                value={
                  <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                    {tableLabel}
                  </span>
                }
              />
              <MobileCardRow
                label="تفاصيل العملية"
                value={<span className="text-start">{log.description || '-'}</span>}
              />
              {log.changed_fields && log.changed_fields.length > 0 && (
                <div className="text-[11px] text-slate-400">
                  الحقول المعدلة: {log.changed_fields.join(', ')}
                </div>
              )}
              <button
                type="button"
                onClick={() => setActiveLog(log)}
                className="rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1a4971] px-2.5 py-1 font-bold text-[11px] transition"
              >
                عرض الفروقات 🔍
              </button>
            </MobileCard>
          )
        })}
        table={(
          <>
            <div className="hidden md:block rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="px-4 py-3 text-start whitespace-nowrap">الوقت والتاريخ</th>
                      <th className="px-4 py-3 text-start whitespace-nowrap">المستخدم (المنفذ)</th>
                      <th className="px-4 py-3 text-start whitespace-nowrap">النوع</th>
                      <th className="px-4 py-3 text-start whitespace-nowrap">القسم / الجدول</th>
                      <th className="px-4 py-3 text-start min-w-[280px]">تفاصيل العملية</th>
                      <th className="px-4 py-3 text-center whitespace-nowrap">التغييرات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedLogs.map((log) => {
                      const tableLabel = TABLE_LABELS[log.table_name] || log.table_name

                      return (
                        <tr
                          key={log.id}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                          onClick={() => setActiveLog(log)}
                        >
                          {/* Timestamp */}
                          <td className="px-4 py-3 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                            {formatDate(log.created_at)}
                          </td>

                          {/* Actor */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-800">
                                {log.actor_name || 'غير معروف'}
                              </span>
                              <RoleBadge role={log.actor_role} />
                            </div>
                            {log.actor_email && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                {log.actor_email}
                              </div>
                            )}
                          </td>

                          {/* Action */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <ActionBadge action={log.action} />
                          </td>

                          {/* Table / Section */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                              {tableLabel}
                            </span>
                          </td>

                          {/* Description */}
                          <td className="px-4 py-3 text-slate-700 font-medium">
                            {log.description || '-'}
                            {log.changed_fields && log.changed_fields.length > 0 && (
                              <div className="mt-0.5 text-[11px] text-slate-400">
                                الحقول المعدلة: {log.changed_fields.join(', ')}
                              </div>
                            )}
                          </td>

                          {/* Action View Button */}
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveLog(log)
                              }}
                              className="rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1a4971] px-2.5 py-1 font-bold text-[11px] transition"
                            >
                              عرض الفروقات 🔍
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        footer={logs.length > 0 && (
          <div className="p-3 border-t border-slate-100">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={logs.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize)
                setCurrentPage(1)
              }}
              pageSizeOptions={[15, 20, 50, 100]}
            />
          </div>
        )}
      />

      {/* ── Log Detail Modal (Inspect JSON Diffs) ── */}
      {activeLog && (
        <Modal
          onClose={() => setActiveLog(null)}
          title={`تفاصيل العملية: ${activeLog.description || activeLog.table_name}`}
        >
          <div className="space-y-4 max-h-[75vh] overflow-y-auto p-1" dir="rtl">
            {/* Metadata summary */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500">الوقت:</span>{' '}
                <span className="font-semibold text-slate-800">{formatDate(activeLog.created_at)}</span>
              </div>
              <div>
                <span className="text-slate-500">نوع العملية:</span>{' '}
                <ActionBadge action={activeLog.action} />
              </div>
              <div>
                <span className="text-slate-500">المنفذ:</span>{' '}
                <span className="font-semibold text-slate-800">{activeLog.actor_name}</span>{' '}
                <RoleBadge role={activeLog.actor_role} />
              </div>
              <div>
                <span className="text-slate-500">الجدول:</span>{' '}
                <span className="font-semibold text-slate-800">
                  {TABLE_LABELS[activeLog.table_name] || activeLog.table_name}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500">معرف السجل (Record ID):</span>{' '}
                <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">
                  {activeLog.record_id}
                </code>
              </div>
            </div>

            {/* If UPDATE: Diff comparison */}
            {activeLog.action === 'UPDATE' && activeLog.changed_fields && (
              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2">
                  الحقول المعدلة والقيم (قبل / بعد):
                </h4>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden text-xs">
                  {activeLog.changed_fields.map((field) => {
                    const oldVal = activeLog.old_data?.[field]
                    const newVal = activeLog.new_data?.[field]

                    return (
                      <div key={field} className="p-2.5 bg-white">
                        <div className="font-bold text-slate-800 mb-1">{field}</div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                          <div className="bg-rose-50 text-rose-800 p-2 rounded border border-rose-100">
                            <span className="font-sans font-semibold block text-[10px] text-rose-600 mb-0.5">
                              القيمة السابقة:
                            </span>
                            {JSON.stringify(oldVal, null, 2) ?? 'null'}
                          </div>
                          <div className="bg-emerald-50 text-emerald-800 p-2 rounded border border-emerald-100">
                            <span className="font-sans font-semibold block text-[10px] text-emerald-600 mb-0.5">
                              القيمة الجديدة:
                            </span>
                            {JSON.stringify(newVal, null, 2) ?? 'null'}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Full Record JSON View */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 mb-1">البيانات الكاملة (JSON):</h4>
              <div className="space-y-2">
                {activeLog.new_data && (
                  <div>
                    <span className="text-[11px] text-slate-500 font-semibold">
                      البيانات الجديدة (New Payload):
                    </span>
                    <pre className="mt-1 max-h-48 overflow-y-auto rounded-xl bg-slate-900 p-3 text-[11px] text-emerald-400 font-mono text-start scrollbar-thin">
                      {JSON.stringify(activeLog.new_data, null, 2)}
                    </pre>
                  </div>
                )}
                {activeLog.old_data && (
                  <div>
                    <span className="text-[11px] text-slate-500 font-semibold">
                      البيانات السابقة (Old Payload):
                    </span>
                    <pre className="mt-1 max-h-48 overflow-y-auto rounded-xl bg-slate-900 p-3 text-[11px] text-rose-400 font-mono text-start scrollbar-thin">
                      {JSON.stringify(activeLog.old_data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveLog(null)}
                className="rounded-xl bg-slate-100 hover:bg-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
