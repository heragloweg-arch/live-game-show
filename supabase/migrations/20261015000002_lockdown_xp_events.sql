-- Security hardening: XP event history is an internal settlement ledger.
-- The client has no direct read path; writes run through trusted Edge Functions.
ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.xp_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.xp_events TO service_role;
