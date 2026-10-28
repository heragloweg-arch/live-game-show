/** Authenticated user safety: report content/users and manage personal blocks. */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors, serveWithCors } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

const categories = new Set(['harassment','hate','sexual_content','spam','cheating','unsafe_content','other']);
const targetTypes = new Set(['user','match','room','challenge']);
const reviewStatuses = new Set(['reviewing','resolved','dismissed']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function base64url(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function mintRoomAdminToken(apiKey: string, apiSecret: string, roomName: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iss: apiKey, sub: 'qaddaha-safety-service', nbf: now, exp: now + 60, video: { room: roomName, roomAdmin: true } }));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(header + '.' + payload));
  return header + '.' + payload + '.' + base64url(sig);
}
function liveKitOrigin(raw: string): string {
  const url = new URL(raw);
  if (url.protocol === 'wss:') url.protocol = 'https:';
  else if (url.protocol === 'ws:') url.protocol = 'http:';
  if (!['https:','http:'].includes(url.protocol)) throw new Error('Unsupported LiveKit URL');
  return url.origin;
}
async function ejectBlockedPeer(supabase: any, blockerId: string, blockedId: string) {
  const liveKitUrl = Deno.env.get('LIVEKIT_URL') || '';
  const apiKey = Deno.env.get('LIVEKIT_API_KEY') || '';
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET') || '';
  if (!liveKitUrl || !apiKey || !apiSecret) return { status: 'not_configured', attempted: 0, removed: 0 };
  const [a, b] = await Promise.all([
    supabase.from('room_participants').select('room_id').eq('user_id', blockerId),
    supabase.from('room_participants').select('room_id').eq('user_id', blockedId),
  ]);
  if (a.error || b.error) throw new Error('Unable to resolve shared rooms');
  const blockerRooms = new Set((a.data ?? []).map((x: any) => String(x.room_id)));
  const shared = [...new Set((b.data ?? []).map((x: any) => String(x.room_id)))].filter((id) => blockerRooms.has(id));
  if (!shared.length) return { status: 'no_shared_rooms', attempted: 0, removed: 0 };
  const { data: rooms, error } = await supabase.from('rooms').select('id,status').in('id', shared).neq('status', 'ended');
  if (error) throw new Error('Unable to validate shared rooms');
  const active = (rooms ?? []).filter((r: any) => shared.includes(String(r.id)));
  if (!active.length) return { status: 'no_shared_rooms', attempted: 0, removed: 0 };
  const origin = liveKitOrigin(liveKitUrl);
  let removed = 0, completed = 0;
  for (const room of active) {
    const roomName = 'zatona-' + room.id;
    const token = await mintRoomAdminToken(apiKey, apiSecret, roomName);
    try {
      const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
      const list = await fetch(origin + '/twirp/livekit.RoomService/ListParticipants', { method: 'POST', headers, body: JSON.stringify({ room: roomName }) });
      if (!list.ok) { console.error('[safety] LiveKit list failed HTTP ' + list.status); continue; }
      const body = await list.json();
      const present = Array.isArray(body.participants) && body.participants.some((p: any) => String(p.identity) === blockedId);
      if (!present) { completed++; continue; }
      const kick = await fetch(origin + '/twirp/livekit.RoomService/RemoveParticipant', { method: 'POST', headers, body: JSON.stringify({ room: roomName, identity: blockedId }) });
      if (kick.ok) { removed++; completed++; } else console.error('[safety] LiveKit removal failed HTTP ' + kick.status);
    } catch { console.error('[safety] LiveKit request failed'); }
  }
  return { status: completed === active.length ? 'complete' : 'partial', attempted: active.length, removed };
}

