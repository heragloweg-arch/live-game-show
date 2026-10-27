# تقرير دفعة القياس وDaily وRematch — قدها

**التاريخ:** 27 أكتوبر 2026  
**الحالة البرمجية:** PASS محلياً / READY_TO_DEPLOY إلى Staging  
**قرار الإطلاق العام:** ما زال `BLOCKED_EXTERNAL`

## التنفيذ

- إضافة migration `20261027000001_retention_rematch_latency.sql`.
- إضافة `rematch_of` إلى `matches` مع فهرس خادمي.
- ربط `createRematch` بالمباراة السابقة بدلاً من تسجيل rematch كـ1v1 عادي.
- إضافة مؤشرات `d1_users/rate` و`d7_users/rate` و`d14_users/rate`.
- إضافة `session2_users/rate` مشتقة من تكرار فتحات الخادم في اليوم.
- إضافة `rematch_attempts/completed/rate`.
- إضافة `p95_response_ms` إلى جانب `median_response_ms`.
- تشديد `open_daily_pack` على `active=true` و`qa_status=approved` ووجود `challenge_answers`، مع منع السؤال الحر بلا إجابة مغلقة.
- إضافة أحداث تشخيصية للعميل: `rematch_requested` و`latency_sample`.
- إنشاء [مصفوفة المالك](OWNER_MATRIX_2026-10-27_AR.md) ببنود التنفيذ والأدلة المطلوبة.

## النتائج

- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run test:production-gates`: **35/35 PASS**
- `npm run verify:content-release`: PASS — 968 صفاً مدققاً، دون bulk activation
- `npm run verify:solo-progression`: PASS — 48 مرحلة وخمس جولات
- `npm run verify:e2e-log`: PASS كفحص أمانة — 10/10 `BLOCKED_EXTERNAL`
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities
- `git diff --check`: PASS

## ما يلزم خارجياً

1. نشر migration و`metrics` و`daily` إلى Staging عبر Supabase CLI أو Management API مصادق.
2. تنفيذ اعتماد المحتوى service-role لكل سؤال مع reviewer UUID وسجل الموافقة؛ لا يكفي تعديل JSON أو REST client.
3. تشغيل `rebuild_day` يومياً، ثم الانتظار حتى تتوافر Cohorts حقيقية لـD1/D7/D14.
4. تنفيذ rematch وDaily وsession 2 وlatency على حسابات Staging وحفظ request/deployment IDs.
5. تشغيل اختبارات الأجهزة وAAB والمتجر والأسرار الخارجية وفق مصفوفة المالك.

لا توجد أرقام احتفاظ أو latency تشغيلية مُعلنة في هذا التقرير؛ الأرقام لا تصبح حقيقة إلا بعد تشغيل Staging وتسجيل الأدلة الخادمية.
