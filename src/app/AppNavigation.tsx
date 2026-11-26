import React from 'react'

export interface NavGroup {
  id: string
  label: string
  icon?: React.ReactNode
  tabs: { id: string; label: string; badge?: React.ReactNode }[]
}

interface AppNavigationProps {
  groups: NavGroup[]
  activeTab: string
  onSelectTab: (tabId: string) => void
}

export default function AppNavigation({ groups, activeTab, onSelectTab }: AppNavigationProps) {
  const activeGroupId = groups.find((g) => g.tabs.some((t) => t.id === activeTab))?.id || groups[0]?.id
  const activeGroup = groups.find((g) => g.id === activeGroupId) || groups[0]

  return (
    <div className="mt-3">
      <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
        {groups.map((group) => {
          const isGroupActive = group.id === activeGroupId
          return (
            <React.Fragment key={group.id}>
              <button
                type="button"
                onClick={() => { if (!isGroupActive && group.tabs[0]) onSelectTab(group.tabs[0].id) }}
                className={`flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold transition-all duration-150 whitespace-nowrap shrink-0 ${
                  isGroupActive
                    ? 'bg-white text-[#1a4971] shadow-float font-extrabold'
                    : 'bg-white/10 text-white/90 hover:bg-white/20 hover:text-white'
                }`}
              >
                {group.icon}
                <span>{group.label}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-num font-extrabold tabular-nums ${isGroupActive ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'bg-white/20 text-white'}`}>
                  {group.tabs.length}
                </span>
              </button>
            </React.Fragment>
          )
        })}
      </div>

      {activeGroup && activeGroup.tabs.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 pb-1 scrollbar-none border-t border-white/15 mt-1.5">
          <span className="text-[11px] font-bold text-white/70 whitespace-nowrap shrink-0 me-1">{activeGroup.label}:</span>
          {activeGroup.tabs.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onSelectTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 min-h-[44px] md:min-h-[36px] rounded-xl text-xs font-bold transition-all duration-150 whitespace-nowrap shrink-0 ${
                  active ? 'bg-white text-[#1a4971] shadow-sm font-extrabold' : 'bg-white/15 text-white hover:bg-white/25'
                }`}
              >
                {tab.label}
              {tab.badge !== undefined && tab.badge !== null && (
                <span className="ms-1 inline-flex min-w-[20px] items-center justify-center rounded-full border border-rose-300 bg-rose-600 px-1.5 py-0.5 text-[10px] font-num font-extrabold tabular-nums text-white shadow-sm">
                  {tab.badge}
                </span>
              )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