serveWithCors(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Safety service is not configured' }, 503);
  const bearer = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json({ error: 'Unauthorized' }, 401);
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await supabase.auth.getUser(bearer);
  if (authError || !user || user.is_anonymous) return json({ error: 'Valid signed-in account required' }, 401);
  const rate = await enforceRateLimit(supabase, user.id, 'safety', 30, 60);
  if (!rate.allowed) return json({ error: 'تم تجاوز حد عمليات السلامة، حاول بعد قليل.', code: 'RATE_LIMITED' }, 429);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const action = String(body.action ?? '');

  if (action === 'report') {
    const targetType = String(body.targetType ?? '');
    const targetId = String(body.targetId ?? '').trim();
    const category = String(body.category ?? '');
    const details = String(body.details ?? '').trim();
    const requestId = String(body.requestId ?? '');
    if (!targetTypes.has(targetType) || !targetId || targetId.length > 128) return json({ error: 'Invalid report target' }, 400);
    if (!categories.has(category) || details.length > 1000 || !UUID.test(requestId)) return json({ error: 'Invalid report payload' }, 400);
    if (targetType === 'user') {
      if (!UUID.test(targetId) || targetId === user.id) return json({ error: 'Invalid report target' }, 400);
      const { data: target, error } = await supabase.from('profiles').select('id').eq('id', targetId).maybeSingle();
      if (error) return json({ error: 'Unable to validate report target' }, 500);
      if (!target) return json({ error: 'Report target not found' }, 404);
    }
    const { count, error: countError } = await supabase.from('user_reports').select('id', { count: 'exact', head: true })
      .eq('reporter_id', user.id).gte('created_at', new Date(Date.now() - 3600000).toISOString());
    if (countError) return json({ error: 'Unable to submit report right now' }, 500);
    if ((count ?? 0) >= 10) return json({ error: 'Report rate limit reached; try again later' }, 429);
    const { data, error } = await supabase.from('user_reports').insert({
      reporter_id: user.id, target_type: targetType, target_id: targetId, category, details: details || null, request_id: requestId,
    }).select('id,status,created_at').single();
    if (error?.code === '23505') return json({ ok: true, duplicate: true });
    if (error) return json({ error: 'Unable to save report' }, 500);
    return json({ ok: true, report: data }, 201);
  }

  if (action === 'block' || action === 'unblock') {
    const targetId = String(body.userId ?? '');
    if (!UUID.test(targetId) || targetId === user.id) return json({ error: 'Invalid user to block' }, 400);
    if (action === 'block') {
      const { data: target, error: targetError } = await supabase.from('profiles').select('id').eq('id', targetId).maybeSingle();
      if (targetError) return json({ error: 'Unable to validate user' }, 500);
      if (!target) return json({ error: 'User not found' }, 404);
      const { error } = await supabase.from('user_blocks').upsert({ blocker_id: user.id, blocked_id: targetId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
      if (error) return json({ error: 'Unable to block user' }, 500);
      try { return json({ ok: true, blocked: true, liveKitKick: await ejectBlockedPeer(supabase, user.id, targetId) }); }
      catch { return json({ ok: true, blocked: true, liveKitKick: { status: 'partial', attempted: 0, removed: 0 } }); }
    }
    const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', targetId);
    if (error) return json({ error: 'Unable to unblock user' }, 500);
    return json({ ok: true, blocked: false });
  }

  if (action === 'list_blocks') {
    const { data, error } = await supabase.from('user_blocks').select('blocked_id,created_at').eq('blocker_id', user.id).order('created_at', { ascending: false }).limit(500);
    if (error) return json({ error: 'Unable to load block list' }, 500);
    return json({ items: data ?? [] });
  }

  const admins = (Deno.env.get('TOURNAMENT_ADMIN_IDS') || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (action === 'admin_list_reports') {
    if (!admins.includes(user.id)) return json({ error: 'Admin only' }, 403);
    const { data, error } = await supabase.from('user_reports').select('id,reporter_id,target_type,target_id,category,details,status,created_at,review_note')
      .in('status', ['pending','reviewing']).order('created_at', { ascending: true }).limit(100);
    if (error) return json({ error: 'Unable to load reports' }, 500);
    return json({ items: data ?? [] });
  }
  if (action === 'admin_review_report') {
    if (!admins.includes(user.id)) return json({ error: 'Admin only' }, 403);
    const reportId = String(body.reportId ?? ''), status = String(body.status ?? ''), note = String(body.note ?? '').trim();
    if (!UUID.test(reportId) || !reviewStatuses.has(status) || note.length > 1000) return json({ error: 'Invalid review payload' }, 400);
    const { data, error } = await supabase.from('user_reports').update({ status, review_note: note || null, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', reportId).in('status', ['pending','reviewing']).select('id,status,reviewed_at').maybeSingle();
    if (error) return json({ error: 'Unable to update report' }, 500);
    if (!data) return json({ error: 'Report not found or already reviewed' }, 409);
    return json({ ok: true, report: data });
  }
  return json({ error: 'Unknown action' }, 400);
});
