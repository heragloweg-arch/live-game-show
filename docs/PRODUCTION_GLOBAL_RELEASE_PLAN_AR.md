# خطة قدها الموحدة للتحول إلى منتج إنتاجي عالمي

**التاريخ:** 22 سبتمبر 2026  
**المرجع:** دمج تقرير الفريق المرفق مع مراجعة المشروع الحالية ومراجعة ملفات React وEdge Functions وSupabase migrations.

## 1. قرار العمل

يجب التعامل مع النسخة الحالية على أنها **Production Candidate غير مكتملة**، وليست تطبيقًا تجريبيًا بسيطًا وليست منتجًا جاهزًا للنشر العالمي. البنية الخادمية موجودة، لكن الحلقة التي يراها اللاعب داخل الجولة تحتاج إغلاقًا واختبارًا قبل توسيع السطح.

الخطة المعتمدة المقترحة هي:

1. إغلاق الحلقة الأساسية للمباراة.
2. ضمان صلاحية كل سؤال قبل أن يدخل الإنتاج.
3. توحيد العقود بين قاعدة البيانات والخادم والعميل.
4. عزل وإزالة كل مسارات الديمو من الإنتاج.
5. إضافة Reveal ومراجعة وتعليم ومساعدات محدودة.
6. بناء حلقة يومية واجتماعية قابلة للقياس.
7. تنفيذ اختبارات تشغيل وبيانات حقيقية قبل النشر العالمي.

**ممنوع خلال أول 6–8 أسابيع:** إضافة وضع لعب جديد، توسيع الاشتراكات، أو إطلاق سوق جديد قبل إغلاق P0/P1 وإثبات الإكمال والعودة.

## 2. ما تأكد من الكود وما يحتاج تحققًا من قاعدة الإنتاج

### عيوب مؤكدة في النسخة المفحوصة

| الأولوية | العيب | الدليل المباشر | القرار |
|---|---|---|---|
| P0 | `next_round` يتعامل مع `canAdvanceRound` كأنه كائن | `authz.ts` يعيد `Promise<boolean>`، بينما `match/index.ts` يستخدم `gate.can` و`gate.reason` في السطور 532–539. | إصلاح فوري، ثم اختبار E2E لجولة ثانية. |
| P0 | عقد أنماط المباريات غير مكتمل | قاعدة البيانات تضيف `couple` و`team`، بينما `MatchMode` في `src/types/index.ts` لا يتضمنهما. | توليد/توحيد العقد قبل أي ميزة. |
| P0 | الاختبارات ليست خضراء | `src/utils/scoring.test.ts` يستورد `DEFAULT_SCORING` غير المصدّر من `src/services/game/scoring.ts`. | جعل test وtypecheck بوابة دمج. |
| P0 | لا توجد مساعدات داخل الجولة | لا يوجد تنفيذ `hint` أو `lifeline` في مكونات المباراة؛ الموجود مجرد نوع اقتصاد `spend_hint`. | تنفيذ V1 بعد إغلاق الجولة، وليس قبلها. |
| P0 | لا يوجد Reveal للإجابة الصحيحة في نتيجة الجولة | `MatchScreen` يعرض صحيحة/خاطئة/انتهى الوقت والنقاط فقط. | Reveal في Solo، وReveal آمن في 1v1 بعد قفل الجولة. |
| P1 | اختيار الصعوبة لا يفلتر الأسئلة | `pickChallenges` يختار من `active + qa_status=approved` ولا يضيف filter على `difficulty`. الصعوبة تغير AI أكثر مما تغير المحتوى. | فصل `playerDifficulty` عن `contentDifficulty` وإضافة سياسة مطابقة. |
| P1 | بنك الديمو منفصل عن الإنتاج | `challengeBank.ts` و`matchEngine.ts` مخصصان للمحرك المحلي، بينما الإنتاج يقرأ قاعدة البيانات. | إبقاء الكود للاختبارات فقط أو حذفه من bundle الإنتاجي. |
| P1 | طبقة QA لا تمنع السؤال اليتيم بشكل بنيوي | لا يوجد قيد يضمن وجود accepted answer أو choices قبل `active/approved`. | Validator وCI وjob تعطيل تلقائي. |
| P1 | القياس الأساسي محلي وجزئي | `retention.ts` يعتمد على localStorage، و`MetricsScreen` يدفع `dau: 1` يدويًا. | نقل cohort analytics إلى الخادم. |
| P1 | تسوية التسجيل في البطولة ليست transaction واحدة | خصم `profiles.coins` يسبق إنشاء `tournament_entries`. | RPC ذري مع ledger وidempotency. |

