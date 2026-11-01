# دفعة قدها — إصلاح CORS وفحص Railway

**التاريخ:** 31 أكتوبر 2026  
**النطاق:** تشخيص `Failed to fetch` في Solo وDaily وMatchmaking والغرف، وفحص أبعاد شاشة تسجيل الدخول، وتشغيل بوابات المستودع.

## النتيجة

تم عزل سبب `Failed to fetch`: رابط Railway الحالي هو:

`https://live-game-show-production-317b.up.railway.app/`

بينما كانت وظائف Supabase الحية تعيد:

`Access-Control-Allow-Origin: https://live-game-show-production-8e73.up.railway.app`

لذلك كان المتصفح يحجب الرد بسبب CORS. ظهر ذلك في preflight والطلبات الفعلية لكل من `daily`, `match`, `matchmaking`, `room`, `team`, `tournament`, و`economy`: الخادم يعيد `401 Unauthorized` مع CORS لنطاق قديم، وليس فشل اتصال داخلي.

## ما تم تغييره محليًا

- `supabase/functions/_shared/cors.ts`: قبول أصل Railway HTTPS المطابق للنمط الرسمي فقط، مع إعادة الأصل المطلوب حرفيًا، والإبقاء على الأصول المعروفة (`qaddaha.app` وCapacitor localhost)، ومنع wildcard.
- `scripts/production-gate.test.mjs`: إضافة بوابة تمنع إزالة حماية Railway الديناميكية أو إدخال wildcard.
- `docs/LAUNCH_STATUS.md`: توثيق الحالة الحية كـ`BLOCKED_EXTERNAL` بأمانة.

## الأدلة

- Railway `/health`: HTTP 200 و`{"status":"ok","service":"qaddaha-web"}`.
- Railway `/ready`: HTTP 200، الخدمة `qaddaha-web`، والبصمة الحية `70d4a42ef687cdb5be42d37fba5ad5305a061954`.
- Railway runtime يشير إلى Supabase Staging الصحيح `jwhrbadnirwjyinplbmn`.
- `npm test -- --run`: 21/21 PASS.
- `npm run test:production-gates`: 50/50 PASS.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `node scripts/verify-production.mjs`: PASS.
- `node scripts/verify-content-release.mjs`: PASS — 968 صفًا مدققًا دون تفعيل جماعي.
- `npm run verify:e2e-log`: 10/10 `BLOCKED_EXTERNAL` بأمانة.
- تم نشر جميع Edge Functions إلى `jwhrbadnirwjyinplbmn`، ثم نشر `daily` بالإصدار 26.
- تم التحقق من `schema_migrations` ووجود `20261031120000`.
- preflight الحي لـ`daily` من نطاق Railway الحالي يعيد HTTP 200 و`Access-Control-Allow-Origin: https://live-game-show-production-317b.up.railway.app`.
- تم دفع واجهة Daily/Solo إلى `main` في commit `93fdb243` بعد نجاح الاختبارات.

## ما لم يُغلق

تم نشر وظائف Supabase وتحديث `CORS_ALLOWED_ORIGIN` إلى النطاق الحالي، لذلك طبقة CORS في Supabase أصبحت PASS للـpreflight. ما لم يُغلق هو Railway: `/ready` ما زال يعرض بصمة `70d4a42ef687cdb5be42d37fba5ad5305a061954` بدل commit `93fdb243`، وبالتالي لا يمكن إثبات تشغيل واجهة Daily الجديدة أو E2E الكامل من رابط Railway حتى يُعاد نشره.

لا يوجد إعلان GO أو جاهزية متجر. شاشة تسجيل الدخول تحتوي بالفعل على `100dvh` وsafe-area وتمرير داخلي وحد أقصى للبطاقة، لكن إثبات المقاس النهائي يحتاج جهاز Android أو محاكيًا فعليًا.
