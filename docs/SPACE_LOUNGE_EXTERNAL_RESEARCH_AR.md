# فحص تكامل SPACE LOUNGE مع TikTok — 8 نوفمبر 2026

## النتائج

- صفحة TikTok for Developers تعرض منتجات مثل Login Kit وShare Kit وContent Posting API وDisplay API وData Portability وResearch API. لم يظهر فيها منتج عام موثق لاستقبال تعليقات أو هدايا TikTok LIVE.
- صفحة Webhook Events الرسمية تعرض أحداث إلغاء التفويض، وفشل/نشر فيديو، وجاهزية تنزيل portability؛ لا تذكر تعليقات البث المباشر أو هداياه أو مغادرة المشاهدين.
- ملف التكامل في مستودع `live-game-show` يصرح بأن الموجود هو Login Kit فقط، وأنه لا يساوي التحكم في TikTok LIVE.
- حزمة npm `tiktok-live-connector` الإصدار 2.5.0 (المتحقق في 2026-11-08) تعلن استقبال أحداث `member`, `chat`, `gift`, و`roomUser`. وثائق الحزمة تصفها بأنها غير رسمية وتقرأ خدمة Webcast الداخلية، وتحذر من تغير البروتوكول دون إشعار. عملية التوقيع تعتمد على خدمة Euler Stream؛ الوثائق تذكر حدودًا مجتمعية مجانية، لكن توفرها/حدودها الخارجية ليسا ضمان تشغيل.
- محرك الأحداث يوفر `giftId`, `repeatCount`, و`repeatEnd`. الهدايا المتسلسلة قد ترسل عدة أحداث؛ يجب اعتماد حدث الاكتمال/منع التكرار قبل الحركة. لا يجوز وضع Gift IDs افتراضية في الإعداد.
- `package.json` في npm يعلن Node `>=20` وترخيص `AGPL-3.0-only`. نسخة LICENSE داخل الحزمة تتضمن استثناءات مرقمة 18–21، منها استثناءات لبعض تكاملات overlays/games، لكنها تقيد الاستخدام كخدمة سحابية/SaaS تجارية ما لم تتوفر الشروط المطلوبة للمصدر الكامل. يلزم الحفاظ على إشعار الترخيص وعرض المصدر المناسب، ومراجعة توافق الترخيص للنشر التجاري؛ هذا ليس رأيًا قانونيًا.

## أثر القرار الهندسي

1. تبقى المكتبة في عامل Node مستقل وخادمي فقط؛ لا تدخل في حزمة React أو التحميل الأول للعبة.
2. فشل العامل أو توقفه لا يوقف المسابقات أو خادم الملفات الثابتة.
3. لا تُدّعى صفة التكامل الرسمي. حالة الاتصال وحدودها تظهر للمضيف.
4. يبقى ربط Gift IDs فارغًا افتراضيًا إلى أن تُرصد القيم الفعلية ويضبطها المالك.
5. لا تُحفظ نصوص التعليقات أو سجل الحضور بعد انتهاء الجلسة؛ ويكون الخروج بمهلة خمول إذا لم يظهر حدث مغادرة موثوق.
6. التشغيل الحي يحتاج إعداد متغيرات خدمة العامل ونشرها منفصلًا، واختبار اتصال حقيقي بحساب/بث يملكه المستخدم؛ عدم وجود هذه الإعدادات يمنع ادعاء اكتمال الربط الحي.

## المصادر

- TikTok Developer products: https://developers.tiktok.com/
- TikTok official webhook event types: https://developers.tiktok.com/doc/webhooks-events/
- TikTok Developer Terms: https://www.tiktok.com/legal/page/global/tik-tok-developer-terms-of-service/en
- TikTok Live Connector README: https://github.com/zerodytrash/TikTok-Live-Connector
- TikTok Live Connector license: https://github.com/zerodytrash/TikTok-Live-Connector/blob/ts-rewrite/LICENSE
- npm package metadata: https://www.npmjs.com/package/tiktok-live-connector
- Repository’s existing integration boundary: https://github.com/heragloweg-arch/live-game-show/blob/main/docs/TIKTOK_INTEGRATION_BOUNDARY_AR.md
