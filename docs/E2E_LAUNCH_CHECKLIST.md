# E2E Launch Checklist — قدها

**Stack:** React + Vite + Capacitor · targetSdk **36** · Node **>=22.22.0** · migrations حتى `20261023050001`

## Build
- [x] Node >= 22.22 — CI مثبت على 22.22.0
- [ ] `npm ci`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `npx cap sync android`

## Database
- [ ] `npx supabase db push` (clean project)
- [x] Functions deploy: 19 وظائف ACTIVE من رأس main — E2E يحتاج تشغيل حي

## Secrets
- [ ] LiveKit
- [ ] GOOGLE_PLAY_* (billing)
- [ ] METRICS_ADMIN_IDS
- [ ] TOURNAMENT_ADMIN_IDS
- [ ] REQUIRE_HOST_PRO (optional true)

## Core Loop
- [ ] Solo: AI can win; rewards server-side
- [ ] 1v1 matchmaking same difficulty
- [ ] Invite create → accept → single match
- [ ] Speed letters → submit answers
- [ ] Daily complete once (atomic)
- [ ] REST cannot update coins/xp
- [ ] Double answer same round rejected

## Social
- [ ] Room join + Realtime participant updates
- [ ] Host create + go live + voice
- [ ] Host Pro banner visible for free users

## Monetization
- [ ] Plus: ads skipped
- [ ] Daily ×2 when Plus active
- [ ] Play purchase verify (with credentials)

## Release
- [ ] keystore + AAB
- [ ] Data Safety
- [ ] Beta 50 players — يتطلب Soft Launch خارجي موثق

السجل التنفيذي التفصيلي للسيناريوهات العشرة موجود في `docs/E2E_EXECUTION_LOG_AR.md`، ولا يُملأ `PASS` قبل تشغيل الأجهزة فعلياً.
