# حالة الإطلاق الحية — قدها

**آخر تحديث:** 26 أكتوبر 2026
**المرجع المعتمد:** `main`؛ بصمة الإصدار الحية تُقرأ دائماً من `dist/build-info.json` بعد البناء، وتظهر أيضاً في استجابة `/ready`.
**التصنيف الحالي:** Production Candidate / Soft-Launch Candidate — ليس إطلاقًا عامًا بعد.

## القرار الحالي

الحالة ليست `GO` للإطلاق العربي العام. الحالة الصحيحة هي `BLOCKED_EXTERNAL` حتى يتم تنفيذ Staging وRLS وFunctions والاختبارات الحية وAAB وInternal Testing. لا يتم اعتبار أي خدمة خارجية PASS من خلال اختبارات المستودع فقط.

## T0 — تثبيت المصدر والبناء

**الحالة: PASS محليًا.**

تم تنفيذ:

- `npm ci --legacy-peer-deps --no-audit --no-fund`
- `npm run typecheck`
- `npm run lint`
- `npm test -- --run` — 8 ملفات و21 اختبارًا ناجحًا.
- `npm run test:production-gates` — 27/27 ناجحًا.
- `npm run verify:solo-progression` — 48 مرحلة وخمس جولات دون regression في الصعوبة.
- `npm run build`
- `node scripts/verify-production.mjs`
- `node scripts/verify-launch-config.mjs`
- `node scripts/verify-content-release.mjs`
- فحص أسرار Android — PASS.
- `dist/build-info.json` يطابق commit الحالي.

بصمة الـartifact ليست قيمة ثابتة داخل هذا الملف؛ مصدر الحقيقة هو `dist/build-info.json` الناتج من نفس commit. يمنع ذلك استمرار عرض بصمة قديمة بعد أي إصلاح لاحق.

ملاحظات T0:

- Node المطلوب للبناء وAAB هو `>=22.22.0`، وCI مثبت على Node `22.22.0`.
- فحص Deno لكل Edge Functions متاح محليًا ونجح في هذه الدفعة.
- `npm audit --omit=dev --audit-level=high` — 0 vulnerabilities بعد ترقية React Router إلى `7.18.4` مع نجاح typecheck/lint/Vitest وبوابات الإنتاج.
- بقي تحذير LiveKit chunk كبيرًا، وهو بند P1 وليس فشلًا مخفيًا.

## T1 — Staging وSupabase وRLS

**الحالة: PASS للمزامنة والنشر الإداري — E2E Staging والأدوار الحية ما زالا BLOCKED_EXTERNAL.**

تم تنفيذ الجزء التالي فعليًا حتى 25 أكتوبر:

- ربط CLI بالمشروع `jwhrbadnirwjyinplbmn`.
- تطبيق `db push --include-all`؛ والنتيجة `Remote database is up to date`.
- مطابقة سجل migrations المحلي والبعيد حتى `20261026000004`، بما فيها reconciliation لزرع محتوى الأعلام.
- إعادة نشر وظائف `daily` (v13)، `match` (v19)، و`metrics` (v9)، مع بقاء وظائف Edge الـ19 كلها بحالة `ACTIVE`.
- حفظ دليل التنفيذ في `docs/STAGING_EXECUTION_REPORT_2026-10-25_AR.md`.
- ضبط `CORS_ALLOWED_ORIGIN` على نطاق Railway الحالي.
- تطبيق RLS role hardening ومنع الكتابة المباشرة إلى الحالة السلطوية.
- نقل تقدم Solo إلى جدول خادمي وRPC idempotent مع فرض تسلسل المراحل.
- نشر `metrics` بالإصدار 9 مع `rebuild_day` مشتق من جداول الخادم؛ `ingest_day` العميلية مرفوضة، و`p_correct` و`median_response_ms` و`drop_rate` أصبحت أعمدة خادمية.
- تطبيق `20261026000004_reconcile_flag_content_seed.sql` على Staging؛ الصفوف تبقى `active=false/needs_review` ولا يجوز تفعيلها قبل مراجعة بشرية.

ما زال يلزم:

1. تحديد مشروع Production منفصل عن Staging وإثبات العزل.
2. أخذ backup موثق قبل أي migration تغيّرية.
3. ضبط secrets الخادمية و`CORS_ALLOWED_ORIGIN` في البيئة المستهدفة.
4. تنفيذ مصفوفة anon/authenticated/host/member/blocked/admin/service_role بحسابات اختبار حقيقية.
5. حفظ نتائج النجاح والرفض مع deployment IDs منزوعة الأسرار.

لا يُسجل T1 كـPASS كاملًا قبل backup موثق، مصفوفة RLS/Auth، واختبارات حسابات حقيقية على Staging/Production. المصفوفة الموحدة في `docs/STAGING_ROLE_MATRIX_AR.md`، والتفاصيل في `docs/SUPABASE_DEPLOYMENT_REPORT_2026-10-22_AR.md` و`docs/T1B_SOLO_RLS_DEPLOYMENT_REPORT_2026-10-23_AR.md`.

## T2 — حلقة اللعب الحية

**الحالة: BLOCKED_EXTERNAL.**

الكود والاختبارات المحلية موجودة، لكن إغلاق المرحلة يحتاج جهازين أو محاكيين، شبكة فعلية، وStaging يعمل. السيناريوهات الإلزامية موحدة في `docs/E2E_EXECUTION_LOG_AR.md` وتشمل Solo و1v1 والانتظار وidempotency وانقطاع الشبكة والخلفية وRoom/Host trial/pro/coins/heartbeat وOverlay/QR والحظر وحذف الحساب وRate Limit.

معيار PASS: سجل E2E يحوي request IDs ولا توجد مضاعفة إجابة أو مكافأة.

## T3 — المحتوى والقياس

**الحالة: PARTIAL / BLOCKED_EXTERNAL للتفعيل.**

بوابة المحتوى البنيوية تمر لـ968 صفًا مدققًا، مع منع bulk activation وفرض اعتماد service-role-only. أضيفت مصالحة seed للأعلام، لكن ظهور الصفوف غير النشطة عبر REST anon محجوب بسياسة RLS؛ لذلك لا يُسجل تحقق صفوف الأعلام PASS إلا عبر service-role audit منزوعة البيانات. لا يجوز تفعيل 968/1119 دفعة واحدة. المطلوب Cohort من 300 سؤال ذهبي بعد المراجعة البشرية المتخصصة، فصل المحتوى الديني، واستبعاد الأسئلة الحرة من Solo/1v1 عند غياب عقد إجابة مغلق.

تم إغلاق فجوة مصدر القياس برمجياً: `metrics` يرفض `ingest_day` القادم بأرقام العميل (`SERVER_DERIVED_ONLY`) ويوفر `rebuild_day` مشتقاً من `matches` و`match_participants` و`answer_submissions`، مع `p_correct` و`median_response_ms` و`drop_rate`. ما زال إثبات التشغيل الفعلي وقياس Cohort والاحتفاظ خارجياً مطلوباً.

## T4 — Android وAAB وInternal Testing

**الحالة: BLOCKED_EXTERNAL.**

مسار Capacitor وRelease signing موجود، وأضيف workflow يدوي `Qaddaha Android Release` يبني AAB من commit محدد على runner فيه SDK، ويفحص عدم وجود keystore في Git، ثم يرفع SHA-256 وcommit مع artifact. لا توجد keystore أو AAB موقع أو نتيجة Internal Testing محفوظة حتى الآن؛ يلزم تشغيل workflow بأسرار المالك ثم الرفع والتثبيت والتسجيل.

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
