-- Atomic tournament registration: row lock, capacity, duplicate protection and wallet debit in one transaction
CREATE OR REPLACE FUNCTION public.join_tournament_atomic(p_tournament_id UUID, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t public.tournaments%ROWTYPE; v_profile public.profiles%ROWTYPE; v_entry public.tournament_entries%ROWTYPE; v_count INT; v_balance INT; v_new_balance INT;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND'; END IF;
  SELECT * INTO v_entry FROM public.tournament_entries WHERE tournament_id = p_tournament_id AND user_id = p_user_id;
  IF FOUND THEN RETURN jsonb_build_object('ok', true, 'alreadyJoined', true, 'entryFee', v_t.entry_coins); END IF;
  IF v_t.status <> 'registration' THEN RAISE EXCEPTION 'REGISTRATION_CLOSED'; END IF;
  SELECT count(*) INTO v_count FROM public.tournament_entries WHERE tournament_id = p_tournament_id;
  IF v_count >= v_t.max_players THEN RAISE EXCEPTION 'TOURNAMENT_FULL'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  v_balance := COALESCE(v_profile.coins, 0);
  IF v_balance < v_t.entry_coins THEN RAISE EXCEPTION 'INSUFFICIENT_COINS'; END IF;
  v_new_balance := v_balance - v_t.entry_coins;
  UPDATE public.profiles SET coins = v_new_balance, updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.tournament_entries(tournament_id, user_id, seed) VALUES (p_tournament_id, p_user_id, v_count + 1) RETURNING * INTO v_entry;
  IF v_t.entry_coins > 0 THEN
    INSERT INTO public.wallet_ledger(user_id, amount, type, reference_id, balance_after)
    VALUES (p_user_id, -v_t.entry_coins, 'tournament_entry', p_tournament_id::text, v_new_balance);
  END IF;
  RETURN jsonb_build_object('ok', true, 'alreadyJoined', false, 'entryFee', v_t.entry_coins, 'filled', v_count + 1, 'maxPlayers', v_t.max_players);
END; $$;
REVOKE ALL ON FUNCTION public.join_tournament_atomic(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_tournament_atomic(UUID, UUID) TO service_role;
