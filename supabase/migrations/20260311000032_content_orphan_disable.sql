-- Content quality gate: orphan or incomplete challenges are never served in production.
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS disabled_reason TEXT;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id);
CREATE INDEX IF NOT EXISTS idx_challenges_production_ready ON public.challenges(active, disabled_reason, difficulty);
UPDATE public.challenges c SET active=false, disabled_reason=COALESCE(c.disabled_reason, 'missing_answer_or_choices'), reviewed_at=now()
WHERE c.active=true AND NOT EXISTS (SELECT 1 FROM public.challenge_answers a WHERE a.challenge_id=c.id)
  AND NOT EXISTS (SELECT 1 FROM public.challenge_choices ch WHERE ch.challenge_id=c.id AND ch.is_correct=true);
