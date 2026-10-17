import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const node = process.execPath;
const run = (script, env) => spawnSync(node, [script], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { PATH: process.env.PATH || '', HOME: process.env.HOME || '', ...env },
});
const validStrict = {
  LAUNCH_GATE: 'strict',
  VITE_SUPABASE_URL: 'https://qaddaha.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_test_key_not_a_real_secret',
  GOOGLE_PLAY_PACKAGE_NAME: 'com.qaddaha.challenges',
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'play@example.iam.gserviceaccount.com', private_key: 'test-key', project_id: 'qaddaha-test' }),
  GOOGLE_PUBSUB_AUDIENCE: 'https://example.com/google-play-rtdn',
  GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL: 'pubsub@example.iam.gserviceaccount.com',
  VITE_ADS_ENABLED: 'false',
  VITE_ADS_SIMULATE: 'false',
  VITE_ADMOB_TEST: 'true',
  VITE_ALLOW_DEV_BILLING: 'false',
  ALLOW_DEV_BILLING: 'false',
  ALLOW_UNVERIFIED_PLAY_PURCHASES: 'false',
  VITE_ENABLE_LOCAL_DEMO: 'false',
};

test('static gate audits repository deployment configuration', () => {
  const result = run('scripts/verify-launch-config.mjs', { LAUNCH_GATE: 'static' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Static launch configuration gate passed/);
});

test('strict gate rejects missing production variables', () => {
  const result = run('scripts/verify-launch-config.mjs', { LAUNCH_GATE: 'strict' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing strict production variables/);
});

test('strict gate accepts a complete safe configuration', () => {
  const result = run('scripts/verify-launch-config.mjs', validStrict);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Strict production launch gate passed/);
});

test('production cannot downgrade strict gate to static', () => {
  const result = run('scripts/verify-launch-config.mjs', { ...validStrict, NODE_ENV: 'production', LAUNCH_GATE: 'static' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot downgrade LAUNCH_GATE/);
});

test('strict gate rejects malformed Google Play service account JSON', () => {
  const result = run('scripts/verify-launch-config.mjs', { ...validStrict, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: '{"project_id":"missing-fields"}' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing required fields/);
});

test('strict gate rejects test or simulated ads when production ads are enabled', () => {
  const result = run('scripts/verify-launch-config.mjs', {
    ...validStrict, VITE_ADS_ENABLED: 'true', VITE_ADS_SIMULATE: 'true', VITE_ADMOB_TEST: 'true',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /VITE_ADMOB_TEST must be explicitly false/);
});

test('runtime gate rejects missing Supabase configuration in production', () => {
  const result = run('scripts/verify-runtime-config.mjs', { NODE_ENV: 'production', VITE_ENVIRONMENT: 'production' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing required production variable/);
});

test('runtime gate accepts valid Supabase configuration and safe flags', () => {
  const result = run('scripts/verify-runtime-config.mjs', {
    NODE_ENV: 'production',
    VITE_SUPABASE_URL: 'https://qaddaha.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'sb_publishable_test_key_not_a_real_secret',
    VITE_ALLOW_DEV_BILLING: 'false',
    VITE_ENABLE_LOCAL_DEMO: 'false',
    VITE_ADS_ENABLED: 'false',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('runtime gate rejects unsafe billing and simulated ads', () => {
  const result = run('scripts/verify-runtime-config.mjs', {
    NODE_ENV: 'production',
    VITE_SUPABASE_URL: 'https://qaddaha.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'sb_publishable_test_key_not_a_real_secret',
    VITE_ALLOW_DEV_BILLING: 'true',
    VITE_ENABLE_LOCAL_DEMO: 'false',
    VITE_ADS_ENABLED: 'true',
    VITE_ADS_SIMULATE: 'true',
    VITE_ADMOB_TEST: 'true',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /VITE_ALLOW_DEV_BILLING must not be true/);
  assert.match(result.stderr, /VITE_ADMOB_APP_ID must contain a valid production AdMob ID/);
});
