# تدقيق فجوات الجاهزية العالمية — تطبيق قدها

**التاريخ:** 20 أكتوبر 2026
**المستودع:** `heragloweg-arch/live-game-show`
**الفرع:** `main`
**المرجع:** `0223a3d18dd4e67d3c8d2de1664bb25d191f65ed`

## الحكم التنفيذي

النسخة الحالية **Production Candidate قوي برمجيًا** وليست Release عالميًا جاهزًا. أساس التطبيق موجود: React/Vite، Capacitor، Supabase، Edge Functions، دورة مباراة خادمية، RLS وRPCs ذرية، حسابات، غرف ومضيف، Daily، اقتصاد، Google Play وTikTok كمسارات مجهزة.

لكن لا يوجد حتى الآن دليل يثبت تشغيل نسخة Production حقيقية عبر Supabase وRailway وGoogle Play وLiveKit وAdMob، أو اختبارها على أجهزة حقيقية، أو قياس الاحتفاظ والإيراد. لذلك التصنيف الصادق هو:

> **جاهز للإغلاق النهائي وSoft Launch محدود بعد تنفيذ بوابات P0، وليس جاهزًا لإطلاق عام عالمي الآن.**

## ملخص الأولويات

| الأولوية | المجال | الحالة | يمنع الإطلاق؟ |
|---|---|---|---|
| P0 | Railway وSupabase الفعليان | غير مثبت تشغيليًا | نعم |
| P0 | تطبيق migrations ونشر Edge Functions | غير مثبت | نعم |
| P0 | اختبار دورة اللعب الحي وإعادة الاتصال | غير مثبت | نعم |
| P0 | Google Play Billing وAAB موقّع | غير منفذ خارجيًا | نعم عند الدفع |
| P0 | AdMob وConsent وSSV | غير منفذ خارجيًا | نعم عند الإعلانات |
| P0 | RLS/Auth/LiveKit/Safety على Staging | غير مثبت | نعم |
| P0 | بنك الأسئلة في Production | Review Queue آمنة، غير مفعلة بالكامل | نعم للمحتوى الكامل |
| P1 | التحليلات الخادمية والاحتفاظ | جزئية ومحلية | نعم للمنافسة المعتمدة على البيانات |
| P1 | عقود TypeScript وDeno | تعمل، لكن بها `any` واسع | لا يمنع Soft Launch، يرفع المخاطر |
| P1 | Daily Loop والاقتصاد والتوازن | موجود جزئيًا | لا يمنع Internal Test، يؤثر على الاحتفاظ |
| P1 | الأداء والأجهزة الضعيفة | تحذير LiveKit كبير بلا اختبار ميداني | لا يمنع Internal Test، يمنع التوسع غير المقاس |
| P1 | الخصوصية والمتاجر والامتثال | شاشات موجودة، إثبات المتطلبات الخارجية ناقص | نعم للنشر العام |
| P2 | التوسع العالمي والتوطين العميق | غير مكتمل | لا يمنع Soft Launch العربي |

## 1. بوابة البنية السحابية والتشغيل — P0

### الفجوة

المستودع يملك أوامر تشغيل وفحص قوية، لكن لا يوجد دليل من الخدمات الخارجية على أن:

- Railway يشغل آخر commit فعلًا.
- متغيرات Supabase موجودة في نفس Service وEnvironment الذي يبدأ منه التطبيق.
- migrations مطبقة على Staging أو Production.
- جميع Edge Functions المنشورة تطابق commit الحالي.
- secrets الخادمية مضبوطة في Supabase أو بيئة التنفيذ الصحيحة.
- Healthcheck وDeploy Logs وRuntime Logs ناجحة بعد آخر نشر.

### معيار الإغلاق

1. Deploy من commit `0223a3d` أو أحدث.
2. ظهور `Runtime configuration validated` و`runtime config written: ... present` في Deploy Logs.
3. تطبيق migrations على Staging مع backup وmigration history.
4. نشر كل الوظائف الموجودة تحت `supabase/functions/`.
5. تنفيذ Smoke Test من عميل حقيقي على Auth وMatch وDaily وRoom.
6. حفظ روابط/أرقام Deployments ولقطة نتائج، لا الاكتفاء بلوج محلي.

## 2. قاعدة البيانات وRLS والأمن التشغيلي — P0

### الفجوة

تمت كتابة RLS و`SECURITY DEFINER` وrate limiting وحذف الحساب والحظر في الكود، لكن لم يثبت سلوكها ضد أدوار حقيقية على Staging.

