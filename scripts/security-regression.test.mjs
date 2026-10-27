import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const daily = readFileSync('supabase/functions/daily/index.ts', 'utf8');
const match = readFileSync('supabase/functions/match/index.ts', 'utf8');
const metrics = readFileSync('supabase/functions/metrics/index.ts', 'utf8');
const retentionMigration = readFileSync('supabase/migrations/20261027000001_retention_rematch_latency.sql', 'utf8');
const soloProjection = readFileSync('src/services/game/soloJourneyProgress.ts', 'utf8');


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

test('Solo stage lock uses the immediately previous linear leaf', () => {
  assert.match(match, /\(\(journeyBranch! - 1\) \* 8\) \+ journeyLeaf! - 2/);
  assert.match(match, /const hasJourneyInputs = journeyBranch !== undefined \|\| journeyLeaf !== undefined/);
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
