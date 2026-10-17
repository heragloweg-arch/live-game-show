# تشغيل Google Play RTDN وAdMob SSV — 17 أكتوبر 2026

## ما أصبح موجودًا في المصدر والخادم
- `subscription`: يتحقق من حالة الاشتراك عبر Android Publisher API v3 `subscriptionsv2.get`، ويحجز ملكية purchase token ذريًا، ويستخدم `activate_subscription_atomic` بدل تعديل الاشتراك والملف في عمليتين منفصلتين.
- `google-play-rtdn`: يتحقق من JWT الخاص بـ Pub/Sub عبر مفاتيح Google OIDC، ويتحقق من issuer/audience والبريد الموثوق، ثم يجلب الحالة الحالية من Play ويطلب مصالحتها ذريًا. لا يمنح استحقاقًا من إشعار RTDN وحده إذا لم يوجد إيصال مرتبط بحساب.
- `admob-ssv`: يتحقق من توقيع AdMob ECDSA باستخدام مفاتيح Google، ويطابق الوحدة ومقدار المكافأة ومعرف الطلب والمستخدم قبل استدعاء `complete_ad_reward_ssv_atomic`.
- `economy`: لم يعد يقبل `ad_reward_claim` من العميل لمنح العملات؛ يجهز طلبًا معلقًا فقط. منح 20 عملة ينتظر callback صالحًا من AdMob.
- قاعدة البيانات: دوال `reserve_google_play_receipt_atomic` و`reconcile_google_play_subscription_atomic` موجودة على قاعدة المشروع الحالية، والتنفيذ المباشر مقصور على `service_role`.

## إعداد أسرار Supabase Edge Functions
أضف القيم في إعدادات Edge Function Secrets داخل Supabase، لا في Git أو محادثة أو متغيرات Vite:
- `GOOGLE_PLAY_PACKAGE_NAME` = `com.qaddaha.challenges`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` = JSON كامل لحساب خدمة Android Publisher بعد منحه الصلاحيات اللازمة
- `GOOGLE_PUBSUB_AUDIENCE` = قيمة audience نفسها التي ستضبطها في إعداد Push subscription
- `GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL` = البريد الموثوق الذي سيصدر JWT للمراسلة
- `ADMOB_REWARDED_UNIT_ID` = معرّف وحدة الإعلان المكافئ المطابق في AdMob

تستخدم وظائف Supabase القيَم المدمجة `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` من بيئة الوظائف. لا تضفها يدويًا إلى كود العميل.

## إعداد Google Play RTDN
- عنوان Push endpoint: `https://jwhrbadnirwjyinplbmn.supabase.co/functions/v1/google-play-rtdn`
- فعّل authenticated push باستخدام service account محدد أعلاه.
- اجعل `audience` مطابقًا حرفيًا لـ `GOOGLE_PUBSUB_AUDIENCE`.
- فعّل RTDN على التطبيق والاشتراكات في Play Console، وتأكد أن حساب الخدمة يستطيع قراءة الاشتراكات.
- اختبر رسالة testNotification أولًا، ثم حالات شراء وتجديد وإلغاء وانتهاء/استرداد باستخدام License testers.

## إعداد AdMob SSV
- عنوان callback: `https://jwhrbadnirwjyinplbmn.supabase.co/functions/v1/admob-ssv`
- اربط callback بوحدة rewarded الصحيحة في AdMob.
- اضبط reward item على `coins` والمقدار على `20` ليتوافقا مع منطق الخادم.
- اضبط `ADMOB_REWARDED_UNIT_ID` ليطابق `ad_unit` الوارد في callback.
- يجب أن يمر العميل `userId` و`customData` عبر خيارات SSV؛ `customData` هو request UUID الذي أنشأه الخادم.
- لا تختبر منح المكافآت باستخدام إعلان اختبار وتتوقع callback إنتاجيًا؛ اختبارات AdMob التجريبية لا ترسل SSV الحقيقي.

## حدود الجاهزية الحالية
- نشر Edge Function لا يثبت أن أسرار Google أو AdMob قد ضُبطت.
- لم يتم تنفيذ اختبار حي برسالة Pub/Sub موثقة، أو شراء Play فعلي/License tester، أو callback AdMob موقّع.
- يعتمد تشغيل إعلان المكافأة في التطبيق على تثبيت/تضمين `@capacitor-community/admob` في بناء Android وإعداد UMP والوحدات. لا تعتبر الإعلانات جاهزة حتى يثبت بناء Android الفعلي ذلك.
- لا تعتبر Billing/RTDN أو SSV مكتملين حتى تُسجل نتائج اختبار حيّ لكل مسار، بما في ذلك الرسائل المكررة والمتأخرة وpurchase token المرتبط بحساب آخر.
