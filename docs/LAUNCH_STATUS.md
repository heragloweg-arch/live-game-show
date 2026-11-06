

## إصلاح Daily وSolo — 6 نوفمبر 2026

- كشف سجل Postgres سبب HTTP 503 في `match`: خطأ SQLSTATE `42702` داخل `advance_match_round` بسبب غموض `user_id` في `COUNT(DISTINCT user_id)`. تم إصلاحه بتأهيل الأعمدة (`s.user_id`) مع إبقاء صلاحية RPC مقتصرة على `service_role`.
- فحص pack الحالي كشف فسادًا حقيقيًا في المحتوى: سؤال «كاتب الأيام؟» كان يعرض حروف «تفاح» ويحمل 34 إجابة غير مرتبطة. تم تصحيح محطات رحلة اليوم الثلاث في migration ذرية:
  - «كاتب «الأيام»؟» ← «طه حسين» وحروف `ط ه ح س ي ن`.
  - «اسم ولد يبدأ بحرف ك (4 أحرف)» ← «كريم».
  - «كوّن كلمة من: ح ب» ← «حب».
- تحقق Supabase بعد التطبيق: المحطات الثلاث تعرض prompt/letter_pool/max_length/accepted_answer متطابقة، وRPC الانتقال يعرض `qualified_count > 0` مع `anon_exec=false` و`authenticated_exec=false`.
- البوابات المحلية بعد الإصلاح: typecheck وlint وVitest وproduction gates وbuild و`git diff --check` ناجحة.

لم يُسجل PASS ميداني نهائي لرحلة Solo أو Daily من جهاز مالك بعد هذا الإصلاح؛ يلزم إعادة السيناريو على Railway مع حفظ `match_id` وrequest IDs. قرار الإطلاق يبقى `NO-GO` حتى إغلاق E2E الخارجي وبقية Android/Billing/AdMob/LiveKit.
