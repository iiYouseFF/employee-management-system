export type DatePreset = 'today' | 'week' | 'month' | 'all'

export function getDateRangeForPreset(preset: DatePreset): { from: string; to: string } {
  const today = new Date()
  const iso = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const to = iso(today)
  if (preset === 'all') return { from: '', to: '' }
  if (preset === 'today') return { from: to, to }
  if (preset === 'week') {
    const start = new Date(today)
    const day = start.getDay() // 0 Sun
    const diff = (day + 1) % 7 // week starts Saturday? For EG business week often Sat; use last 7 days safer? We'll use start of current week Sat.
    start.setDate(start.getDate() - diff)
    return { from: iso(start), to }
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return { from: iso(start), to }
}

export const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'اليوم' },
  { id: 'week', label: 'هذا الأسبوع' },
  { id: 'month', label: 'هذا الشهر' },
  { id: 'all', label: 'الكل' },
]