### نقاط صحيحة في تقرير الفريق لكن تحتاج تحققًا تشغيليًا

- رقم الأسئلة الإنتاجية مثل 578 لا يثبت إلا باستعلام على قاعدة Staging/Production. ملفات migrations توضح وجود seed كبيرًا، لكنها لا تثبت حالة قاعدة البيانات المنشورة.
- عدد الأسئلة اليتيمة يجب قياسه بالاستعلام الذي قدمه الفريق. لا يجوز اعتبار جميعها موجودة أو غير موجودة من الكود وحده.
- ادعاء أن `next_round` أُصلح غير صحيح بالنسبة إلى النسخة المفحوصة؛ الإصلاح يجب أن يظهر في checkout الحالي وفي Edge Function المنشورة، لا في تقرير سابق فقط.
- ادعاء غياب حقل الإدخال يحتاج اختبارًا حسب النوع. الشاشة تعرض text input عند غياب choices، لكن السؤال اليتيم سيُرفض غالبًا، وLetterPool يحتاج اختبارًا حقيقيًا مع `useServerMatch`.
- جودة seed وارتباط كل `challenge.id` بإجابة لا يمكن اعتمادها دون تشغيل استعلام QA على قاعدة البيانات.

## 3. المرحلة صفر: قفل الإنتاج والديمو

### الهدف

منع خروج نسخة تحتوي على مسار محلي أو بيانات تجريبية أو fallback يغير نتيجة اللعب.

### الملفات

- `src/config/flags.ts`
- `.env.example`
- `src/screens/play/DifficultyScreen.tsx`
- `src/screens/match/MatchScreen.tsx`
- `src/hooks/useSoloMatch.ts`
- `src/services/game/matchEngine.ts`
- `src/services/game/challengeBank.ts`
- `src/services/game/aiOpponent.ts`
- `src/services/realtime/reconnect.ts`
- `vite.config.ts`
- `docs/E2E_CHECKLIST.md`
- `docs/E2E_LAUNCH_CHECKLIST.md`

### الإجراءات

1. اجعل `VITE_ENABLE_LOCAL_DEMO` غير موجود في build الإنتاجي، وليس فقط `false`.
2. افصل imports لمحرك الديمو عبر dynamic import مشروط بالتطوير، أو انقله إلى مجلد اختبارات غير مشمول في bundle الإنتاج.
3. امنع أي match id يبدأ بـ `solo` أو يساوي `solo-demo` في رابط production.
4. احذف أي fallback يمنح عملات أو يقرر نتيجة من العميل.
5. أضف build assertion يفشل إذا وجدت strings مثل `solo-demo` أو `VITE_ENABLE_LOCAL_DEMO=true` في artifact الإنتاجي.
6. اجعل عدم وجود Supabase أو Edge Functions فشلًا صريحًا في production بدل تشغيل واجهة تبدو حية بلا backend.

### معيار القبول

- لا يوجد مسار Demo في manifest أو bundle الإنتاجي.
- كل مباراة تبدأ من UUID صادر من الخادم.
- لا يظهر سؤال أو نتيجة من `challengeBank.ts` في مسار المستخدم الحقيقي.
- إيقاف Edge Function يظهر رسالة خطأ قابلة للفهم ولا يمنح مكافأة.

## 4. المرحلة الأولى: إغلاق الحلقة الأساسية للجولة

### 4.1 إصلاح `next_round`

يوجد خياران صحيحان، ويجب اختيار واحد فقط:

