# تقرير نشر Supabase الفعلي — 22 أكتوبر 2026

## المرجع

- المستودع: `heragloweg-arch/live-game-show`
- الفرع: `main`
- commit التطبيق المنشور: `22306ba945544915b22be368971385b0fd3fdd01`
- مشروع Supabase: `jwhrbadnirwjyinplbmn`

## النتيجة المثبتة

تم ربط Supabase CLI بالمشروع الصحيح، ثم تطبيق migrations المحلية باستخدام `--include-all` لأن ثلاث migrations محلية كانت أقدم زمنيًا من migration مطبقة سابقًا على المشروع.

نجح الأمر:

```text
supabase db push --yes --include-all
```

وتم تطبيق:

- `20261018020000_revoke_orphan_server_only_table_grants.sql`
- `20261018030000_atomic_match_round_advance.sql`
- `20261018040000_host_access_coin_packs_tiktok.sql`
- `20261019050000_account_deletion_rate_limits.sql`
- `20261019070000_flag_identification_content.sql`
- `20261019070001_choice_content_approval.sql`
- `20261021050000_add_host_max_plan.sql`
- `20261021050001_global_economy_catalog.sql`
- `20261021050002_host_max_entitlements.sql`

كانت migration `20261018112207` موجودة في السجل البعيد وغير موجودة في Git. أضيف لها ملف توثيقي no-op باسم `20261018112207_remote_applied.sql` حتى لا يعاد تنفيذها أو يتم العبث بسجل التاريخ. لا يدّعي هذا الملف إعادة بناء SQL الأصلي.

## الوظائف المنشورة

تم نشر كل الوظائف الموجودة في المستودع بنجاح، وكلها ظهرت بحالة `ACTIVE` في قائمة Supabase:

```text
account
admob-ssv
answer
couple
creator
daily
economy
google-play-rtdn
match
matchmaking
metrics
overlay
room
safety
subscription
team
tiktok
tournament
voice
```

ومن ضمنها الوظائف المعدلة مباشرة:

```text
daily
match
subscription
voice
```

## CORS

كان الاختبار المباشر يبين أن الوظائف تسمح افتراضيًا بـ`https://qaddaha.app` فقط، بينما النشر الحالي يعمل من Railway. تم ضبط السر الخادمي:

```text
CORS_ALLOWED_ORIGIN=https://live-game-show-production-8e73.up.railway.app
```

والتحقق المباشر بعد الضبط أعاد نطاق Railway الصحيح بدل wildcard.

ملاحظة: عند نقل الواجهة إلى النطاق الرسمي يجب تحديث `CORS_ALLOWED_ORIGIN` إلى النطاق الرسمي أو تنفيذ allowlist متعددة الأصول في طبقة CORS قبل تشغيل النطاقين معًا.

## الأسرار غير المكتملة

قائمة أسرار Supabase الحالية أثبتت وجود أسرار Supabase الأساسية، لكنها لم تثبت وجود أسرار الخدمات الخارجية التالية:

- Google Play: `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- Google RTDN: `GOOGLE_PUBSUB_AUDIENCE`, `GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL`
- LiveKit: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- TikTok: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`
- AdMob: `ADMOB_REWARDED_UNIT_ID`

لذلك نشر الوظائف PASS، لكن الدفع الحقيقي، الصوت الإنتاجي، TikTok OAuth، وAdMob SSV لا تُعتبر مفعلة إنتاجيًا قبل إدخال الأسرار الصحيحة واختبارها.

## ما لم يُدّعَ نجاحه

لم يتم اعتبار ما يلي مكتملًا دون دليل خارجي:

- Google Play purchase verification الحقيقي.
- RTDN الحقيقي.
- LiveKit production call.
- TikTok App Review وOAuth production.
- AdMob reward وSSV.
- Android AAB موقّع وInternal Testing.
- E2E على جهازين وحسابين وشبكتين.

## قرار الإطلاق

حالة Supabase migrations وEdge Functions: **PASS — منشور فعليًا**.

حالة المنتج العربي العام: **BLOCKED_EXTERNAL** حتى تُضبط أسرار الخدمات الخارجية وتُنفذ اختبارات E2E وAAB وInternal Testing والفوترة الحقيقية.
