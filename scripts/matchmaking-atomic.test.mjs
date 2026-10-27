import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20261027000002_atomic_matchmaking_create.sql', import.meta.url),
  'utf8'
);
const handler = await readFile(
  new URL('../supabase/functions/matchmaking/index.ts', import.meta.url),
  'utf8'
);

test('human matchmaking creates match, participants, rounds and queue transition in one SQL transaction', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.join_matchmaking_atomic/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /FOR UPDATE OF q SKIP LOCKED/);
  assert.match(migration, /NOT EXISTS \([\s\S]*FROM public\.user_blocks/);
  assert.match(migration, /INSERT INTO public\.matches/);
  assert.match(migration, /INSERT INTO public\.match_participants/);
  assert.match(migration, /INSERT INTO public\.rounds/);
  assert.match(migration, /UPDATE public\.matchmaking_queue[\s\S]*status = 'matched'/);
  assert.match(migration, /NOT_ENOUGH_PLAYABLE_CHALLENGES/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.join_matchmaking_atomic[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.join_matchmaking_atomic[\s\S]*TO service_role/);
});

test('matchmaking Edge Function delegates human match creation to the atomic RPC', () => {
  assert.match(handler, /supabase\.rpc\('join_matchmaking_atomic'/);
  assert.doesNotMatch(handler, /async function create1v1\(/);
  assert.match(handler, /data\.status === 'matched'/);
  assert.match(handler, /NOT_ENOUGH_PLAYABLE_CHALLENGES/);
  assert.match(handler, /if \(!authHeader\) return json\(\{ error: 'Unauthorized' \}, 401\)/);
});
