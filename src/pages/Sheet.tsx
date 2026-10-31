import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useSettings, useReps, useDeleteRep, useAddRep, useUpdateRep } from '../hooks/useData'
import { Navigate } from 'react-router-dom'
import CashTab from '../components/tabs/CashTab'
import CreditTab from '../components/tabs/CreditTab'
import PaymentsTab from '../components/tabs/PaymentsTab'
import StatementTab from '../components/tabs/StatementTab'
import MonthlyTab from '../components/tabs/MonthlyTab'
import CustomersTab from '../components/tabs/CustomersTab'
import SuppliersTab from '../components/tabs/SuppliersTab'
import ExpensesTab from '../components/tabs/ExpensesTab'
import ProductsTab from '../components/tabs/ProductsTab'
import ManagerDashboardTab from '../components/tabs/ManagerDashboardTab'
import RepsTab from '../components/tabs/RepsTab'
import Toast from '../components/Toast'
import ReportModal from '../components/ReportModal'
import RepModal from '../components/RepModal'
import { useToast } from '../hooks/useToast'
import { friendlyError } from '../lib/errors'
import type { RepFormValues } from '../types/reps'

import { supabase } from '../lib/supabase'

function AuthNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-page-bg px-6 text-center" dir="rtl">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <h1 className="text-lg font-bold text-ink">{title}</h1>
        <p className="mt-2 text-sm text-slate-600 leading-6">{message}</p>
        <button
          type="button"
          onClick={() => { void supabase.auth.signOut() }}
          className="mt-6 w-full rounded-xl bg-[#1a4971] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#102a43] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a4971]"
        >
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
  const [activeTab, setActiveTab] = useState('cash')
  const [repFilter, setRepFilter] = useState<string>('all')
  const [reportAction, setReportAction] = useState<'print' | 'csv' | null>(null)
  const [repModalOpen, setRepModalOpen] = useState(false)
  const [editingRep, setEditingRep] = useState<(RepFormValues & { id?: string }) | null>(null)

  // For Reps, repFilter is permanently fixed to their rep ID
  const effectiveRepFilter = isRep && repProfile?.id ? repProfile.id : repFilter

  if (authLoading || settingsLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-page-bg text-slate-600 gap-3">
        <div className="h-10 w-10 border-4 border-slate-200 border-t-blue-700 rounded-full animate-spin" />
        <span className="font-semibold text-sm">جاري تحميل بيانات النظام...</span>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!role) {
    return (
      <AuthNotice
        title="لا تملك صلاحية الوصول"
        message="هذا الحساب غير مرتبط بأي صلاحية (مدير أو مندوب). يرجى التواصل مع المدير لتفعيل حسابك."
      />
    )
  }

  if (isRep && !repProfile) {
    return (
      <AuthNotice
        title="الحساب غير مرتبط بمندوب"
        message="تم تسجيل الدخول بنجاح، لكن لم يتم ربط حسابك ببيانات مندوب. يرجى التواصل مع المدير."
      />
    )
  }

  const defaultTabNames: Record<string, string> = {
    cash: 'البيع النقدي',
    credit: 'البيع الآجل',
    payments: 'الدفعات',
    statement: 'كشف حساب العملاء',
    monthly: 'الملخص الشهري',
    customers: 'العملاء',
    reps: 'إدارة المناديب',
    suppliers: 'الموردين',
    expenses: 'المصاريف',
    products: 'قائمة الأسعار والكتالوج',
    kpi: 'مؤشرات الأداء المالي (KPIs)',
  }

  const customTabNames =
    typeof settings?.tab_names === 'object' && settings?.tab_names !== null
      ? (settings.tab_names as Record<string, string>)
      : {}

  const getTabLabel = (key: string) => {
    return customTabNames[key] || defaultTabNames[key] || key
  }

  // Available tabs based on role:
  // Managers see all tabs including suppliers and executive KPI dashboard.
  // Sales reps only see cash, credit, payments, statement, customers, and products catalog.
  const availableTabs = isManager
    ? ['cash', 'credit', 'payments', 'statement', 'monthly', 'customers', 'reps', 'suppliers', 'expenses', 'products', 'kpi']
    : ['cash', 'credit', 'payments', 'statement', 'customers', 'products']

  const handleSaveRep = async (values: RepFormValues) => {
    try {
      if (editingRep?.id) {
        await updateRep.mutateAsync({ id: editingRep.id, ...values })
        showToast('تم تحديث بيانات المندوب بنجاح')
      } else {
        await addRep.mutateAsync(values)
        showToast('تمت إضافة المندوب بنجاح')
      }
      setEditingRep(null)
    } catch (error) {
      throw new Error(friendlyError(error, 'تعذر حفظ بيانات المندوب، حاول مرة أخرى'))
    }
  }

  const handleDeleteRep = async (rep: { id: string; name: string }) => {
    if (reps.length <= 1) {
      showToast('يجب الاحتفاظ بمندوب واحد على الأقل')
      return
    }
    try {
      await deleteRep.mutateAsync(rep.id)
      if (repFilter === rep.id) {
        setRepFilter('all')
      }
      showToast('تم حذف المندوب')
    } catch {
      showToast('لا يمكن حذف ' + rep.name + ' - مرتبط بفواتير موجودة')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="min-h-screen bg-page-bg text-ink" dir="rtl">
      {/* Header with explicit solid navy background */}
      <header
        className="sticky top-0 z-30 border-b border-[#122e49] text-white shadow-header"
        style={{
          backgroundColor: '#1a4971',
          backgroundImage: 'linear-gradient(135deg, #102a43 0%, #1a4971 60%, #245e8e 100%)',
        }}
      >
        <div className="mx-auto max-w-[1480px] px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Logo and system title */}
            <div className="flex items-center gap-3.5">
              <div className="h-11 w-11 rounded-2xl bg-white text-[#1a4971] grid place-items-center font-extrabold text-xl shadow-card border border-white/20">
                م
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-white">
                  {settings?.title || 'المؤسسة المصرية لتوزيع المواد الغذائية'}
                </h1>
                <p className="text-xs text-white/80 font-medium">نظام مبيعات وحسابات بقيمة الفاتورة</p>
              </div>
            </div>

            {/* User status & Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {isRep ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-400 text-amber-950 font-bold rounded-xl text-xs shadow-sm border border-amber-300">
                  <span className="h-2 w-2 rounded-full bg-amber-700" />
                  <span>المندوب: {repProfile?.name} (عرض مقيد)</span>
                </div>
              ) : (
                <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 bg-white/15 text-white border border-white/20 rounded-xl text-xs font-semibold backdrop-blur-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span>وضع المدير (صلاحيات كاملة)</span>
                </div>
              )}

              <button
                onClick={() => setReportAction('print')}
                className="app-btn-header"
                title="طباعة تقرير الفواتير"
              >
                طباعة
              </button>

              <button
                onClick={() => setReportAction('csv')}
                className="app-btn-header"
                title="تصدير جدول البيانات CSV"
              >
                تصدير CSV
              </button>

              <button
                onClick={handleLogout}
                className="app-btn-header hover:bg-rose-600/40 hover:border-rose-400/50"
                title="تسجيل الخروج من الحساب"
              >
                تسجيل الخروج
              </button>
            </div>
          </div>

          {/* Tab Navigation Pill Bar */}
          <div className="mt-3.5 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {availableTabs.map((tab) => {
              const active = activeTab === tab
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-xl whitespace-nowrap text-xs sm:text-sm font-semibold transition-all duration-150 ${
                    active
                      ? 'bg-white text-[#1a4971] shadow-float font-bold'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  {getTabLabel(tab)}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      {/* Rep filter ribbon (managers only) — sits directly under the tabs ribbon */}
      {isManager && (
        <div className="border-b border-slate-200 bg-white/95 shadow-sm">
          <div className="mx-auto flex max-w-[1480px] items-center gap-2 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8 scrollbar-none">
            <span className="shrink-0 text-[11px] font-bold text-slate-500 whitespace-nowrap">
              فلترة المناديب:
            </span>
            <button
              onClick={() => setRepFilter('all')}
              className={`shrink-0 rounded-lg px-3 py-1 text-xs font-bold transition-colors ${
                repFilter === 'all'
                  ? 'bg-[#1a4971] text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              جميع المناديب
            </button>
            {reps.map((rep) => {
              const isSelected = repFilter === rep.id
              return (
                <button
                  key={rep.id}
                  onClick={() => setRepFilter(rep.id)}
                  title={rep.email || rep.name}
                  className={`shrink-0 rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                    isSelected
                      ? 'bg-[#1a4971] text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  } ${rep.is_active === false ? 'opacity-55' : ''}`}
                >
                  {rep.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="mx-auto max-w-[1480px] px-4 sm:px-6 lg:px-8 py-6">
        {/* Tab Content Container */}
        <div className="app-card p-5 sm:p-7 min-h-[500px]">
          {activeTab === 'cash' && (
            <CashTab
              repFilter={effectiveRepFilter}
              reps={reps}
              showToast={showToast}
              isReadOnly={isReadOnly}
            />
          )}
          {activeTab === 'credit' && (
            <CreditTab
              repFilter={effectiveRepFilter}
              reps={reps}
              showToast={showToast}
              isReadOnly={isReadOnly}
            />
          )}
          {activeTab === 'payments' && (
            <PaymentsTab
              repFilter={effectiveRepFilter}
              reps={reps}
              showToast={showToast}
              isReadOnly={isReadOnly}
            />
          )}
          {activeTab === 'statement' && <StatementTab repFilter={effectiveRepFilter} />}
          {activeTab === 'monthly' && <MonthlyTab repFilter={effectiveRepFilter} reps={reps} />}
          {activeTab === 'customers' && (
            <CustomersTab
              showToast={showToast}
              repFilter={effectiveRepFilter}
              isReadOnly={isReadOnly}
            />
          )}
          {activeTab === 'suppliers' && isManager && <SuppliersTab showToast={showToast} />}
          {activeTab === 'expenses' && isManager && <ExpensesTab showToast={showToast} />}
          {activeTab === 'reps' && isManager && (
            <RepsTab
              onAdd={() => {
                setEditingRep(null)
                setRepModalOpen(true)
              }}
              onEdit={(rep) => {
                setEditingRep(rep)
                setRepModalOpen(true)
              }}
              onDelete={handleDeleteRep}
              showToast={showToast}
            />
          )}
          {activeTab === 'products' && (
            <ProductsTab isReadOnly={isReadOnly} />
          )}
          {activeTab === 'kpi' && isManager && <ManagerDashboardTab />}
        </div>
      </main>

      {repModalOpen && (
        <RepModal
          initialValues={editingRep}
          onClose={() => {
            setRepModalOpen(false)
            setEditingRep(null)
          }}
          onSubmit={handleSaveRep}
        />
      )}

      {reportAction && (
        <ReportModal
          defaultTab={activeTab}
          defaultRepFilter={effectiveRepFilter}
          defaultAction={reportAction}
          showToast={showToast}
          onClose={() => setReportAction(null)}
        />
      )}

      <Toast message={toast} />
    </div>
  )
}
