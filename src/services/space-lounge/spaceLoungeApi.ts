import { getSpaceLoungeWorkerUrl } from '../../config/runtime';
import { supabase } from '../supabase/client';
import type { SpaceLoungeAction, SpaceLoungeParticipant, SpaceLoungeSnapshot } from '../../types/space-lounge';

export interface StartSpaceLoungeResponse {
  snapshot: SpaceLoungeSnapshot;
  overlayToken: string;
}

export interface ActiveSpaceLoungeResponse {
  session: SpaceLoungeSnapshot | null;
  overlayToken: string | null;
  giftRules: GiftRuleInput[];
}

export interface ClaimResponse {
  claimId: string;
  code: string;
  expiresAt: number;
  instruction: string;
}

export interface ClaimStatusResponse {
  status: 'pending' | 'verified' | 'expired' | 'not_found' | 'full';
  participantId?: string;
  controlToken?: string;
  position?: { x: number; y: number };
  appearance?: 'masculine' | 'feminine';
}

export interface GiftRuleInput {
  giftId: string;
  action: SpaceLoungeAction;
  durationSeconds: number;
  target: 'sender' | 'group' | 'all';
}

function requireWorkerUrl(): string {
  const url = getSpaceLoungeWorkerUrl();
  if (!url) throw new Error('لم يُضبط عنوان عامل استراحة الفضاء بعد.');
  return url;
}

function workerError(error: unknown): string {
  const code = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  const messages: Record<string, string> = {
    tiktok_live_disabled: 'عامل TikTok LIVE غير مفعّل بعد.',
    host_auth_not_configured: 'لم تُهيّأ صلاحيات المضيف في العامل.',
    unauthorized: 'انتهت جلسة الدخول؛ سجّل الدخول مجددًا.',
    forbidden: 'حسابك غير مخوّل لإدارة استراحة الفضاء.',
    session_already_active: 'توجد جلسة استراحة نشطة بالفعل.',
    invalid_tiktok_handle: 'اكتب اسم TikTok صحيحًا دون رابط.',
    invalid_duration: 'مدة الجلسة يجب أن تكون من 60 إلى 90 دقيقة.',
    invalid_overlay_token: 'رابط العرض غير صالح.',
    claim_session_capacity_reached: 'بلغت الجلسة حد طلبات التحقق؛ تواصل مع المضيف.',
    claim_capacity_reached: 'طلبات التحقق كثيرة الآن؛ انتظر قليلًا ثم حاول مجددًا.',
    participant_control_denied: 'تعذر تأكيد صلاحية التحكم بهذه الشخصية.',
    rate_limited: 'طلبات كثيرة؛ انتظر قليلًا ثم حاول مجددًا.',
    service_error: 'تعذر الاتصال بخدمة الاستراحة الآن.',
  };
  return messages[code] || code || 'حدث خطأ غير متوقع في خدمة الاستراحة.';
}

async function request<T>(path: string, init: RequestInit = {}, authenticated = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (authenticated) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('سجّل الدخول أولًا لبدء جلسة الاستراحة.');
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }
  let response: Response;
  try {
    response = await fetch(`${requireWorkerUrl()}${path}`, { ...init, headers });
  } catch {
    throw new Error('تعذر الوصول إلى عامل استراحة الفضاء.');
  }
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try { payload = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { /* normalized below */ }
  if (!response.ok) throw new Error(workerError(payload.error || `http_${response.status}`));
  return payload as T;
}

export function startSpaceLoungeSession(input: { tiktokHandle: string; joinKeyword: string; durationMinutes: number; title?: string }) {
  return request<StartSpaceLoungeResponse>('/api/sessions/start', {
    method: 'POST',
    body: JSON.stringify(input),
  }, true);
}

export function getActiveSpaceLoungeSession() {
  return request<ActiveSpaceLoungeResponse>('/api/sessions/active', { method: 'GET', signal: AbortSignal.timeout(8_000) }, true);
}

export function stopSpaceLoungeSession(sessionId: string) {
  return request<{ status: 'ended' }>(`/api/sessions/${encodeURIComponent(sessionId)}/stop`, { method: 'POST', body: '{}' }, true);
}

export function createSpaceLoungeClaim(sessionId: string) {
  return request<ClaimResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/claim`, {
    method: 'POST',
    body: '{}',
  });
}

export function getSpaceLoungeClaimStatus(sessionId: string, claimId: string) {
  return request<ClaimStatusResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/claim-status`, {
    method: 'POST',
    body: JSON.stringify({ claimId }),
  });
}

export function moveSpaceLoungeParticipant(
  sessionId: string,
  participantId: string,
  controlToken: string,
  input: { x: number; y: number; appearance?: SpaceLoungeParticipant['appearance'] },
) {
  return request<{ status: 'updated' }>(`/api/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}`, {
    method: 'PATCH',
    headers: { 'X-Participant-Control': controlToken },
    body: JSON.stringify(input),
  });
}

export function setSpaceLoungeGiftRules(sessionId: string, rules: GiftRuleInput[]) {
  return request<{ configured: number }>(`/api/sessions/${encodeURIComponent(sessionId)}/gift-rules`, {
    method: 'PUT',
    body: JSON.stringify({ rules }),
  }, true);
}

export function setSpaceLoungeSponsor(sessionId: string, input: { name: string; message?: string }) {
  return request<{ status: 'updated' }>(`/api/sessions/${encodeURIComponent(sessionId)}/sponsor`, {
    method: 'POST',
    body: JSON.stringify(input),
  }, true);
}

export function triggerSpaceLoungeSceneAction(sessionId: string, action: SpaceLoungeAction) {
  return request<{ affected: number }>(`/api/sessions/${encodeURIComponent(sessionId)}/scene-action`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  }, true);
}

export function spaceLoungeEventsUrl(sessionId: string): string {
  return `${requireWorkerUrl()}/api/sessions/${encodeURIComponent(sessionId)}/events`;
}