يجب اختبار الأدوار التالية ببيانات اصطناعية:

- anon.
- authenticated عادي.
- host.
- room member.
- blocked peer.
- creator/admin.
- service role.

### المخاطر التي يجب إثباتها

- عدم كشف `is_correct` قبل وقت الـReveal.
- عدم قراءة غرفة أو مباراة لا يشارك فيها المستخدم.
- عدم منح كوين أو XP بإعادة إرسال نفس الطلب.
- عدم تجاوز الحظر عبر matchmaking أو Room أو Voice أو Overlay.
- عدم قدرة العميل على استدعاء RPC مالي حساس.
- نجاح حذف الحساب في إزالة البيانات الشخصية والرموز والعضويات مع الاحتفاظ القانوني الضروري فقط.
- ضبط `search_path` وGRANTs لكل دوال `SECURITY DEFINER`.

### معيار الإغلاق

حزمة اختبارات SQL/HTTP على Staging بنتائج محفوظة، تشمل النجاح والفشل لكل دور، مع تقرير يثبت RLS وGRANTs وidempotency.

## 3. دورة اللعب والشبكة — P0

### الفجوة

الإصلاحات الذرية وانتظار الخصم وإعادة التسوية موجودة برمجيًا، لكن لا يوجد اختبار تكامل حي آلي أو يدوي موثق لمستخدمين حقيقيين وشبكتين.

### السيناريوهات المفتوحة

- بدء Solo و1v1 وCouple وTeam.
- الإجابة المكررة أو المتزامنة من نفس اللاعب.
- ضغط زر الانتقال للجولة عدة مرات.
- انتهاء الوقت أثناء إرسال الإجابة.
- خروج التطبيق إلى الخلفية ثم عودته.
- تبديل Wi-Fi إلى بيانات الهاتف.
- إعادة الاتصال بعد انقطاع Realtime.
- وصول اللاعب الثاني متأخرًا.
- إغلاق الغرفة أثناء heartbeat أو فشل خصم المضيف.
- Rematch بعد نهاية المباراة.
- فتح المباراة من رابط دعوة من جهاز آخر.

### معيار الإغلاق

اختبار E2E على جهازين أو محاكيين وشبكتين، مع سجلات request IDs وحالة المباراة قبل وبعد كل انقطاع، وعدم وجود مضاعفة في الإجابة أو النتيجة أو المكافأة.

## 4. بنك الأسئلة ونظام المحتوى — P0/P1

### الوضع الحالي

البنك مدمج بصورة آمنة داخل المستودع، وليس تفعيلًا أعمى:

- 1119 سؤالًا كليًا.
- 968 مرشحًا صحيحًا بنيويًا.
- 114 سؤال سرعة بلا إجابة مغلقة.
- 11 سؤالًا فيها اختيارات مكررة.
- 34 تكرارًا نصيًا تقريبًا حسب تقرير التحليل.
- المحتوى يبدأ `active=false` و`qa_status='needs_review'`.
- بوابة الإصدار تمنع التفعيل الجماعي وتفرض سجل اعتماد خادمي.

### الفجوات

- الفحص البنيوي لا يثبت صحة الإجابة معرفيًا.
- لا يوجد دليل محفوظ يربط كل سؤال بمصدر معرفي عند الحاجة.
- أسئلة الدين والقرآن والسيرة تحتاج مراجعة متخصصة مسجلة.
- الأسئلة الحرة لا تصلح تلقائيًا لمسارات Solo/1v1.
- توزيع المحتوى يحتاج قياسًا فعليًا للتكرار والصعوبة، وليس عددًا كبيرًا فقط.
- لا توجد بعد قياسات `p_correct` و`median_response_ms` و`drop_rate` من مستخدمين حقيقيين.
- يجب التأكد من تطبيق migration في قاعدة Staging/Production، فالملف في Git لا يثبت وجود الصفوف فعليًا.

### معيار الإغلاق

تفعيل cohort داخلي من 300 سؤال ذهبي فقط بعد:

- factual review.
- wording review.
- religious review للأسئلة الدينية.
- مصدر/مرجع أو مبرر عدم الحاجة إليه.
- اختبار لعب فعلي.
- مراقبة البلاغات ومعدل الإجابة والتكرار.

ثم التوسع تدريجيًا إلى 1000 سؤال بناءً على الأرقام، لا بمجرد إدخال migration.

## 5. عقود الكود والأنواع — P1

### الفجوة

`typecheck` وDeno check ناجحان، لكن يوجد استخدام واسع لـ`any` في Edge Functions وطبقات API، خصوصًا في:

