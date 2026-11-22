import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const daily = readFileSync('supabase/functions/daily/index.ts', 'utf8');
const match = readFileSync('supabase/functions/match/index.ts', 'utf8');
const metrics = readFileSync('supabase/functions/metrics/index.ts', 'utf8');
const clientRetention = readFileSync('src/services/analytics/retention.ts', 'utf8');
const analyticsFunction = readFileSync('supabase/functions/analytics/index.ts', 'utf8');
const analyticsEvents = readFileSync('src/services/analytics/events.ts', 'utf8');
const serverOpenMigration = readFileSync('supabase/migrations/20261027133117_server_app_open_retention.sql', 'utf8');
const abandonmentMigration = readFileSync('supabase/migrations/20261027133556_match_abandonment_metrics.sql', 'utf8');
const matchScreen = readFileSync('src/screens/match/MatchScreen.tsx', 'utf8');
const retentionMigration = readFileSync('supabase/migrations/20261027000001_retention_rematch_latency.sql', 'utf8');
const soloProjection = readFileSync('src/services/game/soloJourneyProgress.ts', 'utf8');
const soloCoupleMigration = readFileSync('supabase/migrations/20261027132337_atomic_solo_couple_match_create.sql', 'utf8');
const subscription = readFileSync('supabase/functions/subscription/index.ts', 'utf8');
const team = readFileSync('supabase/functions/team/index.ts', 'utf8');
const couple = readFileSync('supabase/functions/couple/index.ts', 'utf8');
const soloMigration = readFileSync('supabase/migrations/20261122000001_solo_no_competitor.sql', 'utf8');
const annualMigration = readFileSync('supabase/migrations/20261122000002_remove_annual_subscription.sql', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const soloScreen = readFileSync('src/screens/play/DifficultyScreen.tsx', 'utf8');


test('Daily refuses non-atomic completion fallback', () => {
  assert.match(daily, /DAILY_ATOMIC_UNAVAILABLE/);
  assert.doesNotMatch(daily, /atomic fallback/);
  assert.doesNotMatch(daily, /from\('daily_completions'\)\.insert/);
});

test('Daily challenge pools only select approved content', () => {
  const approvedChallengePools = [...daily.matchAll(/from\('challenges'\)[\s\S]{0,240}?\.eq\('qa_status', 'approved'\)/g)];
  assert.equal(approvedChallengePools.length, 2);
  assert.match(daily, /challenge\.active', true/);
  assert.match(daily, /challenge\.qa_status', 'approved'/);
  assert.match(daily, /challenges!inner\(id,type,subtype,prompt,difficulty,time_limit_ms,letter_pool,active,qa_status\)/);
});

test('Production runtime rejects simulated ads regardless of ad enablement', () => {
  const runtime = readFileSync('scripts/verify-runtime-config.mjs', 'utf8');
  assert.match(runtime, /'VITE_ADS_SIMULATE'/);
});

test('Solo stage lock uses the immediately previous linear leaf in the atomic RPC', () => {
  assert.match(soloCoupleMigration, /JOURNEY_STAGE_LOCKED/);
  assert.match(soloCoupleMigration, /branch_number=CASE WHEN p_journey_leaf=1 THEN p_journey_branch-1 ELSE p_journey_branch END/);
  assert.match(match, /supabase\.rpc\('create_solo_match_atomic'/);
});

test('Retention is derived from authenticated server app sessions, not browser storage', () => {
  assert.doesNotMatch(clientRetention, /localStorage|sessionStorage/);
  assert.match(analyticsFunction, /record_app_open_atomic/);
  assert.match(analyticsEvents, /recordServerAppOpen/);
  assert.match(metrics, /eq\('surface', 'app_open'\)/);
  assert.match(serverOpenMigration, /retention_opens_app_session_uidx/);
  assert.match(serverOpenMigration, /qaddaha:app-open:/);
});

test('Match abandonment is explicit, participant-authorized, and measured server-side', () => {
  assert.match(abandonmentMigration, /abandon_match_atomic/);
  assert.match(abandonmentMigration, /MATCH_PARTICIPANT_REQUIRED/);
  assert.match(abandonmentMigration, /abandoned_at=COALESCE\(abandoned_at,now\(\)\)/);
  assert.match(match, /case 'abandon'/);
  assert.match(match, /supabase\.rpc\('abandon_match_atomic'/);
  assert.match(matchScreen, /abandonMatch\(currentId, 'navigation'\)/);
  assert.match(metrics, /matchRows\.filter\(\(match\) => Boolean\(match\.abandoned_at\)\)/);
});

test('Metrics are server-derived and include quality measures', () => {
  assert.match(metrics, /SERVER_DERIVED_ONLY/);
  assert.match(metrics, /p_correct/);
  assert.match(metrics, /median_response_ms/);
  assert.match(metrics, /match_abandonments/);
  assert.match(metrics, /d1_rate/);
  assert.match(metrics, /d7_rate/);
  assert.match(metrics, /d14_rate/);
  assert.match(metrics, /session2_rate/);
  assert.match(metrics, /rematch_rate/);
  assert.match(metrics, /p95_response_ms/);
  assert.match(metrics, /function menaDayStart/);
});

test('Rematch is linked server-side and Daily RPC enforces approved content', () => {
  assert.match(match, /rematch_of/);
  assert.match(retentionMigration, /ADD COLUMN IF NOT EXISTS rematch_of/);
  assert.match(retentionMigration, /c\.active = true/);
  assert.match(retentionMigration, /c\.qa_status = 'approved'/);
  assert.match(retentionMigration, /challenge_answers/);
});

test('Solo UI projection has no localStorage dependency', () => {
  assert.doesNotMatch(soloProjection, /localStorage|sessionStorage/);
});

test('Subscription status uses a public projection and never returns receipt secrets', () => {
  assert.match(subscription, /\.select\('id, plan, status, provider, product_id, starts_at, expires_at, auto_renew, created_at, updated_at'\)/);
  const statusBlock = subscription.match(/if \(action === 'status'\) \{[\s\S]*?\n    \}\n\n    if \(action === 'verify_google'\)/)?.[0] ?? '';
  assert.doesNotMatch(statusBlock, /select\('\*'\)/);
  assert.doesNotMatch(statusBlock, /provider_token|raw_receipt/);
});

test('Match invitation tokens use cryptographic randomness', () => {
  assert.match(match, /function randomToken\(\)[\s\S]{0,180}crypto\.randomUUID\(\)/);
  assert.doesNotMatch(match.match(/function randomToken\(\)[\s\S]*?\n\}/)?.[0] ?? '', /Math\.random/);
});

test('Team and couple invitation codes use cryptographic randomness', () => {
  for (const source of [team, couple]) {
    const generator = source.match(/function code6\(\)[\s\S]*?\n\}/)?.[0] ?? '';
    assert.match(generator, /crypto\.getRandomValues/);
    assert.doesNotMatch(generator, /Math\.random/);
  }
});

test('Solo journey is a single-player tree and the app exposes no space lounge route', () => {
  assert.match(soloMigration, /Solo journey has no opponent or AI participant/);
  assert.match(soloMigration, /VALUES\n    \(v_match_id, p_user_id, 'player'/);
  assert.doesNotMatch(soloMigration, /'خصم قدها'|is_ai = true/);
  assert.doesNotMatch(app, /space-lounge|SpaceLounge/);
  assert.match(soloScreen, /لا يوجد منافس أمامك/);
  assert.doesNotMatch(soloScreen, /GAME_FORMATS|format-launcher|LEVELS/);
});

test('Annual subscription is disabled in the sellable catalog', () => {
  assert.match(annualMigration, /UPDATE public\.subscription_catalog/);
  assert.match(annualMigration, /plan = 'plus_yearly'/);
  assert.doesNotMatch(subscription, /\.eq\('google_product_id', productId\)\n\s*\.maybeSingle\(\)/);
});
