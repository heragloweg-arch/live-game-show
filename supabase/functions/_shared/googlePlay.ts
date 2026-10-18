/**
 * Google Play Developer API — subscription verification (production).
 * Secrets:
 *   GOOGLE_PLAY_PACKAGE_NAME=com.qaddaha.challenges
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=<full service account JSON string>
 */

export interface PlayVerifyResult {
  ok: boolean;
  error?: string;
  expiryTimeMillis?: string;
  paymentState?: number;
  raw?: unknown;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function base64url(data: Uint8Array | string): string {
  const s = typeof data === 'string' ? data : String.fromCharCode(...data);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    toArrayBuffer(binary),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function getAccessToken(sa: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const key = await importPrivateKey(sa.private_key);
  const sigInput = new TextEncoder().encode(`${header}.${claim}`);
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, toArrayBuffer(sigInput));
  const jwt = `${header}.${claim}.${base64url(new Uint8Array(sigBuf))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(data.error_description || data.error || 'Failed to get Google access token');
  }
  return data.access_token as string;
}

/**
 * Verify subscription purchase token via Android Publisher API v3.
 */
export async function verifySubscriptionPurchase(
  productId: string,
  purchaseToken: string
): Promise<PlayVerifyResult> {
  if (!productId || !purchaseToken || purchaseToken.length > 4096) {
    return { ok: false, error: 'Invalid Google Play purchase details' };
  }
  const current = await getSubscriptionPurchaseV2(purchaseToken);
  if (!current.ok || !current.purchase) return { ok: false, error: current.error || 'Play verification failed' };
  const purchase = current.purchase as any;
  const lineItems = Array.isArray(purchase.lineItems) ? purchase.lineItems : [];
  const line = lineItems.find((item: any) => item?.productId === productId);
  if (!line) return { ok: false, error: 'Purchase product does not match the requested product', raw: { subscriptionState: purchase.subscriptionState } };
  const expiryText = typeof line.expiryTime === 'string' ? line.expiryTime : '';
  const expiryMs = Date.parse(expiryText);
  if (!Number.isFinite(expiryMs)) return { ok: false, error: 'Google Play did not return a valid subscription expiry' };
  if (expiryMs <= Date.now()) return { ok: false, error: 'Subscription expired', expiryTimeMillis: String(expiryMs) };
  const state = String(purchase.subscriptionState || '');
  if (!['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'].includes(state)) {
    return { ok: false, error: 'Subscription is not entitled in its current Play state', raw: { subscriptionState: state } };
  }
  return {
    ok: true,
    expiryTimeMillis: String(expiryMs),
    paymentState: undefined,
    raw: purchase,
  };
}

export interface PlaySubscriptionV2Result {
  ok: boolean;
  error?: string;
  purchase?: Record<string, unknown>;
}

/** Fetch authoritative current subscription state for RTDN reconciliation. */
export async function getSubscriptionPurchaseV2(purchaseToken: string): Promise<PlaySubscriptionV2Result> {
  const packageName = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME');
  const saRaw = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if (!packageName || !saRaw) return { ok: false, error: 'Google Play server credentials are not configured' };
  let sa: { client_email: string; private_key: string };
  try { sa = JSON.parse(saRaw); }
  catch { return { ok: false, error: 'Invalid Google Play service-account JSON' }; }
  try {
    const token = await getAccessToken(sa);
    const endpoint = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
      + encodeURIComponent(packageName) + '/purchases/subscriptionsv2/tokens/' + encodeURIComponent(purchaseToken);
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    const body = await response.json();
    if (!response.ok) {
      return { ok: false, error: typeof body?.error?.message === 'string' ? body.error.message : `Play API ${response.status}` };
    }
    return { ok: true, purchase: body as Record<string, unknown> };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Google Play API request failed' };
  }
}


export interface PlayAcknowledgeResult {
  ok: boolean;
  alreadyAcknowledged?: boolean;
  error?: string;
}

/** Acknowledge a verified subscription purchase so Google Play does not refund it for non-acknowledgement. */
export async function acknowledgeSubscriptionPurchase(
  productId: string,
  purchaseToken: string,
  currentPurchase?: Record<string, unknown>
): Promise<PlayAcknowledgeResult> {
  const packageName = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME');
  const saRaw = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if (!packageName || !saRaw) return { ok: false, error: 'Google Play credentials are not configured' };
  let purchase = currentPurchase;
  if (!purchase) {
    const current = await getSubscriptionPurchaseV2(purchaseToken);
    if (!current.ok || !current.purchase) return { ok: false, error: current.error || 'Unable to read Play acknowledgement state' };
    purchase = current.purchase;
  }
  if (purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') {
    return { ok: true, alreadyAcknowledged: true };
  }
  let sa: { client_email: string; private_key: string };
  try { sa = JSON.parse(saRaw); }
  catch { return { ok: false, error: 'Invalid Google Play service-account JSON' }; }
  try {
    const token = await getAccessToken(sa);
    const endpoint = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
      + encodeURIComponent(packageName) + '/purchases/subscriptions/'
      + encodeURIComponent(productId) + '/tokens/' + encodeURIComponent(purchaseToken) + ':acknowledge';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) return { ok: true };
    const payload = await response.json().catch(() => ({}));
    return { ok: false, error: typeof payload?.error?.message === 'string' ? payload.error.message : `Play acknowledgement API ${response.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Google Play acknowledgement failed' };
  }
}

export interface PlayProductVerifyResult {
  ok: boolean;
  error?: string;
  purchaseState?: number;
  acknowledgementState?: number;
  orderId?: string;
  raw?: Record<string, unknown>;
}

/** Verify a one-time in-app product purchase via Android Publisher API v3. */
export async function verifyProductPurchase(
  productId: string,
  purchaseToken: string,
): Promise<PlayProductVerifyResult> {
  if (!productId || !purchaseToken || purchaseToken.length > 4096) {
    return { ok: false, error: 'Invalid Google Play product details' };
  }
  const packageName = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME');
  const saRaw = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if (!packageName || !saRaw) return { ok: false, error: 'Google Play server credentials are not configured' };
  let sa: { client_email: string; private_key: string };
  try { sa = JSON.parse(saRaw); }
  catch { return { ok: false, error: 'Invalid Google Play service-account JSON' }; }
  try {
    const token = await getAccessToken(sa);
    const endpoint = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
      + encodeURIComponent(packageName) + '/purchases/products/'
      + encodeURIComponent(productId) + '/tokens/' + encodeURIComponent(purchaseToken);
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    const body = await response.json();
    if (!response.ok) {
      return { ok: false, error: typeof body?.error?.message === 'string' ? body.error.message : `Play API ${response.status}` };
    }
    if (Number(body.purchaseState) !== 0) {
      return { ok: false, error: 'Google Play product is not in a purchased state', raw: body };
    }
    return {
      ok: true,
      purchaseState: Number(body.purchaseState),
      acknowledgementState: Number(body.acknowledgementState),
      orderId: typeof body.orderId === 'string' ? body.orderId : undefined,
      raw: body as Record<string, unknown>,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Google Play product verification failed' };
  }
}

/** Acknowledge a verified one-time product purchase. */
export async function acknowledgeProductPurchase(
  productId: string,
  purchaseToken: string,
): Promise<PlayAcknowledgeResult> {
  const packageName = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME');
  const saRaw = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if (!packageName || !saRaw) return { ok: false, error: 'Google Play credentials are not configured' };
  let sa: { client_email: string; private_key: string };
  try { sa = JSON.parse(saRaw); }
  catch { return { ok: false, error: 'Invalid Google Play service-account JSON' }; }
  try {
    const token = await getAccessToken(sa);
    const endpoint = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
      + encodeURIComponent(packageName) + '/purchases/products/'
      + encodeURIComponent(productId) + '/tokens/' + encodeURIComponent(purchaseToken) + ':acknowledge';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) return { ok: true };
    const payload = await response.json().catch(() => ({}));
    return { ok: false, error: typeof payload?.error?.message === 'string' ? payload.error.message : `Play acknowledgement API ${response.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Google Play product acknowledgement failed' };
  }
}
