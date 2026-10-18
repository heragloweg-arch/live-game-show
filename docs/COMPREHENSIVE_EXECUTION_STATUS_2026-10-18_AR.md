# التقرير التنفيذي الشامل — تطبيق «قدها»

**تاريخ التقرير:** 18 أكتوبر 2026  
**المستودع:** `heragloweg-arch/live-game-show`  
**الفرع المحلي:** `main`  
**آخر commit بعيد:** `339965eeb16ad291e4197fcc3e32df107dc62ce6`  
**آخر commit محلي:** `be4f097 feat: make match round advancement atomic`  
**الحالة العامة:** `Soft-Launch Candidate / PARTIAL` — ليست RC وليست جاهزة للنشر العالمي أو Google Play.

---

## 1. الخلاصة التنفيذية

«قدها» لم تعد نموذجًا أوليًا بسيطًا؛ المستودع يحتوي واجهة React/Vite/TypeScript، غلاف Capacitor Android، وظائف Supabase للعب والاقتصاد والسلامة والاشتراكات والإعلانات والصوت، ونظامًا واسعًا للغرف والمطابقة والفرق والبطولات والمحتوى.

العمل المنفذ حتى الآن ركز على تقوية المصدر والأمن وبوابات الإنتاج، ثم تنفيذ Batch 1 وBatch 2 في الحلقة الأساسية للمباراة. النتيجة التقنية الحالية جيدة من ناحية الفحوص المحلية والبوابات الساكنة، لكن الدليل التشغيلي الحي غير مكتمل. لا توجد حتى الآن أدلة كافية على:

- اختبار لعب حقيقي بين حسابين بعد التغييرات الجديدة.
- تطبيق migration الجديدة الخاصة بالانتقال الذري على Staging.
- تشغيل Deno checks في البيئة الحالية.
- اختبار LiveKit وOverlay وRLS بأدوار فعلية بعد آخر تغييرات.
- دورة شراء Google Play أو RTDN أو AdMob SSV/UMP حية.
- بناء AAB إنتاجي موقّع واختباره عبر Internal Testing.

**القرار الصادق:** نستمر في التطوير، لكن ممنوع إعلان RC أو الجاهزية العالمية أو إطلاق Google Play قبل إغلاق بوابات Staging والتكاملات الخارجية وAndroid.

---

## 2. نقطة البداية وما كان موجودًا قبل Batch 1

### 2.1 البنية الموجودة

المشروع الحالي يضم تقريبًا:

- 113 ملفًا في `src`.
- 18 وظيفة Supabase فعلية إضافة إلى `_shared`.
- 66 migration في المستودع.
- مسارات للمصادقة، الصفحة الرئيسية، اللعب، Daily، المطابقة، الغرف، المضيف، الملف الشخصي، المتجر، الاشتراكات، الفرق، الثنائي، البطولات، المبدعين، الإدارة، Overlay.
- تكامل LiveKit للصوت.
- تكاملات مهيأة برمجيًا لـ Google Play Billing وRTDN وAdMob UMP/SSV.
- بنية تحليلات ومراقبة ومحتوى ومراجعة وبلاغات وحظر.

وجود هذه الملفات لا يعني أن كل خدمة منشورة أو مختبرة حيًا؛ هذا التقرير يميز بين الكود الموجود والدليل التشغيلي.

### 2.2 الأعمال السابقة للفريق

قبل Batch 1 كانت هناك دفعات تحصين سابقة تضمنت:

- بوابات runtime والإعداد الإنتاجي و`/healthz`.
- منع مسارات Dev Billing وUnverified Purchases في الإنتاج.
- تقييد جداول الاشتراكات والإيصالات والتحليلات الداخلية.
- تفعيل RLS وتقييد قراءة الغرف والجولات.
- تقوية عدد من دوال `SECURITY DEFINER` وتثبيت `search_path`.
- إصلاحات في المطابقة والحظر والبلاغات.
- Overlay شفاف للقراءة فقط مع token مخزن كـhash وصلاحية وإبطال.
- تحصين Google Play وRTDN وAdMob SSV على مستوى الكود.
- فحوص محتوى، وبوابة إصدار اجتازت 968 سجلًا مدققًا بنيويًا.
- CI على GitHub، ونشر Railway سابق ناجح بحسب التقارير السابقة.

هذه الأعمال تمثل أساسًا قويًا، لكنها لا تغلق وحدها اختبارات التكامل الحية أو المتجر.

---

## 3. المرحلة 0 — تثبيت المصدر والحوكمة

