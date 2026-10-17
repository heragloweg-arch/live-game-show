-- Private operational and billing records are consumed by trusted Edge Functions.
-- Direct table reads would expose purchase tokens, raw receipts and internal metrics.
DROP POLICY IF EXISTS user_subs_select ON public.user_subscriptions;
REVOKE ALL ON TABLE public.user_subscriptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_subscriptions TO service_role;

DROP POLICY IF EXISTS receipts_select ON public.purchase_receipts;
REVOKE ALL ON TABLE public.purchase_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.purchase_receipts TO service_role;

DROP POLICY IF EXISTS analytics_daily_select ON public.analytics_daily;
REVOKE ALL ON TABLE public.analytics_daily FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.analytics_daily TO service_role;

DROP POLICY IF EXISTS investor_snapshots_select ON public.investor_snapshots;
REVOKE ALL ON TABLE public.investor_snapshots FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.investor_snapshots TO service_role;
