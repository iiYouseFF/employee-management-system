import { useMemo, useState } from 'react'
import { useRepDirectory } from '../../hooks/useData'
import { cn, formatNumber } from '../../lib/format'
import type { RepDirectoryRow, RepFormValues } from '../../types/reps'

interface RepsTabProps {
  onAdd: () => void
  onEdit: (rep: RepFormValues & { id: string }) => void
  onDelete: (rep: { id: string; name: string }) => void
  showToast: (message: string) => void
}

type LinkFilter = 'all' | 'linked' | 'unlinked'

const num = (value: number | string | null | undefined): number => {
  const n = typeof value === 'string' ? parseFloat(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')

export default function RepsTab({ onAdd, onEdit, onDelete, showToast }: RepsTabProps) {
  const { data: reps = [], isLoading, isError, error, refetch } = useRepDirectory()
  const [search, setSearch] = useState('')
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all')
  const [showInactive, setShowInactive] = useState(true)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return reps.filter((rep) => {
      if (!showInactive && !rep.is_active) return false
      if (linkFilter === 'linked' && !rep.is_linked) return false
      if (linkFilter === 'unlinked' && rep.is_linked) return false
      if (!term) return true
      return [rep.name, rep.email, rep.phone].some((field) =>
        (field || '').toLowerCase().includes(term)
      )
    })
  }, [reps, search, linkFilter, showInactive])

  const totals = useMemo(() => {
    return reps.reduce(
      (acc, rep) => {
        acc.reps += 1
        if (rep.is_active) acc.activeReps += 1
        if (rep.is_linked) acc.linked += 1
        acc.customers += num(rep.customers_count)
        acc.sales += num(rep.cash_total) + num(rep.credit_total)
        acc.collected += num(rep.collected_total)
        acc.outstanding += num(rep.outstanding_total)
        return acc
      },
      { reps: 0, activeReps: 0, linked: 0, customers: 0, sales: 0, collected: 0, outstanding: 0 }
    )
  }, [reps])

  const handleCopyInvite = async (rep: RepDirectoryRow) => {
    if (rep.is_linked) {
      showToast('هذا المندوب مرتبط بحساب دخول بالفعل')
      return
    }
    if (!rep.email) {
      showToast('أضف بريداً إلكترونياً للمندوب أولاً ليتمكن من التسجيل')
      return
    }
    const link = `${window.location.origin}/login`
    try {
      await navigator.clipboard.writeText(`${rep.name} — ${rep.email}\n${link}`)
      showToast('تم نسخ بيانات الدعوة ورابط التطبيق')
    } catch {
      showToast('تعذر النسخ التلقائي، انسخ الرابط يدوياً: ' + link)
    }
  }

  const kpis = [
    { label: 'إجمالي المناديب', value: formatNumber(totals.reps), hint: `${formatNumber(totals.activeReps)} نشط` },
    { label: 'حسابات مرتبطة', value: formatNumber(totals.linked), hint: `من ${formatNumber(totals.reps)}` },
    { label: 'عملاء موزعون', value: formatNumber(totals.customers), hint: 'مرتبطون بمناديب' },
    { label: 'إجمالي المبيعات', value: formatNumber(totals.sales), hint: 'كاش + آجل' },
    { label: 'المحصّل', value: formatNumber(totals.collected), hint: 'مدفوعات مسجلة' },
    { label: 'المستحق', value: formatNumber(totals.outstanding), hint: 'أرصدة آجلة مفتوحة' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-800">إدارة المناديب</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            متابعة أداء كل مندوب، أرصدته، وربط حسابات الدخول.
          </p>
        </div>
        <button type="button" onClick={onAdd} className="app-btn app-btn-primary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>إضافة مندوب</span>
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="app-card p-4">
            <div className="text-[11px] font-bold text-slate-500">{kpi.label}</div>
            <div className="text-xl font-black text-slate-800 mt-1 tabular-nums" dir="ltr">
              {kpi.value}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">{kpi.hint}</div>
          </div>
        ))}
      </div>

      <div className="app-card p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1">
            <svg
              className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الجوال أو البريد..."
              className="app-input ps-9"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1">
            {(
              [
                ['all', 'الكل'],
                ['linked', 'مرتبط'],
                ['unlinked', 'غير مرتبط'],
              ] as [LinkFilter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setLinkFilter(value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                  linkFilter === value
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-primary-700 focus:ring-primary-500"
            />
            إظهار الموقوفين
          </label>
        </div>
      </div>

      {isError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm flex items-center justify-between gap-3">
          <span>تعذر تحميل بيانات المناديب: {(error as Error)?.message}</span>
          <button type="button" onClick={() => refetch()} className="app-btn app-btn-ghost app-btn-sm">
            إعادة المحاولة
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="app-card p-5 animate-pulse space-y-3">
              <div className="h-10 w-10 rounded-full bg-slate-200" />
              <div className="h-4 w-32 bg-slate-200 rounded" />
              <div className="h-3 w-48 bg-slate-100 rounded" />
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="h-12 bg-slate-100 rounded-lg" />
                <div className="h-12 bg-slate-100 rounded-lg" />
                <div className="h-12 bg-slate-100 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="app-card p-10 text-center">
          <div className="text-3xl mb-2">👥</div>
          <p className="text-sm font-bold text-slate-700">لا يوجد مناديب مطابقون</p>
          <p className="text-xs text-slate-500 mt-1">جرّب تغيير البحث أو الفلتر، أو أضف مندوباً جديداً.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((rep) => {
            const sales = num(rep.cash_total) + num(rep.credit_total)
            const target = num(rep.monthly_target)
            const monthSales = num(rep.month_sales)
            const progress = target > 0 ? Math.min(100, (monthSales / target) * 100) : 0
            const collectionRate = sales > 0 ? (num(rep.collected_total) / sales) * 100 : 0

            return (
              <div
                key={rep.rep_id}
                className={cn(
                  'app-card p-5 space-y-4',
                  !rep.is_active && 'opacity-75 bg-slate-50/60'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary-600 to-primary-800 text-white flex items-center justify-center font-black text-sm shrink-0">
                    {initials(rep.name) || '؟'}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-black text-slate-800 truncate">{rep.name}</h3>
                      {!rep.is_active && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                          موقوف
                        </span>
                      )}
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full',
                          rep.is_linked
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        )}
                      >
                        {rep.is_linked ? 'مرتبط' : 'بانتظار التسجيل'}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                      <div className="truncate" dir="ltr">
                        {rep.email || '— بدون بريد —'}
                      </div>
                      <div dir="ltr" className="tabular-nums">
                        {rep.phone || '— بدون جوال —'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-50 border border-slate-100 py-2">
                    <div className="text-[10px] font-bold text-slate-500">عملاء</div>
                    <div className="text-sm font-black text-slate-800 tabular-nums">
                      {formatNumber(rep.customers_count)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 py-2">
                    <div className="text-[10px] font-bold text-slate-500">فواتير</div>
                    <div className="text-sm font-black text-slate-800 tabular-nums">
                      {formatNumber(num(rep.cash_count) + num(rep.credit_count))}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 py-2">
                    <div className="text-[10px] font-bold text-slate-500">متأخرة</div>
                    <div
                      className={cn(
                        'text-sm font-black tabular-nums',
                        num(rep.overdue_count) > 0 ? 'text-rose-600' : 'text-slate-800'
                      )}
                    >
                      {formatNumber(rep.overdue_count)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">مبيعات كاش</span>
                    <span className="font-bold text-slate-800 tabular-nums">
                      {formatNumber(rep.cash_total)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">مبيعات آجل</span>
                    <span className="font-bold text-slate-800 tabular-nums">
                      {formatNumber(rep.credit_total)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">المحصّل</span>
                    <span className="font-bold text-emerald-700 tabular-nums">
                      {formatNumber(rep.collected_total)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">المستحق</span>
                    <span
                      className={cn(
                        'font-bold tabular-nums',
                        num(rep.outstanding_total) > 0 ? 'text-amber-700' : 'text-slate-800'
                      )}
                    >
                      {formatNumber(rep.outstanding_total)}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                    <span>هدف الشهر</span>
                    <span className="tabular-nums">
                      {formatNumber(monthSales)}
                      {target > 0 ? ` / ${formatNumber(target)}` : ''}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        progress >= 100
                          ? 'bg-emerald-500'
                          : progress >= 50
                            ? 'bg-primary-600'
                            : 'bg-amber-500'
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>نسبة التحصيل {formatNumber(Math.round(collectionRate))}%</span>
                    <span>
                      آخر حركة: {rep.last_activity ? rep.last_activity.slice(0, 10) : '—'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() =>
                      onEdit({
                        id: rep.rep_id,
                        name: rep.name,
                        email: rep.email,
                        phone: rep.phone,
                        notes: rep.notes,
                        monthly_target: num(rep.monthly_target),
                        is_active: rep.is_active,
                      })
                    }
                    className="app-btn app-btn-ghost app-btn-sm"
                  >
                    تعديل
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyInvite(rep)}
                    disabled={rep.is_linked}
                    className="app-btn app-btn-info app-btn-sm disabled:opacity-50"
                  >
                    {rep.is_linked ? 'مرتبط بالفعل' : 'نسخ الدعوة'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete({ id: rep.rep_id, name: rep.name })}
                    className="app-btn app-btn-ghost app-btn-sm !text-rose-600 hover:!bg-rose-50 ms-auto"
                  >
                    حذف
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
