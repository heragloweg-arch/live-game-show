# تقرير التسليم النهائي المرحلي — المراحل 0 و1 و2

**التاريخ:** 18 أكتوبر 2026  
**المشروع:** تطبيق «قدها»  
**المستودع:** `heragloweg-arch/live-game-show`  
**الفرع المحلي الوحيد:** `main`  
**آخر commit محلي:** `1749c4c docs: add comprehensive execution status report`  
**آخر commit على GitHub:** `339965eeb16ad291e4197fcc3e32df107dc62ce6`  
**القرار:** لا يجوز وصف المراحل 0–2 بأنها مغلقة إنتاجيًا بالكامل؛ الكود والاختبارات المحلية متقدمة، لكن بوابات خارجية لازالت مفتوحة.

---

## 1. طلب التنفيذ وما تم اعتماده

كان المطلوب إنهاء المراحل 0 و1 و2 بكل باتشاتها، عدم ترك فروع أخرى، إرسال تقرير كامل، وتسليم حزمة التطبيق طبقًا لآخر نسخة من المستودع.

تم التعامل مع الطلب وفق قاعدة الصدق التشغيلي: لا يتم تسجيل `PASS` أو وصف نسخة بأنها Production Ready إذا كان الدليل غير موجود. تم تنفيذ كل ما يمكن تنفيذه بأمان داخل المستودع، ورفض تجاوز متطلبات Staging أو صلاحيات GitHub أو المراجعة البشرية للمحتوى.

---

## 2. حالة المصدر والفروع

الحالة المحلية نظيفة، والفرع المحلي الوحيد هو `main`. لا توجد فروع محلية أو فروع عمل إضافية مطلوبة للتسليم.

التاريخ المحلي يحتوي ثلاثة commits فوق النسخة البعيدة:

```text
09b5c2f fix: preserve match round result while waiting for opponent
be4f097 feat: make match round advancement atomic
1749c4c docs: add comprehensive execution status report
```

محاولة الدفع إلى `origin/main` فشلت مرتين بسبب عدم صلاحية اعتماد GitHub الحالي:

```text
403 Permission denied
fatal: Authentication failed
```

حالة GitHub الفعلية بقيت:

```text
origin/main = 339965eeb16ad291e4197fcc3e32df107dc62ce6
branches = main فقط
```

إذًا لا توجد فروع زائدة، لكن آخر ثلاثة commits لم تصل إلى GitHub بسبب صلاحيات خارجية لا يمكن تجاوزها بأمان من داخل المشروع.

---

## 3. المرحلة 0 — المصدر والحوكمة والبوابات

### المنفذ

- تحديد المستودع الصحيح وربطه بنسخة عمل محلية ثابتة.
- إنشاء الخطة التنفيذية `plan.md`.
- إنشاء قائمة النتائج `TODO.md`.
- تثبيت commits Batch 1 وBatch 2 والتقرير التنفيذي.
- إضافة migration جديدة مرقمة ومتسقة داخل `supabase/migrations`.
- تشغيل بوابات المصدر والإنتاج والمحتوى محليًا.
- التحقق من عدم وجود ملفات بيئة أو مفاتيح خاصة ضمن ملفات Git.
- التأكد من أن الفرع المحلي الوحيد هو `main`.
- بناء `dist` من آخر نسخة محلية.

### الأدلة

نجحت البوابات التالية من آخر نسخة محلية:

- `npm run typecheck`
- `npm run lint`
- `npm test -- --run`: 19/19.
- `npm run build`
- `node scripts/verify-production.mjs`: فحص 91 أصل JavaScript.
- `npm run test:production-gates`: 11/11.
- `node scripts/verify-content-release.mjs`.
- `LAUNCH_GATE=static npm run verify:launch-config`.
- `git diff --check`.

### غير المغلق

- GitHub Push غير ممكن حاليًا بسبب 403/invalid credentials.
- CI لم يعمل على commits الثلاثة الجديدة لأن الدفع فشل.
- لا توجد بيئة Staging منفصلة مثبتة يمكن مطابقة migrations عليها.
- Node المحلي `22.13.0` بينما المشروع يعلن `>=22.22.0`؛ CI المعلن يستخدم `22.22.0`.
- Supabase CLI غير مثبت في Sandbox.
- Deno غير مثبت، ومحاولة تنزيله فشلت بسبب نقل ملف جزئي من الشبكة.

