/**
 * Couples — create invite, join by code, status, dissolve
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function code6() {
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

    const body = await req.json();
    const action = body.action as string;

    if (action === 'status') {
      const { data } = await supabase
        .from('couples')
        .select('*, a:profiles!couples_user_a_fkey(id, username, display_name, avatar_url), b:profiles!couples_user_b_fkey(id, username, display_name, avatar_url)')
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .in('status', ['pending', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return json({ couple: data });
    }

    if (action === 'create') {
      // dissolve previous pending of this user as A
      await supabase.from('couples').update({ status: 'dissolved' })
        .eq('user_a', user.id).eq('status', 'pending');

      let invite = code6();
      for (let i = 0; i < 5; i++) {
        const { data: exists } = await supabase.from('couples').select('id').eq('invite_code', invite).maybeSingle();
        if (!exists) break;
        invite = code6();
      }

      const { data, error } = await supabase.from('couples').insert({
        invite_code: invite,
        user_a: user.id,
        status: 'pending',
      }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ couple: data });
    }

    if (action === 'join') {
      const code = String(body.code ?? '').trim().toUpperCase();
      if (code.length < 4) return json({ error: 'رمز غير صالح' }, 400);

      const { data: row } = await supabase.from('couples').select('*').eq('invite_code', code).maybeSingle();
      if (!row) return json({ error: 'الرمز غير موجود' }, 404);
      if (row.status !== 'pending') return json({ error: 'هذه الدعوة لم تعد متاحة' }, 400);
      if (row.user_a === user.id) return json({ error: 'لا يمكن الانضمام لدعوتك' }, 400);
      if (row.user_b) return json({ error: 'الدعوة مستخدمة' }, 400);

      const { data, error } = await supabase.from('couples').update({
        user_b: user.id,
        status: 'active',
        updated_at: new Date().toISOString(),
      }).eq('id', row.id).eq('status', 'pending').select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ couple: data, ok: true });
    }

    if (action === 'dissolve') {
      await supabase.from('couples').update({ status: 'dissolved', updated_at: new Date().toISOString() })
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .in('status', ['pending', 'active']);
      return json({ ok: true });
    }

    if (action === 'record_play') {
      // Deprecated: couple stats update only via settle_match on mode=couple
      return json({ error: 'Use match settle — couple stats are server-side only', code: 'DEPRECATED' }, 410);
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
