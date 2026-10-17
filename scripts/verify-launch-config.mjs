import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const production = process.env.NODE_ENV === 'production' || process.env.VITE_ENVIRONMENT === 'production';
const requested = process.env.LAUNCH_GATE;
const mode = production ? 'strict' : (requested || 'off');
const failures = [];
const fail = (message) => failures.push(message);
const read = (path) => readFileSync(resolve(root, path), 'utf8');

if (production && requested && requested !== 'strict') {
  console.error('Launch config failed: production environment cannot downgrade LAUNCH_GATE from strict mode.');
  process.exit(1);
}
if (mode === 'off') {
  console.log('Launch config check skipped in non-production development mode.');
  process.exit(0);
}
if (!['static', 'strict'].includes(mode)) {
  console.error('Launch config failed: unsupported LAUNCH_GATE mode.');
  process.exit(1);
}

if (mode === 'static') {
  try {
    const pkg = JSON.parse(read('package.json'));
    const railwayJson = JSON.parse(read('railway.json'));
    const railwayToml = read('railway.toml');
    const envExample = read('.env.example');
    for (const key of ['verify:runtime-config', 'test:production-gates']) {
      if (!pkg.scripts?.[key]) fail('package.json is missing script: ' + key);
    }
    if (!String(pkg.engines?.node || '').includes('22.22.0')) fail('Node engine must require Node >=22.22.0.');
    const start = 'scripts/verify-runtime-config.mjs && node scripts/write-runtime-config.mjs';
    if (!railwayJson.deploy?.startCommand?.includes(start)) fail('railway.json must validate runtime config before startup.');
    if (!railwayToml.includes(start)) fail('railway.toml must validate runtime config before startup.');
    for (const token of ['npm ci', 'npm run typecheck', 'npm run lint', 'npm test', 'npm run build', 'scripts/verify-production.mjs']) {
      if (!railwayJson.build?.buildCommand?.includes(token)) fail('railway.json build command is missing: ' + token);
      if (!railwayToml.includes(token)) fail('railway.toml build command is missing: ' + token);
    }
    for (const token of ['VITE_SUPABASE_URL=', 'VITE_SUPABASE_ANON_KEY=', 'VITE_ENABLE_LOCAL_DEMO=false', 'VITE_ALLOW_DEV_BILLING=false', 'VITE_ADS_SIMULATE=false']) {
      if (!envExample.includes(token)) fail('.env.example is missing safe configuration example: ' + token);
    }
    if (!existsSync(resolve(root, 'scripts/verify-runtime-config.mjs'))) fail('Runtime configuration verifier is missing.');
    const tomlStart = railwayToml.match(/startCommand = "([^"]+)"/)?.[1];
    if (railwayJson.deploy?.startCommand !== tomlStart) fail('railway.json and railway.toml start commands differ.');
  } catch (error) {
    fail('Static configuration audit could not complete: ' + (error instanceof Error ? error.message : String(error)));
  }
} else {
  const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'GOOGLE_PLAY_PACKAGE_NAME', 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'GOOGLE_PUBSUB_AUDIENCE', 'GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL'];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length) fail('Missing strict production variables: ' + missing.join(', '));
  const url = process.env.VITE_SUPABASE_URL;
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(parsed.hostname)) fail('VITE_SUPABASE_URL must be a public HTTPS URL.');
    } catch { fail('VITE_SUPABASE_URL must be a valid URL.'); }
  }
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
  if (packageName && !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(packageName)) fail('GOOGLE_PLAY_PACKAGE_NAME is invalid.');
  const serviceAccount = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (serviceAccount) {
    try {
      const parsed = JSON.parse(serviceAccount);
      if (!parsed.client_email || !parsed.private_key || !parsed.project_id) fail('Google Play service account JSON is missing required fields.');
    } catch { fail('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON must contain valid JSON.'); }
  }
  const audience = process.env.GOOGLE_PUBSUB_AUDIENCE;
  if (audience) {
    try { if (new URL(audience).protocol !== 'https:') fail('GOOGLE_PUBSUB_AUDIENCE must use HTTPS.'); }
    catch { fail('GOOGLE_PUBSUB_AUDIENCE must be a valid HTTPS URL.'); }
  }
  const email = process.env.GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL must be a valid email address.');
  for (const key of ['VITE_ALLOW_DEV_BILLING', 'ALLOW_DEV_BILLING', 'ALLOW_UNVERIFIED_PLAY_PURCHASES', 'VITE_ENABLE_LOCAL_DEMO', 'VITE_ADS_SIMULATE']) {
    if (process.env[key] === 'true') fail(key + ' must not be true in production.');
  }
  if (process.env.VITE_ADS_ENABLED === 'true') {
    if (process.env.VITE_ADMOB_TEST !== 'false') fail('VITE_ADMOB_TEST must be explicitly false when production ads are enabled.');
    const ids = {
      VITE_ADMOB_APP_ID: /^ca-app-pub-\d+~\d+$/,
      VITE_ADMOB_BANNER_ID: /^ca-app-pub-\d+\/\d+$/,
      VITE_ADMOB_INTERSTITIAL_ID: /^ca-app-pub-\d+\/\d+$/,
      VITE_ADMOB_REWARDED_ID: /^ca-app-pub-\d+\/\d+$/,
    };
    for (const [key, pattern] of Object.entries(ids)) if (!process.env[key] || !pattern.test(process.env[key])) fail(key + ' must contain a valid production AdMob ID.');
  }
}
if (failures.length) {
  console.error('Launch config failed:\n' + failures.map((item) => '- ' + item).join('\n'));
  process.exit(1);
}
console.log(mode === 'static' ? 'Static launch configuration gate passed.' : 'Strict production launch gate passed.');
