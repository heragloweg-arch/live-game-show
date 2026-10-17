/** Authenticated Google Play RTDN Pub/Sub push handler. */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { getSubscriptionPurchaseV2 } from '../_shared/googlePlay.ts';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const b64urlBytes = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};
const b64Bytes = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const decodePart = (value: string) => JSON.parse(new TextDecoder().decode(b64urlBytes(value)));

let oidcKeys: JsonWebKey[] = [];
let oidcKeysFetchedAt = 0;
async function getGoogleOidcKeys(): Promise<JsonWebKey[]> {
  if (oidcKeys.length && Date.now() - oidcKeysFetchedAt < 45 * 60 * 1000) return oidcKeys;
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Google OIDC verification keys unavailable');
  const payload = await response.json();
  if (!Array.isArray(payload.keys)) throw new Error('Invalid Google OIDC key set');
  oidcKeys = payload.keys as JsonWebKey[];
  oidcKeysFetchedAt = Date.now();
  return oidcKeys;
}
async function verifyPubSubBearer(req: Request): Promise<boolean> {
  const expectedAudience = Deno.env.get('GOOGLE_PUBSUB_AUDIENCE') || '';
  const expectedEmail = Deno.env.get('GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL') || '';
  if (!expectedAudience || !expectedEmail) throw new Error('Pub/Sub OIDC secrets are not configured');
  const authorization = req.headers.get('Authorization') || '';
  const token = /^Bearer\s+([A-Za-z0-9._-]+)$/i.exec(authorization)?.[1];
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const header = decodePart(parts[0]) as { alg?: string; kid?: string };
  const claims = decodePart(parts[1]) as { iss?: string; aud?: string | string[]; email?: string; email_verified?: boolean | string; exp?: number; iat?: number };
  const now = Math.floor(Date.now() / 1000);
  const audienceOk = Array.isArray(claims.aud) ? claims.aud.includes(expectedAudience) : claims.aud === expectedAudience;
  if (header.alg !== 'RS256' || !header.kid || !audienceOk
      || !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss || '')
      || claims.email !== expectedEmail
      || !(claims.email_verified === true || claims.email_verified === 'true')
      || !Number.isFinite(claims.exp) || Number(claims.exp) <= now
      || !Number.isFinite(claims.iat) || Number(claims.iat) > now + 300) return false;
  const jwk = (await getGoogleOidcKeys()).find((key) => (key as JsonWebKey & { kid?: string }).kid === header.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  return await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]),
  );
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    if (!await verifyPubSubBearer(req)) return json({ error: 'Unauthorized Pub/Sub push' }, 401);
  } catch (error) {
    console.error('[google-play-rtdn] OIDC validation unavailable', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'Webhook authentication is not configured or unavailable' }, 503);
  }

  let envelope: any;
  try { envelope = await req.json(); }
  catch { return json({ error: 'Invalid Pub/Sub envelope' }, 400); }
  const message = envelope?.message;
  if (!message?.data || typeof message.data !== 'string') return json({ error: 'Missing Pub/Sub message data' }, 400);
  let notification: any;
  try { notification = JSON.parse(new TextDecoder().decode(b64Bytes(message.data))); }
  catch { return json({ error: 'Invalid RTDN payload' }, 400); }
  if (notification.testNotification) return json({ ok: true, testNotification: true });
  const expectedPackage = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME') || '';
  if (!expectedPackage) return json({ error: 'Google Play package is not configured' }, 503);
  if (notification.packageName !== expectedPackage) return json({ ok: true, ignored: 'package_mismatch' });
  const event = notification.subscriptionNotification;
  if (!event || typeof event.purchaseToken !== 'string' || typeof event.subscriptionId !== 'string') {
    return json({ ok: true, ignored: 'unsupported_notification' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server is not configured' }, 503);
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: receipt, error: receiptError } = await supabase.from('purchase_receipts')
    .select('user_id,product_id,status').eq('provider', 'google_play').eq('purchase_token', event.purchaseToken).maybeSingle();
  if (receiptError) {
    console.error('[google-play-rtdn] receipt lookup failed', receiptError.message);
    return json({ error: 'Unable to look up receipt' }, 503);
  }
  // RTDN must never create or transfer an account entitlement on its own.
  if (!receipt) return json({ ok: true, ignored: 'receipt_not_reserved' });
  if (receipt.product_id !== event.subscriptionId) return json({ ok: true, ignored: 'product_mismatch' });

  const current = await getSubscriptionPurchaseV2(event.purchaseToken);
  if (!current.ok || !current.purchase) {
    console.error('[google-play-rtdn] Play state lookup failed', current.error || 'no payload');
    return json({ error: 'Unable to fetch authoritative Play subscription state' }, 503);
  }
  const purchase = current.purchase as any;
  const lineItems = Array.isArray(purchase.lineItems) ? purchase.lineItems : [];
  const line = lineItems.find((item: any) => item?.productId === event.subscriptionId);
  if (!line) return json({ ok: true, ignored: 'product_not_in_current_purchase' });
  const expiryText = typeof line.expiryTime === 'string' ? line.expiryTime : '';
  const expiryMs = Date.parse(expiryText);
  if (!Number.isFinite(expiryMs)) return json({ error: 'Play subscription expiry is missing' }, 503);
  const state = String(purchase.subscriptionState || '');
  const autoRenew = line.autoRenewingPlan?.autoRenewEnabled === true;
  let status: 'active' | 'grace' | 'expired' | 'cancelled';
  if (state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' && expiryMs > Date.now()) status = 'grace';
  else if (expiryMs <= Date.now() || state === 'SUBSCRIPTION_STATE_EXPIRED') status = 'expired';
  else if (state === 'SUBSCRIPTION_STATE_ACTIVE' || state === 'SUBSCRIPTION_STATE_CANCELED') status = 'active';
  else status = 'cancelled';

  const { data: result, error: reconcileError } = await supabase.rpc('reconcile_google_play_subscription_atomic', {
    p_purchase_token: event.purchaseToken,
    p_status: status,
    p_expires_at: new Date(expiryMs).toISOString(),
    p_auto_renew: autoRenew,
  });
  if (reconcileError) {
    console.error('[google-play-rtdn] reconciliation failed', reconcileError.message);
    return json({ error: 'Subscription state could not be reconciled' }, 503);
  }
  if (result?.ok !== true) return json({ ok: true, ignored: result?.reason || 'subscription_not_found' });
  return json({ ok: true, reconciled: true, status, autoRenew });
});
