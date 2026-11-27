import React, { useEffect } from 'react'
import type { NavGroup } from './AppNavigation'

interface MobileNavDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  roleBadge: React.ReactNode
  groups: NavGroup[]
  activeTab: string
  onSelectTab: (tabId: string) => void
  isManager: boolean
  repFilter: string
  onRepFilterChange: (value: string) => void
  reps: { id: string; name: string }[]
  canExportPrint: boolean
  onDailyReport?: () => void
  onPrint: () => void
  onExportCsv: () => void
  onChangePassword: () => void
  onSignOut: () => void
}

export default function MobileNavDrawer({
  open,
  onClose,
  title,
  roleBadge,
  groups,
  activeTab,
  onSelectTab,
  isManager,
  repFilter,
  onRepFilterChange,
  reps,
  canExportPrint,
  onDailyReport,
  onPrint,
  onExportCsv,
  onChangePassword,
  onSignOut,
}: MobileNavDrawerProps) {
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  return (
    <div
      className={`fixed inset-0 z-50 lg:hidden transition-opacity duration-300 ${
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      aria-label="قائمة التنقل"
    >
      <div
        className={`fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 start-0 z-10 flex w-[85vw] max-w-[320px] flex-col bg-white text-slate-900 shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div
          className="flex items-center justify-between gap-3 px-4 py-3.5 text-white"
          style={{
            backgroundColor: '#1a4971',
            backgroundImage: 'linear-gradient(135deg, #102a43 0%, #1a4971 60%, #245e8e 100%)',
          }}
        >
          <div className="min-w-0">
            <div className="mb-1">{roleBadge}</div>
            <p className="truncate text-sm font-extrabold text-white">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق القائمة"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 text-white hover:bg-white/25"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {isManager && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label htmlFor="mobile-rep-filter" className="mb-1.5 block text-xs font-bold text-slate-600">
                عرض البيانات حسب المندوب
              </label>
              <select
                id="mobile-rep-filter"
                value={repFilter}
                onChange={(e) => onRepFilterChange(e.target.value)}
                className="app-select w-full py-2 text-xs bg-white text-slate-800"
              >
                <option value="all">كل المناديب</option>
                {reps.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <nav className="space-y-3" aria-label="الأقسام">
            {groups.map((group) => (
              <div key={group.id} className="space-y-1">
                <div className="flex items-center gap-2 px-2 py-1 text-xs font-extrabold text-slate-500">
                  {group.icon}
                  <span>{group.label}</span>
                </div>
                <div className="space-y-1">
                  {group.tabs.map((tab) => {
                    const active = activeTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        aria-current={active ? 'page' : undefined}
                        onClick={() => {
                          onSelectTab(tab.id)
                          onClose()
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-start text-sm font-bold transition-colors ${
                          active
                            ? 'bg-[#1a4971] text-white shadow-sm'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="truncate">{tab.label}</span>
                        {tab.badge !== undefined && tab.badge !== null && (
                          <span className="ms-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-num font-extrabold tabular-nums text-white">
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 p-3 space-y-2">
          {isManager && onDailyReport && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onDailyReport()
              }}
              className="app-btn app-btn-sm w-full justify-center border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100"
            >
              التقرير اليومي
            </button>
          )}
          {canExportPrint && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onPrint()
                }}
                className="app-btn app-btn-sm justify-center border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              >
                طباعة
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onExportCsv()
                }}
                className="app-btn app-btn-sm justify-center border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              >
                تصدير CSV
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onClose()
                onChangePassword()
              }}
              className="app-btn app-btn-sm justify-center border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
            >
              كلمة المرور
            </button>
            <button
              type="button"
              onClick={() => {
                onClose()
                onSignOut()
              }}
              className="app-btn app-btn-sm justify-center border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}
