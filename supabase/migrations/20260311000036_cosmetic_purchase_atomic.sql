-- Cosmetic shop v1: server-authoritative, coins only, idempotent per user/item.
CREATE TABLE IF NOT EXISTS public.cosmetic_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cosmetic_id TEXT NOT NULL REFERENCES public.cosmetic_catalog(id),
  price_coins INT NOT NULL CHECK (price_coins >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, cosmetic_id)
);

ALTER TABLE public.cosmetic_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cosmetic_purchases_select ON public.cosmetic_purchases;
CREATE POLICY cosmetic_purchases_select ON public.cosmetic_purchases
  FOR SELECT USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.cosmetic_purchases FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.purchase_cosmetic_atomic(
  p_user_id UUID,
  p_cosmetic_id TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item public.cosmetic_catalog%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_balance INT;
  v_reference TEXT := 'cosmetic:' || p_cosmetic_id;
BEGIN
  SELECT * INTO v_item FROM public.cosmetic_catalog
    WHERE id = p_cosmetic_id AND active = true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COSMETIC_NOT_FOUND'; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  IF EXISTS (SELECT 1 FROM public.cosmetic_purchases
    WHERE user_id = p_user_id AND cosmetic_id = p_cosmetic_id) THEN
    RETURN jsonb_build_object('ok', true, 'alreadyOwned', true,
      'cosmeticId', p_cosmetic_id, 'coins', COALESCE(v_profile.coins, 0));
  END IF;

  v_balance := COALESCE(v_profile.coins, 0);
  IF v_balance < v_item.price_coins THEN RAISE EXCEPTION 'INSUFFICIENT_COINS'; END IF;

  UPDATE public.profiles SET coins = v_balance - v_item.price_coins, updated_at = now()
    WHERE id = p_user_id;
  INSERT INTO public.cosmetic_purchases(user_id, cosmetic_id, price_coins)
    VALUES (p_user_id, p_cosmetic_id, v_item.price_coins);
  INSERT INTO public.user_cosmetics(user_id, cosmetic_id, equipped)
    VALUES (p_user_id, p_cosmetic_id, false)
    ON CONFLICT (user_id, cosmetic_id) DO NOTHING;
  INSERT INTO public.wallet_ledger(user_id, type, currency, amount, balance_after, reference_id, meta)
    VALUES (p_user_id, 'purchase', 'coins', -v_item.price_coins, v_balance - v_item.price_coins,
      v_reference, jsonb_build_object('cosmetic_id', p_cosmetic_id));

  RETURN jsonb_build_object('ok', true, 'alreadyOwned', false,
    'cosmeticId', p_cosmetic_id, 'coins', v_balance - v_item.price_coins);
END; $$;

REVOKE ALL ON FUNCTION public.purchase_cosmetic_atomic(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_cosmetic_atomic(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.equip_cosmetic_atomic(p_user_id UUID, p_cosmetic_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_cosmetics WHERE user_id = p_user_id AND cosmetic_id = p_cosmetic_id) THEN
    RAISE EXCEPTION 'COSMETIC_NOT_OWNED';
  END IF;
  UPDATE public.user_cosmetics uc SET equipped = (uc.cosmetic_id = p_cosmetic_id)
    WHERE uc.user_id = p_user_id;
  RETURN jsonb_build_object('ok', true, 'cosmeticId', p_cosmetic_id);
END; $$;
REVOKE ALL ON FUNCTION public.equip_cosmetic_atomic(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.equip_cosmetic_atomic(UUID, TEXT) TO service_role;
