-- ═══════════════════════════════════════════════════════════════
-- Tournaments (دوري الأبطال) + Subscriptions / Billing foundation
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE public.tournament_status AS ENUM (
    'draft', 'registration', 'active', 'completed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM (
    'none', 'active', 'grace', 'expired', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_plan AS ENUM (
    'free', 'plus_monthly', 'plus_yearly', 'host_pro'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Tournaments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournaments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  description     TEXT,
  status          public.tournament_status NOT NULL DEFAULT 'registration',
  max_players     INT NOT NULL DEFAULT 32,
  entry_coins     INT NOT NULL DEFAULT 0,
  prize_pool      INT NOT NULL DEFAULT 0,
  rounds_total    INT NOT NULL DEFAULT 5,
  difficulty      public.difficulty NOT NULL DEFAULT 'normal',
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tournament_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seed            INT,
  eliminated      BOOLEAN NOT NULL DEFAULT false,
  wins            INT NOT NULL DEFAULT 0,
  losses          INT NOT NULL DEFAULT 0,
  points          INT NOT NULL DEFAULT 0,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_number    INT NOT NULL DEFAULT 1,
  match_id        UUID REFERENCES public.matches(id),
  player_a        UUID REFERENCES public.profiles(id),
  player_b        UUID REFERENCES public.profiles(id),
  winner_id       UUID REFERENCES public.profiles(id),
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_entries_tid ON public.tournament_entries(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tid ON public.tournament_matches(tournament_id);

-- ─── Subscriptions & purchases ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscription_catalog (
  plan            public.subscription_plan PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  price_micros    BIGINT NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'SAR',
  period_days     INT NOT NULL DEFAULT 30,
  google_product_id TEXT,
  benefits_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  active          BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan            public.subscription_plan NOT NULL DEFAULT 'free',
  status          public.subscription_status NOT NULL DEFAULT 'none',
  provider        TEXT NOT NULL DEFAULT 'google_play',
  provider_token  TEXT,
  product_id      TEXT,
  starts_at       TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  auto_renew      BOOLEAN NOT NULL DEFAULT true,
  raw_receipt     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subs_active
  ON public.user_subscriptions (user_id)
  WHERE status IN ('active', 'grace');

CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id      TEXT NOT NULL,
  purchase_token  TEXT NOT NULL,
  order_id        TEXT,
  provider        TEXT NOT NULL DEFAULT 'google_play',
  status          TEXT NOT NULL DEFAULT 'pending',
  verified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, purchase_token)
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_plan public.subscription_plan NOT NULL DEFAULT 'free';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- RLS
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tournaments_select ON public.tournaments FOR SELECT USING (true);
CREATE POLICY tournament_entries_select ON public.tournament_entries FOR SELECT USING (true);
CREATE POLICY tournament_entries_insert ON public.tournament_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY tournament_matches_select ON public.tournament_matches FOR SELECT USING (true);
CREATE POLICY catalog_select ON public.subscription_catalog FOR SELECT USING (true);
CREATE POLICY user_subs_select ON public.user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY receipts_select ON public.purchase_receipts
  FOR SELECT USING (auth.uid() = user_id);

-- Seed catalog
INSERT INTO public.subscription_catalog (plan, title, description, price_micros, period_days, google_product_id, benefits_json)
VALUES
  ('free', 'مجاني', 'اللعب الأساسي', 0, 0, NULL, '{"ads": true, "daily": true}'::jsonb),
  ('plus_monthly', 'قدها بلس شهري', 'بدون إعلانات · مكافآت يومية مضاعفة · إطار بلس', 14990000, 30, 'qaddaha_plus_monthly', '{"ads": false, "daily_multiplier": 2, "frame": "plus", "host_priority": false}'::jsonb),
  ('plus_yearly', 'قدها بلس سنوي', 'نفس بلس مع توفير سنوي', 149900000, 365, 'qaddaha_plus_yearly', '{"ads": false, "daily_multiplier": 2, "frame": "plus", "host_priority": false}'::jsonb),
  ('host_pro', 'مضيف برو', 'أدوات استضافة متقدمة · أولوية غرف', 24990000, 30, 'zatona_host_pro', '{"ads": false, "daily_multiplier": 2, "frame": "host", "host_priority": true, "show_tools": true}'::jsonb)
ON CONFLICT (plan) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  price_micros = EXCLUDED.price_micros,
  google_product_id = EXCLUDED.google_product_id,
  benefits_json = EXCLUDED.benefits_json;

-- Seed Champions League style tournament
INSERT INTO public.tournaments (slug, title, description, status, max_players, entry_coins, prize_pool, rounds_total, difficulty, starts_at, ends_at)
VALUES (
  'champions-s1',
  'دوري أبطال قدها',
  'تنافس على اللقب — تسجيل ثم مواجهات 1 ضد 1 حتى التتويج',
  'registration',
  32,
  50,
  5000,
  5,
  'normal',
  now(),
  now() + interval '14 days'
)
ON CONFLICT (slug) DO NOTHING;
