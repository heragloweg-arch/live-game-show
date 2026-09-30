-- Server-authoritative lifelines. They assist play but never award points directly.
CREATE TABLE IF NOT EXISTS public.user_lifelines (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lifeline_type TEXT NOT NULL CHECK (lifeline_type IN ('fifty_fifty', 'extra_time', 'skip')),
  balance INT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, lifeline_type)
);
CREATE TABLE IF NOT EXISTS public.lifeline_fifty_choices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  removed_choice_ids TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, round_id)
);
CREATE TABLE IF NOT EXISTS public.lifeline_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lifeline_type TEXT NOT NULL,
  match_id UUID REFERENCES public.matches(id),
  round_id UUID REFERENCES public.rounds(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_lifelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifeline_fifty_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifeline_uses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_lifelines_select ON public.user_lifelines;
CREATE POLICY user_lifelines_select ON public.user_lifelines FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS lifeline_fifty_choices_select ON public.lifeline_fifty_choices;
CREATE POLICY lifeline_fifty_choices_select ON public.lifeline_fifty_choices FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.spend_lifeline_fifty(p_user_id UUID, p_match_id UUID, p_round_id UUID, p_removed_choice_ids TEXT[])
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance INT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.lifeline_fifty_choices WHERE user_id=p_user_id AND round_id=p_round_id) THEN
    RETURN (SELECT jsonb_build_object('ok', true, 'alreadyUsed', true, 'removedChoiceIds', to_jsonb(removed_choice_ids))
      FROM public.lifeline_fifty_choices WHERE user_id=p_user_id AND round_id=p_round_id);
  END IF;
  SELECT balance INTO v_balance FROM public.user_lifelines WHERE user_id=p_user_id AND lifeline_type='fifty_fifty' FOR UPDATE;
  IF COALESCE(v_balance, 0) < 1 THEN RAISE EXCEPTION 'LIFELINE_UNAVAILABLE'; END IF;
  UPDATE public.user_lifelines SET balance=balance-1, updated_at=now() WHERE user_id=p_user_id AND lifeline_type='fifty_fifty';
  INSERT INTO public.lifeline_uses(user_id, lifeline_type, match_id, round_id) VALUES(p_user_id, 'fifty_fifty', p_match_id, p_round_id);
  INSERT INTO public.lifeline_fifty_choices(user_id, match_id, round_id, removed_choice_ids)
  VALUES(p_user_id, p_match_id, p_round_id, p_removed_choice_ids)
  ON CONFLICT(user_id, round_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'remaining', v_balance - 1, 'removedChoiceIds', to_jsonb(p_removed_choice_ids));
END; $$;
REVOKE ALL ON FUNCTION public.spend_lifeline_fifty(UUID, UUID, UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spend_lifeline_fifty(UUID, UUID, UUID, TEXT[]) TO service_role;
