-- Remove the annual upgrade from the sellable catalog.
-- Existing annual entitlements remain readable until their verified expiry.
BEGIN;

UPDATE public.subscription_catalog
SET active = false
WHERE plan = 'plus_yearly';

COMMIT;
