import { supabase } from '../supabase/client';

const BASE = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/metrics`
  : '';

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Metrics API failed');
  return data as T;
}

export const metricsOverview = () => invoke<{ overview: any; last14Days: any[]; generatedAt: string }>({ action: 'overview' });
export const metricsIngestDay = (payload: Record<string, unknown>) => invoke({ action: 'ingest_day', ...payload });
export const metricsSnapshot = (payload: Record<string, unknown>) => invoke({ action: 'snapshot', ...payload });
export const metricsListSnapshots = () => invoke<{ snapshots: any[] }>({ action: 'list_snapshots' });
