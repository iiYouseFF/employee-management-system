import { useMemo, useState, useCallback } from 'react'
import { getDateRangeForPreset, type DatePreset } from '@/shared/lib/datePresets'

export function useDatePreset(initial: DatePreset = 'month') {
  const [preset, setPresetState] = useState<DatePreset>(initial)
  const range = useMemo(() => getDateRangeForPreset(preset), [preset])
  const [from, setFrom] = useState(range.from)
  const [to, setTo] = useState(range.to)

  const setPreset = useCallback((p: DatePreset) => {
    setPresetState(p)
    const r = getDateRangeForPreset(p)
    setFrom(r.from)
    setTo(r.to)
  }, [])

  const setCustomRange = useCallback((nextFrom: string, nextTo: string) => {
    setFrom(nextFrom)
    setTo(nextTo)
    setPresetState('all')
  }, [])

  const reset = useCallback(() => setPreset(initial), [initial, setPreset])

  return { preset, from, to, setPreset, setFrom: (v: string) => setCustomRange(v, to), setTo: (v: string) => setCustomRange(from, v), reset, isActive: preset !== 'all' || !!from || !!to }
}
