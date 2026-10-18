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
