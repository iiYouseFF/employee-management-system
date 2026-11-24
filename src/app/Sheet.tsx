import { Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/useAuth'
import { useSettings } from '@/features/settings/useSettings'
import { useReps, useDeleteRep, useAddRep, useUpdateRep } from '@/features/reps/useReps'
import CashTab from '@/features/sales/CashTab'
import CreditTab from '@/features/sales/CreditTab'
import PaymentsTab from '@/features/payments/PaymentsTab'
import StatementTab from '@/features/statements/StatementTab'
import MonthlyTab from '@/features/dashboard/MonthlyTab'
import CustomersTab from '@/features/customers/CustomersTab'
import SupplierDirectoryTab from '@/features/suppliers/SupplierDirectoryTab'
import SupplierPurchasesTab from '@/features/suppliers/SupplierPurchasesTab'
import SupplierPaymentsTab from '@/features/suppliers/SupplierPaymentsTab'
import SupplierStatementTab from '@/features/suppliers/SupplierStatementTab'
import ExpensesTab from '@/features/expenses/ExpensesTab'
import ProductsTab from '@/features/products/ProductsTab'
import ManagerDashboardTab from '@/features/dashboard/ManagerDashboardTab'
import RepsTab from '@/features/reps/RepsTab'
import InventoryTab from '@/features/inventory/InventoryTab'
import ReturnsTab from '@/features/sales/ReturnsTab'
import AuditLogsTab from '@/features/audit/AuditLogsTab'
import Toast from '@/shared/ui/Toast'
import ReportModal from '@/features/reporting/ReportModal'
import RepModal from '@/features/reps/RepModal'
import ChangePasswordModal from '@/features/auth/ChangePasswordModal'
import AppNavigation, { type NavGroup } from '@/app/AppNavigation'
import { useQuickAction } from '@/app/quickActionStore'
import { useToast } from '@/shared/hooks/useToast'
import { friendlyError } from '@/shared/lib/errors'
import { supabase } from '@/shared/lib/supabase'
import type { RepFormValues } from '@/features/reps/reps.types'

const REP_TABS = ['customers', 'cash', 'credit', 'payments', 'statement', 'returns', 'products']
const MANAGER_TABS = [
  ...REP_TABS,
  'suppliers', 'supplier_purchases', 'supplier_payments', 'supplier_statement',
  'expenses', 'inventory', 'monthly', 'kpi', 'reps', 'audit_logs',
]

function AuthNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-page-bg px-6 text-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600 leading-6">{message}</p>
        <button type="button" onClick={() => { void supabase.auth.signOut() }} className="mt-6 w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-2)]">
          تسجيل الخروج
        </button>
      </div>
    </div>
  )
}

