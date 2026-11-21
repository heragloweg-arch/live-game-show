

## إصلاح Daily وSolo — 6 نوفمبر 2026

- كشف سجل Postgres سبب HTTP 503 في `match`: خطأ SQLSTATE `42702` داخل `advance_match_round` بسبب غموض `user_id` في `COUNT(DISTINCT user_id)`. تم إصلاحه بتأهيل الأعمدة (`s.user_id`) مع إبقاء صلاحية RPC مقتصرة على `service_role`.
- فحص pack الحالي كشف فسادًا حقيقيًا في المحتوى: سؤال «كاتب الأيام؟» كان يعرض حروف «تفاح» ويحمل 34 إجابة غير مرتبطة. تم تصحيح محطات رحلة اليوم الثلاث في migration ذرية:
  - «كاتب «الأيام»؟» ← «طه حسين» وحروف `ط ه ح س ي ن`.
  - «اسم ولد يبدأ بحرف ك (4 أحرف)» ← «كريم».
  - «كوّن كلمة من: ح ب» ← «حب».
- تحقق Supabase بعد التطبيق: المحطات الثلاث تعرض prompt/letter_pool/max_length/accepted_answer متطابقة، وRPC الانتقال يعرض `qualified_count > 0` مع `anon_exec=false` و`authenticated_exec=false`.
- البوابات المحلية بعد الإصلاح: typecheck وlint وVitest وproduction gates وbuild و`git diff --check` ناجحة.

لم يُسجل PASS ميداني نهائي لرحلة Solo أو Daily من جهاز مالك بعد هذا الإصلاح؛ يلزم إعادة السيناريو على Railway مع حفظ `match_id` وrequest IDs. قرار الإطلاق يبقى `NO-GO` حتى إغلاق E2E الخارجي وبقية Android/Billing/AdMob/LiveKit.

## دفعة انتقال Solo وتصميم الشجرة — 7 نوفمبر 2026

- أضيف قفل عميل في `useServerMatch` يمنع استدعاء `next_round` المتزامن من النقر المكرر أو تحديث Realtime.
- أضيف حارس idempotent في Edge Function `match`: إذا كانت المباراة بالفعل في `ROUND_STARTING` يعاد state الخادمي بدل إغلاق الجولة التالية مرة أخرى.
- نُشرت Edge Function `match` على Supabase Staging بنجاح، وأصبح الإصدار الحي `v41`. اختبار مجهول مباشر أعاد `401`.
- أُعيد تصميم Solo بصريًا عبر CSS حقيقي: تاج أوراق، جذع متدرج، جذور وفروع جانبية وأوراق مراحل؛ بلا صورة شجرة أو تصميم أعواد منفصل.
- البوابات المحلية لهذه الدفعة ناجحة: typecheck وlint وVitest وproduction gates وbuild و`git diff --check`.
- تحقق Railway الحالي: `/health` = 200 و`/ready` = 200، لكن البصمة الحية وقت التوثيق هي commit `b13b6fc67e652989ecc2032a4042f34c9ca982a5` وليست بعد commit هذه الدفعة؛ يلزم انتظار مزامنة Railway ثم إعادة فحصها.

الحكم لا يزال `NO-GO`: لا يوجد PASS ميداني نهائي بعد لسيناريو Solo سؤال 1→2 أو الغرف، ولا يجوز إعلان جاهزية متجر قبل إغلاق E2E الخارجي وبقية Android/Billing/AdMob/LiveKit.


## استعادة مصدر الحقيقة وإغلاق R0 — 21 نوفمبر 2026

- تم استعادة المستودع الرسمي من `https://github.com/heragloweg-arch/live-game-show.git` على فرع `main` في checkout نظيف.
- commit المرجعي: `432fa995853834444cb2e62e708af01c2e7a3cab` (`fix: route rewarded ads through AdMob SSV`).
- الحالة: `main...origin/main` والشجرة نظيفة وقت الفحص.
- الملفات التي كانت مفقودة في مسار التدقيق السابق موجودة في المصدر الرسمي، ومنها `package-lock.json` و`vite.config.ts` و`eslint.config.js` و`tsconfig.node.json` و`static-server.mjs` وFunctions `answer/room/matchmaking` و`DailyChallengeScreen.tsx` و`android/`.
- `npm ci --legacy-peer-deps --no-audit --no-fund`: PASS.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm test -- --run`: PASS — 12 ملفات و32 اختبارًا.
- `npm run test:production-gates`: PASS — 52/52.
- `npm run verify:content-release`: PASS — 968 صفًا مدققًا، دون تفعيل جماعي.
- `npm run build`: PASS — artifact يحمل commit `432fa995853834444cb2e62e708af01c2e7a3cab`.
- `node scripts/verify-production.mjs`: PASS — فحص 100 ملف JavaScript.
- أضيفت بوابة `npm run verify:contracts` لإنشاء `docs/CONTRACT_INVENTORY.json` والتحقق من عدم وجود Edge Function أو RPC مستعمل دون عقد محلي.
- ما يزال القرار `NO-GO` للتشغيل الخارجي: لا يوجد في هذا الفحص دليل حي جديد على Railway أو Supabase Staging/Production أو E2E أو AAB/Google Play/AdMob/LiveKit/TikTok.
- تحذير أداء غير حاجب: chunks `ThreeSpaceScene` و`livekitClient` أكبر من 500KB بعد minification؛ يُعالج في دفعة الأداء دون إخفاء التحذير.
