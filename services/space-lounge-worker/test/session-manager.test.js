import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../src/session-manager.js';

function makeManager(now = 1_800_000_000_000) {
  let current = now;
  const manager = new SessionManager({ now: () => current, idleTimeoutMs: 1000 });
  const started = manager.start({ hostUserId: 'host-1', tiktokHandle: 'qaddaha', joinKeyword: 'SPACE', durationMinutes: 60 });
  return { manager, started, advance: (ms) => { current += ms; } };
}

test('starts one bounded session and exposes a read-only token only in the start result', () => {
  const { manager, started } = makeManager();
  assert.equal(started.snapshot.status, 'live');
  assert.equal(started.snapshot.connection, 'connecting');
  assert.equal(started.snapshot.participants.length, 0);
  assert.equal(manager.isOverlayTokenValid(started.snapshot.sessionId, started.overlayToken), true);
  assert.equal('overlayToken' in started.snapshot, false);
  assert.throws(() => manager.start({ hostUserId: 'other', tiktokHandle: 'test', durationMinutes: 60 }), /session_already_active/);
  manager.end(started.snapshot.sessionId);
});

test('joins by exact keyword once and never publishes the raw TikTok identifier', () => {
  const { manager, started } = makeManager();
  const id = started.snapshot.sessionId;
  assert.equal(manager.handleChat(id, { userId: 'raw-tiktok-id', displayName: '  <Viewer> ', comment: 'space' }), true);
  assert.equal(manager.handleChat(id, { userId: 'raw-tiktok-id', displayName: 'Viewer', comment: 'SPACE' }), true);
  const snapshot = manager.snapshot();
  assert.equal(snapshot.participants.length, 1);
  assert.equal(snapshot.participants[0].displayName, 'Viewer');
  assert.equal(JSON.stringify(snapshot).includes('raw-tiktok-id'), false);
  manager.end(id);
});

test('verifies a one-use claim against the live chat actor before allowing movement', () => {
  const { manager, started } = makeManager();
  const id = started.snapshot.sessionId;
  const claim = manager.createClaim(id);
  assert.equal(manager.claimStatus(id, claim.claimId).status, 'pending');
  assert.equal(manager.handleChat(id, { userId: 'viewer-9', displayName: 'Rover', comment: `!verify ${claim.code}` }), true);
  const result = manager.claimStatus(id, claim.claimId);
  assert.equal(result.status, 'verified');
  assert.equal(manager.authorizeParticipant(id, result.participantId, result.controlToken), true);
  assert.equal(manager.moveParticipant(id, result.participantId, result.controlToken, 18, 73, 'feminine'), true);
  assert.equal(manager.moveParticipant(id, result.participantId, 'wrong-token', 20, 20), false);
  assert.equal(manager.snapshot().participants[0].appearance, 'feminine');
  assert.equal(manager.handleChat(id, { userId: 'attacker', displayName: 'Other', comment: `!verify ${claim.code}` }), false);
  manager.end(id);
});

test('runs only configured completed gifts, deduplicates event ids, and supports actions and group targets', () => {
  const { manager, started } = makeManager();
  const id = started.snapshot.sessionId;
  manager.handleChat(id, { userId: 'viewer-a', displayName: 'A', comment: 'SPACE' });
  manager.handleChat(id, { userId: 'viewer-b', displayName: 'B', comment: 'SPACE' });
  manager.setGiftRules(id, [{ giftId: '999', action: 'ZERO_GRAVITY', durationSeconds: 6, target: 'all' }]);
  assert.equal(manager.handleGift(id, { userId: 'viewer-a', displayName: 'A', giftId: '999', giftType: 1, repeatCount: 2, repeatEnd: false, eventId: 'g1' }), false);
  const finalGift = { userId: 'viewer-a', displayName: 'A', giftId: '999', giftType: 1, repeatCount: 2, repeatEnd: true, eventId: 'g1' };
  assert.equal(manager.handleGift(id, finalGift), true);
  assert.equal(manager.handleGift(id, finalGift), false);
  assert.equal(manager.snapshot().participants.every((participant) => participant.action === 'ZERO_GRAVITY'), true);
  assert.equal(manager.snapshot().topSupporters[0].giftCount, 2);
  manager.end(id);
});

test('host can trigger one short group action without a competitive score', () => {
  const { manager, started } = makeManager();
  const id = started.snapshot.sessionId;
  manager.handleChat(id, { userId: 'viewer-a', displayName: 'A', comment: 'SPACE' });
  manager.handleChat(id, { userId: 'viewer-b', displayName: 'B', comment: 'SPACE' });
  assert.equal(manager.isHost(id, 'host-1'), true);
  assert.equal(manager.setSceneAction(id, 'RUN'), 2);
  assert.equal(manager.snapshot().participants.every((participant) => participant.action === 'RUN'), true);
  assert.throws(() => manager.setSceneAction(id, 'NOT_AN_ACTION'), /invalid_action/);
  assert.equal('score' in manager.snapshot().participants[0], false);
  manager.end(id);
});

test('idle participants exit and all transient attendance is cleared at session end', () => {
  const { manager, started, advance } = makeManager();
  const id = started.snapshot.sessionId;
  manager.handleChat(id, { userId: 'viewer', displayName: 'Idle', comment: 'SPACE' });
  advance(1200);
  manager.sweep();
  assert.equal(manager.snapshot().participants[0].isExiting, true);
  assert.deepEqual({ x: manager.snapshot().participants[0].x, y: manager.snapshot().participants[0].y }, { x: 88, y: 12 });
  manager.end(id);
  assert.equal(manager.snapshot().participants.length, 0);
  assert.equal(manager.snapshot().topSupporters.length, 0);
});
