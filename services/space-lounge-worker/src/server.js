import { createServer } from 'node:http';
import { URL } from 'node:url';
import { SessionManager } from './session-manager.js';

const PORT = Number(process.env.PORT || 8080);
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || '');
const ENABLE_TIKTOK = process.env.ENABLE_TIKTOK_LIVE === 'true';
const ALLOWED_HOST_IDS = new Set(String(process.env.SPACE_LOUNGE_ALLOWED_HOST_IDS || '').split(',').map((value) => value.trim()).filter(Boolean));
const ALLOWED_ORIGINS = new Set(String(process.env.SPACE_LOUNGE_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean));
const MAX_BODY_BYTES = 8 * 1024;
const MAX_SSE_CLIENTS = 80;
const MAX_RATE_BUCKETS = 4096;
const MAX_GLOBAL_REQUESTS_PER_MINUTE = 12_000;
const manager = new SessionManager({ maxParticipants: 24 });
const rateBuckets = new Map();
let globalRateBucket = { startedAt: Date.now(), count: 0 };
let connector = null;
let sseClientCount = 0;

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  response.end(payload);
}

function applyCors(request, response) {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (!ALLOWED_ORIGINS.has(origin)) return false;
  response.setHeader('access-control-allow-origin', origin);
  response.setHeader('access-control-allow-methods', 'GET,POST,PATCH,PUT,OPTIONS');
  response.setHeader('access-control-allow-headers', 'authorization,content-type,x-participant-control');
  response.setHeader('access-control-max-age', '600');
  response.setHeader('vary', 'Origin');
  return true;
}

function rateLimit(request, response, max = 90) {
  const key = request.socket.remoteAddress || 'unknown';
  const now = Date.now();
  if (now - globalRateBucket.startedAt > 60_000) globalRateBucket = { startedAt: now, count: 0 };
  globalRateBucket.count += 1;
  if (globalRateBucket.count > MAX_GLOBAL_REQUESTS_PER_MINUTE) {
    sendJson(response, 429, { error: 'rate_limited' });
    return false;
  }
  let bucket = rateBuckets.get(key);
  if (bucket) {
    rateBuckets.delete(key);
    rateBuckets.set(key, bucket);
  } else if (rateBuckets.size >= MAX_RATE_BUCKETS) {
    const oldestKey = rateBuckets.keys().next().value;
    if (oldestKey !== undefined) rateBuckets.delete(oldestKey);
  }
  if (!bucket || now - bucket.startedAt > 60_000) {
    bucket = { startedAt: now, count: 1 };
    rateBuckets.set(key, bucket);
    return true;
  }
  bucket.count += 1;
  if (bucket.count <= max) return true;
  sendJson(response, 429, { error: 'rate_limited' });
  return false;
}

function requestLimit(method, pathname) {
  if (pathname.endsWith('/events')) return 300;
  if (method === 'POST' && pathname.endsWith('/claim-status')) return 3600;
  if (method === 'PATCH' && /^\/api\/sessions\/[^/]+\/participants\/[^/]+$/.test(pathname)) return 3000;
  return 90;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('payload_too_large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_json');
    return value;
  } catch {
    throw Object.assign(new Error('invalid_json'), { statusCode: 400 });
  }
}

