/**
 * Edge Function: voice
 * Issues LiveKit access tokens. Backend never touches media.
 *
 * POST { action: 'token', roomId, roomCode?, canPublish?: boolean }
 * POST { action: 'create_room', title, socialProvider?, socialAccountId? }
 * POST { action: 'join_room', code }
 * POST { action: 'end_room', roomId }
 * POST { action: 'host_status' }
 * POST { action: 'host_heartbeat', roomId }
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
  const random = new Uint8Array(6);
  crypto.getRandomValues(random);
  return Array.from(random, (byte) => chars[byte & 31]).join('');
}

async function hasBlockedRoomMember(supabase: any, roomId: string, userId: string): Promise<boolean> {
  const { data: members, error: membersError } = await supabase.from('room_participants')
    .select('user_id').eq('room_id', roomId).neq('user_id', userId);
  if (membersError) throw new Error('Unable to validate room safety');
  const otherIds = new Set((members ?? []).map((row: any) => String(row.user_id)));
  if (!otherIds.size) return false;
  const { data: blocks, error: blocksError } = await supabase.from('user_blocks')
    .select('blocker_id,blocked_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  if (blocksError) throw new Error('Unable to validate room safety');
  return (blocks ?? []).some((row: any) => otherIds.has(String(row.blocker_id) === userId ? String(row.blocked_id) : String(row.blocker_id)));
}

async function billHostRoom(supabase: any, roomId: string) {
  const { data, error } = await supabase.rpc('bill_host_room_period_atomic', { p_room_id: roomId });
  if (error) throw new Error(error.message);
  return data as {
    active?: boolean;
    reason?: string;
    charged?: number;
    access_mode?: string;
    next_charge_at?: string | null;
    coins?: number;
  };
}

function hostBillingError(reason: string | undefined) {
  const status = reason === 'INSUFFICIENT_COINS' ? 402 : 409;
  const messages: Record<string, string> = {
    INSUFFICIENT_COINS: 'رصيد الكوين غير كافٍ لاستمرار الغرفة. اشترِ كوين أو فعّل مضيف برو.',
    TRIAL_EXPIRED: 'انتهت التجربة المجانية ذات الثلاثين دقيقة لهذه الغرفة.',
    SUBSCRIPTION_EXPIRED: 'انتهى اشتراك مضيف برو؛ اشترِ كوين لاستمرار الاستضافة.',
    ROOM_ENDED: 'الغرفة انتهت.',
  };
  return json({ error: messages[reason ?? ''] ?? 'لا يمكن استمرار فوترة الغرفة.', code: reason ?? 'HOST_BILLING_BLOCKED' }, status);
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
        display_name: 'لاعب قدها',
      });
      profile = {
        id: user.id,
        username: 'player_' + user.id.slice(0, 8),
        display_name: 'لاعب قدها',
        avatar_url: null,
      };
    }

    const body = await req.json();
    const action = body.action as string;

    const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL') ?? '';
    const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY') ?? '';
    const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET') ?? '';

    // ── host_status ──────────────────────────────────────
    if (action === 'host_status') {
      const [{ data: hostProfile }, { data: hostSubscription }, { data: tiktok }] = await Promise.all([
        supabase.from('profiles').select('coins, host_trial_used_at, subscription_plan, subscription_expires_at').eq('id', user.id).single(),
        supabase.from('user_subscriptions').select('plan, status, expires_at').eq('user_id', user.id).in('plan', ['host_pro', 'host_max']).in('status', ['active', 'grace']).order('expires_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('tiktok_connections').select('open_id, display_name, avatar_url, created_at').eq('user_id', user.id).maybeSingle(),
      ]);
      const now = Date.now();
      const profileSubscription = ['host_pro', 'host_max'].includes(hostProfile?.subscription_plan)
        && (!hostProfile.subscription_expires_at || new Date(hostProfile.subscription_expires_at).getTime() > now);
      const hasHostSubscription = Boolean(hostSubscription) || profileSubscription;
      return json({
        trialAvailable: !hostProfile?.host_trial_used_at,
        trialMinutes: 30,
        coinCost: 50,
        intervalMinutes: 30,
        coins: Number(hostProfile?.coins ?? 0),
        hostSubscription: hasHostSubscription,
        subscriptionExpiresAt: hostSubscription?.expires_at ?? hostProfile?.subscription_expires_at ?? null,
        tiktok: tiktok ? { connected: true, openId: tiktok.open_id, displayName: tiktok.display_name, avatarUrl: tiktok.avatar_url, connectedAt: tiktok.created_at } : { connected: false },
      });
    }

    // ── create_room ──────────────────────────────────────
    if (action === 'create_room') {
      const title = (body.title as string)?.trim() || 'تحدي قدها المباشر';
      const code = roomCode();
      const socialProvider = body.socialProvider === 'tiktok' ? 'tiktok' : null;
      const socialAccountId = socialProvider === 'tiktok' ? String(body.socialAccountId ?? '') : null;
      const { data, error } = await supabase.rpc('create_host_room_atomic', {
        p_host_id: user.id,
        p_code: code,
        p_title: title,
        p_social_provider: socialProvider,
        p_social_account_id: socialAccountId,
        p_coin_cost: 50,
        p_interval_seconds: 1800,
      });
      if (error) {
        const message = error.message ?? '';
        if (message.includes('INSUFFICIENT_COINS')) return json({ error: 'رصيد الكوين غير كافٍ. اشترِ كوين أو فعّل مضيف برو.', code: 'INSUFFICIENT_COINS' }, 402);
        if (message.includes('ACTIVE_HOST_ROOM_EXISTS')) return json({ error: 'لديك غرفة مضيف نشطة بالفعل. أنهِها قبل إنشاء غرفة جديدة.', code: 'ACTIVE_HOST_ROOM_EXISTS' }, 409);
        if (message.includes('TIKTOK')) return json({ error: 'اربط حساب TikTok أولاً لتفعيل الربط الاجتماعي للغرفة.', code: message.includes('NOT_CONNECTED') ? 'TIKTOK_NOT_CONNECTED' : 'TIKTOK_ACCOUNT_REQUIRED' }, 409);
        if (message.includes('ROOM_CODE_CONFLICT')) return json({ error: 'تعذر حجز رمز الغرفة. حاول مرة أخرى.', code: 'ROOM_CODE_CONFLICT' }, 409);
        return json({ error: 'تعذر إنشاء الغرفة بأمان.', code: 'HOST_ROOM_CREATE_FAILED' }, 503);
      }
      const room = data as Record<string, unknown>;
      return json({ room: {
        id: String(room.room_id),
        code: String(room.code),
        title: String(room.title),
        status: room.status as 'waiting',
        hostId: String(room.host_id),
        accessMode: String(room.access_mode),
        nextChargeAt: (room.next_charge_at as string | null) ?? null,
        coinCost: Number(room.coin_cost ?? 50),
        intervalSeconds: Number(room.interval_seconds ?? 1800),
        socialProvider: (room.social_provider as string | null) ?? null,
        socialAccountId: (room.social_account_id as string | null) ?? null,
        coins: Number(room.coins ?? 0),
      } });
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
      if (await hasBlockedRoomMember(supabase, room.id, user.id)) return json({ error: 'لا يمكن الانضمام إلى غرفة تضم مستخدمًا محظورًا.' }, 403);

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
      await supabase.rpc('end_host_room_session', { p_room_id: roomId });

      return json({ ok: true });
    }

    // ── go_live ──────────────────────────────────────────
    if (action === 'go_live') {
      const roomId = body.roomId as string;
      if (!roomId) return json({ error: 'roomId required' }, 400);

      const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      if (!room) return json({ error: 'Room not found' }, 404);
      if (room.host_id !== user.id) return json({ error: 'Only host' }, 403);
      if (await hasBlockedRoomMember(supabase, roomId, user.id)) return json({ error: 'أزل المشاركين المرتبطين بحظر قبل بدء البث.' }, 403);
      const billing = await billHostRoom(supabase, roomId);
      if (!billing.active) return hostBillingError(billing.reason);

      await supabase
        .from('rooms')
        .update({ status: 'live', started_at: new Date().toISOString() })
        .eq('id', roomId);

      return json({ ok: true, status: 'live' });
    }

    // ── host_heartbeat ───────────────────────────────────
    if (action === 'host_heartbeat') {
      const roomId = String(body.roomId ?? '');
      if (!roomId) return json({ error: 'roomId required' }, 400);
      const { data: room } = await supabase.from('rooms').select('host_id').eq('id', roomId).maybeSingle();
      if (!room) return json({ error: 'Room not found' }, 404);
      if (room.host_id !== user.id) return json({ error: 'Only host' }, 403);
      const billing = await billHostRoom(supabase, roomId);
      if (!billing.active) return hostBillingError(billing.reason);
      return json({ ok: true, billing });
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

      if (room.host_id === user.id) {
        const billing = await billHostRoom(supabase, roomId);
        if (!billing.active) return hostBillingError(billing.reason);
      }

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
      if (await hasBlockedRoomMember(supabase, roomId, user.id)) return json({ error: 'لا يمكن إصدار رمز صوت داخل غرفة تضم مستخدمًا محظورًا.' }, 403);

      const isHost = room.host_id === user.id || membership?.is_host === true;
  const canPublish = isHost; // client cannot escalate publish rights

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

      const { data: room } = await supabase
        .from('rooms')
        .select('host_id')
        .eq('id', roomId)
        .maybeSingle();
      if (!room) return json({ error: 'Room not found' }, 404);

      const { data: membership } = await supabase
        .from('room_participants')
        .select('user_id')
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (room.host_id !== user.id && !membership) {
        return json({ error: 'Not a room participant' }, 403);
      }

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
