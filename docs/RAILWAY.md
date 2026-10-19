# نشر قدها على Railway — إعداد إنتاج موثوق

## إعداد المستودع
- Repository: `heragloweg-arch/live-game-show`
- Branch: `main`
- Root Directory: اتركه فارغًا لأن `package.json` وملفات Railway موجودة في جذر المستودع.
- ملفا `railway.json` و`railway.toml` يجب أن يبقيا متوافقين في أوامر البناء والتشغيل وفحص الصحة.

## متغيرات العميل المطلوبة في Railway → Variables
اضبط القيم في بيئة الإنتاج، ولا تضع أي مفاتيح خادم داخل متغيرات `VITE_*`:

```dotenv
VITE_ENVIRONMENT=production
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
VITE_APP_NAME=قدها
VITE_APP_VERSION=1.0.0
VITE_ENABLE_LOCAL_DEMO=false
VITE_ALLOW_DEV_BILLING=false
VITE_ADS_SIMULATE=false
```

- استخدم عنوان Supabase الصحيح والمفتاح العام المخصص للعميل فقط؛ لا تستخدم `service_role` في العميل.
- يفشل بدء خدمة الإنتاج إذا غاب عنوان Supabase أو المفتاح العام، أو كانت قيم العرض التجريبي/الفوترة غير الآمنة مفعلة.
- اترك `VITE_ADS_ENABLED=false` حتى تصبح معرّفات الإنتاج متاحة ومراجعة. إذا فُعّلت الإعلانات، اضبط `VITE_ADMOB_APP_ID` و`VITE_ADMOB_BANNER_ID` و`VITE_ADMOB_INTERSTITIAL_ID` و`VITE_ADMOB_REWARDED_ID` مع `VITE_ADMOB_TEST=false` و`VITE_ADS_SIMULATE=false`.

## أسرار الخادم
قيم مثل `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` و`GOOGLE_PUBSUB_AUDIENCE` و`GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL` وأسرار LiveKit هي أسرار خادمية. ضع كل قيمة في البيئة التي تقرؤها الخدمة الفعلية (Supabase Edge Function secrets أو بيئة خادم مناسبة)، ولا تضعها في ملفات المصدر أو متغيرات `VITE_*`.

بوابة الإصدار الصارمة `LAUNCH_GATE=strict` تتطلب متغيرات التحقق من Google Play وPub/Sub في بيئة إصدار آمنة. لا تستخدم بيانات وهمية لإجبار البوابة على النجاح.

## بوابات البناء والتشغيل
- البناء ينفذ `npm ci` ثم بوابة الإعداد الثابتة وTypeScript وESLint وVitest وبناء Vite وفحص أثر الإنتاج.
- التشغيل ينفذ `scripts/verify-runtime-config.mjs` قبل إنشاء `dist/env-config.js` وتشغيل الخادم.
- فشل التحقق يمنع بدء نسخة ناقصة الإعداد؛ نجاح النشر وحده ليس اختبارًا للوظائف الحية.
- Health check الحالي هو `/`. بعد كل نشر، راجع Build/Deploy logs وحالة النسخة النشطة في Railway.

## متغير بصمة البناء

عند البناء من GitHub، يوفر Railway المتغير `RAILWAY_GIT_COMMIT_SHA`. يستخدمه `scripts/write-build-info.mjs` لتثبيت بصمة commit داخل `dist/build-info.json` ووسم HTML. لا يحتاج المشروع إلى تثبيت Git داخل صورة runtime. إذا كان النشر بلا Git checkout، يستخدم السكربت بصمة مشتقة من `RAILWAY_DEPLOYMENT_ID` أو `RAILWAY_SNAPSHOT_ID`. وإذا غابت متغيرات Railway كلها، يستخدم بصمة حتمية مشتقة من artifact نفسه مع `fingerprintSource=artifact-content`؛ هذا يمنع فشل البناء من أجل metadata مفقودة، مع عدم تسميتها commit.

## تشخيص شاشة الحماية

إذا ظهر `Missing production variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY` فالمشكلة في Variables الخاصة بخدمة Railway وEnvironment النشطة، وليست في كود Supabase. أضف القيمتين العامتين الصحيحتين، ثم أعد Deploy. لا تضع `service_role` في `VITE_SUPABASE_ANON_KEY`.
