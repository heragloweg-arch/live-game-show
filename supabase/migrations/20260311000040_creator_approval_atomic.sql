-- Atomic, one-time reward for an approved creator submission.
CREATE OR REPLACE FUNCTION public.grant_creator_approval_reward(
  p_user_id UUID,
  p_submission_id UUID,
  p_amount INT DEFAULT 100
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INT;
BEGIN
  IF p_amount <= 0 OR p_amount > 500 THEN
    RAISE EXCEPTION 'Invalid creator reward amount';
  END IF;

  SELECT p.coins INTO v_balance FROM public.profiles p WHERE p.id = p_user_id FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'Creator profile not found'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.wallet_ledger
    WHERE user_id = p_user_id AND type = 'creator_approval' AND reference_id = p_submission_id::text
  ) THEN
    RETURN jsonb_build_object('coins', v_balance, 'awarded', 0, 'already', true);
  END IF;

  v_balance := public.credit_coins(p_user_id, p_amount, 'creator_approval', p_submission_id::text);
  RETURN jsonb_build_object('coins', v_balance, 'awarded', p_amount, 'already', false);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_creator_approval_reward(UUID, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_creator_approval_reward(UUID, UUID, INT) TO service_role;
