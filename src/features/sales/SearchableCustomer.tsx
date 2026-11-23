import { useState, useRef, useEffect } from 'react'

interface SearchableCustomerProps {
  customers: any[]
  value: string | null
  onChange: (customerId: string) => void
}

export default function SearchableCustomer({ customers, value, onChange }: SearchableCustomerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const customer = customers.find((c: any) => c.id === value)
    if (customer) {
      setSelectedCustomer(customer)
      setSearchTerm(customer.name)
    } else {
      setSelectedCustomer(null)
      if (!isOpen && !value) setSearchTerm('')
    }
  }, [value, customers])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        if (selectedCustomer) {
          setSearchTerm(selectedCustomer.name)
        } else {
          setSearchTerm('')
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selectedCustomer])

  const filteredCustomers = customers
    .filter((c: any) => {
      if (!searchTerm.trim()) return true
      const term = searchTerm.toLowerCase().trim()
      const nameMatch = c.name.toLowerCase().includes(term)
      const phoneMatch = c.phone && c.phone.includes(searchTerm.trim())
      return nameMatch || phoneMatch
    })
    .sort((a: any, b: any) => a.name.localeCompare(b.name, 'ar'))

  const handleSelect = (customer: any) => {
    setSelectedCustomer(customer)
    setSearchTerm(customer.name)
    onChange(customer.id)
    setIsOpen(false)
  }

  const handleClear = () => {
    setSelectedCustomer(null)
    setSearchTerm('')
    onChange('')
    setIsOpen(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSearchTerm(val)
    setIsOpen(true)
    if (!val.trim()) {
      setSelectedCustomer(null)
      onChange('')
    }
  }

  return (
    <div className="relative" ref={dropdownRef} dir="rtl">
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder="ابحث عن عميل بالاسم أو الهاتف..."
          className="app-input pe-8 text-xs sm:text-sm"
        />
        {(searchTerm || selectedCustomer) && (
          <button
            onClick={handleClear}
            className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs h-5 w-5 rounded-full flex items-center justify-center transition-colors"
            type="button"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200/90 rounded-2xl shadow-float max-h-60 overflow-y-auto animate-fade-in-up">
          {filteredCustomers.length === 0 ? (
            <div className="p-4 text-slate-400 text-xs text-center">لا توجد نتائج مطابقة</div>
          ) : (
            filteredCustomers.map((customer: any) => (
              <div
                key={customer.id}
                onClick={() => handleSelect(customer)}
                className="p-3 hover:bg-primary-50/70 cursor-pointer border-b border-slate-100 last:border-0 transition-colors flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-slate-800 text-xs sm:text-sm">{customer.name}</div>
                  {customer.phone && (
                    <div className="text-[11px] text-slate-400 font-mono" dir="ltr">
                      {customer.phone}
                    </div>
                  )}
                </div>
                {customer.id === value && (
                  <span className="text-xs text-primary-600 font-bold flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                    <span>محدد</span>
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
