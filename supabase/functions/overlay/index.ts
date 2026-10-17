/** Read-only OBS overlay with expiring, revocable bearer links. */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function makeToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((v) => v.toString(16).padStart(2, '0')).join('');
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Overlay service is not configured' }, 503);
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const action = String(body.action ?? 'get');

  if (action === 'get') {
    const token = String(body.token ?? '');
    if (!/^[0-9a-f]{64}$/i.test(token)) return json({ error: 'Overlay link is invalid or expired' }, 404);
    const { data: link, error: linkError } = await supabase.from('room_overlay_tokens')
      .select('id,room_id,expires_at').eq('token_hash', await sha256(token.toLowerCase())).is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()).maybeSingle();
    if (linkError || !link) return json({ error: 'Overlay link is invalid or expired' }, 404);
    const { data: room, error: roomError } = await supabase.from('rooms').select('id,title,status').eq('id', link.room_id).maybeSingle();
    if (roomError || !room) return json({ error: 'Room unavailable' }, 404);
    const { data: participants, error: participantError } = await supabase.from('room_participants')
      .select('user_id,is_host,joined_at').eq('room_id', room.id).order('joined_at', { ascending: true }).limit(100);
    if (participantError) return json({ error: 'Overlay data unavailable' }, 503);
    const rows = participants ?? [], ids = rows.map((x: any) => x.user_id).filter(Boolean);
    const [profiles, answers, rounds] = await Promise.all([
      ids.length ? supabase.from('profiles').select('id,display_name,username').in('id', ids) : Promise.resolve({ data: [], error: null }),
      supabase.from('room_answers').select('user_id,points').eq('room_id', room.id).limit(5000),
      supabase.from('room_rounds').select('round_number,status,server_end_at,challenge_id').eq('room_id', room.id).order('round_number', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (profiles.error || answers.error || rounds.error) return json({ error: 'Overlay data unavailable' }, 503);
    const profileMap = new Map((profiles.data ?? []).map((x: any) => [x.id, x]));
    const scores = new Map<string, number>();
    for (const answer of answers.data ?? []) scores.set(answer.user_id, (scores.get(answer.user_id) ?? 0) + Number(answer.points ?? 0));
    let round: Record<string, unknown> | null = null;
    if (rounds.data) {
      const result = await supabase.from('challenges').select('prompt').eq('id', rounds.data.challenge_id).maybeSingle();
      if (result.error) return json({ error: 'Overlay data unavailable' }, 503);
      round = { number: rounds.data.round_number, status: rounds.data.status, serverEndAt: rounds.data.server_end_at, prompt: result.data?.prompt ?? null };
    }
    return json({
      ok: true, expiresAt: link.expires_at, room: { title: room.title, status: room.status },
      participants: rows.map((x: any) => { const p = profileMap.get(x.user_id) as any; return { name: String(p?.display_name || p?.username || 'لاعب').slice(0, 40), isHost: Boolean(x.is_host), score: scores.get(x.user_id) ?? 0 }; }),
      round,
    });
  }

  const bearer = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json({ error: 'Unauthorized' }, 401);
  const { data: { user }, error: authError } = await supabase.auth.getUser(bearer);
  if (authError || !user || user.is_anonymous) return json({ error: 'Valid signed-in account required' }, 401);
  const roomId = String(body.roomId ?? '');
  if (!UUID.test(roomId)) return json({ error: 'Invalid room' }, 400);
  const { data: room, error: roomError } = await supabase.from('rooms').select('id,host_id').eq('id', roomId).maybeSingle();
  if (roomError || !room) return json({ error: 'Room not found' }, 404);
  const { data: membership } = await supabase.from('room_participants').select('is_host').eq('room_id', roomId).eq('user_id', user.id).maybeSingle();
  if (room.host_id !== user.id && !membership?.is_host) return json({ error: 'Host permission required' }, 403);

  if (action === 'create') {
    const token = makeToken(), expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: created, error } = await supabase.from('room_overlay_tokens').insert({ room_id: roomId, created_by: user.id, token_hash: await sha256(token), expires_at: expiresAt }).select('id,expires_at').single();
    if (error || !created) return json({ error: 'Unable to create overlay link' }, 500);
    const { error: rotateError } = await supabase.from('room_overlay_tokens').update({ revoked_at: new Date().toISOString() }).eq('room_id', roomId).eq('created_by', user.id).is('revoked_at', null).neq('id', created.id);
    if (rotateError) { await supabase.from('room_overlay_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', created.id); return json({ error: 'Unable to rotate overlay link safely' }, 500); }
    return json({ ok: true, overlayId: created.id, token, expiresAt: created.expires_at }, 201);
  }
  if (action === 'revoke') {
    const overlayId = String(body.overlayId ?? '');
    if (!UUID.test(overlayId)) return json({ error: 'Invalid overlay link' }, 400);
    const { data, error } = await supabase.from('room_overlay_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', overlayId).eq('room_id', roomId).eq('created_by', user.id).is('revoked_at', null).select('id').maybeSingle();
    if (error) return json({ error: 'Unable to revoke overlay link' }, 500);
    return json({ ok: true, revoked: Boolean(data) });
  }
  return json({ error: 'Unknown action' }, 400);
});
