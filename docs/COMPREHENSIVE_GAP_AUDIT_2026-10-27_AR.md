# التدقيق الشامل للفجوات والنواقص — قدها

**التاريخ:** 27 أكتوبر 2026  
**نطاق التدقيق:** المستودع، Edge Functions، migrations/RLS/RPC، React/UX/analytics، CI/CD، Supabase Staging، Railway، Android، الوثائق والدفعات.  
**المرجع قبل هذه المعالجة:** `8dac3ff8`.

## الحكم التنفيذي

المشروع يمر بفحوصات الكود والبناء المحلية، لكن لا يصح إعلان `GO` تشغيلياً. التدقيق كشف فجوات عالية الخطورة في الذرية وidempotency والاقتصاد وإنشاء المباريات وطوابير الفرق ونتائج البطولات وحذف الحساب، إضافة إلى فجوات تحليلية ووثائق إطلاق متناقضة. بعض النقاط السهلة عولجت في هذه الدفعة، أما الإصلاحات التي تتطلب RPC/transaction واختبارات تزامن فتحتاج دفعة هندسية مستقلة.

## نقاط عولجت في هذه الدفعة

| النقطة | المعالجة |
|---|---|
| إعداد `functions.scoring` الميت | أُزيل من `supabase/config.toml`؛ scoring موجودة كـ`_shared` وليست Edge Function مستقلة. |
| أحجام الفرق 8/10/15 | حُصرت واجهة Team في 1/2/3/5 لتطابق حد الخادم. |
| Rematch للـCouples/Team | لم يعد الزر يحول المباراة إلى Solo؛ يظهر Rematch فقط لـ1v1، وتظهر عودة آمنة للأنماط الأخرى. |
| ازدواج `match_finish` | أزيل الإرسال المكرر من `MatchScreen`، وبقيت طبقة lifecycle الخادمية/الـhook مالكة للحدث. |
| وثائق المالك | صُحح commit المرجعي إلى `8dac3ff8` وحالة C4–C9 إلى `STAGING_DEPLOYED / EVIDENCE_REQUIRED`. |

## فجوات عالية الخطورة ما زالت مفتوحة

| الشدة | الفجوة والدليل | القرار والإجراء المطلوب |
|---|---|---|
| HIGH | `daily_bonus` يقرأ ثم يمنح ثم يسجل في `supabase/functions/economy/index.ts` بصورة منفصلة؛ و`match_reward` يعتمد على SELECT قبل `credit_coins`. | بناء RPC claim ذرية بـ`INSERT ... ON CONFLICT` أو `SELECT FOR UPDATE` تجمع الفحص والمنح والـledger، مع اختبار تزامن/replay. |
| HIGH | إنشاء Solo و1v1/AI وCouples وTeam ينشئ `matches` ثم participants ثم rounds بطلبات منفصلة مع تجاهل بعض الأخطاء. | نقل إنشاء المباراة إلى RPC/transaction موحدة، أو تنفيذ cleanup مؤكد قبل إعادة الخطأ؛ لا تُرجع VS قبل اكتمال السجلات. |
| HIGH | Team queue وpickup يقرآن الصفوف ثم ينشئان المباراة/الفريق ويحدثان الحالة بلا lock/claim ذري. | RPC `claim_team_queue` و`claim_pickup_batch` مع `FOR UPDATE SKIP LOCKED` وقيود uniqueness واختبار مزدوج. |
| HIGH | `tournament.report_result` يحدّث match ثم standings والتقدم في خطوات منفصلة. | RPC ذرية تقفل fixture وتنفذ transition مرة واحدة وتحدث النقاط والتقدم والجوائز idempotently. |
| HIGH | حذف الحساب لا يثبت حذف/فك ملكية `teams.owner_id`، والعمود `NOT NULL` بلا `ON DELETE`. | اختبار delete لمستخدم مالك فريق، ثم migration حذف أو `SET NULL` بسياسة واضحة. |
| HIGH | `daily.submit_slot` ومسارات RPC القديمة لا تثبت دائماً أن challenge ما زال active/approved أو أن slot يتبع pack نفسه. | إضافة نفس invariants داخل RPC الذرية، لا الاعتماد على Edge Function وحدها، واختبارات pack/day/challenge mismatch. |
| HIGH | شاشة Metrics ما زالت تعرض retention محلياً، وD14 غير موجود في contract العميل. | جعل الخادم/`analytics_daily` المصدر الرسمي، إضافة D14 للعرض التشخيصي، ووسم localStorage كـQA-only أو إزالته من snapshot. |
| HIGH | `session_2_start` معلن دون استدعاء فعلي، وsession2 الخادمي يعتمد على Daily opens بينما المقام من match participants. | تعريف session/cohort ومقام موحدين، وتسجيل app_open بعد auth بـuser ID، ثم إعادة حساب cohorts. |
| HIGH | `match_abandon` معلن دون تسجيل، وlatency يسجل نجاح الإجابة فقط. | إضافة exit guard و`exit_reason` وrequest IDs، وتسجيل latency/failure في مسار الخطأ دون جعل العميل مصدر الحقيقة. |