- تعديل `canAdvanceRound` ليعيد `{ can, reason }` مع عقد typed.
- أو إبقاءه `boolean` وتعديل `nextRound` إلى `if (!gate)` دون قراءة `gate.can`.

الأفضل هو العقد typed لأنه يحتاج سببًا للواجهة. يجب أن يشمل السبب: `WAITING_FOR_OPPONENT`, `TIME_EXPIRED`, `ALL_ANSWERED`, `ROUND_NOT_FOUND`.

### 4.2 جعل الانتقال ذريًا

التدفق الصحيح هو RPC واحد أو transaction server-side يقوم بالآتي:

1. قفل الجولة والمباراة.
2. التحقق من انتهاء الوقت أو اكتمال إجابات اللاعبين.
3. إغلاق الجولة مرة واحدة.
4. احتساب AI إن وجد.
5. الانتقال إلى الجولة التالية أو إنهاء المباراة.
6. زيادة `sequence` مرة واحدة.

لا تستخدم fallback كتابيًا في الإنتاج إذا فشل RPC الذري؛ سجل الخطأ وأعد حالة قابلة لإعادة المحاولة دون تغيير جزئي.

### 4.3 Reveal وملخص المباراة

في Solo وبعد قفل الجولة، أظهر:

- إجابة اللاعب.
- الإجابة الصحيحة أو مجموعة الإجابات المقبولة.
- سبب القبول أو الرفض عند السؤال المفتوح.
- النقاط الأساسية ومكافأة السرعة.
- شرحًا قصيرًا للسؤال إذا كان المحتوى يملكه.

في 1v1، لا تكشف الإجابة أثناء نافذة الخصم. اكشفها فقط بعد قفل الجولة أو انتهاء الوقت لكلا الطرفين.

في نهاية المباراة، اعرض بطاقة لكل جولة تشمل السؤال، النتيجة، النقاط، وأفضل قرار تالٍ: rematch أو تدريب أو مشاركة النتيجة.

### 4.4 مساعدات V1

لا تطلق اقتصاد المساعدات قبل أن تعمل الجولة. بعد ذلك أضف ثلاث مساعدات فقط:

| المساعدة | الوظيفة | القيد |
|---|---|---|
| حذف إجابتين | للاختيار من متعدد فقط | مرة في المباراة |
| تلميح حرف/كلمة | للأسئلة النصية المدعومة | لا يكشف الإجابة كاملة |
| تخطي | ينقل للسؤال التالي دون نقاط | مرة في المباراة |

المساعدة يجب أن تكون server-authoritative، مع `match_id`, `round_id`, `user_id`, `request_id`, وledger أو سجل استخدام. لا تدع العميل يخصم العملات أو ينشئ المساعدة وحده.

## 5. المرحلة الثانية: Content Production System

### 5.1 شرط صلاحية السؤال

لا يسمح بتفعيل أو اعتماد سؤال إلا إذا تحقق أحد الشروط:

- اختيار من متعدد: خياران على الأقل، وخيار صحيح واحد فقط.
- إجابة نصية مغلقة: إجابة مقبولة واحدة على الأقل.
- Speed/Letter Pool: pool صالح وإجابة مقبولة واحدة على الأقل.
- Mystery أو صورة أو صوت: validator خاص بالقالب مع اختبار مكتوب.

أنشئ validator مشتركًا يستعمله:

- migration/seed CI.
- Creator Admin.
- job دوري في قاعدة البيانات.
- Edge Function عند اختيار السؤال.

### 5.2 عملية QA

لكل سؤال حالات:

`draft → auto_checked → human_review → approved → monitored → retired`.

الاعتماد البشري يجب أن يرى السؤال، الإجابات المقبولة، الاختيارات، مصدر المعلومة، الترجمة، الصعوبة المتوقعة، ومخاطر الحساسية الثقافية.

### 5.3 قاعدة المحتوى الذهبية

