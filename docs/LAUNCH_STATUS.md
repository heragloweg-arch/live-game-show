# حالة الإطلاق الحية — قدها

**آخر تحديث:** 22 أكتوبر 2026
**المرجع المعتمد:** `main` / `22306ba945544915b22be368971385b0fd3fdd01`
**التصنيف الحالي:** Production Candidate / Soft-Launch Candidate — ليس إطلاقًا عامًا بعد.

## القرار الحالي

الحالة ليست `GO` للإطلاق العربي العام. الحالة الصحيحة هي `BLOCKED_EXTERNAL` حتى يتم تنفيذ Staging وRLS وFunctions والاختبارات الحية وAAB وInternal Testing. لا يتم اعتبار أي خدمة خارجية PASS من خلال اختبارات المستودع فقط.

## T0 — تثبيت المصدر والبناء

**الحالة: PASS محليًا.**

تم تنفيذ:

- `npm ci --legacy-peer-deps --no-audit --no-fund`
- `npm run typecheck`
- `npm run lint`
- `npm test -- --run` — 7 ملفات و19 اختبارًا ناجحًا.
- `npm run test:production-gates` — 17/17 ناجحًا.
- `npm run build`
- `node scripts/verify-production.mjs`
- `node scripts/verify-launch-config.mjs`
- `node scripts/verify-content-release.mjs`
- فحص أسرار Android — PASS.
- `dist/build-info.json` يطابق commit الحالي.

بصمة الـartifact:

```text
commit: d9473ddaf577f73811f19f629b9167e754167412
sha256(build-info.json): 7ff1145dd344953b118790bc08a7b68d66972b76d6d3717aa44eeb08dc865e32
```

ملاحظات T0:

- الـSandbox يعمل Node `22.13.0`، بينما `package.json` يطلب `>=22.22.0`. CI يستخدم Node `22.22.0`; يجب تنفيذ البناء النهائي وAAB على Node مطابق أو أحدث.
- Deno غير مثبت في الـSandbox، لذلك لم يتم تسجيل PASS لفحص Edge Functions هنا. يجب تشغيله في CI أو جهاز يحوي Deno.
- `npm audit --omit=dev --audit-level=high` لا يمنع البناء، لكنه أظهر ثغرتين Moderate في React Router، وإصلاح npm المقترح يتضمن breaking change. لا يطبق تلقائيًا قبل اختبار توافق التطبيق.
- بقي تحذير LiveKit chunk كبيرًا، وهو بند P1 وليس فشلًا مخفيًا.

## T1 — Staging وSupabase وRLS

**الحالة: PARTIAL — Supabase Production deployed / E2E Staging still pending.**

تم تنفيذ الجزء التالي فعليًا في 22 أكتوبر:

- ربط CLI بالمشروع `jwhrbadnirwjyinplbmn`.
- تطبيق migrations حتى `20261021050002` باستخدام `--include-all`.
- نشر جميع Edge Functions الموجودة وظهورها بحالة `ACTIVE`.
- ضبط `CORS_ALLOWED_ORIGIN` على نطاق Railway الحالي.

ما زال يلزم:

1. إنشاء أو تحديد مشروع Staging منفصل.
2. أخذ backup قبل التطبيق.
3. تطبيق migrations حتى أحدث ملف.
4. مطابقة `schema_migrations` مع Git.
5. نشر جميع Edge Functions من نفس commit.
6. ضبط secrets الخادمية و`CORS_ALLOWED_ORIGIN`.
7. تنفيذ مصفوفة anon/authenticated/host/member/blocked/admin/service_role.
8. حفظ نتائج النجاح والرفض مع deployment IDs منزوعة الأسرار.

لا يُسجل T1 كـPASS كاملًا قبل backup موثق، مصفوفة RLS/Auth، واختبارات حسابات حقيقية على Staging/Production. التفاصيل في `docs/SUPABASE_DEPLOYMENT_REPORT_2026-10-22_AR.md`.

## T2 — حلقة اللعب الحية

**الحالة: BLOCKED_EXTERNAL.**

