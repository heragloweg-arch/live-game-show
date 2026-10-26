# تقرير التسليم الإنتاجي النهائي — قدها

**التاريخ:** 26 أكتوبر 2026  
**الفرع:** `main`  
**مرجع الإصدار:** يُقرأ من `dist/build-info.json` و`PACKAGE_MANIFEST.json` داخل الحزمة النهائية، وليس من hash مكتوب يدوياً في تقرير.

## القرار الصريح

الحالة الحالية هي **Production Candidate / Soft-Launch Candidate** وليست `GO` لإطلاق عام. تم إغلاق الفجوات البرمجية التي أمكن إثباتها في المصدر وStaging، لكن لا يجوز إعلان الجاهزية العامة قبل اختبارات الأجهزة والحسابات الحقيقية، AAB الموقع، Internal Testing، وربط الخدمات التجارية والخارجية.

## ما تم تنفيذه على المستودع

- تثبيت Quick Match: بحث عن لاعب حقيقي ثم خصم كمبيوتر خادمي صريح عند انتهاء المهلة، مع avatar واضح و`is_ai=true` وتسوية نقاط AI ذرية.
- تثبيت دورة الغرف: answer/reveal وحماية إخفاء الإجابات قبل الكشف، مع بوابات static تمنع رجوع العقد غير السلطوية.
- تثبيت Couples عبر عقد الخادم الحالي.
- تثبيت دوري الفرق: سقف خمسة أعضاء، تسجيل ذري، Round Robin، fixtures، standings، بدء مواجهة حقيقية، وتسوية جائزة idempotent لأعضاء الفريق الفائز.
- إضافة readiness حقيقي لخدمة الويب يعرض `service=qaddaha-web` وبصمة commit من `build-info.json`.
- إضافة بوابة إنتاجية للغرف وAI ودوري الفرق وreadiness وseed الأعلام.
- إضافة migration reconciliation رقم `20261026000004` لأن migration الأعلام القديمة كانت مسجلة بعيدة دون أن تظهر صفوفها في قراءة REST العامة. الصفوف تُنشأ inactive/needs_review ولا تُفعّل تلقائياً.
- إزالة artifacts Capacitor المتتبعة سابقاً والحفاظ على مستودع قابل لإعادة البناء.

## الأدلة المحلية

- TypeScript: PASS.
- ESLint: PASS.
- Vitest: 8 ملفات، 21 اختباراً ناجحاً.
- Production gates: **32/32 PASS**.
- Solo progression: PASS، 48 مرحلة وخمس جولات.
- Content release: PASS بنيوياً لـ968 صفاً، مع منع bulk activation.
- Production artifact: PASS.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- `git diff --check`: PASS.

## الأدلة البعيدة على Staging

- المشروع الإداري المطابق: `jwhrbadnirwjyinplbmn`.
- migrations بعيدة حتى `20261026000004`.
- وظائف Supabase المنشورة ACTIVE، ومن ضمنها:
  - `match`، `matchmaking`، `daily`، `room`، `team`، `tournament`، `metrics`.
  - `couple`، `overlay`، `tiktok`.
- أُعيد النشر الأخير مع تحقق JWT الافتراضي، ولم يُترك خيار تعطيل JWT في دفعة النشر الأخيرة.
- قراءة REST العامة لا تُثبت عدد صفوف الأعلام غير النشطة؛ سياسة RLS تحجبها، لذلك يلزم service-role audit منزوعة البيانات لتسجيل عددها دون تحويل anon إلى مصدر حقيقة.

## ما لا يجوز ادعاء إغلاقه

1. لا توجد نتيجة E2E حقيقية من جهازين/شبكتين في هذا التسليم.
2. لا توجد keystore أو AAB موقع أو نتيجة Google Play Internal Testing.
3. لا توجد مصادقة إنتاجية مثبتة لـ Google Play/RTDN أو AdMob/SSV أو LiveKit production أو TikTok OAuth review.
4. لا يوجد ربط حي مثبت لخدمة Railway الصحيحة؛ readiness المحلي ومصدر الكود صحيحان، لكن الرابط الخارجي يجب أن يكون خدمة Qaddaha نفسها.
5. لا يوجد cohort مستخدمين حقيقي يثبت D1/D7/D14 وcrash-free وlatency وARPDAU.
6. محتوى الأعلام seed موجود كمسار reconciliation ومقصود أن يبقى inactive إلى حين مراجعة بشرية؛ لا يُفعل تلقائياً.

## إجراء أمني إلزامي بعد التسليم

رمز Supabase Management Access Token أُرسل نصياً في المحادثة. يجب على مالك المشروع إلغاؤه/تدويره فوراً وإنشاء رمز جديد قبل أي تشغيل لاحق. لم يُحفظ الرمز في Git أو الحزمة أو هذا التقرير.

## مصدر الحزمة

الحزمة النهائية تُبنى من آخر `main` بعد commit التسليم، وتحتوي manifest وبصمات SHA-256. لا تتضمن `node_modules` أو `dist` أو keystore أو أسراراً أو مخرجات Capacitor المولدة.