- match.
- room.
- daily.
- tournament.
- economy.
- billing.
- authz المشترك.

هذا لا يعني وجود عطل مؤكد، لكنه يجعل تغييرات schema أو response قابلة لإحداث عطل صامت.

### المطلوب

- تعريف request/response schemas مشتركة أو مولدة من schema.
- إزالة `any` من المسارات المالية، match settlement، answer، room state، tournament join، وauthz أولًا.
- إضافة contract tests لكل Edge Function الحساسة.
- توحيد enums بين Postgres وTypeScript وDeno.
- منع `as any` في MatchScreen وAPI contracts الجديدة.

## 6. Daily Loop والاعتياد اليومي — P1

### الموجود

يوجد Daily Pack، streak، مكافآت، مشاركة، وبعض أحداث analytics.

### الفجوات

- الحلقة الموحدة ذات الثلاث دقائق ليست مثبتة كرحلة منتج كاملة في جميع الحالات.
- لا يوجد إثبات أن نهاية كل جلسة تقود بوضوح إلى Rematch أو تدريب أو دعوة أو Daily.
- حماية السلسلة والمكافأة الأسبوعية تحتاج اختبارًا زمنيًا حقيقيًا ومناطق زمنية متعددة.
- القياس الحالي يحتوي مكونات محلية؛ `localStorage` لا يصلح مصدر حقيقة للاحتفاظ العالمي.
- يلزم cohort server-side يميز أول فتح، أول مباراة، إكمال Daily، session 2، D1/D7/D14.

### معيار الإغلاق

Dashboard خادمي موثوق للأحداث، مع تعريف موحد للـcohort وtimezone، وتجربة Soft Launch صغيرة تثبت الإكمال والعودة قبل التوسع.

## 7. الاقتصاد والبطولات — P1/P0 للدفع

### الفجوات

- يجب إثبات أن تسجيل البطولة والخصم وإنشاء entry عملية ذرية واحدة، مع idempotency واسترداد آمن عند الإلغاء.
- يجب مراجعة كل منح XP/coins/reward عبر ledger وreference فريد.
- يجب اختبار انتهاء تجربة المضيف، heartbeat المتأخر، فشل الخصم، إعادة فتح الغرفة، والرصيد صفر.
- يجب التأكد أن Plus وHost Pro لا يخلقان Pay-to-Win.
- يجب اختبار العملة والاشتراك عبر Google Play الحقيقي، لا عبر mocks.

## 8. Google Play Billing وAndroid — P0

### الفجوة

المسار البرمجي والتحقق الخادمي موجودان، لكن التشغيل التجاري غير مثبت:

- لا توجد منتجات حقيقية مؤكدة في Play Console.
- لا يوجد إثبات Service Account بصلاحية Android Publisher الأقل اللازمة.
- لا يوجد AAB إنتاجي موقع من commit معتمد.
- لا يوجد Internal Testing مثبت.
- لم تختبر purchase وrestore وrenew وcancel وrefund وduplicate وpending.
- لم يثبت RTDN مع Pub/Sub والتسوية المتأخرة.
- `versionCode` الحالي يحتاج إدارة إصدار فعلية قبل كل رفع.

### معيار الإغلاق

AAB موقع، Internal Track، حساب اختبار، شراء حقيقي، Restore، إلغاء، استرداد، RTDN، وإثبات أن الرصيد لا يمنح مرتين.

## 9. الإعلانات وAdMob — P0 عند تفعيل الربح الإعلاني

### الفجوة

الكود يملك AdMob وSSV ومسار pending، لكن لا يوجد دليل على:

- AdMob production App/Ad Unit IDs.
- UMP/Consent flow حسب البلد.
- `VITE_ADMOB_TEST=false` في النسخة المنشورة.
- توقيع SSV والتحقق من nonce.
- التعامل مع callback مكرر أو متأخر أو فاشل.
- سقف rewarded ads ومكافأة واحدة فقط لكل حدث.
- استبعاد الإعلانات أثناء الإجابة وفي المواضع المحظورة.

لا يجوز تحقيق دخل حقيقي قبل إغلاق هذه النقاط واختبارها على جهاز حقيقي.

## 10. Auth والهوية والحذف — P0

### الفجوة

مسارا البريد وGoogle موجودان برمجيًا، لكن يلزم إثبات إعدادات Supabase Auth الفعلية:

