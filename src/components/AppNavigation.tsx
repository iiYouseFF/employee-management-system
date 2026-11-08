import React from 'react'

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
  const activeGroupId =
    groups.find((g) => g.tabs.some((t) => t.id === activeTab))?.id || groups[0]?.id

  const activeGroup = groups.find((g) => g.id === activeGroupId) || groups[0]

  return (
    <div className="mt-3" dir="rtl">
      {/* ── Category Tabs (Level 1) ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
        {groups.map((group) => {
          const isGroupActive = group.id === activeGroupId

          return (
            <button
              key={group.id}
              type="button"
              onClick={() => {
                // If switching group, select its first tab immediately
                if (!isGroupActive && group.tabs[0]) {
                  onSelectTab(group.tabs[0].id)
                }
              }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-150 whitespace-nowrap shrink-0 ${
                isGroupActive
                  ? 'bg-white text-[#1a4971] shadow-float font-extrabold'
                  : 'bg-white/10 text-white/90 hover:bg-white/20 hover:text-white'
              }`}
            >
              {group.icon}
              <span>{group.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isGroupActive ? 'bg-primary-100 text-primary-800' : 'bg-white/20 text-white'
                }`}
              >
                {group.tabs.length}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Direct Subtabs Ribbon (Level 2) ── Always fully visible without dropdowns or scrolling */}
      {activeGroup && activeGroup.tabs.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 pb-1 scrollbar-none border-t border-white/15 mt-1.5">
          <span className="text-[11px] font-bold text-white/70 whitespace-nowrap shrink-0 me-1">
            {activeGroup.label}:
          </span>
          {activeGroup.tabs.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-[#1a4971] shadow-sm font-bold scale-[1.02]'
                    : 'bg-white/15 text-white hover:bg-white/25'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
