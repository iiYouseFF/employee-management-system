/**
 * Typed source of truth for per-rep granular permissions.
 *
 * The keys and defaults below must stay in sync with the `permissions` jsonb
 * default in `supabase/migrations/0034_rep_granular_permissions.sql`.
 */

export const REP_PERMISSION_KEYS = [
  'view_customers',
  'view_cash',
  'view_credit',
  'view_overdue',
  'view_payments',
  'view_statement',
  'view_returns',
  'view_products',
  'view_inventory',
  'view_monthly',
  'create_cash_invoice',
  'create_credit_invoice',
  'record_payment',
  'create_return',
  'export_print',
] as const

export type RepPermissionKey = (typeof REP_PERMISSION_KEYS)[number]
export type RepPermissions = Record<RepPermissionKey, boolean>

export const REP_PERMISSION_LABELS: Record<RepPermissionKey, string> = {
  view_customers: 'عرض العملاء',
  view_cash: 'عرض الفواتير النقدية',
  view_credit: 'عرض الفواتير الآجلة',
  view_overdue: 'عرض الفواتير المتأخرة',
  view_payments: 'عرض المدفوعات',
  view_statement: 'عرض كشف حساب العميل',
  view_returns: 'عرض المرتجعات',
  view_products: 'عرض كتالوج المنتجات',
  view_inventory: 'عرض المخزون',
  view_monthly: 'عرض التقرير الشهري',
  create_cash_invoice: 'إنشاء فواتير نقدية وتعديلها',
  create_credit_invoice: 'إنشاء فواتير آجلة وتعديلها',
  record_payment: 'تسجيل مدفوعات العملاء',
  create_return: 'إنشاء مرتجعات وتعديلها',
  export_print: 'الطباعة والتصدير',
}

export const REP_PERMISSION_GROUPS: { id: string; label: string; keys: RepPermissionKey[] }[] = [
  {
    id: 'views',
    label: 'صلاحيات العرض',
    keys: [
      'view_customers',
      'view_cash',
      'view_credit',
      'view_overdue',
      'view_payments',
      'view_statement',
      'view_returns',
      'view_products',
      'view_inventory',
      'view_monthly',
    ],
  },
  {
    id: 'actions',
    label: 'صلاحيات التنفيذ',
    keys: [
      'create_cash_invoice',
      'create_credit_invoice',
      'record_payment',
      'create_return',
      'export_print',
    ],
  },
]

/** Defaults granted to every existing and newly created rep. */
export const DEFAULT_REP_PERMISSIONS: RepPermissions = {
  view_customers: true,
  view_cash: true,
  view_credit: true,
  view_overdue: true,
  view_payments: true,
  view_statement: true,
  view_returns: true,
  view_products: true,
  view_inventory: false,
  view_monthly: false,
  create_cash_invoice: false,
  create_credit_invoice: false,
  record_payment: false,
  create_return: false,
  export_print: true,
}

/** Which permission controls visibility of each tab. */
export const REP_TAB_PERMISSION: Record<string, RepPermissionKey> = {
  customers: 'view_customers',
  cash: 'view_cash',
  credit: 'view_credit',
  overdue_invoices: 'view_overdue',
  payments: 'view_payments',
  statement: 'view_statement',
  returns: 'view_returns',
  products: 'view_products',
  inventory: 'view_inventory',
  monthly: 'view_monthly',
}

/** Normalize a `reps.permissions` jsonb value into the typed shape. */
export function normalizeRepPermissions(value: unknown): RepPermissions {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const result = { ...DEFAULT_REP_PERMISSIONS }
  for (const key of REP_PERMISSION_KEYS) {
    result[key] = raw[key] === true
  }
  return result
}

/** Whether a rep may open a tab. Unmapped tabs are manager-only and never reach here. */
export function canRepAccessTab(permissions: RepPermissions, tab: string): boolean {
  const key = REP_TAB_PERMISSION[tab]
  return key ? permissions[key] : false
}