- Google Client ID وRedirect URLs.
- Email confirmation وReset Password.
- روابط HTTPS للإنتاج لا localhost.
- التعامل مع حساب OAuth المكرر والبريد الموجود مسبقًا.
- حذف الحساب من داخل التطبيق مع إعادة المصادقة والنتيجة النهائية.
- سياسة الاحتفاظ والنسخ الاحتياطية بعد الحذف.

## 11. LiveKit والصوت — P0 للتجربة الاجتماعية

### الفجوة

الـEdge Function ومسار token وقيود الحظر موجودة، لكن لا يوجد اختبار حي يثبت:

- إصدار token بالمستخدم والغرفة الصحيحين.
- منع blocked peer فعليًا من دخول الصوت.
- انتهاء token وإبطاله.
- reconnect وmute وbackground/foreground.
- إدارة تكلفة الغرف والحد الأقصى للاتصال.
- مراقبة latency وpacket loss وjitter.

## 12. TikTok والربط الاجتماعي — P1، وليس شرطًا لتعطيل أول Soft Launch

### الفجوة

الموجود هو Login Kit وربط حساب آمن نسبيًا، وليس تكامل TikTok LIVE كاملًا. لا ينبغي التسويق بأنه تحكم في البث أو نشر تلقائي ما لم تمنح TikTok تلك الصلاحيات.

المطلوب خارجيًا:

- Developer App حقيقي.
- Redirect URI مطابق حرفيًا.
- App Review.
- Privacy Policy وTerms وبيانات اختبار.
- اختبار state وcallback وdisconnect على أصل HTTPS.
- منتج اجتماعي بديل مستقل: بطاقة نتيجة قابلة للمشاركة، رابط غرفة، وCTA واضح.

## 13. القياس والمراقبة — P0 قبل التوسع

### الفجوة

هناك أحداث ومكونات Sentry/PostHog، لكن لا توجد أدلة على أنها تعمل في Production أو أن metrics خادمية لا تقبل أرقامًا يرسلها العميل بلا تحقق.

يجب إغلاق:

- مصدر حقيقة server-side للأحداث المهمة.
- crash-free sessions وANR ومعدل فشل الإقلاع.
- latency لكل Edge Function.
- Room reconnect rate.
- billing failure rate.
- D1/D7/D14.
- Daily completion وRematch وsession 2.
- ARPDAU وeCPM وPlus conversion.
- content report rate وp_correct.
- تنبيهات عند تجاوز الحدود.

## 14. الأداء وقابلية التوسع — P1

### الوضع الحالي

يوجد تحذير أن `livekit-client` يتجاوز 500KB بعد minification، رغم تقسيم chunks الأخرى.

### الفجوات

- لا يوجد Lighthouse baseline محفوظ.
- لا يوجد اختبار Android ضعيف أو شبكة 3G/4G متذبذبة.
- لا يوجد load test لـmatchmaking وRoom وDaily وvoice token.
- لا يوجد قرار CDN/Cache موثق للأصول وHTML وruntime config.
- لا توجد خطة backup/restore وRTO/RPO مثبتة.
- لا توجد مراقبة تكلفة Supabase/LiveKit/Storage مع نمو المستخدمين.

## 15. السلامة والثقة والامتثال — P0 للنشر العام

### الفجوات

- Privacy Policy وTerms موجودان داخل المنتج، لكن يجب التأكد من روابط عامة ثابتة ومحدثة للمتاجر.
- Google Play Data Safety غير مثبت.
- آلية طلب حذف الحساب وسياسة الاحتفاظ يجب أن تطابق الواقع الخادمي.
- يجب اختبار البلاغ، الحظر، الإخراج من الغرفة، وتصفية blocked peer في كل مسار.
- يجب وجود حد أدنى من moderation للمحتوى الذي ينشئه Creator/Host.
- يلزم مراجعة حقوق الصور والملكية الفكرية ومحتوى السينما والدين.
- يجب توفير consent وage/child-safety decisions حسب الأسواق المستهدفة.

## 16. التوطين والمنافسة العالمية — P1/P2

### الفجوة

المنتج عربي الاتجاه وRTL، لكن المنافسة العالمية تحتاج:

- English وLTR حقيقيين، وليس ترجمة نصوص سطحية.
- locale وpluralization وdate/timezone.
- بنك أسئلة محلي حسب البلد مع حساسية ثقافية.
- وحدات قياس وأسماء ومصطلحات مناسبة للسوق.
- دعم أسعار وعملات وضرائب المتجر حسب البلد.
- دعم الإعلانات والامتثال والخصوصية حسب السوق.
- اختبار الخطوط والأرقام العربية/الهندية واللاتينية على Android وWeb.

