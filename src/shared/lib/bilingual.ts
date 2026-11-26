/** Lightweight AR/EN labels for screens that render in either direction. No full i18n layer. */
export type UiLang = 'ar' | 'en'

export function getUiLang(): UiLang {
  if (typeof document === 'undefined') return 'ar'
  return document.documentElement.dir === 'ltr' ? 'en' : 'ar'
}

export function t(lang: UiLang, arabic: string, english: string): string {
  return lang === 'ar' ? arabic : english
}

const localeFor = (lang: UiLang) => (lang === 'ar' ? 'ar-EG' : 'en-US')

export function formatLocalNumber(value: number | string | null | undefined, lang: UiLang, digits = 2): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0'
  return new Intl.NumberFormat(localeFor(lang), {
    minimumFractionDigits: Math.min(2, digits),
    maximumFractionDigits: digits,
  }).format(n)
}

export function formatLocalDate(value: string | null | undefined, lang: UiLang): string {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(localeFor(lang), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

export function localISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
