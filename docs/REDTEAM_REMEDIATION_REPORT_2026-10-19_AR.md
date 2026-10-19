# تقرير تنفيذ ملاحظات Red Team — قدها

**التاريخ:** 2026-10-19

## القرار التنفيذي

تم تحويل الملاحظات القابلة للإغلاق داخل المستودع إلى تنفيذ فعلي، وليس إلى ملفات تجريبية أو واجهات معزولة. شملت الدفعة بصمة build، CORS، rate limiting، حذف الحساب، QR للغرفة، route manifest، وربطها مع بوابات الاختبار الحالية.

أما البنود التي تحتاج Supabase أو Google Play أو LiveKit أو TikTok Developer App أو أجهزة حقيقية فلم يتم تزوير إغلاقها؛ بقيت بوابات تشغيلية صريحة حتى لا يتم اعتبار كود محلي دليل إطلاق.

## ما أُغلق داخل الكود

### بصمة الإصدار

أضيف `scripts/write-build-info.mjs`، وأصبح `npm run build` يكتب `dist/build-info.json` ويحقن commit الفعلي في `index.html` عبر meta باسم `qaddaha-build`. أصبحت `verify-production.mjs` ترفض artifact إذا كانت البصمة مفقودة أو غير صالحة أو لا تطابق `index.html`.

هذا يعالج البصمة القديمة `redteam-hardened-20261007`، ويجعل artifact قابلًا للمطابقة مع commit البناء. عند غياب Git في بيئة CI يجب تمرير `GIT_COMMIT_SHA` أو `COMMIT_SHA` بدل استخدام قيمة وهمية.

### CORS

أزيل `Access-Control-Allow-Origin: *` من المساعد المشترك. الأصل أصبح مضبوطًا عبر `CORS_ALLOWED_ORIGIN`، مع fallback واضح إلى أصل التطبيق الرسمي، وإضافة `Vary: Origin`. يجب ضبط القيمة الحقيقية في Edge Function secrets قبل النشر.

### rate limiting خادمي

أضيفت migration `20261019050000_account_deletion_rate_limits.sql` وفيها جدول buckets وقاعدة `consume_rate_limit_atomic` الذرية. أضيف مساعد Edge مشترك `supabase/functions/_shared/rateLimit.ts` مع fail-closed عند تعطل RPC.

تم ربطه حاليًا بالمسارات الحساسة التالية:

- الإجابات والـlifelines: 60 عملية في الدقيقة لكل مستخدم.
- عمليات المباراة: 30 عملية في الدقيقة لكل مستخدم ولكل action.
- السلامة والبلاغات والحظر: 30 عملية في الدقيقة.
- بدء ربط TikTok: 5 محاولات خلال 10 دقائق.
- طلب حذف الحساب: محاولتان خلال ساعة.

حدود الإنتاج يجب مراجعتها من بيانات الإساءة الفعلية، لكن لا يعتمد النظام الآن على rate limit واجهة العميل وحدها.

### حذف الحساب

أضيف مسار `supabase/functions/account/index.ts` وعميل `src/services/api/accountApi.ts`. الواجهة في لوحة الحساب تطلب تأكيدًا بصريًا ثم إدخال `DELETE_ACCOUNT` قبل الإرسال.

على الخادم، يجري حذف غرف المضيف المملوكة، وإزالة بيانات الإجابات الشخصية، وإخراج الحساب من الطوابير والمشاركين، وإخفاء الهوية من التاريخ التنافسي، ثم حذف ملف `profiles` وتبعياته، وأخيرًا حذف مستخدم Supabase Auth عبر `auth.admin.deleteUser`.

إذا فشل تجهيز البيانات لا يُغلق الحساب. وإذا نجح التنظيف وفشل حذف Auth تعيد الدالة حالة صريحة تحتاج دعمًا، بدل الإبلاغ عن نجاح كاذب.

### QR للمضيف

أضيفت مكتبة `qrcode` المفتوحة المصدر. تعرض غرفة المضيف QR فعليًا للرابط `/room/join?code=...`. عُدّل `RoomScreen` لقراءة query parameter وتعبئة الكود والانضمام تلقائيًا. لا يعتمد QR على خدمة خارجية أو كشف room UUID.

### Route manifest

أضيف `public/manus-routes.json` ويشمل المسارات الثابتة والديناميكية الحالية، بما فيها `/host` و`/overlay/:token` و`/room/:roomId` و`/match/:matchId`.

### بوابات الإنتاج

أضيفت اختبارات ساكنة تثبت أن مسار حذف الحساب وrate limiting مربوطان بالخادم، وأن CORS ليس wildcard، وأن manifest يحتوي مسار المضيف. أصبحت بوابة الإنتاج تحتوي **13 اختبارًا ناجحًا** مع اختبارات الجولة الذرية.

## الأدلة المحلية

نجحت بعد التعديلات:

- `npm run typecheck`
- `npm run lint`
- Vitest: **19 اختبارًا ناجحًا**.
- Production gates: **13 اختبارًا ناجحًا**.
- `deno check` لوظائف account وanswer وmatch وsafety وtiktok وCORS وrateLimit.
- `npm run build`.
- `node scripts/verify-production.mjs`.

ما زال تحذير chunk أكبر من 500KB قائمًا؛ هو بند أداء P1 لاحق وليس فشلًا في البناء، ويجب معالجته قبل حمل تسويقي واسع.

## البنود التي لا يمكن إغلاقها من المصدر المحلي وحده

1. تطبيق migration على Supabase Staging ومطابقة `schema_migrations` ثم Production.
2. نشر جميع Edge Functions من commit معروف.
3. ضبط `CORS_ALLOWED_ORIGIN` وSupabase وLiveKit وGoogle Play وTikTok secrets خارج Git.
4. تنفيذ مصفوفة RLS للأدوار anon/authenticated/host/member/blocked/admin/service_role.
5. اختبار LiveKit فعليًا بطرد blocked peer مع حسابين وغرفة حقيقية.
6. إنشاء منتجات Google Play وRTDN وAAB موقع واختبار الشراء والاستعادة والتجديد والإلغاء والاسترداد والتكرار.
7. إعداد AdMob production وUMP وSSV واختبار callback الموقّع والمكرر والمتأخر.
8. إنشاء TikTok Developer App وإكمال Redirect URI وApp Review.
9. اختبار حذف الحساب على نسخة Staging مع التحقق من عدم بقاء بيانات شخصية أو أسرار tokens.
10. تشغيل cohort عربي وقياس Daily completion وD1/D7 وcrash-free وARPDAU وeCPM قبل التوسع.

## حالة التسليم

المصدر أقوى من حالة Soft-Launch Candidate السابقة، لكن التصنيف لا يتغير إلى RC أو جاهز للنشر حتى تُثبت البوابات الخارجية أعلاه. الكود المحلي جاهز للانتقال إلى Staging؛ التشغيل الحي ما زال يتطلب صلاحيات وخدمات لا توجد داخل Git.
