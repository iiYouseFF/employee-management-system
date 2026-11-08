import React, { useState, useRef, useEffect } from 'react'

export interface NavGroup {
  id: string
  label: string
  icon?: React.ReactNode
  tabs: {
    id: string
    label: string
    badge?: string | number
  }[]
}

interface AppNavigationProps {
  groups: NavGroup[]
  activeTab: string
  onSelectTab: (tabId: string) => void
}

export default function AppNavigation({
  groups,
  activeTab,
  onSelectTab,
}: AppNavigationProps) {
  // Find which group currently owns the activeTab
  const activeGroupId = groups.find((g) => g.tabs.some((t) => t.id === activeTab))?.id || groups[0]?.id

  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const navRef = useRef<HTMLDivElement>(null)

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={navRef} className="mt-3.5" dir="rtl">
      {/* ── Top Level Category Buttons ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
        {groups.map((group) => {
          const isGroupActive = group.id === activeGroupId
          const isOpen = openDropdown === group.id
          const activeSubTab = group.tabs.find((t) => t.id === activeTab)

          // If a group has only 1 tab, render it as a direct button
          if (group.tabs.length === 1) {
            const singleTab = group.tabs[0]
            const active = activeTab === singleTab.id
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  setOpenDropdown(null)
                  onSelectTab(singleTab.id)
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-150 whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-[#1a4971] shadow-float font-bold'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {group.icon}
                <span>{singleTab.label}</span>
              </button>
            )
          }

          return (
            <div key={group.id} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setOpenDropdown(isOpen ? null : group.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-150 whitespace-nowrap ${
                  isGroupActive
                    ? 'bg-white text-[#1a4971] shadow-float font-bold'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {group.icon}
                <span>{group.label}</span>
                {isGroupActive && activeSubTab && (
                  <span className="hidden md:inline-block text-[11px] font-normal opacity-75 ms-1">
                    ({activeSubTab.label})
                  </span>
                )}
                <svg
                  className={`w-3.5 h-3.5 transition-transform duration-150 ms-0.5 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {isOpen && (
                <div
                  className="absolute top-full start-0 mt-2 min-w-[200px] bg-white rounded-2xl shadow-modal border border-slate-200 py-1.5 z-50 animate-scale-in text-slate-800"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    {group.label}
                  </div>
                  <div className="py-1">
                    {group.tabs.map((tab) => {
                      const active = activeTab === tab.id
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            onSelectTab(tab.id)
                            setOpenDropdown(null)
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold transition-colors text-start ${
                            active
                              ? 'bg-primary-50 text-primary-800 font-bold'
                              : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          <span>{tab.label}</span>
                          {active && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary-600 shrink-0" />
                          )}
                          {tab.badge !== undefined && (
                            <span className="badge badge-neutral text-[10px]">{tab.badge}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Active Group Subtabs Ribbon (Horizontal Pills for the Current Section) ── */}
      {(() => {
        const currentGroup = groups.find((g) => g.id === activeGroupId)
        if (!currentGroup || currentGroup.tabs.length <= 1) return null
        return (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-2 pb-1 scrollbar-none border-t border-white/10 mt-2">
            <span className="text-[11px] font-bold text-white/70 whitespace-nowrap shrink-0 me-1">
              {currentGroup.label}:
            </span>
            {currentGroup.tabs.map((tab) => {
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white/90 text-primary-950 font-bold shadow-sm'
                      : 'bg-white/15 text-white/90 hover:bg-white/25'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}
