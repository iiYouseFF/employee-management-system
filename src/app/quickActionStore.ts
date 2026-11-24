import { createContext, useContext } from 'react'

export type QuickAction = 'cash' | 'credit' | 'payments' | 'supplier_purchases' | null

export interface QuickActionContextValue {
  pending: QuickAction
  nonce: number
  trigger: (action: Exclude<QuickAction, null>) => void
  consume: () => void
}

export const QuickActionContext = createContext<QuickActionContextValue | null>(null)

export function useQuickAction() {
  const ctx = useContext(QuickActionContext)
  if (!ctx) throw new Error('useQuickAction must be used within QuickActionProvider')
  return ctx
}
