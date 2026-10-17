import { supabase } from '../supabase/client';
import { getFunctionsUrl, getSupabaseAnonKey } from '../../config/runtime';

export type SafetyReportCategory = 'harassment' | 'hate' | 'sexual_content' | 'spam' | 'cheating' | 'unsafe_content' | 'other';

async function invokeSafety<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('سجّل الدخول أولاً لتنفيذ هذا الإجراء.');
  const response = await fetch(getFunctionsUrl('safety'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: getSupabaseAnonKey() },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload: { error?: string } | null = null;
  try { payload = raw ? JSON.parse(raw) as { error?: string } : null; } catch { /* normalized below */ }
  if (!response.ok) throw new Error(payload?.error || `تعذر تنفيذ الإجراء (${response.status}).`);
  if (!payload && raw) throw new Error('استجابة غير صالحة من خدمة الأمان.');
  return (payload ?? {}) as T;
}

export function reportUser(userId: string, category: SafetyReportCategory = 'other', details = '') {
  return invokeSafety<{ ok: true; duplicate?: boolean }>({ action: 'report', targetType: 'user', targetId: userId, category, details: details.slice(0, 1000), requestId: crypto.randomUUID() });
}
export function blockUser(userId: string) {
  return invokeSafety<{ ok: true; blocked: boolean; liveKitKick?: { status: 'not_configured' | 'no_shared_rooms' | 'complete' | 'partial'; attempted: number; removed: number } }>({ action: 'block', userId });
}
export function unblockUser(userId: string) {
  return invokeSafety<{ ok: true; blocked: boolean }>({ action: 'unblock', userId });
}
export async function fetchBlockedUsers(): Promise<string[]> {
  const result = await invokeSafety<{ items: Array<{ blocked_id: string }> }>({ action: 'list_blocks' });
  return (result.items ?? []).map((item) => item.blocked_id);
}
export interface SafetyAdminReport {
  id: string; reporter_id: string; target_type: 'user' | 'match' | 'room' | 'challenge'; target_id: string;
  category: SafetyReportCategory; details: string | null; status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  created_at: string; review_note: string | null;
}
export function fetchAdminReports() {
  return invokeSafety<{ items: SafetyAdminReport[] }>({ action: 'admin_list_reports' });
}
export function reviewAdminReport(reportId: string, status: 'reviewing' | 'resolved' | 'dismissed', note = '') {
  return invokeSafety<{ ok: true }>({ action: 'admin_review_report', reportId, status, note: note.slice(0, 1000) });
}
