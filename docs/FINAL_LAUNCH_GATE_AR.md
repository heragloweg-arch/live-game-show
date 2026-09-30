# بوابة الإطلاق النهائية — live-game-show / قدها

هذه الحزمة هي مصدر التسليم البرمجي الواحد لجذر مستودع `live-game-show`. يجب نسخ محتويات `qaddaha-ui/` إلى جذر المستودع، وليس إنشاء مجلد متداخل باسم `qaddaha-ui/qaddaha-ui`.

## ما أُغلق داخل الكود

تم إغلاق المسار غير الموثق للمشتريات: وظيفة الاشتراك لا تقوم بتفعيل أي خطة من دون تحقق Google Play Developer API، ولا تستخدم `ALLOW_UNVERIFIED_PLAY_PURCHASES` حتى لو وُجد السر. كما أصبح سجل الإيصال يبدأ بحالة `pending` ولا يتحول إلى `verified` إلا بعد نجاح تحقق Google. وتم منع `activate_dev` عندما تكون بيئة الوظيفة إنتاجية.

تمت إضافة `scripts/verify-launch-config.mjs`، ويمكن تشغيلها في CI بهذه الصيغة:

```bash
LAUNCH_GATE=strict npm run verify:launch-config
```

البوابة تتحقق من Supabase وGoogle Play وAdMob، وترفض Dev Billing وUnverified Purchases، وترفض AdMob الاختباري عند تشغيل الإعلانات الإنتاجية.

## أوامر التسليم

```bash
npm ci --legacy-peer-deps
npm run typecheck
npm run lint
npm test -- --run
npm run build
node scripts/verify-production.mjs
```

بعد تجهيز أسرار الإنتاج فقط:

```bash
LAUNCH_GATE=strict npm run verify:launch-config
npx cap sync android
cd android && ./gradlew bundleRelease
```

## تنفيذ Supabase خارج الحزمة

يجب تشغيل `supabase db push` حتى migration `20260311000040_creator_approval_atomic.sql`، ثم نشر كل الوظائف الموجودة تحت `supabase/functions/`. لا يجب وضع `SUPABASE_SERVICE_ROLE_KEY` أو `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` أو keystore داخل المستودع أو ملف `.env` المرفوع.

## متطلبات Google Play وAdMob

قبل Internal Testing يجب إنشاء المنتجات `qaddaha_plus_monthly` و`qaddaha_plus_yearly` و`qaddaha_host_pro`، وربط Service Account بصلاحية Android Publisher، ثم اختبار الشراء والاستعادة على AAB موقّع. يجب استخدام AdMob production IDs و`VITE_ADMOB_TEST=false`.

## تحقق التشغيل الحقيقي

لا تعتبر البوابة ناجحة قبل اختبار Team وRoom وHost على جهازين أو أكثر، وانقطاع وإعادة اتصال، وDaily 3/3، وRematch، وShop، وشراء وRestore. بعد ذلك تُقاس D1 وD7 وإكمال Daily وRematch وeCPM وتحويل Plus خلال Soft Launch محدود.

## الحد الصادق

الكود والحزمة يمكن التحقق منهما محليًا، لكن نشر Supabase وGoogle Play وAdMob وتوقيع AAB والاختبار على أجهزة حقيقية تتطلب حسابات وأسرارًا خارجية. لا يجوز ادعاء نجاح هذه البنود من داخل ZIP فقط.
