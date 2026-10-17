# مراجعة أمن Supabase الحية — 17 أكتوبر 2026

**النطاق:** قراءة فقط عبر Security Advisor واستعلامات catalog. لم تُنفذ أي تغييرات على قاعدة البيانات.

## النتائج المؤكدة

### 1. دوال SECURITY DEFINER مكشوفة لأدوار العميل
ظهر أن الأدوار `anon` و`authenticated` تملك EXECUTE على الدوال التالية، مع أنها تبدو عمليات خادمية/إدارية ويجب مراجعة كل استعمال قبل سحب الصلاحية:

- `public.atomic_start_round(uuid, integer)`
- `public.claim_matchmaking_opponent(uuid, text)`
- `public.claim_matchmaking_opponent(uuid, text, text)`
- `public.complete_daily_atomic(uuid, date, uuid, text, integer, integer, integer)`
- `public.distribute_tournament_prizes(uuid)`
- `public.handle_new_user()`
- `public.match_human_count(uuid)`
- `public.protect_profile_columns()`
- `public.rls_auto_enable()`
- `public.round_submission_count(uuid)`

تظهر هذه الدوال في قاعدة الإنتاج على أنها `SECURITY DEFINER`. سجّل الاستعلام أيضًا أن `settle_match(uuid)` و`submit_answer_atomic(...)` محصورتان بالفعل في `service_role`، لكنهما ما زالتا تستخدمان `search_path=public` وتحتاجان مراجعة تثبيت المسار.

### 2. search_path
- `public.set_updated_at()`: ليست SECURITY DEFINER، لكنها تستخدم search_path الافتراضي، وEXECUTE متاح لأدوار العميل.
- `public.handle_new_user()` و`public.credit_coins(...)`: search_path افتراضي حسب الاستعلام.
- معظم دوال SECURITY DEFINER الأخرى تستخدم `search_path=public`؛ يُوصى بمسار موثوق مثل `pg_catalog, public, pg_temp` بعد مراجعة جسم كل دالة واعتمادياتها.

### 3. جداول RLS
أظهر Security Advisor ثمانية جداول عليها RLS دون policies:
`ad_reward_claims`, `analytics_daily`, `challenge_answers`, `challenge_choices`, `investor_snapshots`, `room_participants`, `security_events`, `xp_events`.

عدم وجود policy قد يعني رفض الوصول افتراضيًا، وليس مبررًا لإضافة policy واسعة. يجب تحديد الاستخدام المقصود لكل جدول واختباره باستخدام `anon`, `authenticated`, و`service_role`.

### 4. إعداد Auth
حماية كلمات المرور المسرّبة معطلة في إعدادات Auth. يلزم تفعيلها من إعدادات المشروع بعد التحقق من أثرها التشغيلي.

## بوابة الإصلاح الآمنة
1. لا تطبق SQL على الإنتاج مباشرةً.
2. أنشئ Staging أو مشروع اختبار متاحًا دون إنشاء موارد مدفوعة دون موافقة.
3. طابق migration ledger مع ملفات المصدر أولًا؛ سجل الإنتاج يعرض 27 migration حتى `20260311000027_daily_letter_words`.
4. راجع جسم الدوال والـ triggers قبل سحب EXECUTE، ثم أنشئ migration جديدة متوافقة مع schema الفعلي.
5. اختبر الوصول لكل دور، وعمليات الجولات والمطابقة واليوميات والمكافآت، ثم أعد تشغيل Security Advisor.
6. طبّق على الإنتاج فقط بعد نجاح Staging ووجود خطة rollback.

## الحالة
`BLOCKED` للإصلاح التنفيذي على قاعدة البيانات حتى تتوفر بيئة Staging ومطابقة migration ledger. هذا التقرير تشخيص فقط، وليس إثباتًا أن الإصلاحات طُبقت.
