# دفعة التحسين السينمائي وإغلاق ملاحظات Red Team

## الهوية البصرية

- اعتماد شعار `public/images/logo-qaddaha.png` كعنصر Brand أساسي في Home وSplash.
- إضافة طبقة إضاءة ليلية هادئة، توهج بنفسجي/ذهبي، texture خفيف، وعمق بصري بدون رفع الحمل النفسي أو تشتيت اللاعب.
- تحسين focus states وإتاحة لوحة المفاتيح.
- احترام `prefers-reduced-motion`.
- ضبط الحركات على transform/opacity وبزمن قصير ومريح.

## الواجهات

- Hero Home أصبح أكثر ارتباطًا بالعلامة التجارية من خلال orb للشعار، مع إبقاء CTA واضحًا.
- بطاقات اللعب والمتجر والبطولة أصبحت glass surfaces متناسقة مع hierarchy أفضل.
- Daily Pack حصل على:
  - Hero مستقل.
  - شريط محطات أوضح.
  - سؤال رئيسي بعمق بصري أعلى.
  - نتيجة متوهجة عند الإنجاز.
  - streak chip أكثر وضوحًا.
- تحسين اللمس، الضغط، focus، والانتقالات.

## إصلاحات Red Team

- إضافة `rematch` حقيقي ضد نفس الخصم بعد مباراة 1v1 منتهية.
- التحقق الخادمي من أن المستخدم كان مشاركًا في المباراة السابقة.
- إزالة أرقام المكافآت الافتراضية من شاشة النتيجة؛ عند غياب مكافأة الخادم يظهر `جارٍ التحديث` بدل رقم مخترع.
- إضافة `weekly_journey` خادمية تقرأ إكمال الحزم اليومية الفعلية.
- ربط Home بالتقدم الأسبوعي الفعلي بدل بيانات واجهة ثابتة.
- إضافة migration `20260311000037_weekly_journey_index.sql` لفهارس القراءة.
- جعل Railway يستخدم `npm ci --legacy-peer-deps` مع typecheck/lint/tests/production verification قبل build.

## التحقق

بعد التعديلات نجحت:

- `npm run typecheck`
- `npm run lint`
- `npm test -- --run` — 16 اختبارًا
- `npm run build`
- `node scripts/verify-production.mjs`

## ما يزال خارج نطاق الكود

- تطبيق migrations وEdge Functions على Supabase حي.
- QA بحسابين حقيقيين.
- Android AAB والتوقيع وInternal Track.
- قياس Retention الفعلي.
- التحقق من LiveKit/Billing/Ads على الخدمات الحية.
