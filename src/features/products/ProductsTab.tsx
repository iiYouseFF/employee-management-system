import React, { useState, useMemo, useEffect } from 'react'
import {
  useProducts,
  useAddProduct,
  useUpdateProduct,
  useDeleteProduct,
  type Product,
} from '@/features/products/useProducts'
import { useSettings } from '@/features/settings/useSettings'
import { formatNumber } from '@/shared/lib/format'
import Modal from '@/shared/ui/Modal'
import CategorySelect from '@/features/products/CategorySelect'
import WhatsAppShareButton from '@/shared/ui/WhatsAppShareButton'
import { printProductCatalog, shareProductCatalogWhatsApp } from '@/features/reporting/pdfGenerators'
import Pagination from '@/shared/ui/Pagination'
import PageHeader from '@/shared/ui/PageHeader'
import FilterToolbar from '@/shared/ui/FilterToolbar'
import ResponsiveDataView from '@/shared/ui/ResponsiveDataView'
import { useProductStock, type ProductStockRow } from '@/features/inventory/useInventory'
import ProductConsumptionModal from '@/features/products/ProductConsumptionModal'

interface ProductsTabProps {
  isReadOnly?: boolean
}

export default function ProductsTab({ isReadOnly = false }: ProductsTabProps) {
  const { data: products = [], isLoading, error } = useProducts()
  // Rep-facing tab: never fetch manager-only cost/valuation data.
  const { data: stockRows = [] } = useProductStock({ enabled: !isReadOnly })
  const { data: settings } = useSettings()
  const addProduct = useAddProduct()
  const updateProduct = useUpdateProduct()
  const deleteProduct = useDeleteProduct()

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [analyticsProduct, setAnalyticsProduct] = useState<Product | null>(null)
  const [sharing, setSharing] = useState(false)

  const [form, setForm] = useState({
    name_ar: '',
    name_en: '',
    sku: '',
    category: '',
    unit: 'قطعة',
    price: 0,
    min_stock_alert: 0,
    expiry_date: '',
    batch_number: '',
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

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedCategory])

  const totalPages = Math.ceil(filteredProducts.length / pageSize) || 1
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredProducts.slice(start, start + pageSize)
  }, [filteredProducts, currentPage, pageSize])

  const stockFor = (productId: string) =>
    (stockRows as ProductStockRow[]).find((row) => row.product_id === productId)?.on_hand ?? null

  const hasActiveFilters = !!searchTerm.trim() || selectedCategory !== 'all'

  const resetFilters = () => {
    setSearchTerm('')
    setSelectedCategory('all')
    setCurrentPage(1)
  }

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
        min_stock_alert: Number(product.min_stock_alert || 0),
        expiry_date: product.expiry_date || '',
        batch_number: product.batch_number || '',
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
        min_stock_alert: 0,
        expiry_date: '',
        batch_number: '',
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
        min_stock_alert: form.min_stock_alert,
        expiry_date: form.expiry_date || null,
        batch_number: form.batch_number || null,
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
        min_stock_alert: form.min_stock_alert,
        expiry_date: form.expiry_date || null,
        batch_number: form.batch_number || null,
        is_active: form.is_active,
        sort_order: products.length + 1,
      })
    }
    setModalOpen(false)
  }

  const handlePrintCatalog = async () => {
    if (!filteredProducts || filteredProducts.length === 0) return
    await printProductCatalog({
      products: filteredProducts,
      categoryFilter: selectedCategory,
      companyName: settings?.title || 'شركة توريد',
    })
  }

  const handleShareWhatsApp = async () => {
    if (!filteredProducts || filteredProducts.length === 0) return
    setSharing(true)
    try {
      await shareProductCatalogWhatsApp({
        products: filteredProducts,
        categoryFilter: selectedCategory,
        companyName: settings?.title || 'شركة توريد',
      })
    } catch (err) {
      console.error('Failed to share product catalog via WhatsApp:', err)
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header & Controls (Hidden when printing) */}
      <PageHeader
        title="قائمة الأسعار والكتالوج المعتمد"
        count={`${filteredProducts.length} صنف`}
        actions={
          <>
            <button
              onClick={handlePrintCatalog}
              className="app-btn app-btn-ghost py-2 text-xs sm:text-sm flex items-center gap-1.5"
              title="طباعة كتالوج ورقي منسق لمندوبي المبيعات"
            >
              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              <span>طباعة القائمة (A4)</span>
            </button>

            <WhatsAppShareButton
              onClick={handleShareWhatsApp}
              loading={sharing}
              label="مشاركة الكتالوج (PDF)"
              title="مشاركة كتالوج المنتجات كملف PDF عبر واتساب"
            />

            {!isReadOnly && (
              <button
                onClick={() => openModal()}
                className="app-btn app-btn-primary py-2 text-xs sm:text-sm shadow-sm"
              >
                <span>+</span>
                <span>إضافة صنف جديد</span>
              </button>
            )}
          </>
        }
      />

      <FilterToolbar
        search={searchTerm}
        onSearchChange={(v) => { setSearchTerm(v); setCurrentPage(1) }}
        searchPlaceholder="بحث باسم الصنف أو SKU..."
        onReset={resetFilters}
        hasActiveFilters={hasActiveFilters}
      >
        <select
          value={selectedCategory}
          onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1) }}
          className="app-select py-2 text-xs sm:text-sm w-auto"
        >
          <option value="all">جميع التصنيفات</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </FilterToolbar>

      {/* Catalog screen header is handled by the unified print/PDF template */}

      <ResponsiveDataView
        loading={isLoading}
        error={error ? 'تعذّر تحميل قائمة الأسعار. أعد المحاولة لاحقاً.' : undefined}
        hasData={filteredProducts.length > 0}
        empty="لا توجد أصناف مطابقة لشروط البحث أو التصنيف المختار."
        table={(
          <>
      {/* Desktop Products Table */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-border shadow-sm">
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
              <th className="text-center w-40">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <div className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
                    <span>جاري تحميل قائمة الأسعار...</span>
                  </div>
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  لا توجد أصناف مطابقة لشروط البحث أو التصنيف المختار.
                </td>
              </tr>
            ) : (
              paginatedProducts.map((p: Product, index: number) => (
                <tr key={p.id}>
                  <td className="text-center font-mono text-xs text-slate-400">
                    {(currentPage - 1) * pageSize + index + 1}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => setAnalyticsProduct(p)}
                      className="font-bold text-slate-900 hover:text-primary-700 text-start"
                      title="فتح تحليل مبيعات الصنف"
                    >
                      {p.name_ar}
                    </button>
                  </td>
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
                  <td className="text-center font-mono font-extrabold text-base text-primary-800 whitespace-nowrap">
                    {formatNumber(p.price)} <span className="text-xs font-normal text-slate-500">ج.م</span>
                  </td>
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => setAnalyticsProduct(p)}
                        className="app-btn app-btn-sm app-btn-ghost text-xs hover:border-primary-400 hover:text-primary-700"
                        title="تحليل مبيعات الصنف"
                      >
                        تحليل المبيعات
                      </button>
                      {!isReadOnly && (
                        <>
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
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards View */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="bg-card rounded-2xl border border-border p-8 text-center text-slate-400">
            <div className="inline-flex items-center gap-2">
              <span className="h-4 w-4 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
              <span>جاري تحميل قائمة الأسعار...</span>
            </div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-8 text-center text-slate-400">
            لا توجد أصناف مطابقة لشروط البحث أو التصنيف المختار.
          </div>
        ) : (
          paginatedProducts.map((p: Product, index: number) => (
            <div
              key={p.id}
              className="bg-card rounded-2xl p-4 border border-border shadow-xs hover:border-primary-300 transition-all space-y-3"
            >
              {/* Header: Name, Unit/Category, Price */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-slate-400">
                      #{(currentPage - 1) * pageSize + index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAnalyticsProduct(p)}
                      className="font-bold text-slate-900 text-sm text-start hover:text-primary-700"
                    >
                      {p.name_ar}
                    </button>
                  </div>
                  {p.name_en && (
                    <p className="text-xs text-slate-500 font-sans" dir="ltr">{p.name_en}</p>
                  )}
                </div>
                <div className="text-end">
                  <span className="font-mono font-black text-base text-primary-800">
                    {formatNumber(p.price)}
                  </span>
                  <span className="text-xs text-slate-500 ms-1">ج.م</span>
                </div>
              </div>

              {/* Badges: Category, Unit, SKU */}
              <div className="flex items-center gap-1.5 flex-wrap text-xs pt-1 border-t border-border/40">
                {p.category && (
                  <span className="badge badge-neutral text-xs">
                    {p.category}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
                  الوحدة: {p.unit || 'قطعة'}
                </span>
                {p.sku && (
                  <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200" dir="ltr">
                    {p.sku}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50 flex-wrap">
                <button
                  onClick={() => setAnalyticsProduct(p)}
                  className="app-btn app-btn-sm app-btn-ghost text-xs hover:border-primary-400 hover:text-primary-700"
                >
                  تحليل المبيعات
                </button>
                {!isReadOnly && (
                  <>
                    <button
                      onClick={() => openModal(p)}
                      className="app-btn app-btn-sm app-btn-ghost text-xs hover:border-blue-400 hover:text-blue-700"
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
                    >
                      حذف
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Printing uses the unified report template via printProductCatalog() */}

          </>
        )}
        footer={
          <div>
            {/* Pagination Controls */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredProducts.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        }
      />

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

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>تنبيهات المخزون وتاريخ الصلاحية</span>
                <span className="text-[10px] text-slate-400 font-normal">اختياري</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حد تنبيه المخزون</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.min_stock_alert || ''}
                    onChange={(e) => setForm({ ...form, min_stock_alert: parseFloat(e.target.value) || 0 })}
                    className="app-input font-mono text-xs"
                    placeholder="مثال: 10"
                  />
                  <span className="text-[10px] text-slate-400">تنبيه عند وصول الرصيد لهذا الحد</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ انتهاء الصلاحية</label>
                  <input
                    type="date"
                    value={form.expiry_date}
                    onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                    className="app-input text-xs"
                  />
                  <span className="text-[10px] text-slate-400">تنبيه قبل الانتهاء بـ 30 يوماً</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم التشغيلة (Batch/Lot)</label>
                  <input
                    type="text"
                    value={form.batch_number}
                    onChange={(e) => setForm({ ...form, batch_number: e.target.value })}
                    className="app-input font-mono text-xs"
                    dir="ltr"
                    placeholder="LOT-2026-X"
                  />
                </div>
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

      {analyticsProduct && (
        <ProductConsumptionModal
          product={analyticsProduct}
          stockQty={stockFor(analyticsProduct.id)}
          onClose={() => setAnalyticsProduct(null)}
        />
      )}
    </div>
  )
}
