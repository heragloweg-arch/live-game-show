/**
 * Teams — manage roster + queue team vs team (1–5 per side)
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { serveWithCors } from '../_shared/cors.ts';
const configuredOrigin = Deno.env.get('CORS_ALLOWED_ORIGIN') ?? Deno.env.get('TIKTOK_APP_ORIGIN') ?? 'https://qaddaha.app';
const corsHeaders = {
  'Access-Control-Allow-Origin': configuredOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Vary': 'Origin',
};
function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function code6() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

serveWithCors(async (req) => {
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
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Invalid token' }, 401);

    const body = await req.json();
    const action = body.action as string;

    if (action === 'my_team') {
      const { data: mem } = await supabase.from('team_members').select('team_id, role').eq('user_id', user.id).maybeSingle();
      if (!mem) return json({ team: null });
      const { data: team } = await supabase.from('teams').select('*').eq('id', mem.team_id).single();
      const { data: members } = await supabase
        .from('team_members')
        .select('user_id, role, joined_at, profile:profiles(username, display_name, avatar_url)')
        .eq('team_id', mem.team_id);
      return json({ team, role: mem.role, members: members ?? [] });
    }

    if (action === 'create') {
      const name = String(body.name || 'فريق قدها').slice(0, 40);
      const maxMembers = Math.min(5, Math.max(1, Number(body.maxMembers) || 5));
      const { data: team, error } = await supabase.from('teams').insert({
        name,
        invite_code: code6(),
        owner_id: user.id,
        max_members: maxMembers,
      }).select().single();
      if (error) return json({ error: error.message }, 500);
      await supabase.from('team_members').insert({ team_id: team.id, user_id: user.id, role: 'owner' });
      return json({ team });
    }

    if (action === 'join') {
      const code = String(body.code || '').trim().toUpperCase();
      const { data: team } = await supabase.from('teams').select('*').eq('invite_code', code).maybeSingle();
      if (!team) return json({ error: 'رمز غير صالح' }, 404);
      const { count } = await supabase.from('team_members').select('*', { count: 'exact', head: true }).eq('team_id', team.id);
      if ((count ?? 0) >= team.max_members) return json({ error: 'الفريق ممتلئ' }, 400);
      // one team per user
      await supabase.from('team_members').delete().eq('user_id', user.id);
      await supabase.from('team_members').insert({ team_id: team.id, user_id: user.id, role: 'member' });
      return json({ team });
    }

    if (action === 'leave') {
      await supabase.from('team_match_queue').delete().eq('owner_id', user.id);
      await supabase.from('team_members').delete().eq('user_id', user.id);
      return json({ ok: true });
    }

    if (action === 'set_size') {
      const size = Math.min(5, Math.max(1, Number(body.maxMembers) || 5));
      const { data: mem } = await supabase.from('team_members').select('team_id, role').eq('user_id', user.id).maybeSingle();
      if (!mem || mem.role !== 'owner') return json({ error: 'المالك فقط' }, 403);
      await supabase.from('teams').update({ max_members: size }).eq('id', mem.team_id);
      return json({ ok: true, maxMembers: size });
    }

    if (action === 'queue') {
      const difficulty = ['easy', 'normal', 'hard'].includes(body.difficulty) ? body.difficulty : 'normal';
      const { data: mem } = await supabase.from('team_members').select('team_id, role').eq('user_id', user.id).maybeSingle();
      if (!mem) return json({ error: 'انضم لفريق أولاً' }, 400);
      if (mem.role !== 'owner') return json({ error: 'قائد الفريق فقط يبدأ الطابور' }, 403);

      const { data, error } = await supabase.rpc('queue_team_match_atomic', {
        p_user_id: user.id,
        p_team_id: mem.team_id,
        p_difficulty: difficulty,
      });
      if (error || !data || !['queued', 'matched'].includes(data.status)) {
        console.error('[team] atomic queue failed', error ?? data);
        return json({ error: 'تعذر إتمام مطابقة الفريق بأمان. حاول مرة أخرى.' }, 503);
      }
      if (data.status === 'matched') return json({ status: 'matched', matchId: data.matchId, alreadyMatched: !!data.alreadyMatched });
      if (data.reason === 'NOT_ENOUGH_PLAYABLE_CHALLENGES') {
        return json({ status: 'queued', teamSize: data.teamSize, code: data.reason, message: 'نبحث عن منافس؛ لا تتوفر حاليًا خمس جولات معتمدة.' });
      }
      return json({ status: 'queued', teamSize: data.teamSize, message: 'بانتظار فريق منافس…' });
    }

    if (action === 'queue_status') {
      const { data: mem } = await supabase.from('team_members').select('team_id').eq('user_id', user.id).maybeSingle();
      if (!mem) return json({ status: 'idle' });
      const { data: q } = await supabase.from('team_match_queue').select('*').eq('team_id', mem.team_id).maybeSingle();
      if (!q) return json({ status: 'idle' });
      return json({ status: q.status, matchId: q.match_id, teamSize: q.team_size });
    }

    if (action === 'cancel_queue') {
      const { data: mem } = await supabase.from('team_members').select('team_id').eq('user_id', user.id).maybeSingle();
      if (mem) await supabase.from('team_match_queue').delete().eq('team_id', mem.team_id);
      return json({ status: 'cancelled' });
    }


    if (action === 'pickup') {
      const desired = Math.min(5, Math.max(1, Number(body.desiredSize) || 5));
      const difficulty = ['easy', 'normal', 'hard'].includes(body.difficulty) ? body.difficulty : 'normal';
      const { data, error } = await supabase.rpc('join_team_pickup_atomic', {
        p_user_id: user.id,
        p_desired_size: desired,
        p_difficulty: difficulty,
      });
      if (error) {
        if (error.message?.includes('TEAM_OWNER_CANNOT_PICKUP')) {
          return json({ error: 'انقل ملكية فريقك الحالي أو اتركه قبل الدخول إلى التجميع السريع.' }, 409);
        }
        console.error('[team] atomic pickup failed', error);
        return json({ error: 'تعذر تجميع الفريق بأمان. حاول مرة أخرى.' }, 503);
      }
      if (!data) return json({ error: 'تعذر قراءة حالة التجميع.' }, 503);
      if (data.status === 'team_ready') {
        return json({ status: 'team_ready', teamId: data.teamId, size: data.size, message: 'اكتمل الفريق — اطلب المباراة من القائد' });
      }
      return json({ status: 'waiting', size: data.size, waiting: data.waiting ?? 0, need: data.need ?? desired });
    }

    if (action === 'pickup_cancel') {
      await supabase.from('team_pickup_queue').delete().eq('user_id', user.id);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
