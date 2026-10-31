import { useState } from 'react'
import Modal from './Modal'
import type { RepFormValues } from '../types/reps'

interface RepModalProps {
  initialValues?: (RepFormValues & { id?: string }) | null
  onClose: () => void
  onSubmit: (values: RepFormValues) => Promise<void>
}

export default function RepModal({ initialValues, onClose, onSubmit }: RepModalProps) {
  const [name, setName] = useState(initialValues?.name || '')
  const [email, setEmail] = useState(initialValues?.email || '')
  const [phone, setPhone] = useState(initialValues?.phone || '')
  const [target, setTarget] = useState(
    initialValues?.monthly_target != null ? String(initialValues.monthly_target) : ''
  )
  const [notes, setNotes] = useState(initialValues?.notes || '')
  const [isActive, setIsActive] = useState(initialValues?.is_active ?? true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const isEditing = Boolean(initialValues?.id)
  const appUrl = window.location.origin

  const handleCopyLink = () => {
    navigator.clipboard.writeText(appUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSendMail = () => {
    if (!email.trim()) return
    const subject = encodeURIComponent('دعوة للانضمام إلى نظام المبيعات كمندوب')
    const body = encodeURIComponent(
      `مرحباً ${name || 'المندوب'},\n\nتمت إضافتك كمندوب في نظام المبيعات.\nيمكنك الدخول والتسجيل عبر الرابط التالي بنفس بريدك الإلكتروني:\n${appUrl}/login\n\nستتمكن من الاطلاع على فواتيرك وعملائك بصلاحية قراءة فقط.`
    )
    window.open(`mailto:${email.trim()}?subject=${subject}&body=${body}`, '_blank')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('يرجى إدخال اسم المندوب')
      return
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('يرجى إدخال بريد إلكتروني صحيح')
      return
    }

    if (target.trim() && (!Number.isFinite(Number(target)) || Number(target) < 0)) {
      setError('يرجى إدخال هدف شهري صحيح')
      return
    }

    setLoading(true)
    setError('')
    try {
      await onSubmit({
        name: name.trim(),
        email: email.trim().toLowerCase() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
        monthly_target: target.trim() ? Number(target) : 0,
        is_active: isActive,
      })
      onClose()
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء حفظ بيانات المندوب')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={isEditing ? 'تعديل بيانات المندوب' : 'إضافة مندوب جديد ودعوته للنظام'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-sm" dir="rtl">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            اسم المندوب <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: أحمد محمود"
            className="app-input"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            رقم الهاتف <span className="text-slate-400 font-normal">(اختياري)</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010xxxxxxxx"
            dir="ltr"
            className="app-input font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            البريد الإلكتروني للربط والدخول <span className="text-slate-400 font-normal">(اختياري)</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="rep@example.com"
            dir="ltr"
            className="app-input font-mono"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            عند تسجيل المندوب بهذا البريد سيتم منحه صلاحية (عرض فقط) لعملائه وفواتيره الخاصة به فقط.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              الهدف الشهري <span className="text-slate-400 font-normal">(اختياري)</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0.00"
              dir="ltr"
              className="app-input font-mono text-end"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">حالة الحساب</label>
            <button
              type="button"
              onClick={() => setIsActive((v) => !v)}
              className={`app-input flex items-center justify-between text-start ${
                isActive ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              <span className="font-bold">{isActive ? 'نشط' : 'موقوف'}</span>
              <span
                className={`w-9 h-5 rounded-full relative transition-colors ${
                  isActive ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                    isActive ? 'start-[18px]' : 'start-[2px]'
                  }`}
                />
              </span>
            </button>
            <p className="text-[11px] text-slate-500 mt-1">
              المندوب الموقوف يبقى ظاهراً في التقارير لكن لا يُفترض تعيين عملاء جدد له.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            ملاحظات <span className="text-slate-400 font-normal">(اختياري)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="ملاحظات داخلية عن المندوب، منطقته، أو شروط عمله..."
            className="app-textarea resize-none leading-relaxed"
          />
        </div>

        {email.trim() && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50/50 border border-blue-200/80 rounded-2xl p-4 text-xs space-y-2.5">
            <div className="text-blue-900 font-bold flex items-center justify-between">
              <span>خيارات إرسال الدعوة للمندوب:</span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="text-primary-700 hover:text-primary-900 font-bold hover:underline"
              >
                {copied ? 'تم نسخ رابط التطبيق' : 'نسخ رابط التطبيق'}
              </button>
            </div>
            <p className="text-blue-800/90 leading-relaxed">
              يمكنك إرسال رسالة بريد مباشر للمندوب برابط التطبيق ({appUrl}) ليسجل حساباً بكلمة مرور خاصة به فوراً بدون الحاجة لتأكيد البريد.
            </p>
            <button
              type="button"
              onClick={handleSendMail}
              className="app-btn app-btn-info py-2 text-xs font-bold shadow-sm flex items-center justify-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              <span>فتح تطبيق البريد وإرسال الدعوة</span>
            </button>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 text-rose-700 p-3 rounded-xl border border-rose-200 text-xs font-medium flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="app-btn app-btn-ghost px-5"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={loading}
            className="app-btn app-btn-primary px-6 font-bold"
          >
            {loading ? 'جاري الحفظ...' : isEditing ? 'تحديث البيانات' : 'حفظ وإضافة المندوب'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
