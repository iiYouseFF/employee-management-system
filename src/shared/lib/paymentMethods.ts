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
      return 'app-pill app-pill-cash'
    case 'تحويل بنكي':
      return 'app-pill app-pill-bank'
    case 'شيك':
      return 'app-pill app-pill-check'
    case 'فودافون كاش':
      return 'app-pill app-pill-vodafone'
    case 'انستاباي':
      return 'app-pill app-pill-instapay'
    case 'آجل':
      return 'app-pill app-pill-neutral'
    case 'محفظة إلكترونية (قديمة)':
      return 'app-pill app-pill-neutral'
    default:
      return 'app-pill app-pill-neutral'
  }
}

export function paymentMethodLabel(method?: string | null): string {
  const value = normalizePaymentMethod(method)
  if (value === 'محفظة إلكترونية (قديمة)') return 'محفظة إلكترونية (قديمة)'
  return value
}
