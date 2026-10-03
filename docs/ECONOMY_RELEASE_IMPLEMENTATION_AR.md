# تقرير تنفيذ خطة الاقتصاد — قدها

## ما أُغلق داخل المصدر

تم ربط الاقتصاد المنتجّي بدل إبقاء أجزاء منه كـ hooks منفصلة. أصبحت مكافآت الإعلانات الاختيارية تمر عبر `claim_ad_reward_atomic` مع request id فريد وحد يومي خادمي وتاريخ الرياض، بدل الاعتماد على عداد المتصفح وحده. كما ينتظر العميل نتيجة المطالبة الخادمية بعد نجاح callback الإعلان، ويسجل `rewarded_complete` فقط عندما يؤكد الخادم قبول المطالبة.

أضيف `BottomAdBanner` في Home وShop وProfile وLeaderboard. الإعلان لا يظهر أثناء الجولة الحية، يختفي تلقائيًا عند entitlement Plus، ويحترم safe-area. تمت إضافة CTA rewarded بعد نجاح محطة Daily فقط، وليس أثناء الإجابة أو بين الجولات.

أضيفت `subscription_daily_grants` و`claim_subscription_daily_atomic`. عند قراءة حالة الاشتراك الفعالة، تُمنح العملات اليومية مرة واحدة فقط لكل يوم ولكل مستخدم، وتُسجل في ledger من الخادم. لا يشتري الاشتراك إجابات أو نقاط فوز أو أفضلية في التصحيح.

تم توضيح Free مقابل Plus في واجهة الاشتراك، والإبقاء على Restore Purchases، كما تم توحيد `railway.toml` مع بوابات `npm ci --legacy-peer-deps` وtypecheck وlint والاختبارات وفحص الإنتاج.

تم تحسين فلاتر المتجر لتشمل: الكل، مملوك، مجهز، وإطار/لقب/مظهر/تعبير.

## نتائج التحقق

نجحت:

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run build
node scripts/verify-production.mjs
```

الاختبارات: 6 ملفات و16 اختبارًا ناجحًا. البناء وPWA وProduction lock ناجحة.

## بوابة التشغيل خارج المصدر

لكي تصبح الإعلانات والاشتراكات حقيقية في الإنتاج يجب تعبئة IDs الخاصة بـ AdMob، نشر migration `20260311000038_economy_claims_atomic.sql`، نشر `economy` و`subscription`، وضبط Google Play package name وservice-account secret وproduct IDs في Play Console. لا يجوز تفعيل `ALLOW_UNVERIFIED_PLAY_PURCHASES` في الإنتاج.

كما يجب تنفيذ `supabase db push` ثم اختبار حساب مجاني وحساب Plus على بيئة Staging قبل النشر العام. هذه ليست فجوات مخفية في React؛ إنها أسرار وخدمات خارجية لا يمكن وضع قيم صحيحة لها داخل الحزمة.

## سياسة الاقتصاد

الاقتصاد يحافظ على مبدأ عدم Pay-to-Win: الاشتراك يزيل الإزعاج ويمنح قيمة يومية وتجميلًا، والـ Rewarded يمنح عملات اختيارية، والمتجر تجميلي. لا إعلان أثناء عداد السؤال، ولا شراء لفوز أو إجابة أو صعوبة.
