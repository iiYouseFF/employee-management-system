import type { StatementRow } from '@/features/statements/useStatements'

export type StatementRefTarget =
  | { kind: 'invoice'; id: string; type: 'cash' | 'credit' }
  | { kind: 'customer_payment'; id: string }
  | { kind: 'supplier_purchase'; id: string }
  | { kind: 'supplier_payment'; id: string }

export function getStatementReference(row: StatementRow): StatementRefTarget | null {
  if (row.invoice_id && (row.invoice_type === 'cash' || row.invoice_type === 'credit')) {
    return { kind: 'invoice', id: row.invoice_id, type: row.invoice_type }
  }
  if (row.payment_id) {
    return { kind: 'customer_payment', id: row.payment_id }
  }
  if (row.reference_id && row.reference_type === 'supplier_purchase') {
    return { kind: 'supplier_purchase', id: row.reference_id }
  }
  if (row.reference_id && row.reference_type === 'supplier_payment') {
    return { kind: 'supplier_payment', id: row.reference_id }
  }
  return null
}

export function statementReferenceLabel(row: StatementRow): string {
  if (row.ref) return row.ref
  const target = getStatementReference(row)
  if (!target) return '-'
  if (target.kind === 'customer_payment') return 'عرض السداد'
  if (target.kind === 'supplier_payment') return 'عرض السداد'
  if (target.kind === 'supplier_purchase') return 'عرض المشتريات'
  return 'عرض التفاصيل'
}
