const production = process.env.NODE_ENV === 'production'
  || process.env.VITE_ENVIRONMENT === 'production'
  || process.env.RUNTIME_CONFIG_GATE === 'strict';

if (!production) {
  console.log('[qaddaha] Runtime configuration check skipped outside production.');
  process.exit(0);
}

const failures = [];
for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
  if (!process.env[key]?.trim()) failures.push(`Missing required production variable: ${key}`);
}
const url = process.env.VITE_SUPABASE_URL;
if (url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      failures.push('VITE_SUPABASE_URL must be a public HTTPS URL in production.');
    }
    if (/your-project|preview-placeholder|example\.supabase\.co/i.test(parsed.hostname)) {
      failures.push('VITE_SUPABASE_URL contains a placeholder hostname.');
    }
  } catch { failures.push('VITE_SUPABASE_URL must be a valid URL.'); }
}
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
if (/your-anon-key|preview-anon-key|replace-me|placeholder/i.test(anonKey)) {
  failures.push('VITE_SUPABASE_ANON_KEY contains a placeholder value.');
}
for (const key of ['VITE_ALLOW_DEV_BILLING', 'ALLOW_DEV_BILLING', 'ALLOW_UNVERIFIED_PLAY_PURCHASES', 'VITE_ENABLE_LOCAL_DEMO']) {
  if (process.env[key] === 'true') failures.push(`${key} must not be true in production.`);
}
if (process.env.VITE_ADS_ENABLED === 'true') {
  if (process.env.VITE_ADS_SIMULATE !== 'false') failures.push('VITE_ADS_SIMULATE must be explicitly false when ads are enabled.');
  if (process.env.VITE_ADMOB_TEST !== 'false') failures.push('VITE_ADMOB_TEST must be explicitly false when production ads are enabled.');
  const ids = {
    VITE_ADMOB_APP_ID: /^ca-app-pub-\d+~\d+$/,
    VITE_ADMOB_BANNER_ID: /^ca-app-pub-\d+\/\d+$/,
    VITE_ADMOB_INTERSTITIAL_ID: /^ca-app-pub-\d+\/\d+$/,
    VITE_ADMOB_REWARDED_ID: /^ca-app-pub-\d+\/\d+$/,
  };
  for (const [key, pattern] of Object.entries(ids)) {
    if (!process.env[key] || !pattern.test(process.env[key])) failures.push(`${key} must contain a valid production AdMob ID.`);
  }
}
if (failures.length) {
  console.error('[qaddaha] Runtime configuration rejected:\n' + failures.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}
console.log('[qaddaha] Runtime configuration validated.');
