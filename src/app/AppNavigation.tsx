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
    <div className="mt-2.5 border-t border-white/10 pt-2">
      <div className="flex items-center gap-1 overflow-x-auto pb-1.5 scrollbar-none">
        {groups.map((group) => {
          const isGroupActive = group.id === activeGroupId
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => { if (!isGroupActive && group.tabs[0]) onSelectTab(group.tabs[0].id) }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all duration-150 whitespace-nowrap shrink-0 ${
                isGroupActive
                  ? 'bg-white text-[#1a4971] shadow-sm font-extrabold'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              {group.icon}
              <span>{group.label}</span>
            </button>
          )
        })}
      </div>

      {activeGroup && activeGroup.tabs.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1.5 pb-0.5 scrollbar-none border-t border-white/10 mt-1">
          {activeGroup.tabs.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onSelectTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white/20 text-white ring-1 ring-white/30 font-extrabold'
                    : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`}
              >
                {tab.label}
                {tab.badge !== undefined && tab.badge !== null && (
                  <span className="ms-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-num font-extrabold tabular-nums text-white">
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
