# دفعة قدها — Red Team F0/F1 تمهيدي

**التاريخ:** 2026-11-03  
**Commit العمل:** `0a57c1625cffd94e40155051a38cac17e6683707`  
**النطاق:** تثبيت المصدر، البوابات المحلية، مطابقة Staging، نشر daily، وفحص CORS/401.

## ما أُغلق

- `main` مطابق لـ`origin/main` قبل تعديل هذا التقرير.
- Node `v22.23.4` يحقق شرط `>=22.22.0`.
- migrations المحلية والبعيدة متطابقة: 97 migration، وآخرها `20261031120000_daily_slot_coins_and_ad_multiplier`.
- مشروع Supabase الصحيح هو `jwhrbadnirwjyinplbmn` وحالته `ACTIVE_HEALTHY`.
- وظائف Supabase المنشورة كلها `ACTIVE`؛ daily نُشرت مصححة بالإصدار 29 مع JWT verification.
- `daily` يحافظ على RPC الذري للمكافآت، ورفض fallback غير الذري، ويدعم `submit_slot` و`claim_ad_reward`.
- إصلاح توثيق `LAUNCH_STATUS.md`: استُعيد السجل الكامل وأضيف تحديث الدفعة، بعد اكتشاف اختصار غير مقصود في الدفعة السابقة.

## البوابات المحلية

`npm ci --legacy-peer-deps --no-audit --no-fund`، `typecheck`، `lint`، Vitest: 21/21، production gates: 50/50، build، `verify-production`، `verify-content-release` لـ968 صفًا، و`verify:e2e-log` كلها ناجحة. سجل E2E بقي صادقًا: 10/10 `BLOCKED_EXTERNAL`.

## الفحوص الحية

- OPTIONS لـ`daily` من أصل Railway أعاد HTTP 200 وأصل Railway المطلوب، مع headers للـauthorization/apikey/content-type.
- طلب POST بلا Authorization أعاد HTTP 401.
- ملاحظة مهمة: استجابة 401 المبكرة من Supabase Gateway ظهرت معها `Access-Control-Allow-Origin: *` قبل تنفيذ الدالة. لذلك لا يُسجل CORS الكامل PASS لطلبات الرفض حتى يُثبت سلوك Gateway/الإعداد النهائي من البيئة المالكة.

## ما لم يُثبت

- Railway `/ready` لم يُثبت بعد على commit `0a57c162`؛ آخر artifact معروف سابقًا كان `b964cf...`.
- E1–E8 الميدانية، Android/AAB/Internal Testing، Billing، AdMob، LiveKit، حذف الحساب، الحظر، والشبكة ما زالت `BLOCKED_EXTERNAL`.
- لا يجوز إعلان RC أو Store Ready أو Soft Launch.

**Soft Launch:** لا. السبب: E2E خارجي وRailway artifact وF5/F6 لم تُغلق بأدلة حية.
