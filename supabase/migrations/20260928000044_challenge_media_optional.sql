-- Optional challenge media. No challenge requires media to be playable.
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE public.challenges
  DROP CONSTRAINT IF EXISTS challenges_image_url_https;

ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_image_url_https
  CHECK (image_url IS NULL OR image_url ~ '^https://');
