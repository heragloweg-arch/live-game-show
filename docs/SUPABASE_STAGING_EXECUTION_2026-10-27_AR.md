# تقرير تنفيذ Supabase Staging — 27 أكتوبر 2026

## النتيجة

تم الوصول بنجاح إلى مشروع Supabase `jwhrbadnirwjyinplbmn`، وحالته عند التحقق كانت `ACTIVE_HEALTHY`. استُخدم Management Access Token عبر متغير بيئي مؤقت فقط، ولم يُحفظ في Git أو ملفات المشروع.

## قاعدة البيانات

تم تطبيق migration `20261027000001_retention_rematch_latency` عبر Management API، ثم تسجيلها في `supabase_migrations.schema_migrations`. تم التحقق من وجود أعمدة `d1_rate` و`d7_rate` و`d14_rate` و`session2_rate` و`rematch_rate` و`p95_response_ms` في `analytics_daily`، ووجود `rematch_of` في `matches`.

كما تم تحديث `open_daily_pack` ليمنع عرض التحديات غير النشطة أو غير المعتمدة، ويشترط وجود إجابة مغلقة صالحة.

## الوظائف المنشورة

| الوظيفة | الحالة | الإصدار | verify_jwt |
|---|---:|---:|---:|
| `daily` | ACTIVE | 20 | false |
| `metrics` | ACTIVE | 14 | false |
| `match` | ACTIVE | 24 | false |

تم نشر الوظائف عبر Supabase CLI باستخدام `--use-api`. كل وظيفة أعيد اختبارها بطلب غير مصادق، وكانت النتيجة `401 Unauthorized`، وهو السلوك الأمني المتوقع لأن التحقق الداخلي يعتمد على Authorization token.

## حالة بنك الأسئلة الفعلية

الاستعلام الخادمي أعاد:

- الإصدار 41: **922 سؤالاً**.
- أسئلة لها `challenge_answers`: **910**.
- أسئلة بلا إجابة مغلقة صالحة: **12**، وتبقى مستبعدة.
- حالة الإصدار 41 عند التحقق: `active=false`, `qa_status=needs_review`.

لم يتم تجاوز سجل الموافقة لتفعيل الأسئلة مباشرة. تفعيل الـ910 سؤالاً المؤهلة يحتاج `reviewer UUID` فعلياً ليُسجّل في `challenge_content_approvals` عبر دالة الاعتماد service-role. هذا الإجراء يمنع انتحال مراجع أو إعلان اعتماد غير قابل للتدقيق. بعد توفير UUID المراجع، تُنفذ الموافقة لكل سؤال مؤهل فقط، مع رفض الـ12 سؤالاً التي لا تملك إجابة مغلقة.

## ما تم إغلاقه وما بقي

أُغلق نشر migration والوظائف المتأثرة والتحقق من schema والحماية الأساسية. ما بقي لبنك الأسئلة هو اعتماد service-role موثق لكل سؤال مؤهل. وما زالت اختبارات الحسابات الحقيقية، D1/D7/D14 بعد تكوّن cohorts فعلية، Billing/RTDN، AdMob، LiveKit، TikTok، AAB وInternal Testing، وRailway production بنوداً خارجية بحسب مصفوفة المالك.
