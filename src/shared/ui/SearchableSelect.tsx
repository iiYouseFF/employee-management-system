import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  MAX_RESULTS,
  normalizeSearchText,
  scoreOption,
  type SearchableOption,
} from '@/shared/ui/searchableSelectUtils'

interface SearchableSelectProps {
  options: SearchableOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  clearable?: boolean
  className?: string
  ariaLabel?: string
  renderOption?: (option: SearchableOption, isSelected: boolean) => ReactNode
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'اختر من القائمة',
  searchPlaceholder = 'ابحث...',
  emptyText = 'لا توجد نتائج مطابقة',
  disabled = false,
  clearable = true,
  className = '',
  ariaLabel,
  renderOption,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null)
  const listId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  const selected = useMemo(() => options.find((option) => option.value === value), [options, value])

  const filtered = useMemo(() => {
    const tokens = normalizeSearchText(search).split(/\s+/).filter(Boolean)
    const whole = normalizeSearchText(search)
    return options
      .map((option, index) => ({ option, index, rank: scoreOption(option, tokens, whole) }))
      .filter((entry): entry is { option: SearchableOption; index: number; rank: number } =>
        entry.rank !== null
      )
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .slice(0, MAX_RESULTS)
      .map((entry) => entry.option)
  }, [options, search])

  // Derive the clamped index during render rather than syncing it in an effect.
  const selectedIndex = Math.min(activeIndex, Math.max(filtered.length - 1, 0))

  const close = () => {
    setOpen(false)
    setSearch('')
    setMenuStyle(null)
  }

  const choose = (option: SearchableOption) => {
    onChange(option.value)
    close()
    triggerRef.current?.focus()
  }

  const openMenu = () => {
    if (disabled) return
    setSearch('')
    setActiveIndex(0)
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(Math.max(rect.width, 280), 440)
      const padding = 12
      const left = Math.max(padding, Math.min(rect.left, window.innerWidth - width - padding))
      const top = Math.max(padding, Math.min(rect.bottom + 6, window.innerHeight - 300))
      setMenuStyle({ top, left, width })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  // The portal mounts only after `menuStyle` is measured, so focus must wait
  // for that second commit — otherwise the input ref is still null.
  useEffect(() => {
    if (open && menuStyle) inputRef.current?.focus()
  }, [open, menuStyle])

  useEffect(() => {
    if (!open) return
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) return
      close()
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  useEffect(() => {
    if (!open) return
    optionRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, open])

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (filtered.length ? (current + 1) % filtered.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) =>
        filtered.length ? (current - 1 + filtered.length) % filtered.length : 0
      )
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = filtered[selectedIndex]
      if (option) choose(option)
    } else if (event.key === 'Escape') {
      // Keep Escape local so a parent Modal doesn't close with the popover.
      event.preventDefault()
      event.stopPropagation()
      close()
      triggerRef.current?.focus()
    } else if (event.key === 'Tab') {
      close()
      triggerRef.current?.focus()
    }
  }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!open) openMenu()
    } else if (event.key === 'Escape' && open) {
      // Don't let a parent Modal close together with the popover.
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }

  return (
    <div className="relative w-full" dir="rtl">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        className={`app-select flex items-center justify-between gap-2 text-start ${className}`}
      >
        <span className={`truncate ${selected ? 'text-slate-800 font-semibold' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className="w-3.5 h-3.5 text-slate-400 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {clearable && !disabled && value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute end-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-600 text-xs h-5 w-5 rounded-full flex items-center justify-center transition-colors"
          aria-label="مسح الاختيار"
          title="مسح الاختيار"
        >
          ✕
        </button>
      )}

      {open && menuStyle && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: menuStyle.top, left: menuStyle.left, width: menuStyle.width, zIndex: 1200 }}
            className="bg-white rounded-2xl shadow-modal border border-slate-200 py-2 animate-scale-in"
            dir="rtl"
          >
            <div className="px-2.5 pb-2 border-b border-slate-100">
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={filtered.length ? `${listId}-${selectedIndex}` : undefined}
                autoFocus
                value={search}
                onChange={(event) => { setSearch(event.target.value); setActiveIndex(0) }}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                className="app-input py-1.5 px-3 text-xs w-full"
              />
            </div>
            <div id={listId} className="max-h-64 overflow-y-auto py-1" role="listbox">
              {filtered.length === 0 ? (
                <div className="py-4 text-center text-slate-400 text-xs">{emptyText}</div>
              ) : (
                filtered.map((option, index) => {
                  const isSelected = option.value === value
                  return (
                    <button
                      key={option.value}
                      id={`${listId}-${index}`}
                      ref={(element) => { optionRefs.current[index] = element }}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => choose(option)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-start transition-colors ${
                        index === selectedIndex ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        {renderOption ? renderOption(option, isSelected) : (
                          <>
                            <span className={`block truncate text-xs ${isSelected ? 'font-bold' : 'font-medium'}`}>
                              {option.label}
                            </span>
                            {option.meta && <span className="block text-[10px] text-slate-400 mt-0.5">{option.meta}</span>}
                          </>
                        )}
                      </span>
                      {isSelected && (
                        <svg className="w-3.5 h-3.5 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  )
                })
              )}
              {options.length > MAX_RESULTS && (
                <div className="px-3 pt-1 text-center text-[10px] text-slate-400">
                  نتائج كثيرة — أكمل الكتابة لتضييق البحث
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
