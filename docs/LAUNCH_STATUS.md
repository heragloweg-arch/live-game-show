# حالة إطلاق قدها — LIVE

> آخر تحديث: 2026-11-27. هذا الملف يصف الحالة الحالية فقط؛ لا يُعد دليلًا على نجاح ميداني لم يُختبر.

## المصدر والـartifact

- **Commit المصدر عند بدء دفعة F0–F5:** `0ba463cb` على `main`، والشجرة نظيفة قبل التعديل.
- **Railway:** لا يوجد في هذه الدفعة تحقق حي جديد. يجب اعتماد `/ready` و`/build-info.json` بعد النشر، مع مطابقة `gitCommit` للـmanifest.
- **Build contract:** `npm run build` يولّد `dist/build-info.json` ثم `PACKAGE_MANIFEST.json`. بوابة الإنتاج تفشل إذا اختلف commit أو `gitCommit` بينهما.
- **LiveKit:** lazy loading محفوظ. تحذير chunk الكبير لا يُخفى عبر `chunkSizeWarningLimit`.

## Supabase والوظائف

- **Project ref:** `jwhrbadnirwjyinplbmn`.
- **آخر migration مطبقة ومثبتة سابقًا:** `20261126000003` بحسب سجل الجلسة الموروث؛ يلزم إعادة التحقق من المشروع الحي قبل إعلان PASS.
- **Edge Functions:** المصدر يحتوي وظائف التشغيل المطلوبة، لكن لا تُعتبر نسخ الإنتاج متطابقة أو منشورة من هذه الدفعة دون ناتج `supabase functions list` موثق.
- **RPC الحساسة:** يجب أن تبقى صلاحيات التنفيذ مقتصرة على `service_role`، ويُتحقق من ذلك في staging/production قبل الإطلاق.

## بوابات الجودة

- **محليًا:** يجب تشغيل `npm run typecheck` و`npm run lint` و`npm test -- --run` و`npm run test:production-gates` و`npm run verify:contracts` و`npm run verify:content-release` و`npm run verify:solo-progression` و`npm run verify:production` و`git diff --check` بعد كل commit.
- **E2E خارجي:** `BLOCKED_EXTERNAL` حتى يثبت على جهاز حقيقي: تسجيل الدخول، Solo ورقة 1→2، Daily، المباراة، العودة إلى الشجرة، وعدم ظهور سؤال غير قابل للعب.
- **AAB / Google Play Billing / RTDN / Restore / AdMob SSV / LiveKit:** `NOT PROVEN` دون جهاز وبيئة فعلية. لا يجوز إعلان PASS من اختبارات المصدر وحدها.

## قرار الإطلاق

**NO-GO للإطلاق العام أو المتجر.** الحالة الحالية مرشح Soft Launch ضيق فقط بعد نجاح البوابات المحلية والتحقق الحي. المسموح في F2 هو شجرة التحدي وDaily والحساب وقراءة المتجر؛ البطولة والفريق والغرفة والمضيف والثنائي وCreator والإعلانات المكافِئة تبقى OFF/Beta حتى إغلاق اختبارات التشغيل والأمان المقابلة.
