# تقرير التسليم النهائي — قدها

**التاريخ:** 2026-11-05
**المستودع:** `heragloweg-arch/live-game-show`
**الفرع:** `main`
**Commit main النهائي للتسليم:** يثبته `DELIVERY_MANIFEST_AR.md` داخل الحزمة.
**Commit Railway المنشور والمثبت حيًا:** `fb4d3af4539ae7bbbcd8b56d824552a0bd63560b`
**Supabase:** `jwhrbadnirwjyinplbmn`
**Railway:** `https://live-game-show-production-317b.up.railway.app/`

## 1. الحكم التنفيذي

الحزمة الحالية هي **Production Candidate / Soft-Launch Candidate** وليست Store Ready أو GO. تم إغلاق مطابقة Railway للمستودع، ونجحت البوابات البرمجية، وتم فحص سجلات Supabase. بقي الإغلاق الميداني الحقيقي، Billing/AdMob/LiveKit، توقيع Android، ومراجعة أمنية كاملة خارجية قبل الإعلان.

**القرار:** `NO-GO` حتى ينفذ المالك مصفوفة E1–E8 على حسابات وأجهزة حقيقية، ثم يقرر Soft Launch من أرقام فعلية.

## 2. Railway — تم إثبات النشر المطابق

فحص `/health` أعاد HTTP 200 وخدمة `qaddaha-web`. فحص `/ready` أعاد HTTP 200، وكانت البصمة الحية:

```json
{
  "status": "ready",
  "service": "qaddaha-web",
  "build": {
    "commit": "fb4d3af4539ae7bbbcd8b56d824552a0bd63560b",
    "fingerprintSource": "git-commit"
  }
}
```

`/build-info.json` أعاد `gitCommit` مساويًا لـ`fb4d3af4...`، وهو commit موجود في `origin/main`. بذلك أُغلق M0 التشغيلي بنجاح. `contentFingerprint` بقي بيانًا ثانويًا وليس دليل النشر.

## 3. Supabase ووظائف Edge

المشروع الصحيح هو `jwhrbadnirwjyinplbmn`. الوظائف المرتبطة باللعب نشطة:

| الوظيفة | الحالة/الإصدار المرصود |
|---|---|
| `daily` | ACTIVE / v30 |
| `match` | ACTIVE / v38 |
| `answer` | ACTIVE / v16 |
| `matchmaking` | ACTIVE / v27 |
| `couple` | ACTIVE / v17 |
| `room` | ACTIVE / v18 |
| `tournament` | ACTIVE / v20 |
| `team` | ACTIVE / v22 |
| `voice` | ACTIVE / v17 |

`daily` و`match` و`couple` و`room` و`tournament` تعمل مع JWT verification حسب القائمة الحية. وظائف `team` و`creator` و`overlay` وwebhooks لها عقود وصول مختلفة ويجب اختبار أدوارها في E2E، لا اعتبارها PASS من مجرد ACTIVE.

## 4. مراجعة سجلات Supabase

نافذة الفحص: آخر 24 ساعة ضمن الحد المسموح لسجلات Supabase، من `2026-11-04T04:22:00Z` إلى `2026-11-05T04:21:00Z`.

مصادر السجلات المرصودة: `edge_logs` 330، `function_logs` 184، `workflow_run_logs` 98، `function_edge_logs` 87، إضافة إلى pgbouncer/auth/postgres وغيرها.

لم يظهر في الاستعلام العام أي `event_message` يحتوي `error` أو `exception` أو `failed` خلال النافذة. ظهرت سجلات boot/listening/shutdown و`EarlyDrop` في `function_logs`؛ لا أسجلها كعطل تطبيقي دون دليل إضافي.

### Daily

هناك طلبات authenticated ناجحة إلى `daily` بحالة HTTP 200، وطلبات قراءة:

- `daily_packs` لليوم المطلوب.
- `daily_pack_slots` مع `challenge.active=true` و`challenge.qa_status=approved`.
- `daily_pack_completions` للمستخدم والـpack.
- POST إلى `/functions/v1/daily` بحالة 200.

