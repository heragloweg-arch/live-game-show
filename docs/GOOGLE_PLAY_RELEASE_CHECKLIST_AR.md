# قائمة جاهزية Google Play لقدها

## الحالة الحالية

اجتاز مصدر التطبيق فحوصات TypeScript وESLint والاختبارات وبناء Vite وفحص منع مسارات demo. تمت مزامنة `dist` مع مشروع Capacitor Android بنجاح. تعذر بناء APK داخل هذه البيئة لأن Android SDK غير مثبت؛ لذلك لم يتم الادعاء بوجود APK موقّع أو AAB جاهز.

## قبل رفع الإصدار

| البند | الحالة | الإجراء المطلوب |
|---|---|---|
| `compileSdkVersion` و`targetSdkVersion` | مضبوطتان على 36 | التحقق من توافقهما مع متطلبات Google Play وقت النشر |
| Android SDK | غير متاح في بيئة التنفيذ الحالية | تثبيت SDK وBuild Tools ثم ضبط `android/local.properties` أو `ANDROID_HOME` |
| مفتاح التوقيع | غير مضمّن عمدًا | إنشاء keystore في بيئة أسرار آمنة وعدم إضافته إلى Git أو الحزمة |
| Supabase production | خارجي | ضبط URL وanon key ونشر migrations وEdge Functions 000027–000035 |
| Google Play Billing | خارجي | إنشاء المنتجات `qaddaha_plus_monthly`, `qaddaha_plus_yearly`, `qaddaha_host_pro` والتحقق بالخادم |
| LiveKit / AdMob / Sentry | خارجي | إضافة مفاتيح الإنتاج واختبارها على جهاز حقيقي |
| اختبار الجهاز | لم ينفذ داخل sandbox | تنفيذ smoke test على Android حقيقي: تسجيل، مباراة، Daily Pack، دوري، 50:50، انقطاع اتصال، شراء واستعادة |
| Privacy/Data Safety | يحتاج بيانات المنتج النهائية | إكمال نموذج Data Safety وسياسة الخصوصية وروابط الدعم |

## أمر البناء المقترح

```bash
npm ci --legacy-peer-deps
npm run typecheck && npm run lint && npm test -- --run
npm run build
npx cap sync android
cd android
./gradlew bundleRelease
```

يجب تنفيذ أمر `bundleRelease` بعد إعداد signing config في CI أو Android Studio. لا تستخدم debug APK للنشر العام.

## ضوابط الحزمة

لا تتضمن الحزمة النهائية أسرار البيئة أو `node_modules`. يجب تزويد بيئة النشر بمتغيرات Supabase وLiveKit وAdMob وSentry وGoogle Play من secret manager، ثم تشغيل smoke test قبل النشر التدريجي.
