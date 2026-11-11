import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeActor, normalizeChatEvent, normalizeGiftEvent, normalizeMemberEvent } from '../src/tiktok-event-adapter.js';

test('normalizes actor identifiers and sanitizes display names', () => {
  assert.deepEqual(normalizeActor({ user: { id: 456, nickname: '<Host>', uniqueId: 'host' } }), { userId: '456', displayName: 'Host' });
  assert.equal(normalizeActor({ user: { nickname: 'No ID' } }), null);
  assert.deepEqual(normalizeMemberEvent({ user: { uniqueId: 'viewer', nickname: 'Viewer' } }), { userId: 'viewer', displayName: 'Viewer' });
});

test('keeps chat content ephemeral-ready and strips control characters', () => {
  assert.deepEqual(normalizeChatEvent({ comment: '  SPACE\u0000 ', user: { id: 'u1', nickname: 'Name' } }), { userId: 'u1', displayName: 'Name', comment: 'SPACE' });
  assert.equal(normalizeChatEvent({ comment: ' ', user: { id: 'u1' } }), null);
});

test('normalizes gift ids/counts and emits a stable event key for completed streaks', () => {
  const inProgress = normalizeGiftEvent({ giftId: 1234567890123n, repeatCount: 3, repeatEnd: false, giftDetails: { giftType: 1 }, common: { msgId: 'gift-1' }, user: { id: 'u2', nickname: 'Gift sender' } });
  assert.equal(inProgress.giftId, '1234567890123');
  assert.equal(inProgress.repeatCount, 3);
  assert.equal(inProgress.giftType, 1);
  assert.equal(inProgress.repeatEnd, false);
  assert.equal(inProgress.eventId, 'gift-1');
  assert.equal(normalizeGiftEvent({ giftId: 5, user: { nickname: 'no id' } }), null);
});
