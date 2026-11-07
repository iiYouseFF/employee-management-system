import React, { useState, useMemo } from 'react'
import {
  useProducts,
  useAddProduct,
  useUpdateProduct,
  useDeleteProduct,
  type Product,
} from '../../hooks/useProducts'
import { formatNumber } from '../../lib/format'
import Modal from '../Modal'
import CategorySelect from '../CategorySelect'

interface ProductsTabProps {
  isReadOnly?: boolean
}

export default function ProductsTab({ isReadOnly = false }: ProductsTabProps) {
  const { data: products = [], isLoading } = useProducts()
  const addProduct = useAddProduct()
  const updateProduct = useUpdateProduct()
  const deleteProduct = useDeleteProduct()

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const [form, setForm] = useState({
    name_ar: '',
    name_en: '',
    sku: '',
    category: '',
    unit: 'قطعة',
    price: 0,
    is_active: true,
  })

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>()
    products.forEach((p: Product) => {
      if (p.category) set.add(p.category)
    })
    return Array.from(set)
  }, [products])

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p: Product) => {
      const matchSearch =
        p.name_ar.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.name_en && p.name_en.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()))
      const matchCat =
        selectedCategory === 'all' || p.category === selectedCategory
      return matchSearch && matchCat
    })
  }, [products, searchTerm, selectedCategory])

  const openModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product)
      setForm({
        name_ar: product.name_ar,
        name_en: product.name_en || '',
        sku: product.sku || '',
        category: product.category || '',
        unit: product.unit || 'قطعة',
        price: Number(product.price),
        is_active: product.is_active,
      })
    } else {
      setEditingProduct(null)
      setForm({
        name_ar: '',
        name_en: '',
        sku: '',
        category: '',
        unit: 'قطعة',
        price: 0,
        is_active: true,
      })
    }
    setModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name_ar.trim() || form.price < 0) return

    if (editingProduct) {
      await updateProduct.mutateAsync({
        id: editingProduct.id,
        name_ar: form.name_ar,
        name_en: form.name_en || null,
        sku: form.sku || null,
        category: form.category || null,
        unit: form.unit || null,
        price: form.price,
        is_active: form.is_active,
      })
    } else {
      await addProduct.mutateAsync({
        name_ar: form.name_ar,
        name_en: form.name_en || null,
        sku: form.sku || null,
        category: form.category || null,
        unit: form.unit || 'قطعة',
        price: form.price,
        is_active: form.is_active,
        sort_order: products.length + 1,
      })
    }
    setModalOpen(false)
  }

  const handlePrintCatalog = () => {
    window.print()
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header & Controls (Hidden when printing) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-800">قائمة الأسعار والكتالوج المعتمد</h2>
          <span className="badge badge-primary">{filteredProducts.length} صنف</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <input
              type="text"
              placeholder="بحث باسم الصنف أو SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="app-input py-2 text-xs sm:text-sm"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="app-select py-2 text-xs sm:text-sm w-auto"
          >
            <option value="all">جميع التصنيفات</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <button
            onClick={handlePrintCatalog}
            className="app-btn app-btn-ghost py-2 text-xs sm:text-sm flex items-center gap-1.5"
            title="طباعة كتالوج ورقي منسق لمندوبي المبيعات"
          >
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            <span>طباعة القائمة (A4)</span>
          </button>

          {!isReadOnly && (
            <button
              onClick={() => openModal()}
              className="app-btn app-btn-primary py-2 text-xs sm:text-sm shadow-sm"
            >
              <span>+</span>
              <span>إضافة صنف جديد</span>
            </button>
          )}
        </div>
      </div>

      {/* Printable Catalog Header (Only visible on physical print/PDF) */}
      <div className="hidden print:block text-center border-b-2 border-slate-800 pb-4 mb-6">
        <h1 className="text-2xl font-black text-slate-900 mb-1">المؤسسة المصرية لتوزيع المواد الغذائية</h1>
        <h2 className="text-lg font-bold text-slate-700">قائمة أسعار المنتجات المعتمدة لعملاء المبيعات</h2>
        <div className="flex justify-between items-center text-xs text-slate-500 mt-3 pt-2 border-t border-slate-200">
          <span>التصنيف المطبوع: {selectedCategory === 'all' ? 'جميع المنتجات' : selectedCategory}</span>
          <span>تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</span>
        </div>
      </div>

      {/* Modern Products Table */}
      <div className="overflow-x-auto rounded-2xl border border-border shadow-sm print:border-none print:shadow-none">
        <table className="app-table">
          <thead>
            <tr>
              <th className="w-12 text-center">#</th>
              <th>اسم الصنف (بالعربية)</th>
              <th className="text-start">الاسم بالإنجليزية</th>
              <th className="text-center w-28">كود الصنف (SKU)</th>
              <th className="text-center">التصنيف</th>
              <th className="text-center w-20">الوحدة</th>
              <th className="text-center font-bold w-36 text-primary-800">سعر البيع المعتمد</th>
              {!isReadOnly && (
                <th className="text-center w-28 print:hidden">إجراءات</th>
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={isReadOnly ? 7 : 8} className="py-12 text-center text-slate-400">
                  <div className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
                    <span>جاري تحميل قائمة الأسعار...</span>
                  </div>
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={isReadOnly ? 7 : 8} className="py-12 text-center text-slate-400">
                  لا توجد أصناف مطابقة لشروط البحث أو التصنيف المختار.
                </td>
              </tr>
            ) : (
              filteredProducts.map((p: Product, index: number) => (
                <tr
                  key={p.id}
                  className="print:break-inside-avoid"
                >
                  <td className="text-center font-mono text-xs text-slate-400">{index + 1}</td>
                  <td className="font-bold text-slate-900">{p.name_ar}</td>
                  <td className="text-slate-500 text-xs font-sans" dir="ltr">{p.name_en || '-'}</td>
                  <td className="text-center font-mono text-xs text-slate-700" dir="ltr">
                    {p.sku ? (
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                        {p.sku}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="text-center">
                    {p.category ? (
                      <span className="badge badge-neutral text-xs font-medium">
                        {p.category}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="text-center text-slate-600 text-xs">{p.unit || 'قطعة'}</td>
                  <td className="text-center font-mono font-extrabold text-base text-primary-800 print:text-black whitespace-nowrap">
                    {formatNumber(p.price)} <span className="text-xs font-normal text-slate-500">ج.م</span>
                  </td>
                  {!isReadOnly && (
                    <td className="text-center print:hidden">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openModal(p)}
                          className="app-btn app-btn-sm app-btn-ghost text-xs hover:border-blue-400 hover:text-blue-700"
                          title="تعديل بيانات الصنف أو سعره"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`هل أنت متأكد من حذف الصنف ${p.name_ar}؟`)) {
                              await deleteProduct.mutateAsync(p.id)
                            }
                          }}
                          className="app-btn app-btn-sm app-btn-ghost text-xs text-rose-600 hover:bg-rose-50 hover:border-rose-300"
                          title="حذف الصنف من القائمة"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal for Add / Edit Product */}
      {modalOpen && (
        <Modal
          onClose={() => setModalOpen(false)}
          title={editingProduct ? 'تعديل بيانات الصنف وسعر البيع' : 'إضافة صنف جديد لقائمة الأسعار'}
        >
          <form onSubmit={handleSave} className="space-y-4" dir="rtl">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                اسم الصنف (بالعربية) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.name_ar}
                onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                className="app-input"
                placeholder="مثال: زيت طعام 1 لتر"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                اسم الصنف (English Name)
              </label>
              <input
                type="text"
                value={form.name_en}
                onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                className="app-input"
                dir="ltr"
                placeholder="e.g. Cooking Oil 1L"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">كود الصنف (SKU)</label>
                <input
                  type="text"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className="app-input font-mono"
                  dir="ltr"
                  placeholder="OIL-001"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">التصنيف</label>
                <CategorySelect
                  value={form.category}
                  onChange={(val) => setForm({ ...form, category: val })}
                  isManager={!isReadOnly}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">الوحدة</label>
                <input
                  type="text"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="app-input"
                  placeholder="قطعة، كرتونة، كجم..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  سعر البيع المعتمد (ج.م) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={form.price || ''}
                  onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                  className="app-input font-mono font-bold"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="app-btn app-btn-ghost px-5"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="app-btn app-btn-primary px-6 font-bold"
              >
                {editingProduct ? 'حفظ التعديلات' : 'إضافة الصنف'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