### ما تم

- تحديد المستودع الصحيح: `heragloweg-arch/live-game-show`.
- فحص الفرع `main` وسجل GitHub وCI والـPRs.
- تثبيت نسخة عمل محلية دائمة في:

`/home/ubuntu/projects/project-affaac16/live-game-show`

- إنشاء `plan.md` بخطة موحدة من Soft Launch إلى المنتج العالمي.
- إنشاء `TODO.md` بمعايير نتائج واضحة.
- تسجيل Batch 1 وBatch 2 في commits محلية منفصلة.
- الاحتفاظ بتاريخ المصدر دون force-push أو إعادة كتابة.

### الأدلة

- CI أخضر على commit البعيد `339965e` بحسب سجل GitHub.
- الفرع المحلي حاليًا متقدم بــcommitين عن `origin/main`:
  - `09b5c2f` — إصلاح انتظار الخصم وسباق Realtime.
  - `be4f097` — الانتقال الذري بين الجولات.

### المتبقي

- مراجعة التغييرات محليًا ثم قرار دفعها إلى GitHub.
- تشغيل CI على commit Batch 2 نفسه، وليس الاكتفاء بنتائج commit سابق.
- مطابقة سجل migrations في Supabase مع ملفات المصدر قبل تطبيق أي migration جديدة.
- إعداد Staging حقيقي أو إجراء واضح يمنع الكتابة غير المقصودة على Production.
- اعتماد مشروع Webdev وربط إعدادات Preview/diagnostics إذا أصبح ذلك مسار التسليم المعتمد.

**الحالة:** `PARTIAL / SOURCE CONTROLLED`.

---

## 4. Batch 1 — إصلاح حالة الجولة وتجربة الانتظار

### ما تم تنفيذه

تم إصلاح خلل كان يحول رد `ROUND_NOT_READY` إلى شاشة خطأ، رغم أن الحالة طبيعية في 1v1 عندما لم يجب الخصم بعد.

التغييرات:

- إضافة `MatchApiError` في `src/services/api/matchApi.ts` لحفظ `status` و`code`.
- عند `ROUND_NOT_READY` يعيد العميل تحميل حالة المباراة بدل إنهاء المسار.
- إبقاء اللاعب في `round_result` مع رسالة عربية واضحة.
- منع Realtime من إعادة `phase` إلى `playing` وإخفاء نتيجة الجولة.
- منع حالات `ANSWER_SUBMITTED` و`ROUND_RESULT` من طمس المرحلة المحلية.

### المراجعة المستقلة

أثناء المراجعة ظهر سباق فعلي في callback الخاص بـRealtime، وتم إصلاحه قبل تسجيل Batch 1. هذه نقطة مهمة لأن المراجعة لم تكن شكلية؛ تم العثور على regression وإصلاحه.

### التحقق

- `typecheck`: ناجح.
- `lint`: ناجح.
- Vitest: 7 ملفات و19 اختبارًا ناجحًا.
- Vite build: ناجح.
- Production artifact gate: ناجح.
- Static launch gate: ناجح.
- Content gate: ناجح.

### المتبقي من Batch 1

- اختبار حي لحسابين في 1v1.
- اختبار إجابة الخصم بعد ظهور نتيجة اللاعب.
- اختبار انتهاء الوقت ثم الضغط على الجولة التالية.
- اختبار انقطاع وعودة الشبكة أثناء `ANSWER_SUBMITTED`.
- اختبار فعلي يمنع التكرار في الإجابة والمكافأة.

**الحالة:** `CODE VERIFIED / LIVE TEST OPEN`.

---

## 5. Batch 2 — الانتقال الذري بين الجولات

### ما تم تنفيذه

أضيفت migration:

`supabase/migrations/20261018030000_atomic_match_round_advance.sql`

وتضيف:

- العمود `rounds.ai_score_applied`.
- الدالة الخادمية `public.advance_match_round(uuid, integer, integer)`.
- قفل المباراة ثم الجولة في نفس المعاملة.
- فحص رقم الجولة المتوقع لمنع stale requests.
- فحص عدد اللاعبين والإجابات وانتهاء الوقت.
- حالات واضحة للرفض والانتقال.
- صلاحية `service_role` فقط، مع سحب التنفيذ من `anon` و`authenticated`.

تم تعديل `supabase/functions/match/index.ts` بحيث:

