import type { ReactNode } from 'react'

export interface SearchableOption {
  value: string
  label: string
  /** Extra text to search against (SKU, phone, category, code…). */
  searchText?: string
  /** Secondary line shown under the label. */
  meta?: ReactNode
}

export const MAX_RESULTS = 100

type OptionSource = {
  id: string
  name?: string | null
  name_ar?: string | null
  name_en?: string | null
  phone?: string | null
  sku?: string | null
  category?: string | null
}

/** Build searchable options from any product/customer/supplier/rep row shape. */
export function toSearchableOptions(items: readonly OptionSource[]): SearchableOption[] {
  return items.map((item) => ({
    value: item.id,
    label: item.name_ar || item.name || item.id,
    searchText: [item.sku, item.name_en, item.category, item.phone].filter(Boolean).join(' '),
  }))
}

/** Arabic-friendly comparison: strip diacritics/tatweel and unify common variants. */
export function normalizeSearchText(input: string): string {
  return input
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ئ/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .trim()
}

export function scoreOption(option: SearchableOption, tokens: string[], wholeQuery: string): number | null {
  if (tokens.length === 0) return 0
  const haystack = normalizeSearchText(`${option.label} ${option.searchText || ''}`)

  let rank = 0
  for (const token of tokens) {
    if (!haystack.includes(token)) return null
    if (haystack.startsWith(token)) continue
    if (haystack.includes(` ${token}`)) rank = Math.max(rank, 1)
    else rank = Math.max(rank, 2)
  }
  if (wholeQuery && haystack.startsWith(wholeQuery)) rank = 0
  return rank
}
