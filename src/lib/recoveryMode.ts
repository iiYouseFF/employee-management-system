const KEY = 'ems:recovery-pending'

function safeGet(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function markRecoveryPending(): void {
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    /* storage unavailable */
  }
}

export function clearRecoveryPending(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* storage unavailable */
  }
}

export function isRecoveryPending(): boolean {
  return safeGet() === '1'
}

if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
  markRecoveryPending()
}
