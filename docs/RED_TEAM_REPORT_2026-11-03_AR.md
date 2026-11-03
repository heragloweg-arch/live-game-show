# دفعة قدها — Red Team F0/F1/F3

**التاريخ:** 2026-11-03
**Commit العمل:** `c4d341e8`
**النطاق:** تثبيت المصدر، البوابات المحلية، مطابقة Staging، نشر daily، فحص CORS/401، ومراجعة صلاحيات RPC السلطوية.

## ما أُغلق

`main` مطابق لـ`origin/main`، وNode `v22.23.4` يحقق شرط `>=22.22.0`. migrations المحلية والبعيدة متطابقة حتى `20261031120000` قبل migration الأمن الجديدة، وعددها 97؛ ثم طُبقت migration `20261103122217_lockdown_team_tournament_rpcs` وأصبحت جزءًا من سجل Staging. مشروع Supabase الصحيح هو `jwhrbadnirwjyinplbmn` وحالته `ACTIVE_HEALTHY`.

وظائف Supabase المنشورة كلها `ACTIVE`؛ daily نُشرت مصححة بالإصدار 29 مع `verify_jwt=true`. daily يحافظ على RPC الذري للمكافآت، ورفض fallback غير الذري، ويدعم `submit_slot` و`claim_ad_reward`. بوابة المحتوى تمر لـ968 صفًا مدققًا مع منع التفعيل الجماعي.

## البوابات المحلية

نجحت `typecheck` و`lint` وproduction gates: 50/50، وVitest 21/21، والبناء الإنتاجي، `verify-production`، `verify-content-release`، و`verify:e2e-log`. سجل E2E بقي صادقًا: 10/10 `BLOCKED_EXTERNAL`.

## الفحوص الحية

OPTIONS لـ`daily` من أصل Railway أعاد HTTP 200 وأصل Railway المطلوب، مع headers للـauthorization/apikey/content-type. طلب POST بلا Authorization أعاد HTTP 401. ملاحظة مهمة: استجابة 401 المبكرة من Supabase Gateway ظهرت معها `Access-Control-Allow-Origin: *` قبل تنفيذ الدالة؛ لذلك لا يُسجل CORS الكامل PASS لطلبات الرفض حتى يُثبت سلوك Gateway/الإعداد النهائي من البيئة المالكة.

## تصحيح أمني F3

كشف Advisor وقراءة `information_schema.routine_privileges` أن خمس دوال بطولة كانت قابلة للتنفيذ من `anon` و`authenticated` رغم وجود REVOKE في migration سابقة. أُضيفت migration `20261103122217_lockdown_team_tournament_rpcs` وطُبقت على المشروع الصحيح. التحقق الحي بعد التطبيق أظهر أن الدوال الخمس لا تملك EXECUTE إلا لـ`service_role`. بقي `get_public_profiles` بصلاحية القراءة العامة عمدًا لأنه RPC allowlist يعيد حقول الملف العام فقط.

تنبيه Supabase الأمني ما زال يعرض 24 جدولًا RLS بلا policy و36 تحذيرًا متعلقًا بإعادة تقييم `auth.uid()` و58 مفتاحًا أجنبيًا بلا فهارس. بعضها جداول خادمية مقصودة بلا policy، لكنها ليست صفر تحذيرات؛ لذلك تبقى F3 غير مغلقة بالكامل قبل مراجعة كل جدول وتوثيق الاستثناءات.

## ما لم يُثبت

Railway `/ready` يعرض artifact ببصمة `3a37be340f6503798299774c38e603bc3d08867a` غير موجودة في GitHub، لذلك لا يوجد دليل نشر صالح لـ`main`. كما لم تُغلق E1–E8 الميدانية، Android/AAB/Internal Testing، Billing، AdMob، LiveKit، حذف الحساب، الحظر، والشبكة؛ كلها `BLOCKED_EXTERNAL`.

لا يجوز إعلان RC أو Store Ready أو Soft Launch. **Soft Launch: لا**، لأن E2E الخارجي، مطابقة Railway، ومراجعة F3 الكاملة لم تُغلق بأدلة حية.
