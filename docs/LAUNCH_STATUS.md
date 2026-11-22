

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


## دفعة R1.3 — نزاهة الاشتراك ورموز الدعوات — 21 نوفمبر 2026

- تم إصلاح `subscription` action=`status` ليستخدم projection صريحًا للحقول العامة فقط؛ لا يعيد `provider_token` أو `raw_receipt` إلى العميل.
- تم استبدال توليد رمز دعوة المباراة من PRNG غير تشفيري إلى `crypto.randomUUID()` بعد إزالة الشرطات، مع إبقاء قبول الدعوة ذريًا ومقيدًا بانتهاء الصلاحية كما يفرض RPC القائم.
- أضيفت اختبارات regression ثابتة تمنع عودة تسريب بيانات الإيصال أو استخدام توليد غير تشفيري لرموز الدعوات.
- البوابات بعد الإصلاح: `node --test scripts/security-regression.test.mjs` = 11/11، `npm run typecheck` = PASS، `npm run lint` = PASS، `npm test -- --run` = 32/32، `npm run test:production-gates` = 54/54، `npm run verify:content-release` = PASS، `npm run verify:contracts` = PASS، `npm run build` = PASS، و`node scripts/verify-production.mjs` = PASS.
- artifact المحلي يحمل commit السابق `b260755914631ff777cdfd4e28c8149e3a813c5b` إلى حين تسجيل commit هذه الدفعة.
- لا يثبت هذا الإصلاح نشر Supabase أو Railway أو E2E حيًا؛ قرار الإطلاق يبقى `NO-GO` حتى توفير دليل Staging/Railway/E2E وAAB/Google Play/AdMob/LiveKit/TikTok.


## دفعة R1.3b — حماية دعوات الفريق والثنائي — 22 نوفمبر 2026

تم استبدال توليد رموز `team` و`couple` من العشوائية غير التشفيرية إلى `crypto.getRandomValues()` مع rejection sampling لتجنب انحياز modulo. بقيت العشوائية المستخدمة لاختيار وترتيب الأسئلة منفصلة لأنها ليست بيانات اعتماد قابلة للمشاركة.

قبل تسجيل هذه الدفعة: اختبار الأمان `12/12`، بوابات الإنتاج `55/55`، Vitest `32/32`، typecheck وlint وcontent-release وcontract inventory ناجحة. لم يتم تشغيل Deno هنا، لذلك لا أدعي نجاح فحص Edge Functions عبر Deno؛ يلزم تشغيله في CI أو بيئة Supabase عند توفره.

الحكم الخارجي لا يتغير: `NO-GO` للنشر العام حتى إثبات نشر Supabase/Railway وE2E الحي وAAB/Google Play وAdMob وLiveKit وTikTok.


## دفعة R2 — Solo شخصي، إزالة الساحة، وإلغاء الباقة السنوية — 22 نوفمبر 2026

تم تحويل Solo في المصدر إلى رحلة لاعب واحد: migration `20261122000001_solo_no_competitor.sql` يعيد تعريف `create_solo_match_atomic` بحيث ينشئ مشارك المستخدم فقط ولا ينشئ منافس AI، بينما تعرض الواجهة شجرة المستويات والأوراق والأسئلة دون VS أو خصم. يبقى التقدم والفتح والمكافأة خادميًا، وتظل كل ورقة ثلاث أسئلة معتمدة.

تم تعطيل الباقة السنوية من كتالوج البيع عبر migration `20261122000002_remove_annual_subscription.sql`، وإزالتها من منتجات Google Play وأنواع الشراء وواجهة الترقية. أبقيت قراءة الاشتراكات السنوية القديمة ممكنة حتى انتهاء صلاحيتها، لكن لا يمكن شراء أو استعادة منتج سنوي غير نشط عبر المسار الجديد.

تمت إزالة routes وimports وبطاقة الصفحة الرئيسية الخاصة بـ«استراحة الفضاء»؛ ملفاتها القديمة غير المستوردة لم تعد جزءًا من تجربة التطبيق أو مساراته العامة. بوابات هذه الدفعة: typecheck وlint وVitest `32/32` وبوابات الإنتاج `57/57` واختبارات regression `14/14` وcontent-release وcontract inventory وproduction lock ناجحة.

لم يتم بعد تطبيق migrations أو نشر Edge Functions على Supabase في هذه اللحظة، ولم يتم إثبات نشر Railway؛ يلزم تنفيذ ذلك بعد commit من خلال صلاحيات الخدمة الفعلية والتحقق من `/ready` و`build-info.json`. القرار يبقى `NO-GO` حتى ظهور الأدلة الحية.


## تحقق النشر الخارجي بعد R2 — 22 نوفمبر 2026

تم رفع commit `4b190bf660c6809890cfbc5f89248fafa29962f6` إلى `origin/main`، وتطابق `HEAD == origin/main`. تم تثبيت Supabase CLI `3.2.0` ومحاولة ربط المشروع `jwhrbadnirwjyinplbmn`، لكن أداة Supabase أعادت صراحة `Invalid access token`؛ لذلك لم يُنفذ `db push` ولم تُنشر Edge Functions.

تم فحص عنوان Railway السابق `https://live-game-show-production-8e73.up.railway.app` بعد الرفع، وكانت `/`, `/ready`, و`/build-info.json` جميعها تعيد HTTP 404 مع `Application not found`. هذا لا يثبت نشرًا أو تشغيلًا؛ يلزم ربط خدمة Railway الصحيحة أو تحديث العنوان/الصلاحيات من لوحة Railway، ثم Deploy من commit معروف والتحقق من البصمة.
