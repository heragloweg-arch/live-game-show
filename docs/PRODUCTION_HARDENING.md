# Production Hardening — قدها

## Sprint 1–3 منفّذ في هذه الدفعة

### Security
- `challenge_answers` / `challenge_choices`: RLS + REVOKE من anon/authenticated
- قراءة الإجابات فقط عبر Edge (service_role)
- `assertMatchParticipant` على get / start_round / next_round / finish
- Voice: `canPublish` من السيرفر (مضيف) وليس من العميل
- Billing: لن يُفعَّل اشتراك Google بدون تحقق أو `ALLOW_UNVERIFIED_PLAY_PURCHASES` (staging فقط)

### Match Engine
- `atomic_start_round` RPC: انتقال `pending → active` مرة واحدة
- `next_round` ينتظر كل اللاعبين أو انتهاء الوقت
- `myLastAnswer` في حالة المباراة للمشاهد الحالي
- choices بدون `is_correct`

### Matchmaking
- `claim_matchmaking_opponent` مع `FOR UPDATE SKIP LOCKED`

### Daily
- يوم اللعبة حسب `Asia/Riyadh` وليس UTC الخام

## نشر
```bash
npx supabase db push
npx supabase functions deploy match
npx supabase functions deploy matchmaking
npx supabase functions deploy answer
npx supabase functions deploy voice
npx supabase functions deploy subscription
npx supabase functions deploy daily
```

## ما يتبقى قبل المتجر
- Content QA لـ ~483 سؤال
- AdMob حقيقي
- Google Play Developer API verification كامل
- Analytics (PostHog/Firebase)
- Brand namespace Android كامل
- E2E على أجهزة حقيقية