- لا تغلق الجولة بتحديث مباشر منفصل.
- تستخدم RPC واحدًا للانتقال.
- تحسب Delta نقاط AI ثم تجعل المعاملة تطبقه مرة واحدة.
- تمنع مضاعفة نقاط AI عند إعادة الطلب.
- تعالج `STALE_ROUND` و`ROUND_ALREADY_FINISHED` دون كسر حالة العميل.

تم أيضًا توحيد عقد `nextRound` ليعيد `MatchResponse` دائمًا، ومنع إعادة طلب التسوية عند وجود المكافآت في استجابة الإنهاء.

### الاختبارات المحلية

- `npm run typecheck`: ناجح.
- `npm run lint`: ناجح.
- Vitest: **19/19**.
- بوابات الإنتاج: **11/11**، منها اختبارا Batch 2 الجديدان.
- `npm run build`: ناجح.
- `verify-production`: فحص 91 أصل JavaScript بنجاح.
- Content gate: 968 سجلًا.
- Static launch configuration gate: ناجح.
- `git diff --check`: ناجح.

### ما لم يتم

- لم تطبق migration على Supabase.
- لم يثبت SQL فعليًا على Staging.
- لم ينفذ Deno check لأن Deno غير مثبت في Sandbox.
- لم يختبر طلبان متزامنان فعليًا ضد قاعدة بيانات.
- لم يختبر عدم مضاعفة AI على قاعدة حية.

**الحالة:** `PARTIAL / CODE VERIFIED` وليست `PASS` تشغيليًا.

التقرير التفصيلي:

[Batch 2 — الانتقال الذري بين الجولات](./BATCH2_ATOMIC_ROUND_ADVANCE_2026-10-18_AR.md)

---

## 6. مصفوفة المراحل الكبرى

| المرحلة | الهدف | المنفذ | المتبقي | الحالة |
|---|---|---|---|---|
| 0 | تثبيت المصدر والحوكمة | مستودع محدد، خطة، TODO، commits محلية، CI سابق | دفع Batch 2، تشغيل CI على commit الجديد، Staging مطابق | PARTIAL |
| 1 | الحلقة الأساسية للمباراة | منع demo في الإنتاج، عقود mode الأساسية، إصلاح الانتظار، RPC انتقالي ذري | Live 1v1، reconnect، reveal، اختبارات التزامن، تطبيق migration | PARTIAL |
| 2 | المحتوى الذهبي | بوابة بنيوية، 968 صفًا مدققًا، QA status وبنك مراجعة | 300 سؤال ذهبي بمراجعة بشرية، مصادر وشرح وقياسات جودة | PARTIAL |
| 3 | Daily Loop | Daily وتحدٍ وسلسلة ومكافآت موجودة | حزمة 3 دقائق، أهداف 3/5/7، حماية الانقطاع، اقتراح الجلسة التالية، cohort analytics | PARTIAL |
| 4 | الاجتماعي والاقتصاد | 1v1، دعوات، غرف، فرق، بطولات، متجر، XP، اشتراكات | social graph، rematch مترابط، تجميل واضح، join tournament ذري، ledger كامل | PARTIAL |
| 5 | الأمن والتشغيل الحي | RLS على الجداول، تقوية RPC، بلاغات وحظر، Overlay، assertions SQL | اختبار أدوار حي، LiveKit ejection، Overlay/QR، حذف الحساب، Auth settings، audit/rate limits | PARTIAL |
| 6 | الربح وSoft Launch | كود Billing وRTDN وUMP وSSV وبوابات إعداد | Play Console، Service Account، Pub/Sub، AdMob IDs، callbacks حية، AAB، Internal Testing | BLOCKED EXTERNAL |
| 7 | التوسع العالمي | تصميم عربي أولًا وخطة locale/region ومؤشرات | Soft Launch cohort، D1/D7/D14، eCPM/ARPDAU، Android Vitals، قرار Go/Iterate/Stop | NOT STARTED |

---

## 7. حالة الأمن وقاعدة البيانات

بحسب آخر تقرير تدقيق موثق بتاريخ 18 أكتوبر:

- جداول `public`: **57**.
- الجداول التي عليها RLS: **57/57**.
- جداول بلا RLS: **0**.
- امتيازات خطرة TRUNCATE/TRIGGER/REFERENCES للعميل: **0**.
- دوال `SECURITY DEFINER` العامة/الخاصة بلا `search_path` مثبت: **0** بحسب assertion.
- `private.is_current_user_room_member(uuid)` غير قابلة للتنفيذ من أدوار العميل.
- RPC الملف العام allow-list مقصودة ومثبتة الحقول و`search_path`.

