# قوالب لعب قدها

أضيفت قوالب أصلية قابلة للتشغيل من شاشة اللعب:

- **مزيج قدها:** اختيار متنوع بين السرعة والمعرفة والكلمات.
- **نبض السرعة:** أسئلة من نوع `speed`.
- **حروف مبعثرة:** أسئلة subtype `letters` مع عقد الحروف والتلميح.
- **ساحة المعرفة:** أسئلة من نوع `knowledge`.
- **أهل الكلمات:** أسئلة من نوع `words`.

## ضمانات الإنتاج

القالب لا يختار سؤالًا داخل المتصفح. يرسل العميل معرف القالب إلى Edge Function `match`، ثم ينفذ الخادم RPC `create_solo_match_atomic(UUID, INT, INT, TEXT)` بعد ترحيل:

```text
supabase/migrations/20261113000001_game_format_solo_contract.sql
```

الخادم يطبق الشروط الآتية:

- `active = true`.
- `qa_status = 'approved'`.
- وجود إجابة أو خيارات صحيحة أو `letter_pool` صالح.
- منع تكرار السؤال في المباراة.
- حفظ القالب داخل `matches.config_snapshot`.
- رفض القالب غير المعروف.
- إرجاع `GAME_FORMAT_NOT_AVAILABLE` إذا لم يتوفر محتوى معتمد كافٍ.

## النشر على Staging

بعد مراجعة الترحيل:

```bash
npx supabase db push
npx supabase functions deploy match
npm run typecheck
npm run lint
npm test -- --run
npm run verify:production
npm run verify:content-release
```

لا تُفعّل قوالب جديدة بتجاوز بوابة المحتوى أو بإضافة أسئلة غير مراجعة. قوالب اللعبة مجانية داخل المنتج ولا تعتمد على خدمة أو مصدر مدفوع خارجي.
