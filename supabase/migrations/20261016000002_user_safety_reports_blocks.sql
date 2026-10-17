-- Private user reports and bilateral user blocks.
-- Client operations must pass through the authenticated safety Edge Function.
CREATE TABLE IF NOT EXISTS public.user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'match', 'room', 'challenge')),
  target_id TEXT NOT NULL CHECK (length(target_id) BETWEEN 1 AND 128),
  category TEXT NOT NULL CHECK (category IN ('harassment', 'hate', 'sexual_content', 'spam', 'cheating', 'unsafe_content', 'other')),
  details TEXT CHECK (details IS NULL OR length(details) <= 1000),
  request_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  review_note TEXT CHECK (review_note IS NULL OR length(review_note) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT user_reports_request_unique UNIQUE (reporter_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_user_reports_queue ON public.user_reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter_created ON public.user_reports(reporter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_no_self CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_id ON public.user_blocks(blocked_id);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_reports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_blocks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_reports TO service_role;
GRANT ALL ON TABLE public.user_blocks TO service_role;
