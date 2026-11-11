import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../src/session-manager.js';

test('verified participant receives the current scene position and appearance exactly once', () => {
  const manager = new SessionManager();
  const started = manager.start({ hostUserId: 'host-owner', tiktokHandle: 'qaddaha', durationMinutes: 60 });
  const sessionId = started.snapshot.sessionId;
  const actor = { userId: 'tt-actor-1', uniqueId: 'space_pilot', displayName: 'Space Pilot' };
  manager.handleChat(sessionId, { ...actor, comment: 'SPACE' });
  const participant = manager.snapshot().participants[0];
  const claim = manager.createClaim(sessionId);
  manager.handleChat(sessionId, { ...actor, comment: `!verify ${claim.code}` });
  const verified = manager.claimStatus(sessionId, claim.claimId);
  assert.deepEqual(verified.position, { x: participant.x, y: participant.y });
  assert.equal(verified.appearance, participant.appearance);
  assert.ok(verified.controlToken);
  assert.equal(manager.claimStatus(sessionId, claim.claimId).status, 'not_found');
  manager.end(sessionId);
});
