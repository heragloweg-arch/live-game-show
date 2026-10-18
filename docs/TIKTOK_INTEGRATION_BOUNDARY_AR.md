# حدود تكامل TikTok في قدها

## القرار التنفيذي

أُضيف إلى قدها تكامل رسمي من خلال TikTok Login Kit: يضغط المستخدم «ربط TikTok»، يوافق في TikTok، ثم يعود إلى Edge Function آمنة تحفظ رمز الوصول في جدول لا يقرأه العميل. يمكن بعد ذلك إنشاء غرفة قدها مع وسم `social_provider=tiktok` ومشاركة رابط الغرفة.

هذا التكامل لا يساوي التحكم في TikTok LIVE أو إنشاء بث LIVE تلقائيًا. لا يُعلن التطبيق للمستخدم أنه يملك تحكمًا في البث، ولا يطلب صلاحيات غير لازمة. واجهة المضيف توضّح أن الربط يستخدم الحساب المصرح به لمشاركة الغرفة، وأن التحكم في LIVE يحتاج منتجًا وصلاحيات TikTok معتمدة بشكل منفصل.

## الأساس الرسمي

وثائق TikTok تطلب تسجيل التطبيق والحصول على `client key` و`client secret`، وتطلب أن يكون Redirect URI مطلقًا يبدأ بـ `https` وثابتًا ومسجلًا في إعدادات Login Kit. [1]

يُنفذ التفويض على الخادم مع `state` لمقاومة CSRF، ثم تُدار رموز الوصول والتحديث على الخادم ولا تُرسل إلى العميل. نطاق التنفيذ الحالي هو `user.info.basic`، وهو نطاق قراءة أساسي لاسم العرض والصورة، وليس نطاق نشر أو إدارة LIVE. [1] [2]

TikTok توضح أن التطبيقات الموجودة في Live تمر بمراجعة، وأن الموافقة ليست مضمونة بمدة زمنية ثابتة. يجب تقديم سياسة الخصوصية وشروط الاستخدام وبيانات تطبيق صحيحة وحسابات اختبار عند الطلب. [3]

## ما تم تنفيذه في المستودع

- `supabase/functions/tiktok/index.ts`: بدء OAuth، state أحادي الاستخدام لمدة 10 دقائق، callback، قراءة بيانات المستخدم الأساسية، وتخزين token خادميًا.
- `src/services/api/tiktokApi.ts`: عميل الحالة والربط والفصل.
- `src/screens/home/ProfileScreen.tsx`: بطاقة حساب TikTok داخل لوحة الحساب مع popup ورسائل نجاح/فشل وفصل الربط.
- `supabase/migrations/20261018040000_host_access_coin_packs_tiktok.sql`: جداول `tiktok_connections` و`tiktok_oauth_states` مع RLS وامتيازات service role فقط.
- `supabase/functions/voice/index.ts` و`HostScreen.tsx`: خيار ربط الغرفة بـ TikTok، والتحقق الخادمي من أن الاتصال يخص المستخدم قبل إنشاء الغرفة.

## ما يجب تنفيذه خارج المستودع قبل الادعاء بأن الربط حي

1. إنشاء TikTok Developer App وتفعيل Login Kit وطلب النطاق المطلوب.
2. ضبط `TIKTOK_CLIENT_KEY` و`TIKTOK_CLIENT_SECRET` و`TIKTOK_REDIRECT_URI` و`TIKTOK_APP_ORIGIN` في أسرار Supabase Edge Functions فقط.
3. تسجيل Redirect URI مطابق حرفيًا، ونشر سياسة الخصوصية وشروط الاستخدام على HTTPS.
4. تطبيق migration ونشر وظيفة `tiktok` ثم اختبار ربط وفصل حقيقي بحساب اختبار.
5. إرسال التطبيق إلى TikTok App Review وانتظار الموافقة قبل الإطلاق العام.
6. إذا كان المطلوب مستقبلًا بث LIVE أو قراءة أحداث LIVE أو multi-guest، فهذا مسار منفصل لا يجوز تنفيذه عبر scraping أو مكتبة غير رسمية. يلزم منتج TikTok مناسب وصلاحية مكتوبة ومراجعة مستقلة.

## References

[1]: https://developers.tiktok.com/doc/login-kit-web/ "Login Kit for Web - TikTok Developer Guide"
[2]: https://developers.tiktok.com/doc/login-kit-manage-user-access-tokens/ "Manage User Access Tokens with OAuth v2 - TikTok Developer Guide"
[3]: https://developers.tiktok.com/doc/our-guidelines-developer-guidelines "Developer Guidelines - TikTok for Developers"
