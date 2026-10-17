# تنفيذ السلامة والحظر وOBS — 17 أكتوبر 2026

## ما نُفذ على قاعدة Supabase الحالية
- طُبقت migration `harden_legacy_definer_functions`: تثبيت `search_path` للدوال الحساسة وسحب EXECUTE من أدوار العميل للدوال الداخلية.
- طُبقت migration `user_safety_reports_blocks`: إنشاء `user_reports` و`user_blocks` مع RLS ومنع وصول العميل المباشر؛ الوصول يمر عبر Edge Function.
- طُبقت migration `enforce_blocks_and_repair_matchmaking_queue`: إضافة حالة الطابور والطوابع الزمنية، ومنع المطابقة الذرية بين مستخدمين محظورين، وحصر RPC في `service_role`.
- طُبقت migration `room_overlay_tokens`: إنشاء رموز OBS عشوائية، مخزنة كـ SHA-256، قابلة للانتهاء والإبطال، دون صلاحيات مباشرة لأدوار العميل.
- أُعيد الاستعلام بعد التطبيق وأكد وجود الجداول الثلاثة وأعمدة الطابور وصلاحيات الدوال.

## ما أُضيف إلى main
- `supabase/functions/safety/index.ts`: البلاغات، الحظر/إلغاء الحظر، مراجعة المشرف، ومحاولة طرد المستخدم المحظور من غرف LiveKit المشتركة.
- `supabase/functions/overlay/index.ts`: إنشاء/إبطال رابط OBS وواجهة قراءة عامة محدودة.
- `src/services/api/safetyApi.ts`, `src/services/api/overlayApi.ts`.
- `src/screens/creator/SafetyAdminScreen.tsx`, `src/screens/host/OverlayScreen.tsx`.
- مسارات الواجهة وأزرار الإبلاغ/الحظر في الملف الشخصي وأدوات رابط OBS للمضيف.
- تحديث Edge Function للمطابقة لتفشل بأمان بدل الرجوع لمسار مطابقة غير ذري؛ وإضافة فحوص الحظر إلى الدعوات وإعادة المباراة والغرف والصوت.

## حالة النشر والتحقق
- migrations أعلاه نُفذت على المشروع الحالي وتحققت الاستعلامات بعدها.
- تم إنشاء/تحديث ملفات المصدر على `main`.
- يلزم انتظار CI على آخر commit ثم نشر Edge Functions المعدلة والتحقق من الإصدارات المنشورة.
- الطرد الفوري عبر LiveKit لا يعد ناجحًا إلا بعد ضبط `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` واختباره بحسابين فعليين.
- مراجعة البلاغات تتطلب ضبط `TOURNAMENT_ADMIN_IDS` بمعرّفات حسابات الإدارة الموثوقة.
- لا يُعلن RC أو جاهزية Google Play قبل اختبار الوظائف الحية، Billing/RTDN، AdMob/UMP/SSV، وبناء AAB موقّع.

## حدود الأمان
- `user_reports`, `user_blocks`, و`room_overlay_tokens` لا تُمنح وصولًا مباشرًا إلى `anon` أو `authenticated`; يستخدم الخادم `service_role`.
- رابط OBS يتيح فقط اسم الغرفة وحالتها والمشاركين والنقاط والجولة الحالية؛ لا يعيد الإجابات الصحيحة أو بيانات الحساب الحساسة.
- عند تعذر فحص الحظر، تتوقف المسارات الحساسة بدل السماح بالمتابعة.
