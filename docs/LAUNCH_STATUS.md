

## تحقق النشر الخارجي — 22 نوفمبر 2026 (بعد تصحيح رابط Railway)

تم ربط Supabase بالمشروع `jwhrbadnirwjyinplbmn` وتطبيق migration الإنتاج بنجاح:

- `20261122000001_solo_no_competitor.sql`
- `20261122000002_remove_annual_subscription.sql`

تم نشر الوظائف التي لها مصدر حالي في هذا المستودع من commit `bf5088ec` بنجاح: `daily`, `match`, `subscription`, `tournament`, و`voice`.

وأثبتت `supabase functions list` أن الوظائف الأخرى التالية موجودة ونشطة على المشروع، لكنها ليست موجودة كمصدر في هذا checkout الحالي، لذلك لم أدّعِ إعادة نشرها من هذا commit: `room`, `tiktok`, `metrics`, `admob-ssv`, `account`, `answer`, `overlay`, `analytics`, `google-play-rtdn`, `couple`, `creator`, `team`, `matchmaking`, `economy`, `safety`. يلزم استرجاع مصادرها المطابقة من المستودع أو تثبيت قرار رسمي بالإبقاء على إصداراتها الحالية قبل إعادة نشرها.

فحوص smoke المباشرة:

- Railway `https://live-game-show-production-31045377.up.railway.app/ready`: HTTP 200، `status=ready`، والبصمة `bf5088ec06de01dcd53454f0e4c34b43ff5fa243`.
- Railway `/build-info.json`: HTTP 200، و`gitCommit` مطابق للـmain وقت النشر.
- الوظائف المحمية `daily`, `match`, `subscription`, `tournament`, `voice`, `room`, `answer`, `matchmaking`, `economy`, `account`, `team`, `couple`, `creator`, `safety`, `metrics`, و`analytics`: أعادت HTTP 401 دون JWT. وظيفة `overlay` أعادت 404 لحامل غير صالح، وهو مسار رابط موقّع وليس endpoint جلسة عادي.

تم حذف بقايا الساحة الفضائية المعزولة من المصدر (الشاشات، المشهد ثلاثي الأبعاد، الخدمة، الأنواع، واختبارات المشهد) وتنظيف سياسة الخصوصية وتعريفات runtime. لا يوجد لها route في التطبيق أو مرجع مصدر متبقٍ.

تم التحقق أن شاشات المضيف والغرفة وLiveKit lazy routes، ولا تدخل bundle المسار الأول Home→Play. يبقى chunk `livekitClient` كبيرًا عند تحميل المسار المختص، وهو تحذير أداء منفصل وليس فشلًا في المسار الأول.
