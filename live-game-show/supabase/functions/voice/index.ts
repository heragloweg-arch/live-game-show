/**
 * Edge Function: voice
 * Issues LiveKit access tokens. Backend never touches media.
 *
 * POST { action: 'token', roomId, roomCode?, canPublish?: boolean }
 * POST { action: 'create_room', title }
 * POST { action: 'join_room', code }
 * POST { action: 'end_room', roomId }
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

// ─── LiveKit JWT (HS256) without heavy SDK ─────────────────
async function hmacSha256(secret: string, data: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', key, enc.encode(data));
}

function base64url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function mintLiveKitToken(opts: {
  apiKey: string;
  apiSecret: string;
  identity: string;
  name: string;
  roomName: string;
  canPublish: boolean;
  canSubscribe: boolean;
  ttlSeconds?: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (opts.ttlSeconds ?? 3600);

  const header = { alg: 'HS256', typ: 'JWT' };
  const videoGrant: Record<string, unknown> = {
    roomJoin: true,
    room: opts.roomName,
    canPublish: opts.canPublish,
    canSubscribe: opts.canSubscribe,
    canPublishData: true,
  };

  const payload = {
    iss: opts.apiKey,
    sub: opts.identity,
    name: opts.name,
    nbf: now,
    exp,
    video: videoGrant,
    metadata: JSON.stringify({ role: opts.canPublish ? 'host' : 'participant' }),
  };

  const h = base64url(JSON.stringify(header));
  const p = base64url(JSON.stringify(payload));
  const sig = base64url(await hmacSha256(opts.apiSecret, `${h}.${p}`));
  return `${h}.${p}.${sig}`;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function roomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authErr || !user) return json({ error: 'Invalid token' }, 401);

    // Ensure profile
    let { data: profile } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      await supabase.from('profiles').insert({
        id: user.id,
        username: 'player_' + user.id.slice(0, 8),
        display_name: 'لاعب زتونة',
      });
      profile = {
        id: user.id,
        username: 'player_' + user.id.slice(0, 8),
        display_name: 'لاعب زتونة',
        avatar_url: null,
      };
    }

    const body = await req.json();
    const action = body.action as string;

    const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL') ?? '';
    const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY') ?? '';
    const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET') ?? '';

    // ── create_room ──────────────────────────────────────
    if (action === 'create_room') {
      const title = (body.title as string)?.trim() || 'تحدي زتونة المباشر';
      const code = roomCode();

      const { data: room, error } = await supabase
        .from('rooms')
        .insert({
          code,
          host_id: user.id,
          title,
          status: 'waiting',
          max_participants: 20,
        })
        .select()
        .single();

      if (error) return json({ error: error.message }, 500);

      await supabase.from('room_participants').insert({
        room_id: room.id,
        user_id: user.id,
        is_host: true,
      });

      return json({
        room: {
          id: room.id,
          code: room.code,
          title: room.title,
          status: room.status,
          hostId: room.host_id,
        },
      });
    }

    // ── join_room ────────────────────────────────────────
    if (action === 'join_room') {
      const code = String(body.code ?? '').toUpperCase().trim();
      if (!code) return json({ error: 'code required' }, 400);

      const { data: room } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', code)
        .neq('status', 'ended')
        .maybeSingle();

      if (!room) return json({ error: 'الغرفة غير موجودة أو انتهت' }, 404);

      const { count } = await supabase
        .from('room_participants')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', room.id);

      if ((count ?? 0) >= room.max_participants) {
        return json({ error: 'الغرفة ممتلئة' }, 400);
      }

      await supabase.from('room_participants').upsert(
        { room_id: room.id, user_id: user.id, is_host: room.host_id === user.id },
        { onConflict: 'room_id,user_id' }
      );

      return json({
        room: {
          id: room.id,
          code: room.code,
          title: room.title,
          status: room.status,
          hostId: room.host_id,
        },
      });
    }

    // ── end_room ─────────────────────────────────────────
    if (action === 'end_room') {
      const roomId = body.roomId as string;
      if (!roomId) return json({ error: 'roomId required' }, 400);

      const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      if (!room) return json({ error: 'Room not found' }, 404);
      if (room.host_id !== user.id) return json({ error: 'Only host can end room' }, 403);

      await supabase
        .from('rooms')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', roomId);

      return json({ ok: true });
    }

    // ── go_live ──────────────────────────────────────────
    if (action === 'go_live') {
      const roomId = body.roomId as string;
      if (!roomId) return json({ error: 'roomId required' }, 400);

      const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      if (!room) return json({ error: 'Room not found' }, 404);
      if (room.host_id !== user.id) return json({ error: 'Only host' }, 403);

      await supabase
        .from('rooms')
        .update({ status: 'live', started_at: new Date().toISOString() })
        .eq('id', roomId);

      return json({ ok: true, status: 'live' });
    }

    // ── token ────────────────────────────────────────────
    if (action === 'token') {
      const roomId = body.roomId as string;
      if (!roomId) return json({ error: 'roomId required' }, 400);

      if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
        return json({
          error: 'LiveKit not configured',
          message: 'Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET on the function secrets',
        }, 503);
      }

      const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      if (!room) return json({ error: 'Room not found' }, 404);
      if (room.status === 'ended') return json({ error: 'Room ended' }, 400);

      // Must be participant or host
      const { data: membership } = await supabase
        .from('room_participants')
        .select('is_host')
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership && room.host_id !== user.id) {
        return json({ error: 'Not a room participant' }, 403);
      }

      const isHost = room.host_id === user.id || membership?.is_host === true;
      const canPublish = body.canPublish !== undefined ? !!body.canPublish : isHost;

      const identity = user.id;
      const name = profile?.display_name || profile?.username || 'player';
      // LiveKit room name = stable room id
      const lkRoom = `zatona-${room.id}`;

      const token = await mintLiveKitToken({
        apiKey: LIVEKIT_API_KEY,
        apiSecret: LIVEKIT_API_SECRET,
        identity,
        name,
        roomName: lkRoom,
        canPublish,
        canSubscribe: true,
        ttlSeconds: 7200,
      });

      return json({
        token,
        url: LIVEKIT_URL,
        roomName: lkRoom,
        roomId: room.id,
        code: room.code,
        isHost,
        identity,
      });
    }

    // ── list_participants ────────────────────────────────
    if (action === 'list_participants') {
      const roomId = body.roomId as string;
      if (!roomId) return json({ error: 'roomId required' }, 400);

      const { data: rows } = await supabase
        .from('room_participants')
        .select('user_id, is_host, joined_at, profiles:user_id(username, display_name, avatar_url)')
        .eq('room_id', roomId);

      const participants = (rows ?? []).map((r: any) => ({
        userId: r.user_id,
        isHost: r.is_host,
        username: r.profiles?.username ?? 'player',
        displayName: r.profiles?.display_name ?? 'لاعب',
        avatarUrl: r.profiles?.avatar_url ?? null,
        joinedAt: r.joined_at,
      }));

      return json({ participants });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[voice]', err);
    return json({ error: String(err) }, 500);
  }
});
