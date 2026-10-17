-- Normalize search_path on remaining privileged economy and settlement functions.
ALTER FUNCTION public.purchase_cosmetic_atomic(UUID, TEXT) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.equip_cosmetic_atomic(UUID, TEXT) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.settle_match(UUID) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.submit_answer_atomic(TEXT, UUID, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ)
  SET search_path = pg_catalog, public, pg_temp;
