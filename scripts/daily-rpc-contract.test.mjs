import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20261027000004_harden_daily_rpc_contract.sql', import.meta.url),
  'utf8'
);

test('Daily challenge completion validates the exact server-owned date and challenge', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.complete_daily_atomic/);
  assert.match(migration, /challenge_date\s*=\s*p_day AND challenge_id\s*=\s*p_challenge_id/);
  assert.match(migration, /DAILY_CHALLENGE_MISMATCH/);
  assert.match(migration, /active\s*=\s*true AND qa_status\s*=\s*'approved'/);
  assert.match(migration, /DAILY_CHALLENGE_NOT_PLAYABLE/);
  assert.match(migration, /v_daily\.bonus_coins/);
  assert.match(migration, /v_daily\.bonus_xp/);
  assert.doesNotMatch(migration, /EXCEPTION WHEN OTHERS THEN NULL/);
});

test('Daily pack completion verifies slot-to-pack ownership and serializes rewards', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.complete_daily_pack_slot_atomic/);
  assert.match(migration, /WHERE id=p_slot_id AND pack_id=p_pack_id/);
  assert.match(migration, /DAILY_PACK_SLOT_MISMATCH/);
  assert.match(migration, /qaddaha:daily-pack:/);
  assert.match(migration, /ON CONFLICT\(user_id,pack_id\) DO NOTHING/);
  assert.match(migration, /INSERT INTO public\.wallet_ledger/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.complete_daily_pack_slot_atomic[\s\S]*FROM PUBLIC,anon,authenticated/);
});
