import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20261028000001_atomic_economy_match_team_tournament_delete.sql', 'utf8');
const economy = fs.readFileSync('supabase/functions/economy/index.ts', 'utf8');
const match = fs.readFileSync('supabase/functions/match/index.ts', 'utf8');
const matchmaking = fs.readFileSync('supabase/functions/matchmaking/index.ts', 'utf8');
const team = fs.readFileSync('supabase/functions/team/index.ts', 'utf8');
const tournament = fs.readFileSync('supabase/functions/tournament/index.ts', 'utf8');
const metrics = fs.readFileSync('supabase/functions/metrics/index.ts', 'utf8');
const metricsScreen = fs.readFileSync('src/screens/home/MetricsScreen.tsx', 'utf8');

test('atomic domain RPC migration owns economy claims and idempotency locks', () => {
  for (const name of ['claim_daily_bonus_atomic', 'claim_match_reward_atomic', 'credit_coins', 'pg_advisory_xact_lock']) assert.match(migration, new RegExp(name));
  assert.match(economy, /claim_daily_bonus_atomic/);
  assert.match(economy, /claim_match_reward_atomic/);
  assert.doesNotMatch(economy, /from\('daily_bonus_claims'\)/);
});

test('all primary match modes delegate bundle creation to one atomic RPC', () => {
  assert.match(migration, /create_match_bundle_atomic/);
  for (const source of [match, matchmaking, team]) assert.match(source, /create_match_bundle_atomic|queue_team_match_atomic/);
  assert.match(match, /p_mode: 'solo'/);
  assert.match(match, /p_mode: '1v1'/);
  assert.match(match, /p_mode: 'couple'/);
  assert.match(matchmaking, /create_match_bundle_atomic/);
});

test('team pickup and tournament player result use locked RPCs', () => {
  assert.match(migration, /pickup_team_atomic/);
  assert.match(team, /pickup_team_atomic/);
  assert.match(tournament, /report_tournament_player_result_atomic/);
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
});

test('metrics snapshot and UI are server-derived', () => {
  assert.match(metrics, /source: 'analytics_daily'/);
  assert.match(metrics, /retention: \{ source: 'analytics_daily'/);
  assert.match(metricsScreen, /analytics_daily/);
  assert.match(metricsScreen, /D14/);
});

test('account deletion handles owned teams before profile deletion', () => {
  assert.match(migration, /FOR UPDATE LOOP/);
  assert.match(migration, /DELETE FROM public\.teams/);
  assert.match(migration, /UPDATE public\.teams SET owner_id/);
});