لا ينصح بإطلاق عالمي شامل قبل إثبات السوق العربي الأول، ثم التوسع cohort-by-cohort.

## 17. الاختبارات والأتمتة — P0/P1

### الوضع الحالي

CI يغطي typecheck وlint وVitest وbuild وproduction gates وcontent gate وDeno check وdependency audit. لكنه لا يملك E2E آليًا شاملًا للمتصفح أو Android أو Supabase حقيقي.

### المطلوب

- Playwright أو بديل E2E لمسار التسجيل والـDaily و1v1 وRoom.
- اختبارات Android على جهازين أو Firebase Test Lab.
- Supabase Staging smoke tests بعد كل migration.
- اختبار contract للـEdge Functions.
- اختبارات load وreconnect وduplicate requests.
- نشر artifact وSBOM وSHA256 مرتبطين بالcommit.

## 18. فجوة الحوكمة والتوثيق

بعض الملفات القديمة متناقضة مع الحالة الحالية؛ مثل `PHASES_STATUS.md` الذي ما زال يذكر migrations حتى `000021` ويصف TikTok وCreator كأنهما مؤجلان، بينما المستودع يحتوي migrations ووظائف أحدث. هذه ليست مشكلة runtime مباشرة، لكنها خطيرة في التسليم لأنها قد تجعل الفريق ينفذ خطة قديمة أو يعلن حالة غير صحيحة.

المطلوب:

- ملف واحد للحالة المرجعية.
- مصفوفة migration/function/version واحدة.
- تقرير نشر حي لكل بيئة.
- سجل قرار لكل Feature مؤجل أو مفعل.
- عدم إبقاء تقارير قديمة بصيغة توحي بأنها الحالة الحالية.

## ترتيب التنفيذ المقترح

### الدفعة A — إغلاق التشغيل P0

1. تثبيت Railway على آخر commit.
2. تطبيق migrations على Staging.
3. نشر Edge Functions.
4. ضبط secrets وAuth وLiveKit.
5. تنفيذ RLS/Auth/Smoke tests.
6. اختبار دورة اللعب على جهازين وشبكتين.

### الدفعة B — المحتوى والقياس

1. تفعيل 300 سؤال ذهبي فقط عبر approval manifest.
2. فصل الدين في cohort مستقل.
3. اختبار عدم التكرار والصعوبة.
4. نقل أحداث retention واللعب إلى مصدر خادمي موثوق.
5. إعداد Dashboard وتنبيهات.

### الدفعة C — المال والمتاجر

1. إنشاء Google Play products.
2. بناء AAB موقع.
3. Internal Testing purchase/restore/RTDN.
4. AdMob IDs وUMP وSSV.
5. اختبار refunds/duplicates/pending.

### الدفعة D — Soft Launch عربي

1. 50–200 مستخدمًا حقيقيًا أو cohort محدود.
2. قياس D1/D7/D14 وDaily وRematch وcrash-free وlatency.
3. إصلاح أعلى أسباب الخروج والبلاغات.
4. قرار Go / Iterate / Stop.

### الدفعة E — التوسع العالمي

1. English/LTR وتوطين المحتوى.
2. أسواق وأسعار وامتثال لكل بلد.
3. load/cost testing.
4. توسيع المحتوى والميزات بعد إثبات retention والاقتصاد.

## ما يمكن إغلاقه من خلال المستودع فقط

- عقود أكثر صرامة وتقليل `any`.
- E2E tests وcontract tests.
- validators ومصادر المحتوى وسجل QA.
- server-side analytics events.
- تحسين الأداء وlazy loading.
- تحديث docs والحالة المرجعية.
- CI وartifact/SBOM/release manifest.

## ما يتطلب تنفيذ المالك أو صلاحيات خارجية

- Railway Deploy وVariables الفعلية.
- Supabase migrations/functions/secrets على Staging وProduction.
- Google OAuth وGoogle Play Console وService Account وRTDN.
- AdMob وUMP وSSV.
- LiveKit production project and limits.
- TikTok Developer App and review.
- keystore وAAB وInternal Testing.
- Privacy/Data Safety/Store listing.
- مستخدمون وأجهزة وشبكات حقيقية لقياس Soft Launch.

## القرار

لا توجد ضرورة لإعادة بناء التطبيق من الصفر أو إضافة عشرات الأوضاع الآن. الفجوة الأساسية هي تحويل كود مرشح إنتاجي إلى **نظام منشور ومقاس ومختبر**. أي إعلان عن جاهزية عالمية قبل إغلاق P0 أعلاه سيكون غير دقيق.
