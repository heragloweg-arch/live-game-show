import { supabase } from '../supabase/client';
import { getFunctionsUrl, getSupabaseAnonKey } from '../../config/runtime';

export interface OverlaySnapshot {
  ok: true; expiresAt: string; room: { title: string; status: string };
  participants: Array<{ name: string; isHost: boolean; score: number }>;
  round: { number: number; status: string; serverEndAt: string | null; prompt: string | null } | null;
}
async function invokeOverlay<T>(body: Record<string, unknown>, authenticated: boolean): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: getSupabaseAnonKey() };
  if (authenticated) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('سجّل الدخول أولًا لإنشاء رابط العرض.');
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  const response = await fetch(getFunctionsUrl('overlay'), { method: 'POST', headers, body: JSON.stringify(body) });
  const raw = await response.text(); let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { /* normalized below */ }
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `تعذر تحميل العرض (${response.status}).`);
  if (!data) throw new Error('استجابة غير صالحة من خدمة العرض.');
  return data as T;
}
export function createOverlayLink(roomId: string) {
  return invokeOverlay<{ ok: true; overlayId: string; token: string; expiresAt: string }>({ action: 'create', roomId }, true);
}
export function revokeOverlayLink(roomId: string, overlayId: string) {
  return invokeOverlay<{ ok: true; revoked: boolean }>({ action: 'revoke', roomId, overlayId }, true);
}
export function fetchOverlaySnapshot(token: string) { return invokeOverlay<OverlaySnapshot>({ action: 'get', token }, false); }
