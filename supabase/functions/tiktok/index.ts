/**
 * TikTok Login Kit connection for host/creator rooms.
 * Secrets stay on the Edge Function:
 *   TIKTOK_CLIENT_KEY
 *   TIKTOK_CLIENT_SECRET
 *   TIKTOK_REDIRECT_URI (static HTTPS callback registered in TikTok)
 *
 * Actions: start | status | disconnect
 * The OAuth callback is handled by the same function through GET.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors, serveWithCors } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function htmlCallback(payload: Record<string, unknown>, origin: string) {
  const safePayload = JSON.stringify(payload).replace(/</g, '\\u003c');
  const safeOrigin = JSON.stringify(origin);
  return new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>قدها · TikTok</title><body style="font-family:system-ui;background:#111;color:#fff;display:grid;place-items:center;min-height:100vh"><main><h1>قدها</h1><p>يمكنك إغلاق هذه النافذة والعودة للتطبيق.</p></main><script>const payload=${safePayload};const origin=${safeOrigin};if(window.opener){window.opener.postMessage(payload,origin)}setTimeout(()=>window.close(),300)</script></body></html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function publicOrigin() {
  const configured = Deno.env.get('TIKTOK_APP_ORIGIN') ?? '';
  if (configured.startsWith('https://')) return configured.replace(/\/$/, '');
  const redirect = Deno.env.get('TIKTOK_REDIRECT_URI') ?? '';
  try { return new URL(redirect).origin; } catch { return '*'; }
}

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

async function currentUser(req: Request, supabase: any) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  return error || !user ? null : user;
}

async function callback(req: Request, supabase: any) {
  const url = new URL(req.url);
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  const errorDescription = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  const origin = publicOrigin();
  if (!state) return htmlCallback({ source: 'qaddaha:tiktok', ok: false, error: 'حالة الربط غير موجودة.' }, origin);

  const { data: stateRow, error: stateError } = await supabase
    .from('tiktok_oauth_states')
    .select('state, user_id, expires_at, consumed_at')
    .eq('state', state)
    .maybeSingle();
  if (stateError || !stateRow || stateRow.consumed_at || new Date(stateRow.expires_at).getTime() <= Date.now()) {
    return htmlCallback({ source: 'qaddaha:tiktok', ok: false, error: 'انتهت صلاحية جلسة الربط. ابدأ المحاولة من جديد.' }, origin);
  }
  await supabase.from('tiktok_oauth_states').update({ consumed_at: new Date().toISOString() }).eq('state', state);
  if (errorDescription || !code) {
    return htmlCallback({ source: 'qaddaha:tiktok', ok: false, error: errorDescription || 'لم تتم الموافقة على الربط.' }, origin);
  }

  const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY') ?? '';
  const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET') ?? '';
  const redirectUri = Deno.env.get('TIKTOK_REDIRECT_URI') ?? '';
  if (!clientKey || !clientSecret || !redirectUri) {
    return htmlCallback({ source: 'qaddaha:tiktok', ok: false, error: 'تكامل TikTok غير مهيأ على الخادم.' }, origin);
  }

  try {
    const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    const tokenBody = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenBody.access_token || !tokenBody.open_id) {
      return htmlCallback({ source: 'qaddaha:tiktok', ok: false, error: 'تعذر إكمال مصادقة TikTok.' }, origin);
    }

    const fields = 'open_id,display_name,avatar_url';
    const userResponse = await fetch(`https://open.tiktokapis.com/v2/user/info/?fields=${fields}`, {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
    });
    const userBody = await userResponse.json();
    if (!userResponse.ok || !userBody?.data?.user?.open_id) {
      return htmlCallback({ source: 'qaddaha:tiktok', ok: false, error: 'تمت المصادقة لكن تعذر قراءة ملف TikTok.' }, origin);
    }
    const tiktokUser = userBody.data.user;
    const scopes = typeof tokenBody.scope === 'string' ? tokenBody.scope.split(',').map((x: string) => x.trim()).filter(Boolean) : ['user.info.basic'];
    const now = new Date();
    const accessExpiresAt = tokenBody.expires_in ? new Date(now.getTime() + Number(tokenBody.expires_in) * 1000).toISOString() : null;
    const refreshExpiresAt = tokenBody.refresh_expires_in ? new Date(now.getTime() + Number(tokenBody.refresh_expires_in) * 1000).toISOString() : null;
    const { error: upsertError } = await supabase.from('tiktok_connections').upsert({
      user_id: stateRow.user_id,
      open_id: tiktokUser.open_id,
      display_name: tiktokUser.display_name ?? null,
      avatar_url: tiktokUser.avatar_url ?? null,
      scopes,
      access_token: tokenBody.access_token,
      refresh_token: tokenBody.refresh_token ?? null,
      access_token_expires_at: accessExpiresAt,
      refresh_token_expires_at: refreshExpiresAt,
      updated_at: now.toISOString(),
    }, { onConflict: 'user_id' });
    if (upsertError) return htmlCallback({ source: 'qaddaha:tiktok', ok: false, error: 'تعذر حفظ الربط بأمان.' }, origin);
    return htmlCallback({ source: 'qaddaha:tiktok', ok: true, displayName: tiktokUser.display_name ?? null, avatarUrl: tiktokUser.avatar_url ?? null }, origin);
  } catch (error) {
    console.error('[tiktok] callback', error);
    return htmlCallback({ source: 'qaddaha:tiktok', ok: false, error: 'تعذر الاتصال بخدمة TikTok الآن.' }, origin);
  }
}

serveWithCors(async (req) => {
  if (req.method === 'OPTIONS') return handleCors(req) ?? new Response(null, { status: 204, headers: corsHeaders });
  const supabase = serviceClient();
  if (req.method === 'GET') return callback(req, supabase);
  const cors = handleCors(req);
  if (cors) return cors;

  const user = await currentUser(req, supabase);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  try {
    const body = await req.json();
    const action = String(body.action ?? '');
    if (action === 'start') {
      const rate = await enforceRateLimit(supabase, user.id, 'tiktok:start', 5, 600);
      if (!rate.allowed) return json({ error: 'تم تجاوز محاولات ربط TikTok، حاول بعد قليل.', code: 'RATE_LIMITED' }, 429);
      const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY') ?? '';
      const redirectUri = Deno.env.get('TIKTOK_REDIRECT_URI') ?? '';
      if (!clientKey || !Deno.env.get('TIKTOK_CLIENT_SECRET') || !redirectUri || !redirectUri.startsWith('https://')) {
        return json({ error: 'TikTok OAuth غير مهيأ: أضف مفاتيح التطبيق وRedirect URI HTTPS.' }, 503);
      }
      const stateBytes = new Uint8Array(24);
      crypto.getRandomValues(stateBytes);
      const state = `${crypto.randomUUID()}-${Array.from(stateBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
      await supabase.from('tiktok_oauth_states').delete().eq('user_id', user.id).lt('expires_at', new Date().toISOString());
      const { error } = await supabase.from('tiktok_oauth_states').insert({
        state,
        user_id: user.id,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (error) return json({ error: 'تعذر بدء جلسة TikTok.' }, 503);
      const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
      authUrl.search = new URLSearchParams({
        client_key: clientKey,
        scope: 'user.info.basic',
        response_type: 'code',
        redirect_uri: redirectUri,
        state,
      }).toString();
      return json({ authorizationUrl: authUrl.toString() });
    }
    if (action === 'status') {
      const { data } = await supabase.from('tiktok_connections').select('open_id, display_name, avatar_url, scopes, created_at, updated_at').eq('user_id', user.id).maybeSingle();
      return json({ connected: Boolean(data), connection: data ?? null });
    }
    if (action === 'disconnect') {
      await supabase.from('tiktok_connections').delete().eq('user_id', user.id);
      return json({ ok: true });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('[tiktok]', error);
    return json({ error: 'TikTok request failed' }, 500);
  }
});