## فجوات متوسطة

- Room join يستخدم count ثم upsert بصورة قابلة لتجاوز `max_participants` بالتزامن؛ go_live/end_room والفوترة ليست transition واحدة كاملة.
- event contract لا يطابق أسماء Daily المستخدمة فعلياً (`daily_start`/`daily_complete` مقابل pack/slot events).
- Couple/Team لا يملكان Rematch خادمياً؛ تم منع تحويلهما الخاطئ إلى Solo، لكن Rematch حقيقي لهما لم يُبنَ بعد.
- يلزم اختبار حي لتسلسل حذف الحساب مع كل FK غير cascade، وليس الاكتفاء بالـmigration الساكنة.

## فجوات خارجية لا يمكن إغلاقها من الكود وحده

| المجال | الحالة الحالية |
|---|---|
| Supabase role matrix وbackup وRLS drift | Staging منشور إدارياً، لكن لا توجد أدلة R-01 إلى R-10 بحسابات anon/authenticated/host/member/blocked/admin/service_role. |
| Railway | لا يوجد دليل أن الخدمة الخارجية هي `qaddaha-web`؛ `/ready` في الدليل السابق كان يعيد 404 من خدمة مختلفة. |
| Android | لا توجد keystore/AAB موقعة ونتيجة Internal Testing محفوظة. |
| Billing/RTDN وAdMob/UMP/SSV وLiveKit وTikTok | تحتاج أسرار وحسابات ومراجعات خارجية ودليل replay/limits. |
| E2E | السيناريوهات العشرة ما زالت `BLOCKED_EXTERNAL`؛ الاختبار المحلي لا يحولها إلى PASS. |
| محتوى الإصدار 41 | Staging يحتوي 922 سؤالاً؛ 910 لها إجابات مغلقة و12 بلا إجابة. الـ12 تبقى مستبعدة، والـ910 تحتاج `reviewer UUID` وسجل اعتماد service-role قبل التفعيل. |

## تناقضات وثائقية أُغلقت جزئياً

تم تصحيح commit في OWNER_MATRIX وحالة دفعة القياس بعد نشرها. ما يزال يلزم إنشاء `PACKAGE_MANIFEST.json` من نفس commit، وتوسيم التقارير التاريخية بوضوح، وربط كل حالة تشغيلية بـdeployment/request ID. لا ينبغي استخدام `RELEASE_MANIFEST_AR.md` أو أي تقرير قديم بديلاً عن `LAUNCH_STATUS.md`.

## بوابات التحقق المطلوبة للدفعة التالية

1. بناء RPCs الذرية للاقتصاد والمطابقة وTeam والبطولة وDaily وRoom.
2. إضافة اختبارات concurrency/replay لكل claim وtransition.
3. تشغيل مصفوفة حذف الحساب وRLS على Staging مع backup موثق.
4. توحيد Analytics contract وتنفيذ D14/session2/abandon/failure latency ثم تشغيل `rebuild_day` على cohorts غير فارغة.
5. تحديث manifest والحزمة والوثائق مع commit/deployment IDs.
6. تنفيذ E2E وAAB وRailway والتكاملات الخارجية قبل أي قرار GO.

**القرار:** `NO-GO` للإطلاق العام حالياً. الحالة الصحيحة: **Production Candidate / Soft-Launch Candidate — BLOCKED_EXTERNAL مع فجوات هندسية HIGH تحتاج دفعات إصلاح مستقلة**.