**حالة المرحلة 0:** `LOCAL PASS / EXTERNAL BLOCKED`.

---

## 4. المرحلة 1 — حلقة المباراة الأساسية

### Batch 1: انتظار الخصم وRealtime

تم تنفيذ:

- إضافة `MatchApiError` لحفظ HTTP status وerror code.
- معالجة `ROUND_NOT_READY` كحالة لعب طبيعية.
- إعادة مزامنة حالة المباراة عند انتظار الخصم أو انتهاء الوقت.
- إبقاء اللاعب في نتيجة الجولة بدل تحويله إلى شاشة Error.
- منع Realtime من تغيير المرحلة المحلية إلى `playing` عند `ANSWER_SUBMITTED` أو `ROUND_RESULT`.
- إصلاح سباق اكتشفته مراجعة مستقلة قبل تسجيل Batch 1.

### Batch 2: الانتقال الذري

تم تنفيذ:

- إضافة migration:

```text
supabase/migrations/20261018030000_atomic_match_round_advance.sql
```

- إضافة `rounds.ai_score_applied`.
- إضافة RPC:

```text
public.advance_match_round(uuid, integer, integer)
```

- قفل `matches` ثم `rounds` داخل transaction واحدة.
- فحص الجولة المتوقعة لمنع stale requests.
- فحص عدد اللاعبين وإجاباتهم وانتهاء الوقت.
- فصل الحالات `ROUND_NOT_READY` و`STALE_ROUND` و`ROUND_ALREADY_FINISHED` و`MATCH_FINISHED`.
- منع أدوار `anon` و`authenticated` من تنفيذ RPC.
- تطبيق Delta نقاط AI داخل transaction مرة واحدة فقط.
- إزالة تحديثات الجولة المباشرة المتنافسة من Edge Function.
- جعل `nextRound` يعيد `MatchResponse` موحدًا.
- منع إعادة التسوية عند وجود rewards في response النهائي.
- إضافة اختبار ساكن للـRPC والـEdge Function داخل بوابات الإنتاج.

### الاختبارات المحلية

كل الاختبارات المحلية المذكورة في المرحلة 0 ناجحة. كما نجحت فحوص Batch 2 الساكنة التي تثبت وجود القفل والـidempotency ومنع التحديث المباشر.

### غير المغلق إنتاجيًا

لا يوجد دليل حي حتى الآن على:

- تطبيق migration على Staging.
- تشغيل `deno check` لكل Edge Functions.
- لاعبين حقيقيين يرسلان `next_round` في نفس اللحظة.
- انتهاء وقت حقيقي ثم انتقال الجولة.
- مباراة نهائية وتسوية rewards على قاعدة محدثة.
- عدم مضاعفة نقاط AI ضد قاعدة حقيقية.
- اختبار reconnect أثناء submit أو transition.
- اختبار Reveal الآمن في 1v1 من عميلين.

**حالة المرحلة 1:** `CODE VERIFIED / STAGING REQUIRED`.

---

## 5. المرحلة 2 — المحتوى الذهبي

### المنفذ

- بوابة بنيوية للمحتوى تمنع bulk activation.
- migration لمراجعة بنك الأسئلة.
- حالات QA داخل البنك.
- accepted answers وchoices وvalidation modes.
- بوابة إصدار المحتوى.
- فحص محلي ناجح للمحتوى.

### القياس المحلي

طابور المحتوى المحلي:

```text
review-queue.json: 1119 سؤالًا
needs_review_structurally_eligible: 968
needs_review: 151
active: false لكل الطابور
```

هذا يعني أن 968 سؤالًا مؤهلون بنيويًا للمراجعة، وليس أنهم خضعوا لمراجعة بشرية أو أصبحوا Production Approved.

### القياس من Supabase الحالي

تمت قراءة قاعدة Supabase الحالية بصلاحية قراءة فقط، وكانت النتيجة:

