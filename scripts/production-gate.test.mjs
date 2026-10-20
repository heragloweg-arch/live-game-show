import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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

test('runtime gate accepts Railway public Supabase aliases', () => {
  const result = run('scripts/verify-runtime-config.mjs', {
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://qaddaha.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_test_key_not_a_real_secret',
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

test('account deletion and server rate limiting are wired server-side', () => {
  const read = (path) => readFileSync(path, 'utf8');
  const account = read('supabase/functions/account/index.ts');
  const rateLimit = read('supabase/functions/_shared/rateLimit.ts');
  const migration = read('supabase/migrations/20261019050000_account_deletion_rate_limits.sql');
  assert.match(account, /delete_account_data_atomic/);
  assert.match(account, /auth\.admin\.deleteUser/);
  assert.match(rateLimit, /consume_rate_limit_atomic/);
  assert.match(migration, /delete_account_data_atomic/);
  assert.match(migration, /consume_rate_limit_atomic/);
});

test('public deployment metadata is explicit and CORS is not wildcard', () => {
  const cors = readFileSync('supabase/functions/_shared/cors.ts', 'utf8');
  const routes = JSON.parse(readFileSync('public/manus-routes.json', 'utf8'));
  assert.doesNotMatch(cors, /Access-Control-Allow-Origin['"]:\s*['"]\*['"]/);
  assert.ok(Array.isArray(routes.routes) && routes.routes.some((route) => route.path === '/host'));
});

test('content release gate passes the reviewed question bank', () => {
  const result = run('scripts/verify-content-release.mjs', {});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /968 audited rows/);
});

test('Railway build fingerprint accepts the official Git commit variable', () => {
  const buildInfo = readFileSync('scripts/write-build-info.mjs', 'utf8');
  const railwayGuide = readFileSync('docs/RAILWAY.md', 'utf8');
  assert.match(buildInfo, /RAILWAY_GIT_COMMIT_SHA/);
  assert.match(buildInfo, /RAILWAY_DEPLOYMENT_ID/);
  assert.match(buildInfo, /artifact-content/);
  assert.match(buildInfo, /fingerprintSource/);
  assert.match(railwayGuide, /VITE_SUPABASE_URL/);
  assert.match(railwayGuide, /RAILWAY_GIT_COMMIT_SHA/);
});

test('runtime config is a synchronous script before the app module', () => {
  const html = readFileSync('index.html', 'utf8');
  const runtimeIndex = html.indexOf('src="/env-config.js"');
  const appIndex = html.indexOf('src="/src/main.tsx"');
  assert.ok(runtimeIndex >= 0, 'env-config.js must be loaded');
  assert.ok(appIndex > runtimeIndex, 'runtime config must appear before the app module');
  assert.doesNotMatch(html.slice(runtimeIndex - 30, runtimeIndex + 40), /type="module"/);
});

test('flag content is bundled and mixed challenge selection accepts choice questions', () => {
  const match = readFileSync('supabase/functions/match/index.ts', 'utf8');
  const room = readFileSync('supabase/functions/room/index.ts', 'utf8');
  const flagMigration = readFileSync('supabase/migrations/20261019070000_flag_identification_content.sql', 'utf8');
  const choiceApproval = readFileSync('supabase/migrations/20261019070001_choice_content_approval.sql', 'utf8');
  assert.doesNotMatch(match, /Array\.isArray\(c\.letter_pool\).*c\.letter_pool\.length/);
  assert.doesNotMatch(room, /\.not\('letter_pool',\s*'is',\s*null\)/);
  assert.match(match, /challenge_choices/);
  assert.match(room, /challenge_choices/);
  assert.match(flagMigration, /asset_path/);
  assert.match(flagMigration, /false,'needs_review'/);
  assert.match(choiceApproval, /challenge_choices/);
  assert.match(choiceApproval, /playable_answer_contract_missing/);
  assert.equal([...flagMigration.matchAll(/\/flags\/[a-z]{2}\.svg/g)].length, 12);
});
