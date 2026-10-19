import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Account service is not configured' }, 503);
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user || user.is_anonymous) return json({ error: 'Valid signed-in account required' }, 401);

  const rate = await enforceRateLimit(supabase, user.id, 'account:delete', 2, 3600);
  if (!rate.allowed) return json({ error: 'تم تجاوز محاولات حذف الحساب، حاول لاحقًا.', code: 'RATE_LIMITED' }, 429);

  let body: { action?: string; confirmation?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  if (body.action !== 'delete_account' || body.confirmation !== 'DELETE_ACCOUNT') {
    return json({ error: 'تأكيد حذف الحساب غير صحيح.', code: 'CONFIRMATION_REQUIRED' }, 400);
  }

  const { error: cleanupError } = await supabase.rpc('delete_account_data_atomic', { p_user_id: user.id });
  if (cleanupError) {
    console.error('[account] cleanup failed', cleanupError);
    return json({ error: 'تعذر تجهيز بيانات الحساب للحذف. لم يتم حذف الحساب.', code: 'DELETE_PREPARATION_FAILED' }, 500);
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('[account] auth delete failed', deleteError);
    return json({ error: 'تم تنظيف بيانات الحساب لكن تعذر إغلاق هوية الدخول. تواصل مع الدعم.', code: 'AUTH_DELETE_FAILED' }, 502);
  }
  return json({ ok: true });
});
