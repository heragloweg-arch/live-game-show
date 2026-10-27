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
const retentionMigration = readFileSync('supabase/migrations/20261027000001_retention_rematch_latency.sql', 'utf8');
const soloProjection = readFileSync('src/services/game/soloJourneyProgress.ts', 'utf8');
const soloCoupleMigration = readFileSync('supabase/migrations/20261027132337_atomic_solo_couple_match_create.sql', 'utf8');


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
