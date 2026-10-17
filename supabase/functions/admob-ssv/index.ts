/** AdMob SSV callback. No Supabase JWT: AdMob authenticates by ECDSA query signature. */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type AdMobKey = { keyId: number; pem?: string; base64?: string };
let keyCache: AdMobKey[] = [];
let keyCacheAt = 0;

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
function derEcdsaToP1363(der: Uint8Array): Uint8Array {
  if (der.length === 64) return der;
  let i = 0;
  if (der[i++] !== 0x30) throw new Error('Invalid ECDSA signature sequence');
  const readLength = () => {
    let length = der[i++];
    if (length & 0x80) {
      const count = length & 0x7f;
      if (count < 1 || count > 2) throw new Error('Invalid DER length');
      length = 0;
      for (let j = 0; j < count; j++) length = (length << 8) | der[i++];
    }
    return length;
  };
  const sequenceLength = readLength();
  if (i + sequenceLength !== der.length || der[i++] !== 0x02) throw new Error('Invalid ECDSA R');
  const rLength = readLength();
  let r = der.slice(i, i + rLength); i += rLength;
  if (der[i++] !== 0x02) throw new Error('Invalid ECDSA S');
  const sLength = readLength();
  let s = der.slice(i, i + sLength); i += sLength;
  if (i !== der.length) throw new Error('Invalid ECDSA signature tail');
  while (r.length > 32 && r[0] === 0) r = r.slice(1);
  while (s.length > 32 && s[0] === 0) s = s.slice(1);
  if (r.length > 32 || s.length > 32) throw new Error('ECDSA integer out of range');
  const raw = new Uint8Array(64);
  raw.set(r, 32 - r.length);
  raw.set(s, 64 - s.length);
  return raw;
}
async function getAdMobKeys(): Promise<AdMobKey[]> {
  if (keyCache.length && Date.now() - keyCacheAt < 23 * 60 * 60 * 1000) return keyCache;
  const response = await fetch('https://www.gstatic.com/admob/reward/verifier-keys.json', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('AdMob verifier keys unavailable');
  const payload = await response.json();
  if (!Array.isArray(payload.keys)) throw new Error('Invalid AdMob verifier key response');
  keyCache = payload.keys.filter((k: AdMobKey) => Number.isFinite(Number(k.keyId)) && (k.base64 || k.pem));
  keyCacheAt = Date.now();
  return keyCache;
}
async function verifyCallback(url: URL): Promise<boolean> {
  const query = url.search.startsWith('?') ? url.search.slice(1) : url.search;
  const signatureIndex = query.lastIndexOf('&signature=');
  if (signatureIndex <= 0) return false;
  const tail = query.slice(signatureIndex);
  const match = /^&signature=([^&]+)&key_id=(\d+)$/.exec(tail);
  if (!match) return false;
  const signature = decodeBase64Url(match[1]);
  const keyId = Number(match[2]);
  const key = (await getAdMobKeys()).find((item) => Number(item.keyId) === keyId);
  if (!key) return false;
  const spki = key.base64
    ? decodeBase64(key.base64)
    : decodeBase64((key.pem || '').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, ''));
  const publicKey = await crypto.subtle.importKey('spki', toArrayBuffer(spki), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const rawSignature = derEcdsaToP1363(signature);
  return await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    toArrayBuffer(rawSignature),
    toArrayBuffer(new TextEncoder().encode(query.slice(0, signatureIndex))),
  );
}

serve(async (req) => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const url = new URL(req.url);
  const params = url.searchParams;
  const transactionId = params.get('transaction_id') || '';
  const requestId = params.get('custom_data') || '';
  const userId = params.get('user_id') || '';
  const rewardAmount = params.get('reward_amount') || '';
  const rewardItem = params.get('reward_item') || '';
  const adUnit = params.get('ad_unit') || '';
  const expectedAdUnit = Deno.env.get('ADMOB_REWARDED_UNIT_ID') || '';
  if (!expectedAdUnit) return json({ error: 'SSV is not configured' }, 503);
  if (!transactionId || transactionId.length > 200 || !UUID.test(requestId) || !UUID.test(userId)) {
    return json({ error: 'Invalid callback fields' }, 400);
  }
  if (rewardAmount !== '20' || rewardItem !== 'coins' || adUnit !== expectedAdUnit) {
    return json({ error: 'Unexpected reward configuration' }, 400);
  }
  try {
    if (!await verifyCallback(url)) return json({ error: 'Invalid AdMob signature' }, 401);
  } catch (error) {
    console.error('[admob-ssv] signature verification failed', String(error));
    return json({ error: 'Signature verification unavailable' }, 503);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server is not configured' }, 503);
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: pending, error: pendingError } = await supabase
    .from('ad_reward_pending')
    .select('request_id,user_id,status,expires_at')
    .eq('request_id', requestId)
    .maybeSingle();
  if (pendingError) {
    console.error('[admob-ssv] pending lookup failed', pendingError.message);
    return json({ error: 'Unable to validate reward request' }, 503);
  }
  if (!pending || pending.user_id !== userId) return json({ error: 'Reward request not found' }, 404);
  if (pending.status === 'completed') {
    const { data: result, error } = await supabase.rpc('complete_ad_reward_ssv_atomic', {
      p_request_id: requestId, p_transaction_id: transactionId, p_coins: 20,
    });
    if (error) return json({ error: 'Reward transaction conflict' }, 409);
    return json({ ok: true, already: true, result });
  }
  if (pending.status !== 'pending' || new Date(pending.expires_at).getTime() <= Date.now()) {
    return json({ error: 'Reward request expired' }, 410);
  }
  const { data: result, error } = await supabase.rpc('complete_ad_reward_ssv_atomic', {
    p_request_id: requestId, p_transaction_id: transactionId, p_coins: 20,
  });
  if (error) {
    console.error('[admob-ssv] reward completion failed', error.message);
    return json({ error: 'Reward could not be completed' }, 409);
  }
  if (result?.ok !== true) return json({ error: 'Reward request expired' }, 410);
  return json({ ok: true, result });
});
