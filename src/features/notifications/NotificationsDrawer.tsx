import { useState } from 'react'
import { useNotifications, type OperationalAlert } from '@/hooks/useNotifications'
import { fetchLowStockRows } from '@/features/reporting/lowStock'
import { printLowStockReport } from '@/features/reporting/pdfGenerators'
import { formatNumber } from '@/shared/lib/format'
import { LOW_STOCK_THRESHOLD } from '@/shared/lib/stockThresholds'

export type NotificationTargetFilter = 'low_stock' | 'out_of_stock' | 'alerts' | 'all'

interface NotificationsDrawerProps {
  open: boolean
  onClose: () => void
  onNavigate: (tab: string, filter?: NotificationTargetFilter) => void
  companyName?: string
  canExportPrint?: boolean
}

const SEVERITY_GROUPS = [
  { key: 'critical', label: 'تنبيهات حرجة', dot: 'bg-rose-600', chip: 'bg-rose-50 text-rose-800 border-rose-200' },
  { key: 'warning', label: 'تحذيرات', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  { key: 'info', label: 'معلومات', dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-800 border-sky-200' },
]

function filterForAlert(alert: OperationalAlert): NotificationTargetFilter | undefined {
  if (alert.alert_key === 'low_stock') return 'low_stock'
  if (alert.alert_key === 'out_of_stock') return 'out_of_stock'
  if (alert.category === 'stock' || alert.category === 'expiry') return 'alerts'
  return undefined
}

function BellIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export default function NotificationsDrawer({
  open,
  onClose,
  onNavigate,
  companyName,
  canExportPrint = true,
}: NotificationsDrawerProps) {
  const {
    alerts,
    notifications,
    isLoading,
    alertsError,
    notificationsError,
    markRead,
    markAllRead,
    isMarkingRead,
    refetch,
  } = useNotifications()
  const [printing, setPrinting] = useState(false)
  const [actionError, setActionError] = useState('')

  if (!open) return null

  const handlePrintLowStock = async () => {
    setPrinting(true)
    setActionError('')
    try {
      const rows = await fetchLowStockRows()
      const printed = await printLowStockReport({ rows, companyName })
      if (!printed) setActionError('يرجى السماح بالنوافذ المنبثقة للطباعة')
    } catch {
      setActionError('تعذر تجهيز قائمة النواقص. حاول مرة أخرى.')
    } finally {
      setPrinting(false)
    }
  }

  const handleMarkAllRead = async () => {
    setActionError('')
    try {
      await markAllRead()
    } catch {
      setActionError('تعذر تحديث حالة الإشعارات. حاول مرة أخرى.')
    }
  }

  return (
    <div className="fixed inset-0 z-50" dir={document.documentElement.dir || 'rtl'}>
      <button
        type="button"
        aria-label="إغلاق التنبيهات"
        onClick={onClose}
        className="absolute inset-0 w-full h-full bg-slate-900/50 backdrop-blur-[2px]"
      />

      <aside
        role="dialog"
        aria-label="تنبيهات النظام"
        className="absolute top-0 end-0 h-dvh w-screen sm:w-[440px] bg-white shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border bg-gradient-to-r from-[#102a43] to-[#1a4971] text-white">
          <div className="flex items-center gap-2 min-w-0">
            <span className="grid place-items-center h-9 w-9 rounded-xl bg-white/15 border border-white/25">
              <BellIcon />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold truncate">تنبيهات النظام</h2>
              <p className="text-[11px] text-white/75">متابعة حية للمخزون والفواتير ونشاط المناديب</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="grid place-items-center h-9 w-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 transition"
          >
            <CloseIcon />
          </button>
        </div>

        {actionError && (
          <div className="mx-4 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-800">
            {actionError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* ── Live alerts ── */}
          <section>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <h3 className="text-xs font-extrabold text-slate-800">تنبيهات النظام الحية</h3>
              <button
                type="button"
                onClick={refetch}
                className="text-[11px] font-bold text-primary-700 hover:text-primary-900"
              >
                تحديث
              </button>
            </div>

            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500">
                <span className="h-5 w-5 border-2 border-slate-200 border-t-primary-700 rounded-full animate-spin" />
                جاري تحميل التنبيهات...
              </div>
            )}

            {!isLoading && alertsError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-800">
                تعذر تحميل التنبيهات الحية.
                <button type="button" onClick={refetch} className="ms-1 underline font-bold">إعادة المحاولة</button>
              </div>
            )}

            {!isLoading && !alertsError && alerts.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[11px] text-slate-500">
                لا توجد تنبيهات حية حالياً.
              </div>
            )}

            <div className="space-y-3">
              {SEVERITY_GROUPS.map((group) => {
                const groupAlerts = alerts.filter((alert) => alert.severity === group.key)
                if (!groupAlerts.length) return null
                return (
                  <div key={group.key} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${group.dot}`} />
                      <p className="text-[11px] font-extrabold text-slate-600">{group.label}</p>
                      <span className="text-[10px] text-slate-400 tabular-nums">({groupAlerts.length})</span>
                    </div>

                    {groupAlerts.map((alert) => (
                      <div key={alert.alert_key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="text-xs font-extrabold text-slate-800">{alert.title}</p>
                              <span className={`badge text-[9px] ${group.chip}`}>{group.label}</span>
                            </div>
                            <p className="mt-1 text-[11px] leading-5 text-slate-600">{alert.message}</p>
                          </div>
                          <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-extrabold text-slate-700 tabular-nums">
                            {formatNumber(alert.count)}
                          </span>
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onNavigate(alert.target_tab, filterForAlert(alert))}
                            className="app-btn app-btn-sm app-btn-ghost text-[10px] text-primary-700 hover:border-primary-400"
                          >
                            فتح القسم
                          </button>
                          {canExportPrint && alert.alert_key === 'low_stock' && (
                            <button
                              type="button"
                              disabled={printing}
                              onClick={() => void handlePrintLowStock()}
                              className="app-btn app-btn-sm bg-orange-50 border border-orange-200 text-orange-800 hover:bg-orange-100 text-[10px] disabled:opacity-60"
                            >
                              {printing ? 'جاري التجهيز...' : 'طباعة النواقص'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </section>

          {/* ── Notification log ── */}
          <section className="border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-extrabold text-slate-800">سجل الإشعارات</h3>
                {notifications.some((row) => !row.is_read) && (
                  <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-extrabold text-white tabular-nums">
                    {formatNumber(notifications.filter((row) => !row.is_read).length)} غير مقروء
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={!notifications.some((row) => !row.is_read) || isMarkingRead}
                onClick={() => void handleMarkAllRead()}
                className="text-[11px] font-bold text-primary-700 hover:text-primary-900 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                تحديد الكل كمقروء
              </button>
            </div>

            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-6 text-[11px] text-slate-500">
                <span className="h-4 w-4 border-2 border-slate-200 border-t-primary-700 rounded-full animate-spin" />
                جاري تحميل السجل...
              </div>
            )}

            {!isLoading && notificationsError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-800">
                تعذر تحميل سجل الإشعارات.
              </div>
            )}

            {!isLoading && !notificationsError && notifications.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[11px] text-slate-500">
                لا توجد إشعارات مسجلة بعد.
              </div>
            )}

            <div className="space-y-2">
              {notifications.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    if (!row.is_read) void markRead([row.id]).catch(() => undefined)
                    if (row.target_tab) onNavigate(row.target_tab)
                  }}
                  className={`w-full text-start rounded-xl border p-3 transition-colors ${
                    row.is_read
                      ? 'border-slate-200 bg-white hover:bg-slate-50'
                      : 'border-sky-200 bg-sky-50/60 hover:bg-sky-50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${row.is_read ? 'bg-slate-300' : 'bg-rose-600'}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-extrabold text-slate-800 truncate">{row.title}</p>
                        <span className="shrink-0 text-[9px] text-slate-400 tabular-nums">
                          {new Date(row.created_at).toLocaleString('ar-EG')}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-5 text-slate-600">{row.message}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <p className="text-center text-[10px] text-slate-400">
            حد النواقص المعتمد: {formatNumber(LOW_STOCK_THRESHOLD)} وحدة أو أقل
          </p>
        </div>
      </aside>
    </div>
  )
}
