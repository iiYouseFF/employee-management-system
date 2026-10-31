# Deployment Guide — Vercel + Supabase

هذا الملف يشرح خطوات نشر النظام على Vercel وربطه بمشروع Supabase.

---

## 1. المتطلبات

| العنصر | القيمة |
|---|---|
| Node.js | 20.19+ (Vite 8 requirement, also set in `package.json` → `engines`) |
| Supabase project | `pswyzpadnicjwdqgwwtd` (eu-central-1) |
| GitHub repo | `iiYouseFF/employee-management-system` |

---

## 2. متغيّرات البيئة

المتغيّران المطلوبان فقط:

```
VITE_SUPABASE_URL=https://pswyzpadnicjwdqgwwtd.supabase.co
VITE_SUPABASE_ANON_KEY=<anon أو publishable key>
```

- محلياً: ضعهما في `.env.local` (غير مُتتبَّع في git).
- على Vercel: **Settings → Environment Variables**، وأضفهما لكل من Production / Preview / Development.

> ⚠️ **لا تضع `service_role` key في أي متغيّر يبدأ بـ `VITE_`.** أي متغيّر بهذا الشكل يُحزَّم داخل ملفات المتصفح ويصبح متاحاً للجميع. الـ `anon` key فقط هو المسموح، والحماية الحقيقية تأتي من RLS.

---

## 3. النشر على Vercel

1. **Add New → Project** ثم اختر المستودع.
2. الإعدادات تُقرأ تلقائياً من `vercel.json`:
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. أضف متغيّرات البيئة (القسم 2).
4. **Deploy**.

### لماذا `vercel.json` ضروري؟

التطبيق يستخدم `BrowserRouter`، فبدونه أي تحديث للصفحة على `/login` أو أي مسار آخر يُرجع 404 من Vercel. ملف `vercel.json` يحتوي على:

- `rewrites`: `/(.*)` → `/index.html` (SPA fallback).
- Cache headers: `assets/*` immutable لمدة سنة، و`index.html` دائماً يُعاد التحقق منه.
- Security headers: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.

---

## 4. إعدادات Supabase Auth (يدوية — لا تُدار من الكود)

هذه الإعدادات **لا يمكن قراءتها أو تعديلها عبر MCP**؛ يجب ضبطها من لوحة تحكم Supabase:

**Authentication → URL Configuration**

| الحقل | القيمة |
|---|---|
| Site URL | `https://<your-domain>.vercel.app` (أو الدومين المخصّص) |
| Redirect URLs | `https://<your-domain>.vercel.app/**`<br>`http://localhost:5173/**` (للتطوير المحلي) |

**Authentication → Emails / SMTP**

- الإعداد الافتراضي (Supabase SMTP) مخصّص للتجربة فقط: محدود المعدّل، وقد لا يصل للمستخدمين، وغير مناسب للإنتاج.
- اضبط **Custom SMTP** (Resend / SendGrid / Amazon SES / Gmail SMTP…) قبل دعوة مندوبين حقيقيين.
- تحقّق من قوالب Reset Password وConfirm Signup بعد تفعيل SMTP.

**Authentication → Providers → Email**

- إن كان التسجيل الذاتي غير مرغوب فيه، أوقف **Allow new users to sign up**. سير العمل الحالي: المدير يُنشئ المندوب في شاشة المندوبين أولاً، ثم يسجّل المندوب بنفس البريد.

> ملاحظة مهمة: ربط الحساب بـ `reps` يتم عبر `provision_user_role` عند أول تأكيد للبريد. يجب أن يكون بريد المندوب محفوظاً في صف `reps` **قبل** أول تأكيد، وإلا لن يُربط الحساب تلقائياً.

---

## 5. قائمة تحقّق بعد النشر

- [ ] فتح `/login` مباشرة ثم تحديث الصفحة → تعمل (لا 404).
- [ ] تسجيل دخول المدير → كل التبويبات ظاهرة.
- [ ] تسجيل دخول مندوب → بياناته فقط، بدون أزرار تعديل/حذف.
- [ ] محاولة فتح تبويب الموردين/لوحة المؤشرات كمندوب → محجوب.
- [ ] استعادة كلمة المرور تصل عبر البريد ومن نفس الدومين.
- [ ] الطباعة (كشف الحساب / قائمة الأسعار) تعمل على A4 بالعربية والإنجليزية.

---

## 6. أوامر مفيدة

```bash
npm run dev        # تطوير محلي
npm run typecheck  # فحص TypeScript فقط
npm run lint       # oxlint
npm run build      # بناء الإنتاج (tsc -b && vite build)
npm run preview    # معاينة dist محلياً
```

---

## 7. ملاحظات صيانة

- بعد أي migration جديدة: أعد توليد أنواع Supabase ثم حدّث `src/types/supabase.ts`.
- الـ migrations موجودة في `supabase/migrations/` وتُطبَّق بالترتيب.
- نموذج المحاسبة (مدين/دائن، الرصيد التراكمي، معادلات KPI) موثّق في `docs/accounting-model.md`.
