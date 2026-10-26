# تقرير التدقيق النهائي وسد الفجوات — قدها

**التاريخ:** 26 أكتوبر 2026  
**الفرع:** `main`  
**النطاق:** تدقيق ساكن/هندسي/أمني للمستودع، الاختبارات المحلية، إعدادات CI، migrations، Edge Functions، ومخرجات البناء. لا يتضمن هذا التقرير ادعاء نجاح اختبارات الأجهزة أو المتاجر أو الخدمات الخارجية التي تحتاج تشغيلًا ميدانيًا.

## القرار الصريح

تم إغلاق الفجوات البرمجية الداخلية التي أمكن إثباتها من المستودع والبيئة: لا توجد حالياً ثغرات npm عالية أو متوسطة (`npm audit --omit=dev --audit-level=high` = 0)، ونجحت بوابات TypeScript وESLint وVitest وبوابات الإنتاج. تم تطبيق migration القياس على Supabase Staging ونشر الوظائف المتأثرة والتحقق من أنها `ACTIVE`.

المنتج **ليس GO لإطلاق عام** حتى الآن؛ السبب المتبقي خارجي وتشغيلي، وليس فجوة كود مخفية: اختبار E2E بأجهزة وحسابات حقيقية، AAB موقع وInternal Testing، أسرار الخدمات الخارجية، الفوترة وAdMob وLiveKit وTikTok، وقياس cohort بعد تشغيل حقيقي.

## الفجوات التي اكتُشفت وأُغلقت

### 1. Daily كان يملك مساراً غير ذري

كان `supabase/functions/daily/index.ts` يسجل الإكمال ويمنح العملات يدوياً إذا فشل `complete_daily_atomic`. هذا كان يفتح احتمال نتيجة جزئية أو مكافأة مكررة عند غياب RPC أو فشله. أزيل المسار بالكامل، وأصبح الفشل يعيد `503` مع `DAILY_ATOMIC_UNAVAILABLE` دون حفظ أو منح مكافأة جزئية.

أضيف regression gate يمنع عودة عبارة أو مسار atomic fallback.

### 2. تقدم Solo كان ذا مصدر حقيقة مزدوج

كانت الواجهة تعتمد على `localStorage` لتحديد الأوراق المفتوحة، مع مزامنة لاحقة من الخادم. أزيل التخزين المحلي من projection الشجرة ومن hook التسوية. أصبحت الواجهة تعرض الصفوف الخادمية فقط، بينما يظل السماح الحقيقي مفروضاً داخل Edge Function وRPC الخادميين.

### 3. قفل مراحل Solo كان يحسب الورقة السابقة خطأ عند عبور الفروع

الصيغة القديمة كانت تحول `branch 1 / leaf 2` إلى تحقق من `branch 2 / leaf 1`. تم إصلاح الحساب الخطي إلى الورقة السابقة الفعلية، وتشديد قبول المدخلات الناقصة أو الصفرية، وإضافة اختبار انحدار للعقد.

### 4. قياسات جودة الإجابة لم تكن مكتملة في schema

أضيفت migration:

`supabase/migrations/20261026000002_metrics_quality_rates.sql`

وتضيف `p_correct` و`median_response_ms` إلى `analytics_daily`. وظيفة `metrics/rebuild_day` تحسبها من `answer_submissions` الخادمية، بجانب `drop_rate`، دون قبول أرقام يرسلها العميل.

### 5. ثغرات React Router في الاعتماديات

أظهر `npm audit` ثغرتين Moderate في سلسلة React Router القديمة. تمت الترقية إلى `react-router` و`react-router-dom` الإصدار `7.18.4`، ونجحت typecheck وlint وVitest وبوابات الإنتاج، وأصبح audit النهائي صفراً.

### 6. Android كان يحتوي مخرجات Capacitor مولدة ومتتبعة

أزيلت 3543 مخرجات متتبعة من `android/app/src/main/assets/public/`، وأضيف المسار إلى `.gitignore`. البناء يعيد توليدها بواسطة `npm run build && npx cap sync android`، فلا تبقى نسخة Web قديمة أو source maps ضخمة داخل المستودع.

### 7. إصدار Android كان ثابتاً على versionCode = 1

أصبح `ANDROID_VERSION_CODE` و`ANDROID_VERSION_NAME` قابلين للتمرير إلى Gradle، مع رفض versionCode غير الموجب. أضيفت المدخلات إلى workflow اليدوي؛ وهذا يمنع إعادة رفع نسخة Play بنفس رقم البناء سهواً.

## البوابات المحلية

- TypeScript: PASS.
- ESLint: PASS.
- Vitest: 8 ملفات، 21 اختباراً ناجحاً.
- Production gates: 27/27 ناجحاً.
- Solo progression: 48 مرحلة وخمس جولات دون regression في الصعوبة.
- Content release: 968 صفاً مدققاً، دون bulk activation، وباعتماد service-role-only.
- Production artifact: PASS؛ تم فحص 96 ملف JavaScript.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- `git diff --check`: PASS.

## التنفيذ البعيد على Supabase Staging

تم تطبيق `db push --include-all` على المشروع المرتبط، ووصل السجل إلى migration `20261026000002`. تم نشر الوظائف المتأثرة والتحقق من حالتها:

| الوظيفة | الحالة | الإصدار بعد النشر |
|---|---:|---:|
| `daily` | ACTIVE | 13 |
| `match` | ACTIVE | 19 |
| `metrics` | ACTIVE | 9 |

وجميع وظائف Edge الـ19 الظاهرة في قائمة المشروع `ACTIVE`.

## الملفات الجوهرية التي تغيرت

- `supabase/functions/daily/index.ts`
- `supabase/functions/match/index.ts`
- `supabase/functions/metrics/index.ts`
- `supabase/migrations/20261026000002_metrics_quality_rates.sql`
- `src/services/game/soloJourneyProgress.ts`
- `src/screens/play/DifficultyScreen.tsx`
- `src/hooks/useServerMatch.ts`
- `scripts/security-regression.test.mjs`
- `scripts/production-gate.test.mjs`
- `package.json` و`package-lock.json`
- `android/app/build.gradle`
- `.github/workflows/android-release.yml`
- `.gitignore`
- `docs/LAUNCH_STATUS.md`

## ما بقي خارج نطاق الكود

هذه ليست نقاطاً يجوز تحويلها إلى PASS من قراءة المصدر فقط:

1. تشغيل مصفوفة الأدوار والحسابات الحقيقية على Staging والتحقق من RLS/Auth والحظر والحذف.
2. بناء AAB موقع من workflow بأسرار المالك وتثبيته على أجهزة Android.
3. Google Play Internal Testing وشراء/Restore وRTDN الحقيقي.
4. LiveKit من شبكتين، AdMob/SSV، TikTok OAuth، ومراقبة الخدمات.
5. مراجعة بشرية لـ Cohort المحتوى وتفعيل تدريجي، ثم قياس D1/D7/D14 وcompletion وcrash-free وlatency.

## ملاحظة أمان

رمز Supabase الإداري تم إدخاله في المحادثة النصية، وليس في Git أو التقرير. لأفضل ممارسة أمنية يجب على مالك المشروع تدويره/إلغاؤه بعد انتهاء هذه الدفعة وإنشاء رمز جديد للتشغيل القادم.

## مصدر الحزمة

الحزمة النهائية يجب أن تُنشأ بعد آخر commit من `main` باستخدام manifest يحوي SHA-256 لكل ملف و`dist/build-info.json`. لا يتم تضمين `node_modules` أو `dist` أو keystore أو أسرار أو مخرجات Capacitor المولدة في حزمة المصدر.
