-- Add the professional host plan in its own migration transaction.
DO $$
BEGIN
  ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'host_max';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