الكود والاختبارات المحلية موجودة، لكن إغلاق المرحلة يحتاج جهازين أو محاكيين، شبكة فعلية، وStaging يعمل. السيناريوهات الإلزامية هي Solo و1v1 والانتظار وidempotency وانقطاع الشبكة والخلفية وRoom/Host trial/pro/coins/heartbeat وOverlay/QR والحظر وحذف الحساب وRate Limit.

معيار PASS: سجل E2E يحوي request IDs ولا توجد مضاعفة إجابة أو مكافأة.

## T3 — المحتوى والقياس

**الحالة: PARTIAL / BLOCKED_EXTERNAL للتفعيل.**

بوابة المحتوى البنيوية تمر لـ968 صفًا مدققًا، مع منع bulk activation وفرض اعتماد service-role-only. لا يجوز تفعيل 968/1119 دفعة واحدة. المطلوب Cohort من 300 سؤال ذهبي بعد المراجعة البشرية المتخصصة، فصل المحتوى الديني، واستبعاد الأسئلة الحرة من Solo/1v1 عند غياب عقد إجابة مغلق.

يلزم أيضًا أن تظهر أحداث المباراة وDaily والأخطاء والبلاغات من مصدر خادمي في Staging، لا أن تكون `localStorage` مصدر الحقيقة.

## T4 — Android وAAB وInternal Testing

**الحالة: BLOCKED_EXTERNAL.**

مسار Capacitor وRelease signing موجود، لكن لا توجد keystore أو AAB موقع أو نتيجة Internal Testing محفوظة. يلزم بناء AAB من commit معتمد، فحصه، رفعه إلى Internal Track، تثبيته على جهاز حقيقي، وتسجيل نتيجة WebView/Auth/Billing/SSV.

## T5 — Soft Launch عربي

**الحالة: NOT STARTED / BLOCKED BY T1–T4.**

لا يبدأ قبل إغلاق P0. بعد ذلك يكون Soft Launch محدودًا، مع مراقبة crash-free وlatency وD1/D7/D14 وDaily completion وsession 2 وrematch وARPDAU وبلاغات المحتوى وتكلفة Supabase/LiveKit.

## مصفوفة المالك O0–O7

| البند | المطلوب | الحالة |
|---|---|---|
| O0 | Supabase/Auth وStaging وmigrations وFunctions | BLOCKED_EXTERNAL |
| O1 | Google Play products وService Account وRTDN | BLOCKED_EXTERNAL |
| O2 | AdMob IDs وUMP وSSV | BLOCKED_EXTERNAL |
| O3 | LiveKit production وlimits | BLOCKED_EXTERNAL |
| O4 | TikTok Developer App وOAuth Review | BLOCKED_EXTERNAL |
| O5 | Store listing وPrivacy/Terms/Data Safety | BLOCKED_EXTERNAL |
| O6 | عشرة اختبارات حقيقية على أجهزة/شبكات | BLOCKED_EXTERNAL |
| O7 | Soft Launch عربي محدود وقرار Go/Iterate/Stop | BLOCKED_BY_O0_O6 |

## Go/No-Go

الإطلاق العربي لا يصبح `GO` إلا عند تحقق كل الآتي:

- Production وStaging مطابقان للـcommit المعتمد.
- Migrations وFunctions منشورة ومثبتة.
- RLS/Auth/Safety/Delete Account ناجحة على Staging.
- E2E اللعب والمضيف والحذف والحظر ناجح على جهازين.
- AAB موقع مثبت عبر Internal Testing.
- Billing وAdMob لا يمنحان مكافأة مكررة.
- Privacy وTerms وData Safety وروابط المتجر جاهزة.
- قياس خادمي أساسي يعمل.
- لا توجد نتيجة معلنة PASS دون دليل الخدمة نفسها.

## الوثائق القديمة

هذا الملف هو الحالة الحية المرجعية. يجب قراءة `PHASES_STATUS.md` كملف تاريخي فقط، وعدم استخدامه لاتخاذ قرار إطلاق إذا تعارض مع هذا الملف أو مع تقرير دفعة أحدث.
