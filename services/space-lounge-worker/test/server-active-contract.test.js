import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 3_000);
    timer.unref();
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

test('active-session HTTP contract includes an empty giftRules array for an allowlisted host', async (t) => {
  const authServer = createServer((request, response) => {
    if (request.url !== '/auth/v1/user') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ id: 'host-allowed' }));
  });
  const authPort = await listen(authServer);
  const workerPortProbe = createServer();
  const workerPort = await listen(workerPortProbe);
  await new Promise((resolve) => workerPortProbe.close(resolve));

  const worker = spawn(process.execPath, ['src/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(workerPort),
      ENABLE_TIKTOK_LIVE: 'false',
      SUPABASE_URL: `http://127.0.0.1:${authPort}`,
      SUPABASE_ANON_KEY: 'fake-anon-key-for-test',
      SPACE_LOUNGE_ALLOWED_HOST_IDS: 'host-allowed',
      SPACE_LOUNGE_ALLOWED_ORIGINS: 'http://127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let childOutput = '';
  worker.stdout.on('data', (chunk) => { childOutput += chunk.toString(); });
  worker.stderr.on('data', (chunk) => { childOutput += chunk.toString(); });
  t.after(async () => {
    await stopChild(worker);
    await new Promise((resolve) => authServer.close(resolve));
  });

  let healthResponse;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (worker.exitCode !== null) throw new Error(`worker exited early: ${childOutput}`);
    try {
      healthResponse = await fetch(`http://127.0.0.1:${workerPort}/healthz`);
      if (healthResponse.ok) break;
    } catch {
      // Wait until the child HTTP listener is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(healthResponse?.status, 200, `worker did not become healthy: ${childOutput}`);

  const response = await fetch(`http://127.0.0.1:${workerPort}/api/sessions/active`, {
    headers: { authorization: 'Bearer test-access-token-0123456789-abcdef' },
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, { session: null, overlayToken: null, giftRules: [] });
});
