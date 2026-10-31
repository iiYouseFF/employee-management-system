import { useState, type FormEvent } from 'react'
import Modal from './Modal'
import SearchableCustomer from './SearchableCustomer'

export type FormFieldType = 'text' | 'number' | 'date' | 'select' | 'textarea' | 'customer'

export interface FormField {
  name: string
  label: string
  type?: FormFieldType
  required?: boolean
  placeholder?: string
  dir?: 'rtl' | 'ltr'
  min?: number
  step?: string
  full?: boolean
  options?:
    | { value: string; label: string }[]
    | ((values: Record<string, any>) => { value: string; label: string }[])
}

interface FormModalProps {
  title: string
  fields: FormField[]
  initialValues: Record<string, any>
  customers?: any[]
  submitLabel?: string
  busy?: boolean
  onClose: () => void
  onSubmit: (values: Record<string, any>) => void | Promise<void>
  onFieldChange?: (
    name: string,
    value: any,
    values: Record<string, any>
  ) => Partial<Record<string, any>> | void
  validate?: (values: Record<string, any>) => string | null
}

export default function FormModal({
  title,
  fields,
  initialValues,
  customers = [],
  submitLabel = 'حفظ',
  busy,
  onClose,
  onSubmit,
  onFieldChange,
  validate,
}: FormModalProps) {
  const [values, setValues] = useState<Record<string, any>>(initialValues)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const setField = (name: string, value: any) => {
    setError(null)
    setValues((prev) => {
      const next = { ...prev, [name]: value }
      const patch = onFieldChange?.(name, value, next)
      return patch ? { ...next, ...patch } : next
    })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    for (const field of fields) {
      if (!field.required) continue
      const value = values[field.name]
      if (value === null || value === undefined || String(value).trim() === '') {
        setError(`يرجى إدخال ${field.label}`)
        return
      }
    }

    for (const field of fields) {
      if (field.type !== 'number') continue
      const raw = values[field.name]
      const num = parseFloat(raw)
      if (raw !== '' && raw !== null && raw !== undefined && Number.isNaN(num)) {
        setError(`${field.label} يجب أن يكون رقماً`)
        return
      }
      if (field.min !== undefined && num < field.min) {
        setError(`${field.label} يجب ألا يقل عن ${field.min}`)
        return
      }
    }

    const custom = validate?.(values)
    if (custom) {
      setError(custom)
      return
    }

    setSaving(true)
    try {
      await onSubmit(values)
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const disabled = saving || !!busy

  return (
    <Modal
      title={title}
      onClose={disabled ? () => {} : onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="app-btn app-btn-ghost px-5"
          >
            إلغاء
          </button>
          <button
            type="submit"
            form="form-modal"
            disabled={disabled}
            className="app-btn app-btn-primary px-6 font-bold"
          >
            {disabled ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>جارٍ الحفظ...</span>
              </span>
            ) : (
              submitLabel
            )}
          </button>
        </>
      }
    >
      <form id="form-modal" onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((field) => {
            const value = values[field.name] ?? ''
            const options =
              typeof field.options === 'function' ? field.options(values) : field.options

            return (
              <div key={field.name} className={field.full ? 'sm:col-span-2' : ''}>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 tracking-wide">
                  {field.label}
                  {field.required && <span className="text-rose-500 font-extrabold ms-0.5">*</span>}
                </label>

                {field.type === 'customer' ? (
                  <SearchableCustomer
                    customers={customers}
                    value={value || null}
                    onChange={(customerId) => setField(field.name, customerId)}
                  />
                ) : field.type === 'select' ? (
                  <select
                    value={value}
                    onChange={(e) => setField(field.name, e.target.value)}
                    className="app-select"
                  >
                    <option value="">{field.placeholder || 'اختر من القائمة'}</option>
                    {(options || []).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    value={value}
                    onChange={(e) => setField(field.name, e.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                    dir={field.dir}
                    className="app-textarea"
                  />
                ) : (
                  <input
                    type={field.type || 'text'}
                    value={value}
                    onChange={(e) => setField(field.name, e.target.value)}
                    placeholder={field.placeholder}
                    dir={field.dir}
                    min={field.min}
                    step={field.step}
                    className="app-input"
                  />
                )}
              </div>
            )
          })}
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-sm font-medium text-rose-700 flex items-center gap-2 animate-slide-in">
            <svg className="w-4 h-4 shrink-0 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <span>{error}</span>
          </div>
        )}
      </form>
    </Modal>
  )
}
