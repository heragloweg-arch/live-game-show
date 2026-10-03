import { supabase } from '../supabase/client';

export type FeatureHealthStatus = 'stable' | 'beta' | 'disabled' | 'maintenance';
export type FeatureHealth = { feature_key: string; status: FeatureHealthStatus; message: string | null };

export async function getFeatureHealth(): Promise<Record<string, FeatureHealth>> {
  const { data, error } = await supabase.from('feature_health').select('feature_key,status,message');
  if (error) {
    console.warn('[feature-health]', error.message);
    return {};
  }
  return Object.fromEntries((data ?? []).map((row) => [row.feature_key, row as FeatureHealth]));
}
