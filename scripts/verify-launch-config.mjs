const isProduction = process.env.VITE_ENVIRONMENT === 'production' || process.env.LAUNCH_GATE === 'strict';
if (!isProduction) {
  console.log('Launch config check skipped: set VITE_ENVIRONMENT=production or LAUNCH_GATE=strict.');
  process.exit(0);
}

const required = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'GOOGLE_PLAY_PACKAGE_NAME',
  'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
];
const missing = required.filter((key) => !process.env[key]);
const failures = [];
if (missing.length) failures.push(`Missing production secrets: ${missing.join(', ')}`);
if (process.env.VITE_ALLOW_DEV_BILLING === 'true') failures.push('VITE_ALLOW_DEV_BILLING must be false in production');
if (process.env.ALLOW_DEV_BILLING === 'true') failures.push('ALLOW_DEV_BILLING must be false in production');
if (process.env.ALLOW_UNVERIFIED_PLAY_PURCHASES === 'true') failures.push('ALLOW_UNVERIFIED_PLAY_PURCHASES is forbidden in production');
if (process.env.VITE_ADS_ENABLED === 'true') {
  if (process.env.VITE_ADMOB_TEST !== 'false') failures.push('VITE_ADMOB_TEST must be explicitly false when production ads are enabled');
  for (const key of ['VITE_ADMOB_APP_ID', 'VITE_ADMOB_BANNER_ID', 'VITE_ADMOB_INTERSTITIAL_ID', 'VITE_ADMOB_REWARDED_ID']) {
    if (!process.env[key]) failures.push(`Missing production AdMob ID: ${key}`);
  }
}
if (failures.length) {
  console.error('Launch config failed:\n' + failures.map((x) => `- ${x}`).join('\n'));
  process.exit(1);
}
console.log('Launch config passed: production billing verification, Supabase, and AdMob gates are configured.');
