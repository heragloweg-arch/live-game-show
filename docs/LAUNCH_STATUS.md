# حالة إطلاق قدها — LIVE

> آخر تحديث: 2026-11-28. هذا الملف يصف الحالة الحالية فقط؛ لا يُعد دليلًا على نجاح ميداني لم يُختبر أو على جاهزية المتجر.

## المصدر والـartifact

- **المصدر:** آخر commit منشور بعد هذه الدفعة سيُثبت في Git بعد اجتياز build النهائي، دون force-push.
- **آخر build متحقق سابقًا:** يحمل `gitCommit=ccc4764d7b8a2d815f7a0c92013c6cc542765633`، وسيُعاد توليد manifest بعد commit الواجهة الحالي.
- **Railway:** المستخدم أفاد أن النشر يعمل بالبصمة الجديدة. هذا توثيق مصدره المستخدم (`USER_REPORTED`) وليس artifact أو log مستخرجًا من البيئة في هذه الدفعة.
- **Build contract:** `npm run build` يولّد `dist/build-info.json` ثم `PACKAGE_MANIFEST.json`. بوابة الإنتاج تمنع اختلاف commit أو تسريب `service_role`.
- **LiveKit:** lazy loading محفوظ. تحذير chunk الكبير مقبول ولم يُخفَ عبر `chunkSizeWarningLimit`.

## Supabase Production

- **Project ref:** `jwhrbadnirwjyinplbmn`.
- **Database:** migration `20261127000001_owner_accounts.sql` طُبقت فعليًا عبر `npx supabase db push --linked --yes` — **PASS**. الحسابان `sir.market7@gmail.com` و`miss.market7@gmail.com` يُوسمان خادميًا عبر `profiles.is_owner` عند تطابق بريد `auth.users`، ولا يمكن للعميل تعديل العلامة.
- **Edge Functions:** نشر غير تفاعلي باستخدام `--yes` اكتمل للوظائف العشرين، ثم تم التحقق عبر `supabase functions list --output=json`. جميعها `ACTIVE`:

| الوظيفة | الإصدار | JWT |
|---|---:|---|
| account | 14 | لا |
| admob-ssv | 18 | لا |
| analytics | 8 | لا |
| answer | 19 | نعم |
| couple | 18 | نعم |
| creator | 15 | لا |
| daily | 38 | نعم |
| economy | 22 | نعم |
| google-play-rtdn | 19 | لا |
| match | 47 | نعم |
| matchmaking | 28 | نعم |
| metrics | 31 | نعم |
| overlay | 19 | لا |
| room | 21 | نعم |
| safety | 16 | نعم |
| subscription | 24 | نعم |
| team | 23 | لا |
| tiktok | 15 | لا |
| tournament | 25 | نعم |
| voice | 22 | نعم |

- **مصدر جدول الوظائف:** ناتج فعلي من `npx supabase functions list --remote=jwhrbadnirwjyinplbmn --output=json` في 2026-11-27. الحالة `ACTIVE` لكل وظيفة.
- **RPC الحساسة:** بوابات المصدر تتحقق من بقاء ملكية النتائج والمكافآت والانتقال الذري خادمية؛ لا يُعد ذلك بديلًا عن اختبار أمني ميداني مستقل.

## بوابات الجودة

- **PASS محلي:** TypeScript typecheck، ESLint، Vitest: `27/27`، production gates: `57/57`، contract inventory: `20` وظيفة و`42` RPC، content release: `968` صفًا مدققًا دون bulk activation، solo progression: `48` مرحلة × `3` أسئلة، production lock، و`git diff --check`.
- **E2E خارجي:** المستخدم أفاد باختبار تسجيل الدخول وSolo وDaily والمواجهات على أجهزة فعلية (`USER_REPORTED`). لا توجد في هذه الدفعة logs أو screenshots أو IDs قابلة لإعادة التحقق؛ لذلك لا تُرفع هذه البنود إلى دليل مستقل.
- **AAB / Google Play Billing / RTDN / Restore / AdMob SSV / LiveKit:** `NOT PROVEN` في هذه الدفعة لغياب artifact وجهاز/بيئة اختبار قابلة للتوثيق. نشر Functions وحده لا يثبت دورة الشراء أو الاستعادة أو SSV.

## Soft Launch والواجهة

- المسموح حاليًا: شجرة التحدي، Daily، الحساب، وقراءة المتجر.
- البطولة، الفريق، الغرفة، المضيف، الثنائي، Creator، وميزات الإعلانات المكافِئة تبقى `OFF/Beta` حتى إغلاق اختبارات التشغيل والأمان المقابلة.
- الواجهة تحافظ على الثيم الداكن والفاتح، safe areas، الهاتف والتابلت، والوضع الرأسي والأفقي. أُضيفت معالجة تخطيطية للوضع الأفقي القصير حتى لا يظهر التطبيق كصفحة طويلة على الأجهزة العريضة.
- شجرة التحدي أعيد تصميمها بصريًا كمسار تقدّم سينمائي بعمود مركزي، أغصان، حالات فتح/إكمال/قفل، وتباين محسّن في الثيمين.
- بطاقة `خليك قدها` أصبحت كاملة الضغط وتفتح ساحة اللعب. Daily لم يعد مكررًا داخلها، واستُبدل رابط إحصائيات المستخدم العادي بالترقية؛ لوحة المؤشرات المباشرة محمية للمالك.
- الدوريات والغرف والأصدقاء والمضيف ظاهرة كمساحات `قريبًا` غير مفعلة؛ لم تُفتح لأن بوابات التشغيل الخاصة بها لم تُغلق بعد.

## قرار الإطلاق

**NO-GO للإطلاق العام أو إعلان Store Ready.** الحالة الحالية **Soft Launch Candidate ضيق** بعد نجاح البوابات المحلية وتحقق Supabase ووظائفه. يلزم قبل الإطلاق العام إثبات AAB موقّع، Google Play Billing وRestore، RTDN، AdMob SSV، LiveKit، واختبارات ميدانية قابلة للتدقيق، مع إبقاء الأوضاع غير المختبرة مغلقة.