لا تستهدف رقمًا كبيرًا فقط. الهدف الأول هو **300 سؤالًا ذهبيًا** مغلق الإجابات ومختبرًا، ثم التوسع إلى 1000 سؤال بعد قياس التكرار والجودة. السؤال الذهبي يملك إجابة واضحة، صياغة قصيرة، شرحًا، tags، difficulty، locale، ومراجعة بشرية.

### 5.4 الصعوبة والتكرار

عند اختيار الجولة، استخدم:

- الصعوبة المطلوبة أو نطاقًا قريبًا منها.
- سجل آخر N أسئلة للمستخدم.
- منع تكرار السؤال في نفس المباراة وفي آخر 20–50 سؤالًا حسب الوضع.
- توزيعًا متوازنًا للأنواع والفئات.
- معدل نجاح السؤال الفعلي بعد تراكم البيانات.

الصعوبة يجب أن تقاس أيضًا بـ `p_correct`, `median_response_ms`, و`drop_rate`، لا بالوسم اليدوي وحده.

## 6. المرحلة الثالثة: توحيد العقود والملفات

### المصدر المشترك

اعتمد مصدرًا واحدًا لعقود:

- إمّا توليد Types من Supabase schema.
- أو package مشتركة تستعملها Edge Functions والعميل.

### الملفات الواجب توحيدها

- `src/types/index.ts`: أضف `couple` و`team` وأي mode فعلي آخر.
- `supabase/migrations/*`: وثّق enum ومراحل الحالة في ملف contract.
- `src/services/api/matchApi.ts`: استخدم response schemas بدل `any`.
- `src/store/matchStore.ts`: ادمج team scores وparticipants بعقد typed.
- `src/hooks/useServerMatch.ts`: وحّد phase مع `MatchStatus`.
- `src/screens/match/MatchScreen.tsx`: أزل `as any` في answer وteam والحالة.
- `supabase/functions/_shared`: أضف validators للـ request والـ response.
- `src/services/game/scoring.ts` و`supabase/functions/_shared/scoring.ts`: مصدر حساب واحد أو golden tests مشتركة.

### معيار القبول

- `npm run typecheck` بلا أخطاء.
- لا يوجد `as any` في MatchScreen أو API contracts الجديدة.
- كل Edge Function تملك request/response examples في الاختبار.
- `npm test` أخضر بالكامل.

## 7. المرحلة الرابعة: التقدم والاقتصاد

### XP والمستوى

كل مستوى يجب أن يفتح شيئًا مرئيًا: إطار، لقب، مؤثر، فئة، أو تذكرة فعالية. لا تجعل XP عدادًا بلا نتيجة.

### العملات

كل عملية مالية تستخدم:

- RPC أو transaction.
- `wallet_ledger`.
- `reference_id` فريد.
- idempotency key.
- تحقق من الرصيد داخل الخادم.

### البطولة

أنشئ RPC `join_tournament_atomic` يقوم بالتحقق من الحالة والسعة والرصيد، ثم الخصم وإنشاء entry وledger في transaction واحدة. أضف استردادًا آمنًا عند إلغاء البطولة قبل البدء.

### Pay-to-Win

ابقِ المساعدات محدودة ومكتسبة أو تجميلية. لا تبيع إجابة، ولا وقتًا تنافسيًا إضافيًا، ولا مطابقة أسهل. يمكن أن يكون Plus لإزالة الإعلانات، تخصيص الملف، إحصائيات متقدمة، وحزم تجميلية.

## 8. المرحلة الخامسة: عادة الاستخدام اليومية

### Daily Pack

استبدل سؤالًا واحدًا بحزمة من ثلاث دقائق:

1. سؤال معرفة أو لغز افتتاحي.
2. سؤال سرعة.
3. سؤال قرار أو مشاركة اجتماعية.

بعد الإكمال يظهر score يومي، تقدم أسبوعي، ومقارنة اختيارية مع أصدقاء أو ترتيب اليوم.

### السلسلة

أضف:

- مكافآت عند 3 و5 و7 أيام.
- شحنة إنقاذ شهرية.
- مهمة عودة بعد الانقطاع.
- إشعارًا اختياريًا قبل نهاية اليوم.
- أسبوعًا أول مرنًا لا يعاقب المستخدم الجديد.

