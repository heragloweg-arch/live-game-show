-- Validation modes + tighter security helpers

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS validation_mode TEXT NOT NULL DEFAULT 'exact'
    CHECK (validation_mode IN ('exact', 'open_speed', 'choice', 'hybrid')),
  ADD COLUMN IF NOT EXISTS validation_rules JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Speed letter challenges → open_speed or hybrid
UPDATE public.challenges
SET validation_mode = 'hybrid'
WHERE type = 'speed' AND (subtype ILIKE '%letter%' OR prompt ~ 'يبدأ|تبدأ|حروف|بحرف|تنتهي');

UPDATE public.challenges
SET validation_mode = 'exact'
WHERE type IN ('knowledge', 'words', 'mystery') AND validation_mode IS DISTINCT FROM 'choice';

-- Rate-limit helper table for sensitive RPCs (optional client-facing abuse)
CREATE TABLE IF NOT EXISTS public.security_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.profiles(id),
  event_type  TEXT NOT NULL,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_events_user_time
  ON public.security_events (user_id, created_at DESC);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
-- no client policies — service role only

-- Harden: revoke direct credit if still granted
REVOKE EXECUTE ON FUNCTION public.credit_coins FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_coins TO service_role;

REVOKE EXECUTE ON FUNCTION public.settle_match FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_match TO service_role;

REVOKE EXECUTE ON FUNCTION public.submit_answer_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_answer_atomic TO service_role;

-- Expanded accepted answers for open speed (curated + hybrid still benefits)
INSERT INTO public.challenge_answers (challenge_id, accepted_answer, normalized_answer)
SELECT c.id, v.ans, v.norm
FROM public.challenges c
CROSS JOIN (VALUES
  ('سارة','ساره'),('نورة','نوره'),('هدى','هدي'),('لمى','لمي'),('رنا','رنا'),('دينا','دينا'),
  ('كريم','كريم'),('خالد','خالد'),('كمال','كمال'),('كاظم','كاظم'),
  ('مصر','مصر'),('المغرب','المغرب'),('موريتانيا','موريتانيا'),
  ('أسد','اسد'),('سمكة','سمكه'),('سنجاب','سنجاب'),
  ('أحمر','احمر'),('أزرق','ازرق'),('أخضر','اخضر'),('أبيض','ابيض'),
  ('بيت','بيت'),('نار','نار'),('ماء','ماء'),('قمر','قمر'),
  ('تفاح','تفاح'),('تمر','تمر'),('تين','تين'),
  ('الأردن','الاردن'),('السودان','السودان'),('عمان','عمان'),
  ('بيروت','بيروت'),('بغداد','بغداد'),('باريس','باريس')
) AS v(ans, norm)
WHERE c.type = 'speed'
ON CONFLICT DO NOTHING;
