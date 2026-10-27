import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20261027130924_atomic_matchmaking_create.sql', import.meta.url),
  'utf8'
);
const handler = await readFile(
  new URL('../supabase/functions/matchmaking/index.ts', import.meta.url),
  'utf8'
);
const aiMigration = await readFile(
  new URL('../supabase/migrations/20261027131128_atomic_matchmaking_ai_fallback.sql', import.meta.url),
  'utf8'
);
const teamMigration = await readFile(
  new URL('../supabase/migrations/20261027131609_atomic_team_matchmaking.sql', import.meta.url),
  'utf8'
);
const teamHandler = await readFile(
  new URL('../supabase/functions/team/index.ts', import.meta.url),
  'utf8'
);
const pickupMigration = await readFile(
  new URL('../supabase/migrations/20261027131856_atomic_team_pickup.sql', import.meta.url),
  'utf8'
);
const pickupRetryMigration = await readFile(
  new URL('../supabase/migrations/20261027132536_pickup_assignment_retry.sql', import.meta.url),
  'utf8'
);
const soloCoupleMigration = await readFile(
  new URL('../supabase/migrations/20261027132337_atomic_solo_couple_match_create.sql', import.meta.url),
  'utf8'
);
const matchHandler = await readFile(
  new URL('../supabase/functions/match/index.ts', import.meta.url),
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

test('AI fallback creation is idempotent and server-enforced after queue timeout', () => {
  assert.match(aiMigration, /CREATE OR REPLACE FUNCTION public\.create_matchmaking_ai_fallback_atomic/);
  assert.match(aiMigration, /pg_advisory_xact_lock/);
  assert.match(aiMigration, /enqueued_at > now\(\) - interval '60 seconds'/);
  assert.match(aiMigration, /INSERT INTO public\.matches/);
  assert.match(aiMigration, /INSERT INTO public\.match_participants/);
  assert.match(aiMigration, /INSERT INTO public\.rounds/);
  assert.match(aiMigration, /REVOKE ALL ON FUNCTION public\.create_matchmaking_ai_fallback_atomic[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(aiMigration, /GRANT EXECUTE ON FUNCTION public\.create_matchmaking_ai_fallback_atomic[\s\S]*TO service_role/);
  assert.match(handler, /supabase\.rpc\('create_matchmaking_ai_fallback_atomic'/);
  assert.doesNotMatch(handler, /async function createAiFallback\(/);
});

test('Team matchmaking claims an opponent and creates the full match atomically', () => {
  assert.match(teamMigration, /CREATE OR REPLACE FUNCTION public\.queue_team_match_atomic/);
  assert.match(teamMigration, /pg_advisory_xact_lock/);
  assert.match(teamMigration, /FOR UPDATE OF q SKIP LOCKED/);
  assert.match(teamMigration, /INSERT INTO public\.matches/);
  assert.match(teamMigration, /INSERT INTO public\.match_participants/);
  assert.match(teamMigration, /INSERT INTO public\.rounds/);
  assert.match(teamMigration, /UPDATE public\.team_match_queue SET status='matched',match_id=v_match_id/);
  assert.match(teamMigration, /FROM PUBLIC,anon,authenticated/);
  assert.match(teamHandler, /supabase\.rpc\('queue_team_match_atomic'/);
  assert.doesNotMatch(teamHandler, /async function createTeamMatch\(/);
});

test('Pickup assembly is serialized, row-locked and assigned atomically', () => {
  assert.match(pickupMigration, /CREATE OR REPLACE FUNCTION public\.join_team_pickup_atomic/);
  assert.match(pickupMigration, /pg_advisory_xact_lock/);
  assert.match(pickupMigration, /FOR UPDATE SKIP LOCKED/);
  assert.match(pickupMigration, /INSERT INTO public\.teams/);
  assert.match(pickupMigration, /INSERT INTO public\.team_members/);
  assert.match(pickupMigration, /UPDATE public\.team_pickup_queue SET status='assigned',team_id=v_team_id/);
  assert.match(pickupMigration, /TEAM_OWNER_CANNOT_PICKUP/);
  assert.match(teamHandler, /supabase\.rpc\('join_team_pickup_atomic'/);
  assert.doesNotMatch(teamHandler, /const \{ data: waiting \} = await supabase/);
});

test('Solo and Couple matches are fully created by atomic SQL transactions', () => {
  assert.match(soloCoupleMigration, /CREATE OR REPLACE FUNCTION public\.create_solo_match_atomic/);
  assert.match(soloCoupleMigration, /CREATE OR REPLACE FUNCTION public\.create_couple_match_atomic/);
  assert.match(soloCoupleMigration, /JOURNEY_STAGE_LOCKED/);
  assert.match(soloCoupleMigration, /INSERT INTO public\.matches/);
  assert.match(soloCoupleMigration, /INSERT INTO public\.match_participants/);
  assert.match(soloCoupleMigration, /INSERT INTO public\.rounds/);
  assert.match(matchHandler, /supabase\.rpc\('create_solo_match_atomic'/);
  assert.match(matchHandler, /supabase\.rpc\('create_couple_match_atomic'/);
});

test('Pickup assignment retry returns the assigned team before owner restrictions', () => {
  const assignedCheck = pickupRetryMigration.indexOf("status='assigned'");
  const ownerGuard = pickupRetryMigration.indexOf("TEAM_OWNER_CANNOT_PICKUP");
  assert.ok(assignedCheck >= 0 && ownerGuard > assignedCheck);
  assert.match(pickupRetryMigration, /alreadyAssigned/);
});
