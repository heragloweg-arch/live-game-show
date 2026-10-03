# اعتماد مستودع قدها النهائي — live-game-show

## مصدر الحقيقة الوحيد

اعتمدوا محتوى هذه الحزمة فقط داخل مستودع `live-game-show`. ارفضوا أي نسخة قديمة تحتوي على Migration `20260928000043_approve_wording_reviewed_bank.sql` أو تفعيل جماعي لـ `version=41`.

## ما يفعله db push

- `041`: يستورد المرشحين كـ `active=false / qa_status=needs_review`.
- `042`: يجهز `letter_pool` والإجابة الخادمية والتطبيع العربي، مع بقاء المرشحين غير نشطين.
- `043`: ينشئ `challenge_content_approvals` ويثبت أن كل `version=41` غير نشط. لا يفعّل سؤالًا تلقائيًا.

## الاعتماد الانتقائي

التفعيل ليس Migration جماعية. يستخدم مسؤول المحتوى خدمة إدارية محمية لاستدعاء:

```text
approve_challenge_content(
  challenge_id,
  reviewer_id,
  cohort,
  factual_reviewed,
  wording_reviewed,
  religious_reviewed,
  reviewer_note
)
```

الشروط:

- مراجعة وقائعية: مطلوبة.
- مراجعة صياغية: مطلوبة.
- مراجعة دينية: مطلوبة للفئات `religion`.
- وجود `letter_pool` وإجابة خادمية: مطلوب.
- الدالة متاحة لـ `service_role` فقط، وليست للعميل أو المستخدم العادي.

ابدأوا بـ `cohort='internal'` وبعدد صغير من الأسئلة التي أُغلقت مراجعتها سؤالًا بسؤال، ثم انتقلوا إلى `soft_launch`. لا تستخدموا `production` قبل نجاح اختبار الأجهزة وبلاغات المحتوى.

## أوامر التحقق المحلي

```bash
npm ci --legacy-peer-deps
npm run typecheck
npm run lint
npm test -- --run
npm run build
node scripts/verify-production.mjs
npm run verify:content-release
```

## Staging فقط

```bash
npx supabase db push
npx supabase functions deploy match
npx supabase functions deploy room
npx supabase functions deploy economy
npx supabase functions deploy subscription
npx supabase functions deploy answer
npx supabase functions deploy daily
npx supabase functions deploy team
npx supabase functions deploy couple
npx supabase functions deploy matchmaking
```

بعد النشر نفذوا اختبارًا حقيقيًا على جهازين على الأقل لمسارات Solo وDaily و1v1 وRematch وRoom وHost وTeam، واختبروا تطبيع:

```text
أحمد / احمد
مدرسة / مدرسه
فتى / فتي
مسافات وتطويل
```

## بوابة Play وAdMob

لا تستخدموا `ALLOW_UNVERIFIED_PLAY_PURCHASES=true` أو Billing تجريبيًا في الإنتاج. شغّلوا `npm run verify:launch-config` مع:

```text
LAUNCH_GATE=strict
VITE_ENVIRONMENT=production
```

ويجب أن تكون معرفات AdMob إنتاجية، وService Account الخاص بـ Google Play مضبوطًا، والشراء وRestore مختبرين على Internal Testing Track قبل أي إعلان أو دفع حقيقي.

## الحكم

الحزمة قاعدة إطلاق تقنية آمنة لـ Staging/Internal. لا تدّعي اكتمال الجاهزية العالمية قبل تشغيل Supabase وPlay وAdMob وAAB موقّع وSoft Launch وقياس D1/D7.

## توقيع AAB

تم ضبط Gradle لرفض أي `release` غير موقّع. مفاتيح التوقيع لا تدخل المستودع، ويجب تمريرها في بيئة CI أو الجهاز الآمن:

```text
RELEASE_KEYSTORE_PATH=/secure/path/qaddaha-upload.jks
RELEASE_KEYSTORE_PASSWORD=...
RELEASE_KEY_ALIAS=qaddaha-upload
RELEASE_KEY_PASSWORD=...
```

بعد توفيرها خارج المستودع:

```bash
npm run android:release
```

بدون هذه الأسرار سيفشل البناء بدل إنتاج AAB غير صالح للنشر، وهذا مقصود.
