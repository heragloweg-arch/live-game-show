import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const configuredOrigins = (Deno.env.get('CORS_ALLOWED_ORIGIN') ?? Deno.env.get('TIKTOK_APP_ORIGIN') ?? 'https://qaddaha.app')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  ...configuredOrigins,
  'https://qaddaha.app',
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'http://127.0.0.1',
  'https://127.0.0.1',
]);

const fallbackOrigin = configuredOrigins[0] ?? 'https://qaddaha.app';

// Railway domains can be regenerated without changing the Supabase function
// deployment. Accept only the platform's HTTPS hostname shape, never an
// arbitrary origin or a wildcard.
function isTrustedRailwayOrigin(origin: string): boolean {
  return /^https:\/\/[a-z0-9][a-z0-9-]*\.up\.railway\.app$/i.test(origin);
}

export function getCorsHeaders(req?: Request): Record<string, string> {
  const requestOrigin = req?.headers.get('Origin') ?? '';
  const origin = requestOrigin && (allowedOrigins.has(requestOrigin) || isTrustedRailwayOrigin(requestOrigin))
    ? requestOrigin
    : fallbackOrigin;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Vary': 'Origin',
  };
}

// Kept for existing response helpers. serveWithCors applies the request-specific value.
export const corsHeaders = getCorsHeaders();

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }
  return null;
}

/**
 * Wraps any Edge Function response so success and error JSON responses carry the
 * same request-specific CORS header. This is important for Capacitor's
 * https://localhost origin while retaining the Railway/web allowlist.
 */
export function serveWithCors(handler: (req: Request) => Response | Promise<Response>) {
  return serve(async (req) => {
    const response = await handler(req);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(getCorsHeaders(req))) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  });
}
