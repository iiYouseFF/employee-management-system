export const PRODUCT_UNITS = [
  'كرتونة',
  'باليته',
  'ربطة',
  'قطعة',
  'كيلوجرام',
  'جرام',
  'علبه',
] as const

export type ProductUnit = (typeof PRODUCT_UNITS)[number]

export const DEFAULT_PRODUCT_UNIT: string = 'قطعة'

/** Keeps legacy free-text units selectable so existing products are not silently changed. */
export function productUnitOptions(current?: string | null): string[] {
  const value = String(current || '').trim()
  if (value && !(PRODUCT_UNITS as readonly string[]).includes(value)) {
    return [value, ...PRODUCT_UNITS]
  }
  return [...PRODUCT_UNITS]
}

/** Resolves a nullable stored unit to a usable default. */
export function resolveProductUnit(unit?: string | null): string {
  return String(unit || '').trim() || DEFAULT_PRODUCT_UNIT
}
