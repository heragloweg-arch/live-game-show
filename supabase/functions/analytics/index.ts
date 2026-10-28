import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { serveWithCors } from '../_shared/cors.ts';

const configuredOrigin = Deno.env.get('CORS_ALLOWED_ORIGIN') ?? Deno.env.get('TIKTOK_APP_ORIGIN') ?? 'https://qaddaha.app';
const corsHeaders = {
  'Access-Control-Allow-Origin': configuredOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

serveWithCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authorization = req.headers.get('Authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return json({ error: 'Analytics service is not configured' }, 503);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await admin.auth.getUser(authorization.slice(7));
    if (authError || !user) return json({ error: 'Invalid token' }, 401);

    const body = await req.json().catch(() => null);
    if (!body || body.action !== 'app_open') return json({ error: 'Unsupported action' }, 400);
    const sessionId = body.sessionId;
    if (typeof sessionId !== 'string' || sessionId.length < 8 || sessionId.length > 100 || !/^[A-Za-z0-9_-]+$/.test(sessionId)) {
      return json({ error: 'Invalid session id' }, 400);
    }

    const { data, error } = await admin.rpc('record_app_open_atomic', {
      p_user_id: user.id,
      p_session_id: sessionId,
    });
    if (error) {
      console.error('[analytics] app_open recording failed', error);
      return json({ error: 'Unable to record app session' }, 503);
    }
    return json(data ?? { ok: false }, 200);
  } catch (error) {
    console.error('[analytics] request failed', error);
    return json({ error: 'Unexpected analytics error' }, 500);
  }
});
