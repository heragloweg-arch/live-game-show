-- Qaddaha global economy catalog v2.
-- Base currency is USD; Google Play may localize the displayed price per user's country.


UPDATE public.subscription_catalog
SET title = 'قدها Plus',
    description = 'بدون إعلانات + 1000 كوين هدية شهرياً',
    price_micros = 3990000,
    currency = 'USD',
    period_days = 30,
    benefits_json = '{"ads": false, "monthly_coins": 1000, "frame": "plus"}'::jsonb
WHERE plan = 'plus_monthly';

UPDATE public.subscription_catalog
SET title = 'مبدع',
    description = 'بث خاص ساعة يومياً + بدون إعلانات + 5000 كوين شهرياً',
    price_micros = 9990000,
    currency = 'USD',
    period_days = 30,
    benefits_json = '{"ads": false, "monthly_coins": 5000, "host_minutes_per_day": 60, "frame": "creator"}'::jsonb
WHERE plan = 'host_pro';

INSERT INTO public.subscription_catalog (plan, title, description, price_micros, currency, period_days, google_product_id, benefits_json)
VALUES ('host_max', 'محترف', 'بث خاص ساعتين يومياً + بدون إعلانات + 10000 كوين شهرياً', 16990000, 'USD', 30, 'qaddaha_host_max_monthly', '{"ads": false, "monthly_coins": 10000, "host_minutes_per_day": 120, "frame": "pro"}'::jsonb)
ON CONFLICT (plan) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  price_micros = EXCLUDED.price_micros,
  currency = EXCLUDED.currency,
  period_days = EXCLUDED.period_days,
  google_product_id = EXCLUDED.google_product_id,
  benefits_json = EXCLUDED.benefits_json;

INSERT INTO public.coin_catalog (pack_id, title, coins, price_micros, currency, google_product_id, active)
VALUES
  ('coins_100', 'بداية صغيرة', 100, 990000, 'USD', 'qaddaha_coins_100', true),
  ('coins_500', 'حزمة المنافس', 500, 3990000, 'USD', 'qaddaha_coins_500', true),
  ('coins_1200', 'حزمة النجم', 1200, 7990000, 'USD', 'qaddaha_coins_1200', true),
  ('coins_3000', 'حزمة البطل', 3000, 14990000, 'USD', 'qaddaha_coins_3000', true),
  ('coins_7500', 'حزمة الأسطورة', 7500, 29990000, 'USD', 'qaddaha_coins_7500', true),
  ('coins_20000', 'حزمة النخبة', 20000, 69990000, 'USD', 'qaddaha_coins_20000', true),
  ('coins_50000', 'حزمة القمة', 50000, 149990000, 'USD', 'qaddaha_coins_50000', true),
  ('coins_100000', 'حزمة الإمبراطور', 100000, 249990000, 'USD', 'qaddaha_coins_100000', true)
ON CONFLICT (pack_id) DO UPDATE SET
  title = EXCLUDED.title,
  coins = EXCLUDED.coins,
  price_micros = EXCLUDED.price_micros,
  currency = EXCLUDED.currency,
  google_product_id = EXCLUDED.google_product_id,
  active = EXCLUDED.active;

-- Retire the earlier Saudi-only catalog IDs; Play products must be created with the new IDs.
UPDATE public.coin_catalog
SET active = false
WHERE pack_id IN ('coins_250', 'coins_700', 'coins_1800');