async function verifyHost(request, sessionId) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ALLOWED_HOST_IDS.size) throw Object.assign(new Error('host_auth_not_configured'), { statusCode: 503 });
  const authorization = String(request.headers.authorization || '');
  const match = /^Bearer\s+([A-Za-z0-9._~-]{24,4096})$/i.exec(authorization);
  if (!match) throw Object.assign(new Error('unauthorized'), { statusCode: 401 });
  let authResponse;
  try {
    authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${match[1]}` },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw Object.assign(new Error('auth_service_unavailable'), { statusCode: 503 });
  }
  if (!authResponse.ok) throw Object.assign(new Error('unauthorized'), { statusCode: 401 });
  const user = await authResponse.json().catch(() => null);
  if (!user?.id || !ALLOWED_HOST_IDS.has(user.id)) throw Object.assign(new Error('forbidden'), { statusCode: 403 });
  if (sessionId && !manager.isHost(sessionId, user.id)) throw Object.assign(new Error('forbidden'), { statusCode: 403 });
  return user.id;
}

function handleSse(request, response, sessionId, token) {
  if (sseClientCount >= MAX_SSE_CLIENTS) return sendJson(response, 429, { error: 'overlay_capacity_reached' });
  if (!manager.isOverlayTokenValid(sessionId, token)) return sendJson(response, 403, { error: 'invalid_overlay_token' });
  sseClientCount += 1;
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-store, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
    'x-content-type-options': 'nosniff',
  });
  const writeSnapshot = (event) => {
    if (event.sessionId !== sessionId || response.destroyed) return;
    response.write(`event: snapshot\ndata: ${JSON.stringify(event.snapshot)}\n\n`);
  };
  writeSnapshot({ sessionId, snapshot: manager.snapshot() });
  manager.on('snapshot', writeSnapshot);
  const heartbeat = setInterval(() => { if (!response.destroyed) response.write(': keep-alive\n\n'); }, 20_000);
  heartbeat.unref?.();
  response.on('close', () => {
    clearInterval(heartbeat);
    manager.off('snapshot', writeSnapshot);
    sseClientCount = Math.max(0, sseClientCount - 1);
  });
}

const server = createServer(async (request, response) => {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'no-referrer');
  if (!applyCors(request, response)) return sendJson(response, 403, { error: 'origin_not_allowed' });
  if (request.method === 'OPTIONS') {
    if (!rateLimit(request, response, 300)) return;
    response.writeHead(204);
    return response.end();
  }
  let url;
  try { url = new URL(request.url || '/', 'http://worker.local'); }
  catch { return sendJson(response, 400, { error: 'invalid_url' }); }
  const method = request.method || 'GET';
  if (!rateLimit(request, response, requestLimit(method, url.pathname))) return;
  try {
    if (method === 'GET' && url.pathname === '/healthz') {
      return sendJson(response, 200, {
        status: 'ok',
        tiktokEnabled: ENABLE_TIKTOK && Boolean(connector),
        hostAuthConfigured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && ALLOWED_HOST_IDS.size),
        session: manager.status,
      });
    }

    if (method === 'GET' && url.pathname === '/api/sessions/active') {
      const hostUserId = await verifyHost(request);
      const active = manager.activeSessionForHost(hostUserId);
      return sendJson(response, 200, { session: active?.snapshot ?? null, overlayToken: active?.overlayToken ?? null, giftRules: active?.giftRules ?? [] });
    }

    if (method === 'GET' && /^\/api\/sessions\/[^/]+\/events$/.test(url.pathname)) {
      const sessionId = url.pathname.split('/')[3];
      const tokenMatch = /^Bearer\s+([A-Za-z0-9_-]{24,256})$/i.exec(String(request.headers.authorization || ''));
      return handleSse(request, response, sessionId, tokenMatch?.[1] || '');
    }

    if (method === 'POST' && url.pathname === '/api/sessions/start') {
      if (!ENABLE_TIKTOK || !connector) throw Object.assign(new Error('tiktok_live_disabled'), { statusCode: 503 });
      const hostUserId = await verifyHost(request);
      const body = await readJson(request);
      const result = manager.start({
        hostUserId,
        tiktokHandle: body.tiktokHandle,
        joinKeyword: body.joinKeyword,
        durationMinutes: body.durationMinutes,
        title: body.title,
        sponsorLabel: body.sponsorLabel,
      });
      connector.connect(result.snapshot.sessionId, manager.session.tiktokHandle);
      return sendJson(response, 201, {
        snapshot: result.snapshot,
        overlayToken: result.overlayToken,
      });
    }

    const stopMatch = /^\/api\/sessions\/([^/]+)\/stop$/.exec(url.pathname);
    if (method === 'POST' && stopMatch) {
      await verifyHost(request, stopMatch[1]);
      manager.end(stopMatch[1]);
      await connector?.stop(stopMatch[1], { updateState: false });
      return sendJson(response, 200, { status: 'ended' });
    }

    const claimMatch = /^\/api\/sessions\/([^/]+)\/claim$/.exec(url.pathname);
    if (method === 'POST' && claimMatch) {
      await readJson(request);
      return sendJson(response, 201, manager.createClaim(claimMatch[1]));
    }

    const claimStatusMatch = /^\/api\/sessions\/([^/]+)\/claim-status$/.exec(url.pathname);
    if (method === 'POST' && claimStatusMatch) {
      const body = await readJson(request);
      return sendJson(response, 200, manager.claimStatus(claimStatusMatch[1], body.claimId));
    }

    const participantMatch = /^\/api\/sessions\/([^/]+)\/participants\/([^/]+)$/.exec(url.pathname);
    if (method === 'PATCH' && participantMatch) {
      const body = await readJson(request);
      const token = String(request.headers['x-participant-control'] || '');
      const accepted = manager.moveParticipant(participantMatch[1], participantMatch[2], token, body.x, body.y, body.appearance);
      return sendJson(response, accepted ? 200 : 403, accepted ? { status: 'updated' } : { error: 'participant_control_denied' });
    }

    const giftRulesMatch = /^\/api\/sessions\/([^/]+)\/gift-rules$/.exec(url.pathname);
    if (method === 'PUT' && giftRulesMatch) {
      await verifyHost(request, giftRulesMatch[1]);
      const body = await readJson(request);
      const count = manager.setGiftRules(giftRulesMatch[1], body.rules);
      return sendJson(response, 200, { configured: count });
    }

    const sceneActionMatch = /^\/api\/sessions\/([^/]+)\/scene-action$/.exec(url.pathname);
    if (method === 'POST' && sceneActionMatch) {
      await verifyHost(request, sceneActionMatch[1]);
      const body = await readJson(request);
      const affected = manager.setSceneAction(sceneActionMatch[1], body.action);
      return sendJson(response, 200, { affected });
    }

    const hostMoveMatch = /^\/api\/sessions\/([^/]+)\/participants\/([^/]+)\/host-move$/.exec(url.pathname);
    if (method === 'POST' && hostMoveMatch) {
      await verifyHost(request, hostMoveMatch[1]);
      const body = await readJson(request);
      const accepted = manager.hostMoveParticipant(hostMoveMatch[1], hostMoveMatch[2], body.x, body.y, body.action);
      return sendJson(response, accepted ? 200 : 404, accepted ? { status: 'updated' } : { error: 'participant_not_found' });
    }

    const sponsorMatch = /^\/api\/sessions\/([^/]+)\/sponsor$/.exec(url.pathname);
    if (method === 'POST' && sponsorMatch) {
      await verifyHost(request, sponsorMatch[1]);
      manager.setSponsor(sponsorMatch[1], await readJson(request));
      return sendJson(response, 200, { status: 'updated' });
    }

    return sendJson(response, 404, { error: 'not_found' });
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    const message = status >= 500 ? 'service_error' : String(error.message || 'request_rejected').slice(0, 80);
    if (status >= 500) console.error('[space-lounge-worker] request failed:', error?.message || 'unknown');
    return sendJson(response, status, { error: message });
  }
});

manager.on('ended', (sessionId) => { void connector?.stop(sessionId, { updateState: false }); });

if (ENABLE_TIKTOK) {
  try {
    const { LiveConnector } = await import('./live-connector.js');
    connector = new LiveConnector({ sessionManager: manager });
  } catch (error) {
    console.error('[space-lounge-worker] connector could not load:', error?.message || 'unknown');
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[space-lounge-worker] listening on ${PORT}; tiktokEnabled=${ENABLE_TIKTOK && Boolean(connector)}`);
});

async function shutdown() {
  if (manager.id) manager.end(manager.id);
  if (connector && manager.id) await connector.stop(manager.id, { updateState: false });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref?.();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
