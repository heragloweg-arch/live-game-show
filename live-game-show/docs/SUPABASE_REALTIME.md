# تفعيل Realtime للغرف

في Supabase Dashboard → Database → Replication / Realtime:

فعّل publication للجداول:
- `rooms`
- `room_participants`
- `room_rounds`

بدون ذلك يعمل التطبيق عبر fallback polling كل 15 ثانية.
