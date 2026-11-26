import { useState } from 'react'
import Modal from '@/shared/ui/Modal'
import { useAuth } from '@/features/auth/useAuth'
import { useUpdateRepPermissions } from '@/features/reps/useReps'
import {
  DEFAULT_REP_PERMISSIONS,
  REP_PERMISSION_GROUPS,
  REP_PERMISSION_LABELS,
  normalizeRepPermissions,
  type RepPermissionKey,
  type RepPermissions,
} from '@/features/reps/repPermissions'

interface RepPermissionsModalProps {
  repId: string
  repName: string
  permissions: unknown
  onClose: () => void
  onSaved?: () => void
}

export default function RepPermissionsModal({
  repId,
  repName,
  permissions,
  onClose,
  onSaved,
}: RepPermissionsModalProps) {
  const [values, setValues] = useState<RepPermissions>(() => normalizeRepPermissions(permissions))
  const [error, setError] = useState('')
  const updatePermissions = useUpdateRepPermissions()
  const { refresh } = useAuth()

  const toggle = (key: RepPermissionKey) => {
    setValues((current) => ({ ...current, [key]: !current[key] }))
  }

  const handleSave = async () => {
    setError('')
    try {
      await updatePermissions.mutateAsync({ id: repId, permissions: values })
      await refresh()
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الصلاحيات، حاول مرة أخرى')
    }
  }

  return (
    <Modal
      title={`صلاحيات المندوب: ${repName}`}
      subtitle="اختر ما يسمح له هذا المندوب بعرضه أو تنفيذه. التغييرات تُطبّق فوراً على حساب المندوب."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="app-btn app-btn-ghost px-5">
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={updatePermissions.isPending}
            className="app-btn app-btn-primary px-6 font-bold"
          >
            {updatePermissions.isPending ? 'جاري الحفظ...' : 'حفظ الصلاحيات'}
          </button>
        </>
      }
    >
      <div className="space-y-5 text-sm" dir="rtl">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-600 leading-5">
            الصلاحيات الافتراضية تمنح العرض الأساسي والطباعة فقط. يمكنك تعديلها لكل مندوب على حدة.
          </p>
          <button
            type="button"
            onClick={() => setValues({ ...DEFAULT_REP_PERMISSIONS })}
            className="app-btn app-btn-ghost app-btn-sm shrink-0"
          >
            استعادة الافتراضي
          </button>
        </div>

        {REP_PERMISSION_GROUPS.map((group) => (
          <section key={group.id} className="space-y-2">
            <h3 className="text-xs font-black text-slate-800 border-b border-slate-100 pb-2">{group.label}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {group.keys.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  aria-pressed={values[key]}
                  className={`app-input flex items-center justify-between gap-3 text-start transition-colors ${
                    values[key] ? 'text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  <span className="font-bold text-xs leading-5">{REP_PERMISSION_LABELS[key]}</span>
                  <span
                    className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${
                      values[key] ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                        values[key] ? 'start-[18px]' : 'start-[2px]'
                      }`}
                    />
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}

        {error && (
          <div className="bg-rose-50 text-rose-700 p-3 rounded-xl border border-rose-200 text-xs font-medium">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
