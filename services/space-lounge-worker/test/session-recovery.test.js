import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../src/session-manager.js';

test('active session recovery returns the overlay capability only to its owning host', () => {
  const manager = new SessionManager();
  const started = manager.start({ hostUserId: 'host-owner', tiktokHandle: 'qaddaha', durationMinutes: 60 });
  manager.setGiftRules(started.snapshot.sessionId, [{ giftId: '1', action: 'DANCE', durationSeconds: 5, target: 'sender' }]);
  const recovered = manager.activeSessionForHost('host-owner');
  assert.equal(recovered.snapshot.sessionId, started.snapshot.sessionId);
  assert.equal(recovered.overlayToken, started.overlayToken);
  assert.deepEqual(recovered.giftRules, [{ giftId: '1', action: 'DANCE', durationSeconds: 5, target: 'sender' }]);
  assert.throws(() => manager.activeSessionForHost('other-host'), /forbidden/);
  manager.end(started.snapshot.sessionId);
  assert.equal(manager.activeSessionForHost('host-owner'), null);
});
