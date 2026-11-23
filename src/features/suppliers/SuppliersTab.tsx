import { useState } from 'react'
import SupplierDirectoryTab from '@/features/suppliers/SupplierDirectoryTab'
import SupplierPurchasesTab from '@/features/suppliers/SupplierPurchasesTab'
import SupplierPaymentsTab from '@/features/suppliers/SupplierPaymentsTab'
import SupplierStatementTab from '@/features/suppliers/SupplierStatementTab'

type SuppliersSubTab = 'directory' | 'purchases' | 'payments' | 'statement'

const tabs: { id: SuppliersSubTab; label: string }[] = [
  { id: 'directory', label: 'الموردين' },
  { id: 'purchases', label: 'مشتريات الموردين' },
  { id: 'payments', label: 'مدفوعات الموردين' },
  { id: 'statement', label: 'كشف حساب مورد' },
]

export default function SuppliersTab({ showToast }: { showToast: (msg: string) => void }) {
  const [activeTab, setActiveTab] = useState<SuppliersSubTab>('directory')

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">إدارة الموردين</h2>
          <p className="text-xs text-slate-500 mt-0.5">إدارة بيانات الموردين والمشتريات والمدفوعات وكشوف الحساب من مكان واحد.</p>
        </div>
      </div>

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
      {activeTab === 'purchases' && <SupplierPurchasesTab showToast={showToast} />}
      {activeTab === 'payments' && <SupplierPaymentsTab showToast={showToast} />}
      {activeTab === 'statement' && <SupplierStatementTab />}
    </div>
  )
}
