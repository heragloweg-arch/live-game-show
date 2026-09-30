-- Runtime capability registry. Amber modes are explicit, never silently presented as complete.
CREATE TABLE IF NOT EXISTS public.feature_health (
  feature_key TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('stable','beta','disabled','maintenance')),
  min_client_version TEXT NOT NULL DEFAULT '1.0.0',
  message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.feature_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feature_health_select ON public.feature_health;
CREATE POLICY feature_health_select ON public.feature_health FOR SELECT USING (true);
INSERT INTO public.feature_health(feature_key,status,message) VALUES
 ('solo','stable',''),('one_v_one','stable',''),('daily_pack','stable',''),
 ('tournament','beta','المواجهات الفعلية تتطلب اتصالاً مستقراً'),('team','beta',''),
 ('host','beta',''),('couple','stable','')
ON CONFLICT(feature_key) DO UPDATE SET status=EXCLUDED.status, message=EXCLUDED.message, updated_at=now();