### نهاية المباراة

لا تكتفِ بزر العودة. اعرض إجراءً أساسيًا واحدًا حسب الحالة:

- فوز: تحدي الخصم مجددًا.
- خسارة: إعادة مباراة أو تدريب على الفئة الضعيفة.
- تعادل: rematch سريع.
- انقطاع: استئناف المباراة.

## 9. المرحلة السادسة: المجتمع والانتشار

الحد الأدنى المطلوب:

- قائمة أصدقاء.
- آخر منافسين.
- rematch.
- دعوة قابلة لإعادة الاستخدام.
- حالة حضور اختيارية.
- بلاغ عن سؤال أو مستخدم.
- كتم وإدارة المضيف.

الغرف والمضيف والفرق يجب أن تغذي التقدم نفسه: حضور الغرفة يمنح تقدمًا اجتماعيًا، والمضيف يرى جودة الأسئلة، والفريق يملك مهمة أسبوعية. لا تجعل كل مسار قاعدة منفصلة.

## 10. المرحلة السابعة: القياس والتشغيل

### أحداث أساسية

أضف events typed:

`daily_pack_started`, `daily_item_viewed`, `daily_pack_completed`, `question_answered`, `question_abandoned`, `question_reported`, `round_waiting`, `round_advanced`, `round_stuck`, `matchmaking_timeout`, `match_reconnected`, `rematch_clicked`, `friend_invite_sent`, `friend_invite_accepted`, `lifeline_used`, `reveal_viewed`, `streak_saved`, و`streak_lost`.

كل حدث يحمل قدر الإمكان:

`user_id`, `session_id`, `match_id`, `round_id`, `content_id`, `content_version`, `mode`, `difficulty`, `locale`, `region`, `network_state`, `app_version`, و`exit_reason`.

### المؤشرات

- Activation: بدأ أول سؤال وأكمل أول مباراة.
- Match completion rate حسب الوضع.
- D1/D3/D7/D14/D30 cohort retention.
- أيام اللعب أسبوعيًا.
- Daily Pack completion.
- زمن المطابقة وtimeout.
- نسبة reconnect والعودة.
- معدل تكرار السؤال والبلاغات.
- استخدام المساعدات وتأثيرها على الإكمال.
- مصادر ومصارف العملات.

لا تعتمد على `localStorage` كمصدر رسمي للـ retention، ولا على إدخال DAU يدوي من الشاشة.

## 11. الاختبارات الإلزامية

### Unit

- normalize Arabic والمرادفات.
- كل validator لكل subtype.
- scoring goldens بين الخادم والعميل.
- AI outcomes.
- XP level-up.
- economy idempotency.
- streak continuity and recovery.

### Integration

- create match → start round → answer → result → next round.
- double answer لنفس round.
- late answer بعد انتهاء الوقت.
- concurrent next round.
- concurrent tournament join.
- duplicate reward settlement.
- reconnect أثناء `ROUND_ACTIVE`.
- إنهاء التطبيق ثم العودة للمباراة.

### Content QA

- سؤال approved بلا answers/choices يفشل CI.
- اختيار متعدد بلا إجابة صحيحة أو بأكثر من إجابة يفشل.
- letter pool لا يطابق accepted answers يفشل.
- تكرار prompt أو normalized answer يخضع للمراجعة.

### E2E على جهاز Android

- anonymous auth وprofile.
- daily pack.
- Solo server.
- 1v1 بجهازين.
- invite.
- room وmicrophone.
- ads بعد الجولة فقط.
- purchase verification في staging.
- offline/online/reconnect.

## 12. ترتيب التنفيذ والملكية