هذا يثبت أن مسار Daily استُخدم حيًا بنجاح، لكنه لا يثبت وحده كل حالات المكافأة والإعادة؛ يلزم سجل E2E بحساب المالك.

### Match/Solo

تم رصد 26 استجابة HTTP 200 لـ`/functions/v1/match`، مع طلب واحد HTTP 503:

```text
request_id=01a1a4dc-4505-79c1-ad17-64128bb4ecd6
timestamp=2026-11-04T04:41:02Z
execution=618ms
```

لا توجد في سجل الطلب وحده رسالة سبب تفصيلية. لذلك لا أسجل Solo كـPASS كامل، ويجب إعادة سيناريو Solo مع حفظ request ID ومراقبة السجل أثناء التنفيذ. هذا هو العطل التشغيلي الوحيد الظاهر في استعلامات 4xx/5xx لمسارات اللعب التي فُحصت.

### Couple/Room/Host/Tournament

لم تظهر خلال نافذة السجل حركة كافية يمكن أن تثبت رحلة كاملة لهذه المسارات. وجود الوظائف ACTIVE أو وجود عقود الواجهة لا يعادل اختبار start/answer/reveal/close أو إنشاء/انضمام Couple أو تقرير/جوائز البطولة. تبقى هذه المسارات `BLOCKED_EXTERNAL` حتى تشغيلها بحسابات وأدوار حقيقية.

## 5. نظام الإجابة الموحد

المكوّن `UnifiedAnswerInput` مستخدم في:

- Match/Solo.
- Daily.
- Room challenge.

العقد الحالي:

- الحروف: خانات بطول الإجابة، إكمال تلقائي عند الامتلاء، تلميح/حذف عبر المسار الموجود.
- الاختيارات: اختيار يرسل تلقائيًا دون زر إرسال مستقل.
- النص: Enter يرسل تلقائيًا، مع منع الإرسال المكرر محليًا.
- الخادم يعيد التحقق من الإجابة، ولا يعتمد على نتيجة العميل.
- Room يخفي الإجابة الصحيحة حتى reveal.
- Daily وMatch يفلتران المحتوى إلى `active=true` و`qa_status=approved`.

الفحص الثابت وجد مراجع `UnifiedAnswerInput` في المكونات الثلاثة المطلوبة، ولم يجد زرًا مستقلًا بعنوان إرسال الإجابة داخل مسارات اللعب. هذا دليل كودي وليس بديلًا عن اختبار الجهاز.

## 6. Solo وشجرة المستويات

العقد الحالي يعرّف:

- 6 فروع.
- 8 أوراق لكل فرع.
- 3 أسئلة للورقة.
- فتح الورقة التالية من تقدم خادمي لا من localStorage.
- إكمال الورقة يتطلب إجابتين صحيحتين من 3 حسب عقد RPC.
- التقدم يظهر في الشجرة ومؤشرات الورقة.

تم التحقق محليًا من idempotency وatomic progression، لكن فتح الورقة الثانية فعليًا على حساب وجهاز حقيقي ما زال جزءًا من E1.

## 7. البطولات والغرف والكابلز والمضيف

الكود والخدمات موجودة وتستخدم Edge Functions/عقودًا خادمية:

- البطولات: تسجيل، جدول، بدء مباراة، تقرير نتيجة، إنهاء، جوائز، وإنشاء بطولة لاحقة.
- Couple: status/create/join/dissolve و`create_couple` للمباراة.
- Room: start، answer، reveal، leaderboard، polling/Realtime، والتحكم المضيف.
- Host: خصم الاستضافة عبر الخادم، trial/coins/subscription، LiveKit voice عند توفر الأسرار.

لكن لا يوجد دليل ميداني كامل لهذه الرحلات في `E2E_EXECUTION_LOG_AR.md`. يجب ألا توصف بأنها مكتملة تشغيليًا قبل E5/E6/E7 وباقي مصفوفة الأدوار.

