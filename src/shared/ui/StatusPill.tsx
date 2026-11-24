interface StatusPillProps { status?: string | null; className?: string }
export default function StatusPill({ status, className = '' }: StatusPillProps) {
  const s = String(status || '').trim()
  const map: Record<string, string> = {
    'مدفوع': 'app-pill-paid', 'paid': 'app-pill-paid', 'confirmed': 'app-pill-paid', 'نشط': 'app-pill-paid',
    'جزئي': 'app-pill-partial', 'partial': 'app-pill-partial', 'معلق': 'app-pill-partial', 'draft': 'app-pill-partial',
    'غير مدفوع': 'app-pill-unpaid', 'unpaid': 'app-pill-unpaid', 'ملغي': 'app-pill-unpaid', 'cancelled': 'app-pill-unpaid',
    'متأخر': 'app-pill-late', 'late': 'app-pill-late', 'overdue': 'app-pill-late', 'غير نشط': 'app-pill-neutral',
  }
  const cls = map[s] || 'app-pill-neutral'
  const label = ({ paid: 'مدفوع', confirmed: 'مؤكد', partial: 'جزئي', draft: 'مسودة', unpaid: 'غير مدفوع', cancelled: 'ملغي', late: 'متأخر', overdue: 'متأخر' } as Record<string,string>)[s] || s || '-'
  return <span className={`app-pill ${cls} ${className}`}>{label}</span>
}
