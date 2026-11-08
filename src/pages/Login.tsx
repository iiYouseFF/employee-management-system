import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { clearRecoveryPending, isRecoveryPending, markRecoveryPending } from '../lib/recoveryMode'

type Mode = 'login' | 'signup' | 'forgot' | 'recovery'

const COUNTRY_CODE = '+20'
const recoveryMessage = 'اختر كلمة مرور جديدة لحسابك'

function buildPhone(local: string) {
  const digits = local.replace(/\D/g, '')
  return `${COUNTRY_CODE}${digits}`
}

export default function Login() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState(() => (isRecoveryPending() ? recoveryMessage : ''))
  const [mode, setMode] = useState<Mode>(() => (isRecoveryPending() ? 'recovery' : 'login'))
  const navigate = useNavigate()

  const fullPhone = buildPhone(phone)

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

  // ─── Login ───────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (phone.replace(/\D/g, '').length < 7) {
      setError('أدخل رقم هاتف صحيح')
      return
    }
    setLoading(true)
    setError('')
    setMessage('')

    // 1. Resolve phone → email via secure DB function (returns { email: string } jsonb)
    const { data: result, error: lookupError } = await supabase.rpc(
      'get_email_by_phone',
      { p_phone: fullPhone },
    )

    const resolvedEmail = (result as { email?: string } | null)?.email

    if (lookupError || !resolvedEmail) {
      setError('رقم الهاتف غير مسجل في النظام')
      setLoading(false)
      return
    }

    // 2. Sign in with email + password (Supabase standard flow)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    })

    if (signInError) {
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'كلمة المرور غير صحيحة'
          : signInError.message,
      )
    } else {
      navigate('/')
    }
    setLoading(false)
  }

  // ─── Sign-up (phone + password, stored as email internally) ──────────────
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (phone.replace(/\D/g, '').length < 7) {
      setError('أدخل رقم هاتف صحيح')
      return
    }
    if (password.length < 6) {
      setError('يجب أن تكون كلمة المرور 6 أحرف على الأقل')
      return
    }
    setLoading(true)
    setError('')
    setMessage('')

    // For sign-up we need an email — use phone as a fake email domain
    // so the user only ever needs their phone number to log in.
    const fakeEmail = `${fullPhone.replace('+', '')}@phone.local`

    const { data, error } = await supabase.auth.signUp({
      email: fakeEmail,
      password,
      options: { data: { phone: fullPhone } },
    })

    if (error) {
      setError(error.message)
    } else if (data.session) {
      // Also persist the real phone in auth.users via update
      await supabase.auth.updateUser({ phone: fullPhone })
      navigate('/')
    } else if (data.user && data.user.identities && data.user.identities.length === 0) {
      setError('هذا الرقم مسجل بالفعل. سجّل الدخول بكلمة المرور الأصلية.')
    } else {
      setMessage('تم إنشاء الحساب بنجاح. يمكنك تسجيل الدخول الآن.')
    }
    setLoading(false)
  }

  // ─── Forgot Password ─────────────────────────────────────────────────────
  // Looks up the email behind the phone number and sends a reset link.
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    const isEmail = phone.trim().includes('@')

    if (!phone.trim()) {
      setError('أدخل رقم الهاتف أو البريد الإلكتروني')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    let targetEmail = ''

    if (isEmail) {
      targetEmail = phone.trim()
    } else {
      const { data: result, error: lookupError } = await supabase.rpc(
        'get_email_by_phone',
        { p_phone: fullPhone },
      )
      targetEmail = (result as { email?: string } | null)?.email || ''
      if (lookupError || !targetEmail) {
        setError('لم نتمكن من العثور على حساب مرتبط برقم الهاتف هذا')
        setLoading(false)
        return
      }
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: `${window.location.origin}/login`,
    })

    if (resetError) {
      setError(resetError.message)
    } else {
      setMessage('تم إرسال رابط إعادة تعيين كلمة المرور إلى البريد الإلكتروني المرتبط بهذا الحساب')
    }
    setLoading(false)
  }

  // ─── Update Password (recovery mode) ─────────────────────────────────────
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      setError('يجب أن تكون كلمة المرور 6 أحرف على الأقل')
      return
    }
    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين')
      return
    }
    setLoading(true)
    setError('')
    setMessage('')

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
    } else {
      await supabase.auth.signOut()
      clearRecoveryPending()
      setPassword('')
      setConfirmPassword('')
      setMode('login')
      setMessage('تم تعيين كلمة المرور بنجاح، يمكنك الآن تسجيل الدخول بها')
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
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">
              {mode === 'recovery'
                ? 'تعيين كلمة مرور جديدة'
                : mode === 'forgot'
                ? 'استعادة كلمة المرور'
                : 'نظام إدارة المبيعات والحسابات'}
            </h1>
            <p className="text-slate-500 text-sm mt-1.5 font-medium">
              {mode === 'recovery'
                ? 'أدخل كلمة المرور الجديدة لتأمين حسابك'
                : mode === 'forgot'
                ? 'أدخل رقم هاتفك المسجل لإرسال رابط الاستعادة'
                : 'تسجيل الدخول إلى حسابك للمتابعة'}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium flex items-center gap-2 animate-slide-in">
              <svg className="w-5 h-5 shrink-0 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="flex-1">{error}</p>
            </div>
          )}

          {message && (
            <div className="mb-6 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium flex items-center gap-2 animate-slide-in">
              <svg className="w-5 h-5 shrink-0 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <p className="flex-1">{message}</p>
            </div>
          )}

          {/* ── Recovery: set new password ──────────────────────────────── */}
          {mode === 'recovery' ? (
            <form onSubmit={handleUpdatePassword} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  كلمة المرور الجديدة
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError('') }}
                    className="app-input text-start pe-10"
                    placeholder="••••••••"
                    dir="ltr"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  تأكيد كلمة المرور الجديدة
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
                    className="app-input text-start pe-10"
                    placeholder="••••••••"
                    dir="ltr"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                    className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label={showConfirmPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    title={showConfirmPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showConfirmPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
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
                      <span>جاري الحفظ...</span>
                    </span>
                  ) : (
                    'حفظ كلمة المرور الجديدة'
                  )}
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
                  setConfirmPassword('')
                  await supabase.auth.signOut()
                }}
                className="app-btn app-btn-ghost w-full py-2.5 font-semibold text-slate-700 hover:text-slate-900"
              >
                رجوع لتسجيل الدخول
              </button>
            </form>

          /* ── Forgot: send reset link ──────────────────────────────────── */
          ) : mode === 'forgot' ? (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  رقم الهاتف
                </label>
                <div className="flex" dir="ltr">
                  <span className="inline-flex items-center px-3 rounded-s-xl border border-e-0 border-slate-300 bg-slate-100 text-slate-600 text-sm font-semibold select-none whitespace-nowrap">
                    {COUNTRY_CODE}
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setError('') }}
                    className="app-input rounded-s-none flex-1 text-start"
                    placeholder="1012345678"
                    dir="ltr"
                    inputMode="numeric"
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  سنرسل رابط إعادة التعيين إلى البريد الإلكتروني المرتبط بهذا الرقم
                </p>
              </div>
              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="app-btn app-btn-primary w-full py-3 text-base shadow-card font-bold hover:shadow-card-hover"
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>جاري الإرسال...</span>
                    </span>
                  ) : (
                    'إرسال رابط إعادة التعيين'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); setMessage('') }}
                  className="app-btn app-btn-ghost w-full py-2.5 font-semibold text-slate-700 hover:text-slate-900"
                >
                  رجوع لتسجيل الدخول
                </button>
              </div>
            </form>

          /* ── Login / Sign-up ─────────────────────────────────────────── */
          ) : (
            <>
              <form onSubmit={mode === 'signup' ? handleSignUp : handleLogin} className="space-y-5">
                {/* Phone number field */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    رقم الهاتف
                  </label>
                  <div className="flex" dir="ltr">
                    <span className="inline-flex items-center px-3 rounded-s-xl border border-e-0 border-slate-300 bg-slate-100 text-slate-600 text-sm font-semibold select-none whitespace-nowrap">
                      {COUNTRY_CODE}
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value)
                        setError('')
                      }}
                      className="app-input rounded-s-none flex-1 text-start"
                      placeholder="1012345678"
                      dir="ltr"
                      inputMode="numeric"
                      required
                    />
                  </div>
                </div>

                {/* Password field */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                      كلمة المرور
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => { setMode('forgot'); setError(''); setMessage('') }}
                        disabled={loading}
                        className="text-xs font-bold text-primary-700 hover:text-primary-900 hover:underline"
                      >
                        نسيت كلمة المرور؟
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setError('')
                      }}
                      className="app-input text-start pe-10"
                      placeholder="••••••••"
                      dir="ltr"
                      minLength={6}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                      aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
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