```text
rows: 533
qa_status: approved = 533
active: true = 533
أنواع الأسئلة: speed = 122, words = 402, mystery = 9
```

الملاحظة المهمة: قاعدة الإنتاج الحالية تعرض 533 سؤالًا approved/active، لكن ذلك لا يثبت وحده الجودة المعرفية أو التنوع أو عدم التكرار أو وجود مراجعة بشرية موثقة لكل سؤال.

### غير المغلق

- لا يوجد manifest موثق يثبت هوية المراجع البشري لكل سؤال.
- لا توجد أدلة مصادر وشرح ومراجعة fact-check لكل الدفعة الذهبية.
- لا توجد قياسات إنتاجية مستقرة لـ`p_correct` و`median_response_ms` و`drop_rate`.
- لا يوجد تثبيت رسمي لـ300 سؤال ذهبي بعد مراجعة بشرية وفق تعريف الجودة.
- لا يصح تحويل 968 سؤالًا إلى approved تلقائيًا؛ ذلك يخالف بوابة المحتوى ويخاطر بجودة المنتج.

**حالة المرحلة 2:** `STRUCTURAL PASS / HUMAN QA OPEN`.

---

## 6. الحزمة التي سيتم تسليمها

تم بناء `dist` بنجاح من آخر commit محلي. الحزمة الكاملة تتضمن:

- مصدر React/Vite/TypeScript.
- `dist` المبني.
- Supabase Edge Functions.
- جميع migrations، بما فيها Batch 2.
- تطبيق Android/Capacitor الموجود في المستودع.
- الاختبارات والبوابات.
- المحتوى المحلي والتوثيق.
- manifest يوضح commit والاختبارات والقيود.

لا تتضمن الحزمة:

- `node_modules`.
- `.git`.
- مفاتيح البيئة أو Service Account أو keystore.
- مفاتيح Google Play أو AdMob.
- أي أسرار مأخوذة من بيئة التنفيذ.

الحزمة ليست AAB موقّعًا؛ هي حزمة المصدر والتنفيذ. Android SDK غير موجود في Sandbox، لذلك لا يمكن اعتبارها متجرية أو موقعة.

---

## 7. ما يلزم لإغلاق المراحل فعلًا

### لإغلاق المرحلة 0

1. إصلاح صلاحيات GitHub أو تنفيذ الدفع من جهاز/حساب لديه write access.
2. تشغيل CI على commit النهائي.
3. تحديد مشروع Staging منفصل أو اعتماد خطة rollback وموافقة تشغيلية واضحة.
4. مطابقة سجل Supabase مع كل migrations حتى `20261018030000`.

### لإغلاق المرحلة 1

1. تثبيت Deno وتشغيل كل Edge checks.
2. تطبيق migration Batch 2 على Staging فقط.
3. تنفيذ سيناريوهات لاعبين متزامنين.
4. اختبار reconnect وtimeout وfinal settlement وAI idempotency.
5. مراجعة output وإغلاق أية فروق schema/RLS.

### لإغلاق المرحلة 2

1. اختيار 300 سؤالًا ذهبيًا منظمًا.
2. مراجعة بشرية/تحريرية وفactual review حسب النوع.
3. توثيق المصدر والشرح والإجابة والـlocale والـdifficulty.
4. إصدار approval manifest عبر service role فقط.
5. تشغيل monitoring أولي للتكرار والدقة والزمن والتخطي.

---

## 8. القرار النهائي

تم تنفيذ وتسليم كل الأعمال التي يمكن تنفيذها بأمان داخل المستودع الحالي، وتم تجهيز نسخة مصدر كاملة قابلة للمراجعة والبناء.

لكن لا يجوز تسجيل العبارة التالية لأنها غير صحيحة حاليًا:

> «المراحل 0 و1 و2 مغلقة إنتاجيًا دون نقاط متبقية.»

العبارة الدقيقة هي:

> **المراحل 0–2 متقدمة كوديًا، واجتازت البوابات المحلية، لكن المرحلة 0 متوقفة على GitHub/CI وStaging، والمرحلة 1 متوقفة على اختبار Supabase/Deno الحي، والمرحلة 2 متوقفة على مراجعة بشرية واعتماد محتوى موثق.**
