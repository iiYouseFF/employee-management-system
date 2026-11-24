import { useMemo, useState } from 'react'
import {
  useKpiSummary,
  useReceivablesAging,
  useCashflowSeries,
} from '@/features/dashboard/useKpi'
import { formatNumber, getTodayISO } from '@/shared/lib/format'
import PageHeader from '@/shared/ui/PageHeader'
import FilterToolbar from '@/shared/ui/FilterToolbar'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from 'recharts'

export default function ManagerDashboardTab() {
  const initialRange = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return { from: d.toISOString().slice(0, 10), to: getTodayISO() }
  }, [])
  const [fromDate, setFromDate] = useState(initialRange.from)
  const [toDate, setToDate] = useState(initialRange.to)

  const { data: kpi, isLoading: loadingKpi, isError: kpiError, refetch: refetchKpi } = useKpiSummary(fromDate, toDate)
  const { data: aging = [], isLoading: loadingAging, isError: agingError, refetch: refetchAging } = useReceivablesAging(toDate)
  const { data: cashflow = [], isLoading: loadingCashflow, isError: cashflowError, refetch: refetchCashflow } = useCashflowSeries(
    fromDate,
    toDate
  )
  const hasDataError = kpiError || agingError || cashflowError
  const retryAll = () => {
    void refetchKpi()
    void refetchAging()
    void refetchCashflow()
  }

  const handleSetPreset = (days: number) => {
    const today = new Date()
    const d = new Date()
    d.setDate(today.getDate() - days)
    setFromDate(d.toISOString().slice(0, 10))
    setToDate(today.toISOString().slice(0, 10))
  }

  const resetFilters = () => {
    setFromDate(initialRange.from)
    setToDate(initialRange.to)
  }
  const hasActiveFilters = fromDate !== initialRange.from || toDate !== initialRange.to

  const salesDonutData = [
    { name: 'البيع النقدي', value: kpi?.cash_sales || 0, color: '#10b981' },
    { name: 'البيع الآجل', value: kpi?.credit_sales || 0, color: '#2a78b8' },
  ]

  const liquidityRatioData = [
    { name: 'سيولة نقدية محصلة', value: kpi?.income || 0, color: '#059669' },
    { name: 'أرصدة عملاء معلقة (مدين)', value: kpi?.receivables || 0, color: '#f59e0b' },
    { name: 'مستحقات موردين (دائن)', value: kpi?.payables || 0, color: '#ef4444' },
  ]

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <PageHeader
        title="لوحة مؤشرات الأداء المالي والتحصيل (Financial KPIs)"
        subtitle="تحليل شامل للسيولة النقدية، سرعة التحصيل، مبيعات الآجل، وأعمار الديون"
      />

      {/* Date Filter & Control Bar */}
      <FilterToolbar
        from={fromDate}
        to={toDate}
        onFromChange={setFromDate}
        onToChange={setToDate}
        onReset={resetFilters}
        hasActiveFilters={hasActiveFilters}
      >
        {/* Quick Presets */}
        <div className="flex gap-1.5">
          <button
            onClick={() => handleSetPreset(7)}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            آخر 7 أيام
          </button>
          <button
            onClick={() => handleSetPreset(30)}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            آخر 30 يوم
          </button>
          <button
            onClick={() => handleSetPreset(90)}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            آخر 3 أشهر
          </button>
        </div>
      </FilterToolbar>

      {hasDataError && (
        <div className="app-card border-rose-200 bg-rose-50/70 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-rose-900">تعذّر تحميل بيانات لوحة المؤشرات</p>
            <p className="text-xs text-rose-700 mt-0.5">قد تظهر بعض الأرقام غير مكتملة. تحقق من الاتصال ثم أعد المحاولة.</p>
          </div>
          <button type="button" onClick={retryAll} className="app-btn app-btn-secondary app-btn-sm shrink-0">إعادة المحاولة</button>
        </div>
      )}

      {/* Top 4 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Income Card */}
        <div className="app-card p-5 relative overflow-hidden group hover:shadow-card-hover transition-all">
          <div className="absolute top-0 start-0 w-1.5 h-full bg-emerald-500" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">إجمالي المقبوضات (Income)</span>
            <span className="badge badge-success text-[11px]">
              محصل فعلياً
            </span>
          </div>
          <p className="mt-3 text-2xl font-black text-emerald-700 font-mono tabular-nums">
            {kpiError ? '—' : loadingKpi ? '...' : `${formatNumber(kpi?.income)} ج.م`}
          </p>
          <p className="text-xs text-slate-400 mt-1 font-medium">مبيعات نقدية + دفعات مسددة</p>
        </div>

        {/* Outcome Card */}
        <div className="app-card p-5 relative overflow-hidden group hover:shadow-card-hover transition-all">
          <div className="absolute top-0 start-0 w-1.5 h-full bg-rose-500" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">إجمالي المدفوعات (Outcome)</span>
            <span className="badge badge-danger text-[11px]">
              مدفوعات
            </span>
          </div>
          <p className="mt-3 text-2xl font-black text-rose-700 font-mono tabular-nums">
            {kpiError ? '—' : loadingKpi ? '...' : `${formatNumber(kpi?.outcome)} ج.م`}
          </p>
          <p className="text-xs text-slate-400 mt-1 font-medium">دفعات موردين ومشتريات ومصاريف</p>
        </div>

        {/* Net Cash Flow Card */}
        <div className="app-card p-5 relative overflow-hidden group hover:shadow-card-hover transition-all">
          <div className="absolute top-0 start-0 w-1.5 h-full bg-primary-600" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">صافي السيولة النقدية (Net)</span>
            <span className="badge badge-primary text-[11px]">
              الفائض النقدي
            </span>
          </div>
          <p
            className={`mt-3 text-2xl font-black font-mono tabular-nums ${
              (kpi?.net_profit || 0) >= 0 ? 'text-primary-800' : 'text-rose-700'
            }`}
          >
            {kpiError ? '—' : loadingKpi ? '...' : `${formatNumber(kpi?.net_profit)} ج.م`}
          </p>
          <p className="text-xs text-slate-400 mt-1 font-medium">الفارق بين المقبوض والمنصرف</p>
        </div>

        {/* DSO Velocity Card */}
        <div className="app-card p-5 relative overflow-hidden group hover:shadow-card-hover transition-all">
          <div className="absolute top-0 start-0 w-1.5 h-full bg-blue-500" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">معدل دوران الائتمان (DSO)</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              سرعة التحصيل
            </span>
          </div>
          <p className="mt-3 text-2xl font-black text-blue-700 font-mono tabular-nums">
            {kpiError ? '—' : loadingKpi ? '...' : `${kpi?.dso || 0} يوم`}
          </p>
          <p className="text-xs text-slate-400 mt-1 font-medium">متوسط المدة اللازمة لتحصيل الفاتورة</p>
        </div>
      </div>

      {/* Inventory & Gross Margin Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="app-card p-4.5 bg-gradient-to-br from-indigo-50/70 to-white border-indigo-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-indigo-900 block">تكلفة البضاعة المباعة (COGS)</span>
            <p className="text-2xl font-black text-indigo-800 font-mono mt-1">
              {kpiError ? '—' : loadingKpi ? '...' : `${formatNumber(kpi?.cogs ?? 0)} ج.م`}
            </p>
            <span className="text-[11px] text-slate-400 mt-0.5 block">محسوبة بمتوسط التكلفة المرجح للأصناف المباعة</span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
            تكلفة
          </div>
        </div>

        <div className="app-card p-4.5 bg-gradient-to-br from-teal-50/70 to-white border-teal-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-teal-900 block">مجمل الربح (Gross Margin)</span>
            <p className={`text-2xl font-black font-mono mt-1 ${(kpi?.gross_margin ?? 0) >= 0 ? 'text-teal-800' : 'text-rose-700'}`}>
              {kpiError ? '—' : loadingKpi ? '...' : `${formatNumber(kpi?.gross_margin ?? 0)} ج.م`}
            </p>
            <span className="text-[11px] text-slate-400 mt-0.5 block">إجمالي مبيعات الفواتير − تكلفة البضاعة المباعة</span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
            ربح
          </div>
        </div>
      </div>

      {/* Velocity Details Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50/80 to-blue-100/40 p-4.5 rounded-2xl border border-blue-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900">
              أرصدة العملاء المعلقة (Receivables)
            </span>
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          </div>
          <p className="text-xl font-black text-blue-800 font-mono mt-1.5">
            {kpiError ? '—' : `${formatNumber(kpi?.receivables)} ج.م`}
          </p>
          <span className="text-xs text-blue-700/80 font-medium mt-1 block">إجمالي الديون المستحقة عند العملاء بالخارج</span>
        </div>

        <div className="bg-gradient-to-br from-amber-50/80 to-amber-100/40 p-4.5 rounded-2xl border border-amber-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900">
              مستحقات الموردين (Accounts Payable)
            </span>
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          </div>
          <p className="text-xl font-black text-amber-800 font-mono mt-1.5">
            {kpiError ? '—' : `${formatNumber(kpi?.payables)} ج.م`}
          </p>
          <span className="text-xs text-amber-700/80 font-medium mt-1 block">إجمالي الالتزامات الواجبة السداد للموردين</span>
        </div>

        <div className="bg-gradient-to-br from-emerald-50/80 to-emerald-100/40 p-4.5 rounded-2xl border border-emerald-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-900">
              نسبة التحصيل خلال 30 يوماً
            </span>
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
          </div>
          <p className="text-xl font-black text-emerald-800 font-mono mt-1.5">
            {kpiError ? '—' : `${kpi?.collection_rate_30d || 0}%`}
          </p>
          <span className="text-xs text-emerald-700/80 font-medium mt-1 block">
            متوسط فترة السداد: {kpi?.avg_collection_days || 0} يوم
          </span>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cashflow Over Time Chart */}
        <div className="app-card p-5 sm:p-6 shadow-card">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
            <span>حركة التدفق النقدي اليومي (المقبوضات مقابل المدفوعات)</span>
          </h3>
          <div className="h-64 w-full">
            {loadingCashflow ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                جاري تحميل الرسم البياني...
              </div>
            ) : cashflowError ? (
              <div className="h-full flex items-center justify-center text-rose-500 text-xs">
                تعذّر تحميل بيانات التدفق النقدي
              </div>
            ) : cashflow.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                لا توجد بيانات تدفق مالي في هذه الفترة المحددة
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashflow}>
                  <defs>
                    <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="tx_date" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      color: '#fff',
                      borderRadius: '0.75rem',
                      border: 'none',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    name="مقبوضات"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorInc)"
                  />
                  <Area
                    type="monotone"
                    dataKey="outcome"
                    name="مدفوعات"
                    stroke="#ef4444"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorOut)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Receivables Aging Buckets */}
        <div className="app-card p-5 sm:p-6 shadow-card">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span>أعمار الديون المستحقة عند العملاء (Receivables Aging)</span>
          </h3>
          <div className="h-64 w-full">
            {loadingAging ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                جاري تحميل أعمار الديون...
              </div>
            ) : agingError ? (
              <div className="h-full flex items-center justify-center text-rose-500 text-xs">
                تعذّر تحميل أعمار الديون
              </div>
            ) : aging.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                لا توجد أعمار ديون مسجلة في الفترة المحددة
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aging}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      color: '#fff',
                      borderRadius: '0.75rem',
                      border: 'none',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="amount"
                    name="المبلغ المستحق (ج.م)"
                    fill="#2a78b8"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Donut Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cash vs Credit Sales Breakdown */}
        <div className="app-card p-5 sm:p-6 shadow-card">
          <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
            <span>هيكل المبيعات (نقدي مقابل آجل)</span>
          </h3>
          <div className="h-60 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={salesDonutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {salesDonutData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    color: '#fff',
                    borderRadius: '0.75rem',
                    border: 'none',
                    fontSize: '12px',
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Liquidity vs Receivables vs Payables */}
        <div className="app-card p-5 sm:p-6 shadow-card">
          <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
            <span>ميزان السيولة والالتزامات (المحصل / العملاء / الموردين)</span>
          </h3>
          <div className="h-60 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={liquidityRatioData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {liquidityRatioData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    color: '#fff',
                    borderRadius: '0.75rem',
                    border: 'none',
                    fontSize: '12px',
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