## 8. الاختبارات المحلية

نجحت:

- TypeScript typecheck.
- ESLint.
- Vitest: 21/21.
- Production gates: 50/50.
- Production lock: 97 JavaScript assets scanned.
- Content release gate: 968 audited rows.
- E2E integrity gate: 10/10 `BLOCKED_EXTERNAL` بلا PASS مزيف.
- Build fingerprint المحلي: `fb4d3af4...` و`fingerprintSource=git-commit`.

## 9. المحتوى والاقتصاد والأمن

- لا يوجد تفعيل جماعي غير موثق لبنك الأسئلة.
- المسار الإنتاجي يطلب محتوى active/approved وإجابة مغلقة.
- اعتماد المحتوى service-role مع reviewer UUID ومراجعة wording/factual والدينية عند الحاجة.
- تم إغلاق صلاحيات RPC البطولة الحساسة من anon/authenticated في migration `20261103122217_lockdown_team_tournament_rpcs`.
- جرد RLS للـ24 جدولًا بلا policy موثق، والحالة الأمنية `جزئي موثق` وليست صفر تنبيهات.
- الاقتصاد يعتمد على RPC/ledger/idempotency حسب البوابات المحلية، لكن Billing الحقيقي وPlay verification لم يُثبتا.

## 10. Android

- `applicationId`: `com.qaddaha.challenges`.
- `targetSdkVersion`: 36.
- `minSdkVersion`: 22.
- Node: v22.23.4.
- build و`npx cap sync android` ناجحان.
- لا توجد keystore أو أسرار توقيع في Git.
- AAB Release موقّع وInternal Testing يحتاجان keystore وأسرار المالك خارج Git.

## 11. المطلوب من المالك

1. توفير حسابات اختبار منفصلة مؤكدة البريد: لاعب Solo، مستخدم Daily، لاعبان 1v1، Host، Couple، Tournament، وBlocked user.
2. توفير جهاز Android فعلي أو محاكيين، شبكة Wi-Fi وشبكة جوال، وتنفيذ E1–E8 مع تسجيل request IDs وmatch IDs فقط.
3. توفير keystore خارج Git وبياناته عبر متغيرات البيئة: `RELEASE_KEYSTORE_PATH` و`RELEASE_KEYSTORE_PASSWORD` و`RELEASE_KEY_ALIAS` و`RELEASE_KEY_PASSWORD`، ثم بناء AAB من commit `fb4d3af4...`.
4. رفع AAB إلى Internal Testing في Google Play وإجراء شراء تجريبي فعلي للتحقق الخادمي.
5. توفير إعدادات AdMob الإنتاجية واختبار rewarded ad دون تسجيل PASS مزيف.
6. توفير أسرار LiveKit إذا كان الصوت ضمن Soft Launch.
7. مراجعة جرد RLS مع مالك قاعدة البيانات، وتوثيق كل service-only exception قبل إطلاق عام.
8. بعد E2E فقط: اختيار `Go` أو `Iterate` أو `Stop` بناءً على crash rate، completion، retention، وcost؛ لا تُخترع أرقام.

## 12. الملفات المسلّمة

- هذا التقرير.
- `docs/LAUNCH_STATUS.md`.
- `docs/E2E_EXECUTION_LOG_AR.md`.
- `docs/RLS_ADVISOR_INVENTORY_2026-11-04_AR.md`.
- `docs/RAILWAY.md`.
- كامل مصدر المشروع، migrations، Edge Functions، Android، و`dist` في الحزمة المضغوطة.

**الخلاصة:** Railway وSupabase يعطون أدلة تشغيلية جيدة وM0 مغلق، لكن المنتج ليس جاهزًا لإعلان متجر أو منافسة عامة حتى يُعاد اختبار 503 في Match وتُنفذ E1–E8 وAndroid/Billing/AdMob/LiveKit بحسابات وأجهزة حقيقية.