| المرحلة | المخرجات | الملفات المحورية | بوابة الخروج |
|---|---|---|---|
| 0 | Production lock وإزالة الديمو | flags, Vite, MatchScreen, matchEngine | لا demo في build |
| 1 | جولة مستقرة وReveal | authz, match, answer, MatchScreen | 5 جولات E2E |
| 2 | Content QA | migrations, creator, validators, seeds | لا سؤال يتيم |
| 3 | Contracts | types, API, hooks, stores | typecheck + tests أخضر |
| 4 | Economy | wallet RPCs, tournament join, rewards | لا double charge |
| 5 | Daily Pack | daily function, screens, streak | حزمة 3 دقائق قابلة للقياس |
| 6 | Social | friends, rematch, invites, reports | دعوة ناجحة وعودة |
| 7 | Global | i18n, locale content, region config | سوق إضافي مع cohort gates |
| 8 | Release | CI, Android, secrets, monitoring | Beta ثم staged rollout |

## 13. Definition of Done للإنتاج العالمي

لا تعلن الجاهزية قبل تحقق كل ما يلي:

- `npm ci`, `npm run typecheck`, `npm test`, `npm run build` ناجحة.
- migrations وEdge Functions منشورة على Staging وتم اختبارها.
- production build لا يحتوي مسار Demo.
- كل سؤال active/approved صالح ومربوط بمصدر تحقق.
- الجولة تنتقل دائمًا أو تعرض سبب الانتظار وإجراء إعادة المحاولة.
- Reveal يعمل بأمان حسب نوع المباراة.
- المكافآت والعملات idempotent ومحمية بـ ledger.
- Daily Pack وstreak والـ recovery مكتملة.
- D1/D7/D30 محسوبة من cohorts خادمية.
- اختبارات Android حقيقية على أجهزة متعددة.
- Crash/error monitoring فعال.
- سياسة الخصوصية، حذف الحساب، Data Safety، Billing، وAdMob مكتملة.
- Beta بشرية لا تقل عن 50 لاعبًا ثم staged rollout، مع rollback جاهز.

## الحكم النهائي

تقرير الفريق متوافق مع الاتجاه العام للتدقيق السابق: **المشكلة ليست غياب البنية، بل أن حلقة السؤال والجولة والمكافأة والعودة لم تصبح موثوقة وممتعة بعد**.

النقطة الأهم التي يجب تثبيتها قبل التنفيذ هي أن بعض الإصلاحات المذكورة كأنها منجزة ليست موجودة في checkout المفحوص، وأبرزها عقد `canAdvanceRound`. لذلك يجب اعتماد الكود المنشور والاختبارات، لا الوثائق السابقة، كمصدر الحقيقة.

إذا أُغلقت المرحلة الأولى والثانية بصورة صحيحة، يمكن تحويل قدها من تطبيق يحتوي أوضاعًا متعددة إلى منتج واضح الوعد:

> **ثلاث دقائق يوميًا تختبر سرعتك، تعلّمك شيئًا، وتترك لك خصمًا أو صديقًا تعود إليه غدًا.**

هذا هو المسار الأقصر نحو منتج عربي قوي قابل للتوسع عالميًا، دون التضحية بالعدالة أو الثقة أو جودة المحتوى.

## مصادر الخطة

[1]: `../supabase/functions/_shared/authz.ts` "Authorization and round advancement helpers"

[2]: `../supabase/functions/match/index.ts` "Match Edge Function and round lifecycle"

[3]: `../src/screens/match/MatchScreen.tsx` "Round UI, answer input, and result presentation"

[4]: `../src/types/index.ts` "Shared domain types and match modes"

[5]: `../src/services/game/scoring.ts` "Client scoring implementation"

[6]: `../src/utils/scoring.test.ts` "Scoring regression tests"

[7]: `../supabase/functions/answer/index.ts` "Server answer validation and persistence"

[8]: `../supabase/functions/daily/index.ts` "Daily challenge and streak lifecycle"

[9]: `../supabase/functions/matchmaking/index.ts` "Matchmaking queue and skill fields"

[10]: `../supabase/functions/tournament/index.ts` "Tournament registration and prize lifecycle"

[11]: `../src/services/analytics/retention.ts` "Client retention storage"

[12]: `../src/services/analytics/events.ts` "Analytics event contract"
