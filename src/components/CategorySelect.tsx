import { useState, useRef, useEffect } from 'react'
import {
  useProductCategories,
  useAddProductCategory,
  useUpdateProductCategory,
  useDeleteProductCategory,
  type ProductCategory,
} from '../hooks/useProductCategories'

interface CategorySelectProps {
  value: string
  onChange: (value: string) => void
  isManager?: boolean
}

export default function CategorySelect({ value, onChange, isManager = false }: CategorySelectProps) {
  const { data: categories = [], isLoading } = useProductCategories()
  const addCategory = useAddProductCategory()
  const updateCategory = useUpdateProductCategory()
  const deleteCategory = useDeleteProductCategory()

  const [open, setOpen] = useState(false)
  const [manageMode, setManageMode] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [addError, setAddError] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
  const newInputRef = useRef<HTMLInputElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setManageMode(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Focus new input when manage mode opens
  useEffect(() => {
    if (manageMode && newInputRef.current) newInputRef.current.focus()
  }, [manageMode])

  const selectedLabel = categories.find((c) => c.name === value)?.name ?? value

  const handleSelect = (name: string) => {
    onChange(name)
    setOpen(false)
    setManageMode(false)
  }

  const handleClear = () => {
    onChange('')
    setOpen(false)
  }

  const handleAdd = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setAddError('هذا التصنيف موجود بالفعل')
      return
    }
    setAddError('')
    const created = await addCategory.mutateAsync(trimmed)
    setNewName('')
    onChange(created.name)
  }

  const handleSaveEdit = async (cat: ProductCategory) => {
    const trimmed = editingName.trim()
    if (!trimmed || trimmed === cat.name) {
      setEditingId(null)
      return
    }
    await updateCategory.mutateAsync({ id: cat.id, name: trimmed })
    // If the edited category was selected, update selection
    if (value === cat.name) onChange(trimmed)
    setEditingId(null)
  }

  const handleDelete = async (cat: ProductCategory) => {
    if (!confirm(`حذف التصنيف "${cat.name}"؟`)) return
    await deleteCategory.mutateAsync(cat.id)
    if (value === cat.name) onChange('')
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setManageMode(false) }}
        className="app-input w-full flex items-center justify-between gap-2 text-start cursor-pointer"
      >
        <span className={value ? 'text-slate-800 font-medium' : 'text-slate-400'}>
          {value ? selectedLabel : 'اختر تصنيفاً...'}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] bg-white border border-slate-200 rounded-xl shadow-modal overflow-hidden animate-scale-in">

          {/* ── Category list ────────────────────────── */}
          {!manageMode && (
            <>
              <div className="max-h-52 overflow-y-auto py-1">
                {isLoading ? (
                  <div className="px-4 py-3 text-xs text-slate-400">جاري التحميل...</div>
                ) : categories.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-slate-400">لا توجد تصنيفات بعد</div>
                ) : (
                  <>
                    {/* Clear option */}
                    <button
                      type="button"
                      onClick={handleClear}
                      className="w-full text-start px-4 py-2.5 text-xs text-slate-400 hover:bg-slate-50 transition-colors"
                    >
                      — بدون تصنيف
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleSelect(cat.name)}
                        className={`w-full text-start px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-between gap-2 ${
                          value === cat.name
                            ? 'bg-primary-50 text-primary-800'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {cat.name}
                        {value === cat.name && (
                          <svg className="w-4 h-4 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </>
                )}
              </div>

              {/* Manager: "Manage categories" button */}
              {isManager && (
                <div className="border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setManageMode(true)}
                    className="w-full px-4 py-2.5 text-xs font-bold text-primary-700 hover:bg-primary-50 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    إدارة التصنيفات
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Manage panel (manager only) ───────────── */}
          {manageMode && isManager && (
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-700">إدارة التصنيفات</span>
                <button
                  type="button"
                  onClick={() => { setManageMode(false); setAddError('') }}
                  className="text-slate-400 hover:text-slate-700 transition-colors"
                  title="رجوع"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              </div>

              {/* Add new category */}
              <div className="flex gap-1.5">
                <input
                  ref={newInputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => { setNewName(e.target.value); setAddError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAdd() } }}
                  className="app-input py-1.5 text-sm flex-1 min-w-0"
                  placeholder="اسم التصنيف الجديد..."
                />
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={addCategory.isPending || !newName.trim()}
                  className="app-btn app-btn-primary py-1.5 px-3 text-xs font-bold shrink-0"
                >
                  {addCategory.isPending ? '...' : 'إضافة'}
                </button>
              </div>
              {addError && <p className="text-xs text-rose-600">{addError}</p>}

              {/* Existing categories list */}
              <div className="max-h-44 overflow-y-auto space-y-1 mt-1">
                {categories.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-2">لا توجد تصنيفات بعد</p>
                )}
                {categories.map((cat) => (
                  <div key={cat.id} className="flex items-center gap-1.5 group">
                    {editingId === cat.id ? (
                      <>
                        <input
                          autoFocus
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); void handleSaveEdit(cat) }
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          className="app-input py-1 text-sm flex-1 min-w-0"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(cat)}
                          disabled={updateCategory.isPending}
                          className="app-btn app-btn-sm app-btn-primary py-1 px-2 text-xs font-bold"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="app-btn app-btn-sm app-btn-ghost py-1 px-2 text-xs"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-slate-700 truncate">{cat.name}</span>
                        <button
                          type="button"
                          onClick={() => { setEditingId(cat.id); setEditingName(cat.name) }}
                          className="opacity-0 group-hover:opacity-100 app-btn app-btn-sm app-btn-ghost py-1 px-2 text-xs text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-opacity"
                          title="تعديل"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(cat)}
                          disabled={deleteCategory.isPending}
                          className="opacity-0 group-hover:opacity-100 app-btn app-btn-sm app-btn-ghost py-1 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition-opacity"
                          title="حذف"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