export default function Sheet() {
  const { user, role, repProfile, isRep, isReadOnly, isManager, loading: authLoading } = useAuth()
  const { data: settings, isLoading: settingsLoading } = useSettings()
  const { data: reps = [] } = useReps()
  const addRep = useAddRep()
  const updateRep = useUpdateRep()
  const deleteRep = useDeleteRep()
  const { toast, showToast } = useToast()
  const { pending, nonce, trigger, consume } = useQuickAction()

  const [activeTabState, setActiveTabState] = useState<string>(() => {
    try { return sessionStorage.getItem('ems:activeTab') || 'cash' } catch { return 'cash' }
  })
  const allowedTabs = isManager ? MANAGER_TABS : REP_TABS
  // Ignore a stored tab that the current role cannot open (avoids a blank main area).
  const activeTab = allowedTabs.includes(activeTabState) ? activeTabState : 'cash'
  const [repFilter, setRepFilter] = useState<string>('all')
  const [reportAction, setReportAction] = useState<'print' | 'csv' | null>(null)
  const [repModalOpen, setRepModalOpen] = useState(false)
  const [editingRep, setEditingRep] = useState<(RepFormValues & { id?: string }) | null>(null)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)

  const effectiveRepFilter = isRep && repProfile?.id ? repProfile.id : repFilter

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab)
    try { sessionStorage.setItem('ems:activeTab', tab) } catch { /* ignore */ }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const dir = params.get('dir')
    if (dir === 'ltr' || dir === 'rtl') document.documentElement.dir = dir
  }, [])

  // Keep the signal alive until the target tab mounts and consumes it.
  useEffect(() => {
    if (!pending) return
    setActiveTab(pending)
  }, [pending, nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading || settingsLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-page-bg text-slate-600 gap-3">
        <div className="h-10 w-10 border-4 border-slate-200 border-t-[var(--primary)] rounded-full animate-spin" />
        <span className="font-semibold text-sm">جاري تحميل بيانات النظام...</span>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (!role) {
    return <AuthNotice title="لا تملك صلاحية الوصول" message="هذا الحساب غير مرتبط بدور صلاحية (مدير أو مندوب). يرجى التواصل مع المدير لتفعيل حسابك." />
  }

  if (isRep && !repProfile) {
    return <AuthNotice title="الحساب غير مرتبط بمندوب" message="تم تسجيل الدخول بنجاح لكن لم يتم ربط حسابك ببيانات مندوب. يرجى التواصل مع المدير." />
  }

  const defaultTabNames: Record<string, string> = {
    cash: 'فاتورة نقدي', credit: 'فاتورة آجل', payments: 'المدفوعات', statement: 'كشف حساب العميل',
    monthly: 'التقرير الشهري', customers: 'العملاء', returns: 'مرتجعات المبيعات', reps: 'إدارة المناديب',
    suppliers: 'دليل الموردين', supplier_purchases: 'مشتريات الموردين', supplier_payments: 'مدفوعات الموردين', supplier_statement: 'كشف حساب مورد',
    expenses: 'المصاريف', inventory: 'المخزون', products: 'كتالوج الأسعار والمنتجات',
    kpi: 'مؤشرات الأداء المالية (KPIs)', audit_logs: 'سجل العمليات والنظام',
  }
  const customTabNames = typeof settings?.tab_names === 'object' && settings?.tab_names !== null ? (settings.tab_names as Record<string, string>) : {}
  const getTabLabel = (key: string) => customTabNames[key] || defaultTabNames[key] || key

  const navGroups: NavGroup[] = isManager ? [
    {
      id: 'sales', label: 'المبيعات والعملاء',
      tabs: [
        { id: 'customers', label: getTabLabel('customers') },
        { id: 'cash', label: getTabLabel('cash') },
        { id: 'credit', label: getTabLabel('credit') },
        { id: 'payments', label: getTabLabel('payments') },
        { id: 'statement', label: getTabLabel('statement') },
        { id: 'returns', label: getTabLabel('returns') },
      ],
    },
    {
      id: 'purchases', label: 'المشتريات والموردين',
      tabs: [
        { id: 'suppliers', label: getTabLabel('suppliers') },
        { id: 'supplier_purchases', label: getTabLabel('supplier_purchases') },
        { id: 'supplier_payments', label: getTabLabel('supplier_payments') },
        { id: 'supplier_statement', label: getTabLabel('supplier_statement') },
        { id: 'expenses', label: getTabLabel('expenses') },
      ],
    },
    {
      id: 'inventory_reports', label: 'المخزون والتقارير',
      tabs: [
        { id: 'inventory', label: getTabLabel('inventory') },
        { id: 'products', label: getTabLabel('products') },
        { id: 'monthly', label: getTabLabel('monthly') },
        { id: 'kpi', label: getTabLabel('kpi') },
        { id: 'reps', label: getTabLabel('reps') },
        { id: 'audit_logs', label: getTabLabel('audit_logs') },
      ],
    },
  ] : [
    {
      id: 'sales', label: 'المبيعات والعملاء',
      tabs: [
        { id: 'customers', label: getTabLabel('customers') },
        { id: 'cash', label: getTabLabel('cash') },
        { id: 'credit', label: getTabLabel('credit') },
        { id: 'payments', label: getTabLabel('payments') },
        { id: 'statement', label: getTabLabel('statement') },
        { id: 'returns', label: getTabLabel('returns') },
      ],
    },
    {
      id: 'inventory_reports', label: 'المخزون والتقارير',
      tabs: [{ id: 'products', label: getTabLabel('products') }],
    },
  ]

  const handleSaveRep = async (values: RepFormValues) => {
    try {
      if (editingRep?.id) { await updateRep.mutateAsync({ id: editingRep.id, ...values }); showToast('تم تحديث بيانات المندوب بنجاح') }
      else { await addRep.mutateAsync(values); showToast('تمت إضافة المندوب بنجاح') }
      setEditingRep(null)
    } catch (error) { throw new Error(friendlyError(error, 'تعذر حفظ بيانات المندوب، حاول مرة أخرى')) }
  }
  const handleDeleteRep = async (rep: { id: string; name: string }) => {
    if (reps.length <= 1) { showToast('لا يمكن حذف آخر مندوب متبقٍ'); return }
    try {
      await deleteRep.mutateAsync(rep.id)
      if (repFilter === rep.id) setRepFilter('all')
      showToast('تم حذف المندوب')
    } catch { showToast('لم يتم حذف ' + rep.name + ' - تحقق من ارتباطه ببيانات') }
  }

  const roleBadge = isManager
    ? <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 text-white border border-white/20 px-2.5 py-1 text-[11px] font-bold backdrop-blur-sm"><span className="h-2 w-2 rounded-full bg-emerald-400" />مدير النظام</span>
    : <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 text-amber-950 border border-amber-300 px-2.5 py-1 text-[11px] font-bold"><span className="h-2 w-2 rounded-full bg-amber-700" />مندوب مبيعات — عرض فقط</span>

  return (
    <div className="min-h-screen bg-page-bg text-slate-900" dir={document.documentElement.dir || 'rtl'}>
      <header
        className="sticky top-0 z-40 border-b border-[#122e49] text-white shadow-header"
        style={{
          backgroundColor: '#1a4971',
          backgroundImage: 'linear-gradient(135deg, #102a43 0%, #1a4971 60%, #245e8e 100%)',
        }}
      >
        <div className="mx-auto max-w-[1480px] px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="h-10 w-10 rounded-2xl bg-white text-[#1a4971] grid place-items-center font-extrabold text-xl shadow-card border border-white/20 shrink-0">م</div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[11px] text-white/75 font-medium">نظام مبيعات وحسابات بنكهة الفاتورة</p>
                  {roleBadge}
                </div>
                <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-white leading-tight truncate">
                  {settings?.title || (isRep ? `مرحباً، ${repProfile?.name || 'مندوب'}` : 'لوحة إدارة المؤسسة')}
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isManager && (
                <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-2.5 py-1.5 backdrop-blur-sm">
                  <span className="text-xs font-semibold text-white/90">عرض البيانات:</span>
                  <select value={repFilter} onChange={(e) => setRepFilter(e.target.value)} className="app-select min-w-[150px] py-1.5 text-xs bg-white text-slate-800 border-white/30">
                    <option value="all">كل المناديب</option>
                    {reps.map((rep) => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
                  </select>
                </div>
              )}

              <button type="button" onClick={() => setReportAction('print')} className="app-btn-header" title="طباعة تقرير الفواتير">طباعة</button>
              <button type="button" onClick={() => setReportAction('csv')} className="app-btn-header" title="تصدير جدول البيانات CSV">تصدير CSV</button>
              <button type="button" onClick={() => setChangePasswordOpen(true)} className="app-btn-header" title="تغيير كلمة المرور الخاصة بحسابك">كلمة المرور</button>
              <button type="button" onClick={() => { void supabase.auth.signOut() }} className="app-btn-header hover:bg-rose-600/40 hover:border-rose-400/50" title="تسجيل الخروج من الحساب">تسجيل الخروج</button>
            </div>
          </div>

          <AppNavigation groups={navGroups} activeTab={activeTab} onSelectTab={setActiveTab} />
        </div>
      </header>

      {isManager && (
        <div className="border-b border-border bg-slate-50/70">
          <div className="mx-auto max-w-[1480px] px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 me-1">إجراءات سريعة:</span>
            <button type="button" onClick={() => trigger('cash')} className="app-btn app-btn-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-100">+ فاتورة نقدي</button>
            <button type="button" onClick={() => trigger('credit')} className="app-btn app-btn-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-100">+ فاتورة آجل</button>
            <button type="button" onClick={() => trigger('payments')} className="app-btn app-btn-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-100">+ دفعة عميل</button>
            <button type="button" onClick={() => trigger('supplier_purchases')} className="app-btn app-btn-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-100">+ مشتريات مورد</button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1480px] px-4 sm:px-6 lg:px-8 py-6">
        <div className="app-card p-4 sm:p-6 lg:p-7 min-h-[500px]">
          {activeTab === 'cash' && <CashTab repFilter={effectiveRepFilter} reps={reps} showToast={showToast} isReadOnly={isReadOnly} createSignal={pending === 'cash' ? nonce : undefined} onSignalHandled={consume} />}
          {activeTab === 'credit' && <CreditTab repFilter={effectiveRepFilter} reps={reps} showToast={showToast} isReadOnly={isReadOnly} createSignal={pending === 'credit' ? nonce : undefined} onSignalHandled={consume} />}
          {activeTab === 'payments' && <PaymentsTab repFilter={effectiveRepFilter} reps={reps} showToast={showToast} isReadOnly={isReadOnly} createSignal={pending === 'payments' ? nonce : undefined} onSignalHandled={consume} />}
          {activeTab === 'returns' && <ReturnsTab repFilter={effectiveRepFilter} reps={reps} showToast={showToast} isReadOnly={isReadOnly} />}
          {activeTab === 'statement' && <StatementTab repFilter={effectiveRepFilter} />}
          {activeTab === 'monthly' && <MonthlyTab repFilter={effectiveRepFilter} reps={reps} />}
          {activeTab === 'customers' && <CustomersTab showToast={showToast} repFilter={effectiveRepFilter} isReadOnly={isReadOnly} />}
          {activeTab === 'suppliers' && isManager && <SupplierDirectoryTab showToast={showToast} />}
          {activeTab === 'supplier_purchases' && isManager && <SupplierPurchasesTab showToast={showToast} createSignal={pending === 'supplier_purchases' ? nonce : undefined} onSignalHandled={consume} />}
          {activeTab === 'supplier_payments' && isManager && <SupplierPaymentsTab showToast={showToast} />}
          {activeTab === 'supplier_statement' && isManager && <SupplierStatementTab />}
          {activeTab === 'expenses' && isManager && <ExpensesTab showToast={showToast} />}
          {activeTab === 'inventory' && isManager && <InventoryTab />}
          {activeTab === 'reps' && isManager && <RepsTab onAdd={() => { setEditingRep(null); setRepModalOpen(true) }} onEdit={(rep) => { setEditingRep(rep); setRepModalOpen(true) }} onDelete={handleDeleteRep} showToast={showToast} />}
          {activeTab === 'products' && <ProductsTab isReadOnly={isReadOnly} />}
          {activeTab === 'kpi' && isManager && <ManagerDashboardTab />}
          {activeTab === 'audit_logs' && isManager && <AuditLogsTab />}
        </div>
      </main>

      {repModalOpen && <RepModal initialValues={editingRep} onClose={() => { setRepModalOpen(false); setEditingRep(null) }} onSubmit={handleSaveRep} />}
      {reportAction && <ReportModal defaultTab={activeTab} defaultRepFilter={effectiveRepFilter} defaultAction={reportAction} showToast={showToast} onClose={() => setReportAction(null)} />}
      <ChangePasswordModal isOpen={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} onSuccess={(msg) => showToast(msg)} />
      <Toast message={toast} />
    </div>
  )
}
