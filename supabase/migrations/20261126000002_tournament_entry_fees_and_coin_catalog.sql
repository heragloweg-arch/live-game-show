-- Commercial catalog approved for launch: prices remain USD in the server catalog;
-- Google Play supplies the user's localized display price on native devices.
UPDATE public.tournaments
SET entry_coins = CASE WHEN competition_mode = 'team_league' THEN 500 ELSE 250 END,
    updated_at = now()
WHERE slug IN ('champions-s1', 'teams-s1') OR competition_mode IN ('player', 'team_league');

UPDATE public.coin_catalog SET price_micros = CASE coins
  WHEN 500 THEN 1000000
  WHEN 5000 THEN 7000000
  WHEN 10000 THEN 15000000
  WHEN 20000 THEN 25000000
  WHEN 50000 THEN 50000000
  WHEN 100000 THEN 70000000
  ELSE price_micros END
WHERE coins IN (500, 5000, 10000, 20000, 50000, 100000);

INSERT INTO public.coin_catalog (pack_id, title, coins, price_micros, currency, google_product_id, active)
VALUES
  ('coins_5000', 'حزمة المحترف', 5000, 7000000, 'USD', 'qaddaha_coins_5000', true),
  ('coins_10000', 'حزمة النخبة', 10000, 15000000, 'USD', 'qaddaha_coins_10000', true)
ON CONFLICT (pack_id) DO UPDATE SET title = EXCLUDED.title, coins = EXCLUDED.coins,
  price_micros = EXCLUDED.price_micros, currency = EXCLUDED.currency,
  google_product_id = EXCLUDED.google_product_id, active = true;

UPDATE public.coin_catalog SET active = false
WHERE coins NOT IN (500, 5000, 10000, 20000, 50000, 100000);
