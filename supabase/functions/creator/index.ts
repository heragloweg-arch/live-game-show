/**
 * Creator Mode — submit challenges for QA, list own, enable creator flag
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { normalizeArabic } from '../_shared/arabic.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Invalid token' }, 401);

    const body = await req.json();
    const action = body.action as string;

    if (action === 'enable') {
      const bio = String(body.bio || '').slice(0, 200);
      await supabase.from('profiles').update({ is_creator: true, creator_bio: bio || null }).eq('id', user.id);
      return json({ ok: true, isCreator: true });
    }

    if (action === 'status') {
      const { data: prof } = await supabase
        .from('profiles')
        .select('is_creator, creator_bio, display_name')
        .eq('id', user.id)
        .single();
      const { count } = await supabase
        .from('creator_challenges')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', user.id);
      return json({
        isCreator: !!prof?.is_creator,
        bio: prof?.creator_bio,
        submissions: count ?? 0,
      });
    }

    if (action === 'list') {
      const { data } = await supabase
        .from('creator_challenges')
        .select('*')
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      return json({ items: data ?? [] });
    }

    if (action === 'submit') {
      const { data: prof } = await supabase.from('profiles').select('is_creator').eq('id', user.id).single();
      if (!prof?.is_creator) return json({ error: 'فعّل وضع المبدع أولاً' }, 403);
      const prompt = String(body.prompt || '').trim();
      if (prompt.length < 8) return json({ error: 'نص السؤال قصير جداً' }, 400);
      const answers = Array.isArray(body.answers)
        ? body.answers.map((a: string) => String(a).trim()).filter(Boolean).slice(0, 8)
        : [];
      if (!answers.length) return json({ error: 'أضف إجابة واحدة على الأقل' }, 400);

      const { data, error } = await supabase.from('creator_challenges').insert({
        creator_id: user.id,
        type: body.type || 'knowledge',
        subtype: body.subtype || null,
        prompt,
        difficulty: body.difficulty || 'normal',
        time_limit_ms: Number(body.timeLimitMs) || 12000,
        letter_pool: body.letterPool || null,
        accepted_answers: answers.map((a: string) => normalizeArabic(a)),
        status: 'pending',
      }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ item: data });
    }

    // Admin approve → publish into challenges bank

    if (action === 'list_pending') {
      const admins = (Deno.env.get('TOURNAMENT_ADMIN_IDS') || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!admins.includes(user.id)) return json({ error: 'Admin only' }, 403);
      const { data } = await supabase
        .from('creator_challenges')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(100);
      return json({ items: data ?? [] });
    }

    if (action === 'approve') {
      const admins = (Deno.env.get('TOURNAMENT_ADMIN_IDS') || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!admins.includes(user.id)) return json({ error: 'Admin only' }, 403);
      const id = body.id as string;
      const { data: row } = await supabase.from('creator_challenges').select('*').eq('id', id).single();
      if (!row) return json({ error: 'Not found' }, 404);

      const { data: ch, error: chErr } = await supabase.from('challenges').insert({
        type: row.type,
        subtype: row.subtype,
        prompt: row.prompt,
        difficulty: row.difficulty,
        time_limit_ms: row.time_limit_ms,
        letter_pool: row.letter_pool,
        active: true,
        qa_status: 'approved',
        weight: 12,
      }).select().single();
      if (chErr) return json({ error: chErr.message }, 500);

      for (const ans of row.accepted_answers || []) {
        await supabase.from('challenge_answers').insert({
          challenge_id: ch.id,
          accepted_answer: ans,
          normalized_answer: normalizeArabic(ans),
        });
      }
      await supabase.from('creator_challenges').update({
        status: 'approved',
        published_challenge_id: ch.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', id);
      return json({ ok: true, challengeId: ch.id });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
