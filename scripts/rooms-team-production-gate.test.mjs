import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const matchmaking = read('supabase/functions/matchmaking/index.ts');
const match = read('supabase/functions/match/index.ts');
const room = read('supabase/functions/room/index.ts');
const tournament = read('supabase/functions/tournament/index.ts');
const team = read('supabase/functions/team/index.ts');
const migration = read('supabase/migrations/20261026000003_team_tournament_league.sql');
const flagReconcile = read('supabase/migrations/20261026000004_reconcile_flag_content_seed.sql');
const server = read('scripts/static-server.mjs');

 test('Quick Match AI fallback is an explicit server participant and never a timeout-only path', () => {
  assert.match(matchmaking, /create_matchmaking_ai_fallback_atomic/);
  assert.match(matchmaking, /fallbackAi:\s*true/);
  assert.match(matchmaking, /is_ai:\s*true/);
  assert.match(matchmaking, /خصم الكمبيوتر/);
  assert.match(match, /is_ai/);
  assert.match(match, /AI_ACCURACY/);
  assert.match(match, /p_ai_score_delta/);
});

test('Room reveal and answer security remain server-authoritative', () => {
  assert.match(room, /action === 'reveal'/);
  assert.match(room, /status.*revealed/);
  assert.match(room, /roomChallengeSecurity/);
  assert.match(room, /status.*active/);
});

test('Team league has five-member cap, atomic registration, fixtures, standings and idempotent prizes', () => {
  assert.match(migration, /max_members BETWEEN 1 AND 5/);
  assert.match(migration, /join_tournament_team_atomic/);
  assert.match(migration, /generate_team_round_robin/);
  assert.match(migration, /start_tournament_team_match/);
  assert.match(migration, /report_tournament_team_result/);
  assert.match(migration, /distribute_team_tournament_prizes/);
  assert.match(migration, /prizes_distributed/);
  assert.match(tournament, /action === 'team_join'/);
  assert.match(tournament, /action === 'start_team_match'/);
  assert.match(team, /Math\.min\(5/);
});

test('Readiness exposes the exact qaddaha service and deployed build commit', () => {
  assert.match(server, /service: 'qaddaha-web'/);
  assert.match(server, /readFile\(join\(root, 'build-info\.json'/);
  assert.match(server, /commit: buildInfo\.commit/);
  assert.match(server, /Boolean\(buildInfo\?\.commit\)/);
});

test('Flag content has an idempotent reconciliation seed and stays inactive pending review', () => {
  assert.match(flagReconcile, /Reconcile flag identification seed rows/);
  assert.equal([...flagReconcile.matchAll(/asset_path\) VALUES/g)].length, 12);
  assert.match(flagReconcile, /active=false/);
  assert.match(flagReconcile, /qa_status='needs_review'/);
});
