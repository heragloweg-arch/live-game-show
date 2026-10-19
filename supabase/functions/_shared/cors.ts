const configuredOrigin = Deno.env.get('CORS_ALLOWED_ORIGIN') ?? Deno.env.get('TIKTOK_APP_ORIGIN') ?? 'https://qaddaha.app';

export const corsHeaders = {
  'Access-Control-Allow-Origin': configuredOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Vary': 'Origin',
};

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
