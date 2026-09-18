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
    binary,
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
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, sigInput);
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
  const packageName = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME');
  const saRaw = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if (!packageName || !saRaw) {
    return { ok: false, error: 'GOOGLE_PLAY secrets missing' };
  }

  let sa: { client_email: string; private_key: string };
  try {
    sa = JSON.parse(saRaw);
  } catch {
    return { ok: false, error: 'Invalid GOOGLE_PLAY_SERVICE_ACCOUNT_JSON' };
  }

  try {
    const token = await getAccessToken(sa);
    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
      `${encodeURIComponent(packageName)}/purchases/subscriptions/` +
      `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: body?.error?.message || `Play API ${res.status}`,
        raw: body,
      };
    }

    // paymentState: 1 = received, 2 = free trial, 0 = pending
    const paymentState = body.paymentState as number | undefined;
    const expiryTimeMillis = body.expiryTimeMillis as string | undefined;
    const expired = expiryTimeMillis ? Number(expiryTimeMillis) < Date.now() : false;

    if (expired) {
      return { ok: false, error: 'Subscription expired', expiryTimeMillis, raw: body };
    }
    if (paymentState === 0) {
      return { ok: false, error: 'Payment pending', paymentState, raw: body };
    }

    return {
      ok: true,
      expiryTimeMillis,
      paymentState,
      raw: body,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
