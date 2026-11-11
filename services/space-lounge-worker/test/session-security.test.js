import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { SessionManager } from '../src/session-manager.js';

function makeSession(now = 1_800_000_000_000) {
  let current = now;
  const manager = new SessionManager({ now: () => current, idleTimeoutMs: 1000 });
  const started = manager.start({ hostUserId: 'host-1', tiktokHandle: 'qaddaha', joinKeyword: 'SPACE', durationMinutes: 60 });
  return { manager, started, advance: (milliseconds) => { current += milliseconds; } };
}

test('claim verification is eight digits, time-limited, and returns its control capability only once', () => {
  const { manager, started } = makeSession();
  const claim = manager.createClaim(started.snapshot.sessionId);
  assert.match(claim.code, /^\d{8}$/);
  manager.handleChat(started.snapshot.sessionId, { userId: 'viewer-1', displayName: 'Rover', comment: 'SPACE' });
  assert.equal(manager.handleChat(started.snapshot.sessionId, { userId: 'viewer-1', displayName: 'Rover', comment: `!verify ${claim.code}` }), true);
  const result = manager.claimStatus(started.snapshot.sessionId, claim.claimId);
  assert.equal(result.status, 'verified');
  assert.ok(result.controlToken);
  assert.deepEqual(manager.claimStatus(started.snapshot.sessionId, claim.claimId), { status: 'not_found' });
  manager.end(started.snapshot.sessionId);
});

test('claim allocations have a strict per-session memory cap', () => {
  const { manager, started, advance } = makeSession();
  const sessionId = started.snapshot.sessionId;
  for (let index = 0; index < 1000; index += 1) {
    advance(3 * 60_000 + 1);
    manager.createClaim(sessionId);
  }
  advance(3 * 60_000 + 1);
  assert.throws(() => manager.createClaim(sessionId), /claim_session_capacity_reached/);
  manager.end(sessionId);
});

test('a participant who re-enters during the exit animation is not deleted by the old timer', async () => {
  const { manager, started, advance } = makeSession();
  const sessionId = started.snapshot.sessionId;
  manager.handleChat(sessionId, { userId: 'viewer-returning', displayName: 'Back', comment: 'SPACE' });
  advance(1200);
  manager.sweep();
  assert.equal(manager.snapshot().participants[0].isExiting, true);
  manager.handleChat(sessionId, { userId: 'viewer-returning', displayName: 'Back', comment: 'SPACE' });
  await delay(1350);
  assert.equal(manager.snapshot().participants.length, 1);
  assert.equal(manager.snapshot().participants[0].isExiting, undefined);
  manager.end(sessionId);
});

test('host move validates action before changing position', () => {
  const { manager, started } = makeSession();
  const sessionId = started.snapshot.sessionId;
  manager.handleChat(sessionId, { userId: 'viewer-2', displayName: 'Pilot', comment: 'SPACE' });
  const participantId = manager.snapshot().participants[0].participantId;
  const before = manager.snapshot().participants[0];
  assert.equal(manager.hostMoveParticipant(sessionId, participantId, 20, 30, 'INVALID'), false);
  const after = manager.snapshot().participants[0];
  assert.equal(after.x, before.x);
  assert.equal(after.y, before.y);
  assert.equal(after.action, undefined);
  manager.end(sessionId);
});
