-- Reserve ownership of a Google Play purchase token before verification.
-- Serializing by provider token prevents two accounts racing to claim the same token.
BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_google_play_receipt_atomic(
  p_user_id UUID,
  p_product_id TEXT,
  p_purchase_token TEXT,
  p_order_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_receipt public.purchase_receipts%ROWTYPE;
BEGIN
  IF p_user_id IS NULL
     OR p_product_id IS NULL OR length(btrim(p_product_id)) = 0
     OR p_purchase_token IS NULL OR length(btrim(p_purchase_token)) = 0
     OR length(p_purchase_token) > 4096
     OR (p_order_id IS NOT NULL AND length(p_order_id) > 256) THEN
    RAISE EXCEPTION 'Invalid Google Play receipt reservation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('qaddaha-receipt:' || p_purchase_token, 0));

  SELECT * INTO v_receipt
    FROM public.purchase_receipts
    WHERE provider = 'google_play' AND purchase_token = p_purchase_token
    FOR UPDATE;

  IF FOUND THEN
    IF v_receipt.user_id <> p_user_id THEN
      RAISE EXCEPTION 'Purchase token is already linked to another account';
    END IF;
    IF v_receipt.product_id <> p_product_id THEN
      RAISE EXCEPTION 'Purchase token product mismatch';
    END IF;
    UPDATE public.purchase_receipts
      SET order_id = COALESCE(v_receipt.order_id, p_order_id)
      WHERE id = v_receipt.id;
  ELSE
    INSERT INTO public.purchase_receipts (
      user_id, product_id, purchase_token, order_id, provider, status, verified_at
    ) VALUES (
      p_user_id, p_product_id, p_purchase_token, p_order_id, 'google_play', 'pending', NULL
    )
    ON CONFLICT (provider, purchase_token) DO NOTHING;

    SELECT * INTO v_receipt
      FROM public.purchase_receipts
      WHERE provider = 'google_play' AND purchase_token = p_purchase_token
      FOR UPDATE;

    IF NOT FOUND OR v_receipt.user_id <> p_user_id OR v_receipt.product_id <> p_product_id THEN
      RAISE EXCEPTION 'Purchase token is already linked to another account or product';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', v_receipt.status, 'user_id', v_receipt.user_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_google_play_receipt_atomic(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_google_play_receipt_atomic(UUID, TEXT, TEXT, TEXT) TO service_role;

COMMIT;
