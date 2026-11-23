export const CUSTOMER_PAYMENT_METHODS = [
  'نقدي',
  'تحويل بنكي',
  'شيك',
  'فودافون كاش',
  'انستاباي',
  'آجل',
] as const

export const SUPPLIER_PAYMENT_METHODS = [
  'نقدي',
  'تحويل بنكي',
  'شيك',
  'فودافون كاش',
  'انستاباي',
] as const

export type CustomerPaymentMethod = (typeof CUSTOMER_PAYMENT_METHODS)[number]
export type SupplierPaymentMethod = (typeof SUPPLIER_PAYMENT_METHODS)[number]

const LEGACY_METHOD_MAP: Record<string, string> = {
  'محفظة إلكترونية': 'محفظة إلكترونية (قديمة)',
  wallet: 'محفظة إلكترونية (قديمة)',
  'e-wallet': 'محفظة إلكترونية (قديمة)',
}

export function normalizePaymentMethod(method?: string | null): string {
  const raw = String(method || '').trim()
  if (!raw) return '-'
  return LEGACY_METHOD_MAP[raw] || raw
}

export function paymentMethodBadgeClass(method?: string | null): string {
  const value = normalizePaymentMethod(method)
  switch (value) {
    case 'نقدي':
      return 'badge badge-success'
    case 'تحويل بنكي':
      return 'badge badge-primary'
    case 'شيك':
      return 'badge badge-warning'
    case 'فودافون كاش':
      return 'badge badge-danger'
    case 'انستاباي':
      return 'badge badge-info'
    case 'آجل':
      return 'badge badge-neutral'
    case 'محفظة إلكترونية (قديمة)':
      return 'badge badge-neutral'
    default:
      return 'badge badge-neutral'
  }
}

export function paymentMethodLabel(method?: string | null): string {
  const value = normalizePaymentMethod(method)
  if (value === 'محفظة إلكترونية (قديمة)') return 'محفظة إلكترونية (قديمة)'
  return value
}
