import { useEffect, useState } from 'react'
import SupplierDirectoryTab from '@/features/suppliers/SupplierDirectoryTab'
import SupplierPurchasesTab from '@/features/suppliers/SupplierPurchasesTab'
import SupplierPaymentsTab from '@/features/suppliers/SupplierPaymentsTab'
import SupplierStatementTab from '@/features/suppliers/SupplierStatementTab'
import PageHeader from '@/shared/ui/PageHeader'

type SuppliersSubTab = 'directory' | 'purchases' | 'payments' | 'statement'

const tabs: { id: SuppliersSubTab; label: string }[] = [
  { id: 'directory', label: 'دليل الموردين' },
  { id: 'purchases', label: 'مشتريات الموردين' },
  { id: 'payments', label: 'مدفوعات الموردين' },
  { id: 'statement', label: 'كشف حساب مورد' },
]

export default function SuppliersTab({ showToast, createSignal }: { showToast: (msg: string) => void; createSignal?: number }) {
  const [activeTab, setActiveTab] = useState<SuppliersSubTab>('directory')
  useEffect(() => { if (createSignal) setActiveTab('purchases') }, [createSignal])

  return (
    <div className="space-y-5">
      <PageHeader
        title="إدارة الموردين"
        subtitle="إدارة بيانات الموردين والمشتريات والمدفوعات وكشوف الحساب من مكان واحد."
      />

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {tabs.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors border ${
                active
                  ? 'bg-[#1a4971] text-white border-[#1a4971] shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'directory' && <SupplierDirectoryTab showToast={showToast} />}
      {activeTab === 'purchases' && <SupplierPurchasesTab showToast={showToast} createSignal={createSignal} />}
      {activeTab === 'payments' && <SupplierPaymentsTab showToast={showToast} />}
      {activeTab === 'statement' && <SupplierStatementTab />}
    </div>
  )
}
