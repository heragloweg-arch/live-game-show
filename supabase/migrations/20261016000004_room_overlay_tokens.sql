-- Public OBS overlay links are opaque, hashed, read-only, expiring, and revocable.
CREATE TABLE IF NOT EXISTS public.room_overlay_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT room_overlay_expiry_after_creation CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_room_overlay_tokens_room_active
  ON public.room_overlay_tokens(room_id, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.room_overlay_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.room_overlay_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.room_overlay_tokens TO service_role;
