-- Qaddaha coin catalog pricing v3.
-- Prices are stored in USD micros; Google Play remains authoritative for localized checkout prices.
ALTER TABLE public.coin_catalog
  ADD COLUMN IF NOT EXISTS old_price_micros BIGINT;

ALTER TABLE public.coin_catalog
  DROP CONSTRAINT IF EXISTS coin_catalog_old_price_positive;
ALTER TABLE public.coin_catalog
  ADD CONSTRAINT coin_catalog_old_price_positive
  CHECK (old_price_micros IS NULL OR old_price_micros >= price_micros);

INSERT INTO public.coin_catalog (
  pack_id, title, coins, price_micros, old_price_micros, currency, google_product_id, active
)
VALUES
  ('coins_500', 'حزمة الانطلاقة', 500, 3990000, 4990000, 'USD', 'qaddaha_coins_500', true),
  ('coins_1200', 'حزمة النجم', 1200, 7990000, 9990000, 'USD', 'qaddaha_coins_1200', true),
  ('coins_3000', 'حزمة البطل', 3000, 14990000, 19990000, 'USD', 'qaddaha_coins_3000', true),
  ('coins_7500', 'حزمة الأسطورة', 7500, 29990000, 39990000, 'USD', 'qaddaha_coins_7500', true),
  ('coins_20000', 'حزمة النخبة', 20000, 69990000, 89990000, 'USD', 'qaddaha_coins_20000', true),
  ('coins_50000', 'حزمة القمة', 50000, 149990000, 199990000, 'USD', 'qaddaha_coins_50000', true),
  ('coins_100000', 'حزمة الإمبراطور', 100000, 249990000, 299990000, 'USD', 'qaddaha_coins_100000', true)
ON CONFLICT (pack_id) DO UPDATE SET
  title = EXCLUDED.title,
  coins = EXCLUDED.coins,
  price_micros = EXCLUDED.price_micros,
  old_price_micros = EXCLUDED.old_price_micros,
  currency = EXCLUDED.currency,
  google_product_id = EXCLUDED.google_product_id,
  active = EXCLUDED.active;

UPDATE public.coin_catalog
SET active = false
WHERE pack_id IN ('coins_100', 'coins_250', 'coins_700', 'coins_1800');

REVOKE ALL ON public.coin_catalog FROM anon, authenticated;
GRANT SELECT ON public.coin_catalog TO service_role;
