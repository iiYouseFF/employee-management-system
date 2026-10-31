import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { clearRecoveryPending, isRecoveryPending, markRecoveryPending } from '../lib/recoveryMode'

type Mode = 'login' | 'signup' | 'recovery'

const recoveryMessage = 'اختر كلمة مرور جديدة لحسابك'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState(() => (isRecoveryPending() ? recoveryMessage : ''))
  const [mode, setMode] = useState<Mode>(() => (isRecoveryPending() ? 'recovery' : 'login'))
  const navigate = useNavigate()

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        markRecoveryPending()
        setMode('recovery')
        setMessage(recoveryMessage)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'بيانات الدخول غير صحيحة، يرجى التأكد من البريد وكلمة المرور' : error.message)
    } else {
      navigate('/')
    }
    setLoading(false)
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    } else if (data.session) {
      navigate('/')
    } else if (data.user && data.user.identities && data.user.identities.length === 0) {
      setError('هذا البريد الإلكتروني مسجل بالفعل. سجّل الدخول بكلمة المرور الأصلية أو استخدم "نسيت كلمة المرور".')
    } else {
      setMessage('تم إنشاء الحساب بنجاح. افتح رسالة تأكيد البريد الإلكتروني ثم سجّل الدخول.')
    }
    setLoading(false)
  }

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('أدخل البريد الإلكتروني أولاً لإرسال رابط إعادة تعيين كلمة المرور')
      return
    }
    setLoading(true)
    setError('')
    setMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) {
      setError(error.message)
    } else {
      setMessage('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني')
    }
    setLoading(false)
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      setError('يجب أن تكون كلمة المرور 6 أحرف على الأقل')
      return
    }
    setLoading(true)
    setError('')
    setMessage('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
    } else {
      await supabase.auth.signOut()
      clearRecoveryPending()
      setPassword('')
      setMode('login')
      setMessage('تم تحديث كلمة المرور بنجاح، يمكنك تسجيل الدخول الآن')
    }
    setLoading(false)
  }

  return (
    <div className="relative min-h-screen bg-page-bg flex items-center justify-center p-4 overflow-hidden" dir="rtl">
      {/* Decorative ambient background glows */}
      <div className="absolute -top-40 -start-40 w-96 h-96 bg-primary-300/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -end-40 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md animate-fade-in-up">
        <div className="app-card p-8 sm:p-10 shadow-modal border-slate-200/80">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white font-extrabold text-2xl shadow-glow mb-4">
              م
            </div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">نظام إدارة المبيعات والحسابات</h1>
            <p className="text-slate-500 text-sm mt-1.5 font-medium">تسجيل الدخول إلى حسابك للمتابعة</p>
          </div>

          {error && (
            <div className="mb-6 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium flex items-center gap-2 animate-slide-in">
              <svg className="w-5 h-5 shrink-0 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <p className="flex-1">{error}</p>
            </div>
          )}

          {message && (
            <div className="mb-6 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium flex items-center gap-2 animate-slide-in">
              <svg className="w-5 h-5 shrink-0 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
              <p className="flex-1">{message}</p>
            </div>
          )}

          {mode === 'recovery' ? (
            <form onSubmit={handleUpdatePassword} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  كلمة المرور الجديدة
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="app-input text-start"
                  placeholder="••••••••"
                  dir="ltr"
                  minLength={6}
                  required
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="app-btn app-btn-primary w-full py-3 text-base shadow-card font-bold hover:shadow-card-hover"
                >
                  {loading ? 'جاري الحفظ...' : 'حفظ كلمة المرور الجديدة'}
                </button>
              </div>

              <button
                type="button"
                onClick={async () => {
                  clearRecoveryPending()
                  setMode('login')
                  setError('')
                  setMessage('')
                  setPassword('')
                  await supabase.auth.signOut()
                }}
                className="app-btn app-btn-ghost w-full py-2.5 font-semibold text-slate-700 hover:text-slate-900"
              >
                رجوع لتسجيل الدخول
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={mode === 'signup' ? handleSignUp : handleLogin} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    البريد الإلكتروني
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="app-input text-start"
                      placeholder="name@example.com"
                      dir="ltr"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    كلمة المرور
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="app-input text-start"
                      placeholder="••••••••"
                      dir="ltr"
                      minLength={6}
                      required
                    />
                  </div>
                  {mode === 'login' && (
                    <div className="mt-2 text-end">
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        disabled={loading}
                        className="text-xs font-bold text-primary-700 hover:text-primary-900 hover:underline"
                      >
                        نسيت كلمة المرور؟
                      </button>
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="app-btn app-btn-primary w-full py-3 text-base shadow-card font-bold hover:shadow-card-hover"
                  >
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>جاري التحقق...</span>
                      </span>
                    ) : mode === 'signup' ? (
                      'إنشاء حساب جديد'
                    ) : (
                      'تسجيل الدخول'
                    )}
                  </button>
                </div>
              </form>

              <div className="relative my-6 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative inline-block px-4 bg-white text-xs text-slate-400 font-medium">
                  أو
                </div>
              </div>

              <button
                onClick={() => {
                  setMode(mode === 'signup' ? 'login' : 'signup')
                  setError('')
                  setMessage('')
                }}
                type="button"
                disabled={loading}
                className="app-btn app-btn-ghost w-full py-2.5 font-semibold text-slate-700 hover:text-slate-900"
              >
                {mode === 'signup' ? 'لديك حساب بالفعل؟ تسجيل الدخول' : 'إنشاء حساب جديد'}
              </button>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6 font-medium">
          نظام المبيعات والحسابات التراكمية {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
