import { useState, useCallback, type ReactNode } from 'react'
import { QuickActionContext, type QuickAction } from '@/app/quickActionStore'

export function QuickActionProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<QuickAction>(null)
  const [nonce, setNonce] = useState(0)
  const trigger = useCallback((action: Exclude<QuickAction, null>) => {
    setPending(action)
    setNonce((n) => n + 1)
  }, [])
  const consume = useCallback(() => setPending(null), [])
  return <QuickActionContext.Provider value={{ pending, nonce, trigger, consume }}>{children}</QuickActionContext.Provider>
}
