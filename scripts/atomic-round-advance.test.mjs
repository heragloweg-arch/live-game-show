import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20261018030000_atomic_match_round_advance.sql', import.meta.url),
  'utf8'
);
const handler = await readFile(
  new URL('../supabase/functions/match/index.ts', import.meta.url),
  'utf8'
);

test('atomic round migration owns the match and round transition', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.advance_match_round/);
  assert.match(migration, /FROM public\.matches[\s\S]*FOR UPDATE/);
  assert.match(migration, /FROM public\.rounds[\s\S]*FOR UPDATE/);
  assert.match(migration, /p_expected_round/);
  assert.match(migration, /ROUND_NOT_READY/);
  assert.match(migration, /STALE_ROUND/);
  assert.match(migration, /ai_score_applied BOOLEAN NOT NULL DEFAULT false/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.advance_match_round/);
});

test('match Edge Function delegates next_round to the atomic RPC', () => {
  const nextRoundStart = handler.indexOf('async function nextRound(');
  const nextRoundEnd = handler.indexOf('async function finishMatch(', nextRoundStart);
  assert.ok(nextRoundStart >= 0 && nextRoundEnd > nextRoundStart);
  const nextRound = handler.slice(nextRoundStart, nextRoundEnd);
  assert.match(nextRound, /supabase\.rpc\('advance_match_round'/);
  assert.doesNotMatch(nextRound, /\.from\('rounds'\)\.update/);
  assert.match(nextRound, /ROUND_NOT_READY/);
  assert.match(nextRound, /STALE_ROUND/);
});

const soloMigration = await readFile(
  new URL('../supabase/migrations/20261023050000_solo_journey_server_progress.sql', import.meta.url),
  'utf8'
);
const soloLeafContract = await readFile(
  new URL('../supabase/migrations/20261029000001_solo_leaf_three_questions.sql', import.meta.url),
  'utf8'
);

test('Solo journey progress is server-authoritative and idempotent', () => {
  assert.match(soloMigration, /CREATE TABLE IF NOT EXISTS public\.solo_journey_progress/);
  assert.match(soloMigration, /PRIMARY KEY \(user_id, branch_number, leaf_number\)/);
  assert.match(soloMigration, /CREATE POLICY solo_journey_progress_select_own/);
  assert.match(soloMigration, /ON CONFLICT \(user_id, branch_number, leaf_number\) DO NOTHING/);
  assert.match(soloMigration, /complete_solo_journey_leaf/);
  assert.match(soloMigration, /REVOKE ALL ON FUNCTION public\.complete_solo_journey_leaf/);
});

test('Solo match carries the journey stage and records it after settlement', () => {
  assert.match(handler, /case 'solo_progress'/);
  assert.match(handler, /journeyBranch/);
  assert.match(handler, /journeyLeaf/);
  assert.match(handler, /JOURNEY_STAGE_LOCKED/);
  assert.match(handler, /complete_solo_journey_leaf/);
});

test('Solo leaves use three questions and require two correct answers', () => {
  assert.match(soloLeafContract, /FOR v_round IN 1\.\.3 LOOP/);
  assert.match(soloLeafContract, /total_rounds[^\n]*3/);
  assert.match(soloLeafContract, /generate_series\(1, 3\)/);
  assert.match(soloLeafContract, /count\(\*\)[\s\S]*outcome = 'correct'[\s\S]*< 2/);
  assert.match(soloLeafContract, /'requiredCorrect', 2/);
  assert.match(soloLeafContract, /'leafQuestions', 3/);
});
