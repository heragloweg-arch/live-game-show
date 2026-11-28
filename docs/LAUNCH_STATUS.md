# حالة إطلاق قدها — LIVE

> آخر تحديث: 2026-11-28. هذا الملف يصف ما تم إثباته فقط؛ لا يُعد إعلانًا عن Store Ready أو Global Launch Ready.

## المصدر والـartifact

- **المستودع:** `main`، آخر commit منشور: `f1533d54f6e05a0bcce689cf2deed258917e21a8` (`feat: unify challenge runtime contracts`).
- **الرفع:** `origin/main` متزامن مع commit أعلاه، دون force-push.
- **Build:** `npm run build` نجح، و`PACKAGE_MANIFEST.json` يُولد تلقائيًا من `dist/build-info.json`.
- **Performance:** lazy loading لـLiveKit محفوظ. تحذير chunk الكبير ظاهر كما هو ولم يُخفَ عبر `chunkSizeWarningLimit`.

## Supabase Production

- **Project ref:** `jwhrbadnirwjyinplbmn`.
- **Database:** migration `20261128000001_unified_challenge_runtime_contract.sql` طُبقت فعليًا في Production بعد نجاح dry-run. تثبت 20 ثانية لكل سؤال، حد 10 جولات للغرف، و10 أسئلة غير مكررة لمسارات مباريات البطولة/الفرق، مع تقييد RPCs الحساسة إلى `service_role`.
- **Content release:** أُطلقت أعلام الدول الرسمية المحددة فقط عندما يحتوي كل سؤال على إجابة صحيحة واحدة؛ لا يوجد bulk activation لبنك `needs_review`.
- **Edge Functions المعدلة:** `room` و`match` و`answer` نُشرت بنجاح، وكلها `ACTIVE`.

| الوظيفة | الحالة | الإصدار المثبت |
|---|---|---:|
| answer | ACTIVE | 21 |
| match | ACTIVE | 49 |
| room | ACTIVE | 23 |

- بقية الوظائف الموجودة في Production بقيت `ACTIVE` ولم تُعاد إعادة نشرها دون تغيير مصدر.
- نشر الوظائف لا يثبت وحده دورة شراء أو إعلان أو اختبار أجهزة متعدد.

## بوابات الجودة

- **PASS محلي:** TypeScript، ESLint، Vitest، production gates، contract inventory، content release، solo progression، production build، production lock، و`git diff --check`.
- **E2E خارجي:** لا يُرفع إلى دليل مستقل في هذه الدفعة لعدم وجود logs أو screenshots أو IDs قابلة لإعادة التحقق داخل البيئة.
- **AAB / Google Play Billing / Restore / RTDN / AdMob SSV / LiveKit:** `NOT PROVEN` ميدانيًا. وجود Functions الخاصة بها لا يثبت دورة التشغيل الكاملة.

## Soft Launch والواجهة

- **مفعّل في الكود:** شجرة التحدي، Daily، الحساب، قراءة المتجر، المطابقة، البطولة، الفرق، الغرف، المضيف، الثنائي، وCreator.
- **مغلق عمدًا:** `ads=false` و`billing=false` حتى تثبيت AdMob production IDs وSSV، Google Play products، service account، RTDN، AAB موقّع، وشراء/Restore فعلي.
- المؤقت الموحد في الواجهة والخادم 20 ثانية، وتظهر حالة `timeout` بصيغة «فات الأوان»، وملخص المباراة يستخدم رسائل فوز/خسارة/تعادل واضحة.
- الواجهة تحتفظ بالثيم الداكن والفاتح، safe areas، الهاتف والتابلت، والوضعين الرأسي والأفقي. لا يُعتبر ذلك بديلًا عن اختبار الأجهزة الحقيقية.

## قرار الإطلاق

**NO-GO للإطلاق العام أو إعلان Store Ready.** الحالة الحالية **Soft Launch Candidate تقني** بعد نجاح البوابات المحلية، تطبيق migration، ونشر الوظائف المعدلة. يلزم قبل الإطلاق العام إثبات AAB موقّع، Google Play Billing وRestore وRTDN، AdMob SSV، LiveKit، واختبارات تشغيل متعددة الأجهزة قابلة للتدقيق، ثم قياس cohort مثل D1/D7 وإكمال Daily وRematch وتحويل Plus.
