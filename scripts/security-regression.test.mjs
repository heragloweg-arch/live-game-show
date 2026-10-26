import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const daily = readFileSync('supabase/functions/daily/index.ts', 'utf8');
const match = readFileSync('supabase/functions/match/index.ts', 'utf8');
const metrics = readFileSync('supabase/functions/metrics/index.ts', 'utf8');
const soloProjection = readFileSync('src/services/game/soloJourneyProgress.ts', 'utf8');


test('Daily refuses non-atomic completion fallback', () => {
  assert.match(daily, /DAILY_ATOMIC_UNAVAILABLE/);
  assert.doesNotMatch(daily, /atomic fallback/);
  assert.doesNotMatch(daily, /from\('daily_completions'\)\.insert/);
});

test('Daily challenge pools only select approved content', () => {
  const approvedChallengePools = [...daily.matchAll(/from\('challenges'\)[\s\S]{0,240}?\.eq\('qa_status', 'approved'\)/g)];
  assert.equal(approvedChallengePools.length, 2);
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
});

test('Solo UI projection has no localStorage dependency', () => {
  assert.doesNotMatch(soloProjection, /localStorage|sessionStorage/);
});