### التحذيرات المفتوحة

- 16 جدولًا عليها RLS بلا policies؛ قد يكون ذلك مقصودًا للجداول الداخلية، لكن يلزم توثيق كل جدول واختبار مسار الخدمة.
- `get_public_profiles` متاحة للعميل عمدًا؛ يلزم اختبارها من anon وauthenticated بعد آخر migration.
- تحذيرات anonymous تحتاج قرارًا حسب نموذج الضيف والبيانات المقصودة.
- حماية كلمات المرور المسرّبة في Supabase Auth لم يثبت تفعيلها بعد.
- لا توجد مصفوفة كاملة موثقة بحسابات anon/authenticated/host/member/admin/service role لكل المسارات.

**الحالة:** التحصين البنيوي جيد، لكن الاعتماد التشغيلي والأمني النهائي غير مغلق.

---

## 8. حالة المحتوى وجودة اللعبة

البنية الحالية تشمل:

- `qa_status` ومسار مراجعة.
- بوابة تمنع التفعيل الجماعي غير المراجع.
- فحص لعقود الإجابة.
- فحص 968 صفًا.
- دعم أنواع speed/words/knowledge/mystery.
- accepted answers وchoices وvalidation modes.

لكن فحص البنية لا يثبت:

- صحة كل إجابة معرفيًا.
- وضوح السؤال وعدم التباسه.
- جودة الترجمة واللهجات.
- توازن الصعوبة.
- عدم التكرار بالنسبة للمستخدم نفسه.
- عدم وجود تحيز أو حساسية ثقافية غير مراجعة.
- تفسير رفض الإجابة المفتوحة.

الهدف المعتمد هو 300 سؤال ذهبي بمراجعة بشرية قبل التوسع إلى 1000، مع قياس `p_correct` و`median_response_ms` و`drop_rate`.

**الحالة:** بوابة بنيوية ناجحة، إنتاج المحتوى الذهبي لم يغلق.

---

## 9. حالة Daily والاحتفاظ

الموجود حاليًا:

- شاشة Daily.
- تحدٍ يومي وسلسلة.
- مكافآت يومية وأسبوعية جزئية.
- أحداث تحليلات أساسية.

المطلوب لبناء عادة يومية حقيقية:

1. حزمة Daily واضحة مدتها ثلاث دقائق.
2. سؤال افتتاحي ثم سرعة ثم سؤال اجتماعي/لغز.
3. مؤشرات 3/5/7 أيام.
4. حماية من فقدان السلسلة بعد انقطاع واحد.
5. نتيجة قابلة للمشاركة.
6. اقتراح واضح بعد الفوز أو الخسارة.
7. قياس خادمي D1/D3/D7/D14/D30 بدل الاعتماد على localStorage أو `dau: 1` يدوي.

**الحالة:** موجودة كميزة، لكنها ليست بعد حلقة احتفاظ مكتملة.

---

## 10. حالة الاقتصاد والربح

### الموجود برمجيًا

- XP ومستويات.
- Coins ومحفظة وledger في أجزاء من النظام.
- اشتراكات Google Play في الكود.
- RTDN والتحقق الخادمي.
- AdMob UMP وSSV في الكود.
- حدود مكافأة الإعلان ومحاولات يومية.
- متجر وميزات Plus وHost Pro.

### غير المثبت تشغيليًا

- منتجات وخطط Google Play حية.
- Service Account وAndroid Publisher API.
- Pub/Sub push وOIDC audience.
- AdMob production IDs.
- UMP messages للأسواق الفعلية.
- SSV callback موقّع ومكرر ومتأخر.
- شراء واستعادة وتجديد وإلغاء واسترداد حي.
- AAB إنتاجي موقّع.
- Play Internal Testing.

القاعدة التجارية المعتمدة: الاشتراك يبيع إزالة الإعلانات والتخصيص والإحصائيات، ولا يبيع أفضلية تنافسية؛ الإعلانات لا تمنح عملات إلا عبر SSV موثوق وidempotency.

**الحالة:** الكود موجود جزئيًا، الربح الحي متوقف على إعدادات خارجية واختبارات فعلية.

---

## 11. حالة Android والمتجر

الموجود:

- مشروع Capacitor Android.
- إعدادات SDK وGradle.
- فحوص إعدادات توقيع.
- APK تطويري سابق.
- إعدادات Billing وAds في الكود.

غير موجود كدليل إطلاق:

