-- T1b role hardening: client may edit identity fields only.
-- Economy, scores, subscriptions, matches and moderation remain server-owned.

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
GRANT INSERT (id, username, display_name) ON public.profiles TO authenticated;
GRANT UPDATE (username, display_name, avatar_url) ON public.profiles TO authenticated;

-- Explicitly deny direct client writes to server-authoritative state.
REVOKE INSERT, UPDATE, DELETE ON public.matches FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.match_participants FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.rounds FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.answer_submissions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallet_ledger FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.xp_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_subscriptions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.purchase_receipts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.coin_purchase_receipts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.host_room_charges FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.rate_limit_buckets FROM anon, authenticated;

-- Client can join/create only through Edge Functions; no table bypass.
REVOKE INSERT, UPDATE, DELETE ON public.rooms FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.room_participants FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.matchmaking_queue FROM anon, authenticated;

-- Service role remains the only actor that can mutate authoritative state.
GRANT ALL ON public.matches, public.match_participants, public.rounds,
  public.answer_submissions, public.wallet_ledger, public.xp_events,
  public.user_subscriptions, public.purchase_receipts, public.coin_purchase_receipts,
  public.host_room_charges, public.rate_limit_buckets, public.rooms,
  public.room_participants, public.matchmaking_queue TO service_role;
