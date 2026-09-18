-- Economy: wallet ledger + daily bonus tracking

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'coins' CHECK (currency IN ('coins', 'gems')),
  amount        INT NOT NULL,
  balance_after INT NOT NULL,
  reference_id  TEXT,
  meta          JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_user ON public.wallet_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.daily_bonus_claims (
  user_id     UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_claim  DATE NOT NULL DEFAULT CURRENT_DATE
);

ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_bonus_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_select ON public.wallet_ledger FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY daily_select ON public.daily_bonus_claims FOR SELECT USING (auth.uid() = user_id);

-- Atomic credit function
CREATE OR REPLACE FUNCTION public.credit_coins(
  p_user_id UUID,
  p_amount INT,
  p_type TEXT,
  p_reference TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_balance INT;
BEGIN
  IF p_amount = 0 THEN
    SELECT coins INTO new_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(new_balance, 0);
  END IF;

  UPDATE public.profiles
  SET coins = GREATEST(0, coins + p_amount),
      updated_at = now()
  WHERE id = p_user_id
  RETURNING coins INTO new_balance;

  INSERT INTO public.wallet_ledger (user_id, type, currency, amount, balance_after, reference_id)
  VALUES (p_user_id, p_type, 'coins', p_amount, new_balance, p_reference);

  RETURN new_balance;
END;
$$;