- AAB Production موقّع من commit معتمد.
- Upload key محفوظ في CI أو Secret Manager.
- Play App Signing وInternal Testing مكتملان.
- اختبار على أجهزة حقيقية متعددة.
- Android Vitals وcrash-free baseline.
- Data Safety، Privacy، Account deletion، Store listing مكتملة ومراجعة.

**الحالة:** BLOCKED حتى تجهيز الاعتمادات وبناء AAB واختباره.

---

## 12. المراحل المتبقية بالترتيب التنفيذي

### المرحلة التالية المباشرة — إغلاق Batch 2 على Staging

- مطابقة سجل Supabase مع migrations الحالية.
- تطبيق migration الجديدة على Staging فقط.
- تشغيل Deno check لكل الوظائف.
- اختبار تزامن `next_round`، انتهاء الوقت، stale request، المباراة النهائية، وAI idempotency.
- اختبار صلاحية RPC من الأدوار المختلفة.

### بعد ذلك — Batch 3: نظام المحتوى الذهبي

- validator مشترك لكل قالب.
- منع السؤال اليتيم بنيويًا.
- اعتماد 300 سؤال ذهبي بمراجعة بشرية.
- مصادر وشرح وlocale/difficulty.
- منع التكرار وقياس جودة السؤال.

### Batch 4: Daily Loop والقياس

- Daily Pack ثلاث دقائق.
- سلسلة 3/5/7 وحماية الانقطاع.
- next action بعد كل نتيجة.
- event taxonomy خادمية وcohort retention.

### Batch 5: الاقتصاد والعودة الاجتماعية

- social graph بسيط.
- rematch ومنافسون أخيرون.
- تجميل واضح وXP unlocks.
- join tournament ذري وledger/idempotency.

### Batch 6: الأمان والتكاملات الحية

- مصفوفة RLS كاملة.
- LiveKit ejection.
- Overlay وQR وOBS.
- البلاغ والحظر وسجل التدقيق.
- حذف الحساب والاحتفاظ.
- Auth leaked-password protection.

### Batch 7: الربح وAndroid

- Google Play وRTDN.
- AdMob UMP وSSV.
- AAB موقّع.
- Internal Testing.
- اختبارات شراء وإعلانات كاملة.

### Batch 8: Soft Launch عربي محدود

- Cohort محدود.
- مراقبة D1/D7/D14 وDaily completion وsession 2 وrematch.
- crash-free وlatency وeCPM وARPDAU وPlus conversion.
- قرار Go / Iterate / Stop.

### المرحلة العالمية

لا تبدأ قبل إثبات الاحتفاظ والربحية والجودة في السوق العربي الأول. بعدها نفصل locale عن content locale عن region، نضيف الترجمة، نراجع المحتوى ثقافيًا، ونوسع تدريجيًا.

---

## 13. بوابات تمنع إعلان RC

لا يمكن إعلان RC قبل وجود أدلة حديثة على كل ما يلي:

1. Node `>=22.22.0` وCI أخضر على commit النهائي.
2. Typecheck وlint وVitest وbuild وproduction gate وDeno check وaudit.
3. Migrations مطابقة على Staging ومختبرة مع خطة rollback.
4. RLS/GRANTs/SECURITY DEFINER مختبرة بأدوار فعلية.
5. Solo و1v1 والغرف وإعادة الاتصال والانتقال الذري مثبتة حيًا.
6. LiveKit وOverlay وQR وبلاغ/حظر مختبرة.
7. Content golden cohort معتمد ومقاس.
8. Daily Loop وقياس retention خادمي.
9. Google Play Billing وRTDN حيّان بحسابات اختبار.
10. AdMob UMP/SSV حيّان مع منع التكرار.
11. AAB موقّع وInternal Testing ناجح.
12. Privacy/Data Safety/Account deletion/Store metadata مكتملة.
13. Soft Launch عربي ببيانات كافية وقرار توسع مبني على النتائج.

---

## 14. القرار الحالي

**المنتج قابل لاستكمال التطوير، وليس قابلًا بعد للإطلاق العالمي.**

Batch 1 وBatch 2 حسّنا موثوقية الحلقة الأساسية، ونجحت الفحوص المحلية، لكنهما لا يعوضان اختبار Staging أو التكاملات الحية. الخطوة الصحيحة التالية هي إغلاق دليل Batch 2 تشغيليًا على Staging، ثم الانتقال إلى جودة المحتوى وDaily Loop والقياس بدل إضافة أوضاع لعب جديدة.
