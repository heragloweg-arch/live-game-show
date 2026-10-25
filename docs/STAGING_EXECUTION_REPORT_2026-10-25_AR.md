# تقرير تنفيذ Staging — قدها

**التاريخ:** 25 أكتوبر 2026  
**المستودع:** `heragloweg-arch/live-game-show`  
**الفرع:** `main`  
**مشروع Supabase:** `jwhrbadnirwjyinplbmn`  
**نطاق التنفيذ:** مزامنة migrations ونشر Edge Functions والتحقق من المصدر والبناء.

## النتيجة التنفيذية

تم تنفيذ مسار Staging الإداري بنجاح باستخدام Supabase Management Access Token. لم يتم حفظ الرمز في المستودع أو هذا التقرير أو ملفات الحزمة.

نفذ أمر `supabase db push --project-ref jwhrbadnirwjyinplbmn --include-all --yes` بنجاح، وكانت النتيجة:

```text
Remote database is up to date.
```

تمت مطابقة سجل migrations المحلي والبعيد، من `20260311000001` حتى آخر migration:

```text
20261023050001_rls_role_hardening
```

لا توجد migrations محلية معلّقة أو migrations بعيدة غير موجودة في المصدر.

## Edge Functions

تمت إعادة نشر جميع وظائف Edge Functions الموجودة في `supabase/functions/` من رأس `main` الحالي. عدد الوظائف المنشورة: **19**، وجميعها ظهرت بحالة `ACTIVE`.

بعد إضافة تدرج Solo الخادمي، أُعيد نشر `match` وظهر بحالة `ACTIVE` بالإصدار **17**.

الوظائف المنشورة هي:

`account`, `admob-ssv`, `answer`, `couple`, `creator`, `daily`, `economy`, `google-play-rtdn`, `match`, `matchmaking`, `metrics`, `overlay`, `room`, `safety`, `subscription`, `team`, `tiktok`, `tournament`, `voice`.

بعد النشر ارتفعت إصدارات الوظائف عن الحالة السابقة، وتاريخ آخر تحديث أصبح 25 أكتوبر 2026. تحذير Docker أثناء النشر كان تحذيراً محلياً فقط؛ الرفع والنشر البعيدان اكتملَا بنجاح.

## بوابات المصدر والبناء

تم تشغيل المصدر على Node `22.22.0` المطابق لإعداد CI. نجحت البوابات التالية:

- `npm ci --legacy-peer-deps --no-audit --no-fund`
- `npm run typecheck`
- `npm run lint`
- Vitest: **8 ملفات / 21 اختباراً ناجحاً**
- Production gates: **23 اختباراً ناجحاً**
- `npm run build`
- `npm run verify:production`
- `npm run verify:content-release`

تم إنشاء build ببصمة commit الحالية، ونجحت بوابة المحتوى مع **968 صفاً مدققاً** ومنع التفعيل الجماعي واعتماد الموافقة عبر service-role فقط.

## تحقق الخدمة الخارجية

استجاب endpoint التالي بنجاح:

```text
https://my-twin-pro-production-fd77.up.railway.app/health
HTTP 200
api=healthy
version=23.0.0
kernel=active
engines=14
```

تمت إضافة `/ready` و`/health` و`/healthz` إلى خادم ملفات قدها، وتم توحيد `railway.json` و`railway.toml` على `/ready`. الاختبار المحلي أعاد `HTTP 200` لمسارات readiness. أما الرابط المفحوص `my-twin-pro-production-fd77.up.railway.app` فيعيد خدمة API مختلفة (`version 23.0.0`) وليس خادم قدها الثابت؛ لذلك يعيد `/ready` فيها `404` ولا يصلح دليلاً على نشر قدها. يلزم ربط خدمة Railway الصحيحة بمستودع قدها ثم إعادة الفحص الحي.

## حدود ما لم يُنفذ

نجح `npm run android:debug` في البناء والـCapacitor sync حتى مرحلة Gradle، ثم توقف لأن Android SDK غير مثبت في البيئة (`ANDROID_HOME`/`sdk.dir` مفقود). لذلك لا يوجد APK/AAB قابل للتسليم من هذه الجلسة. كما لا تزال اختبارات الأجهزة الحقيقية وAAB الموقع وGoogle Play Internal Testing وشراء/Restore وAdMob الحقيقي وLiveKit الفعلي وBeta اللاعبين خارج البيئة الحالية. كذلك لم تُضبط أسرار Google Play وLiveKit وTikTok وAnalytics لأنها غير متاحة في جلسة التنفيذ.

## القرار

- Supabase Staging migrations: **PASS**.
- Edge Functions deployment: **PASS — 19/19 ACTIVE**.
- Source quality and build gates: **PASS**.
- Qaddaha static readiness: **CODE FIXED / LOCAL PASS — ينتظر ربط خدمة Railway الصحيحة وإعادة فحص حي**.
- الرابط المفحوص الحالي: **WRONG SERVICE / NOT EVIDENCE FOR QADDAHA**.
- Android/store/E2E external gates: **BLOCKED_EXTERNAL**.
- قرار الإطلاق العام: **NO-GO** إلى أن تُغلق بوابات الجهاز والمتجر والخدمات الخارجية.
