import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeActor, normalizeGiftEvent } from '../src/tiktok-event-adapter.js';

test('strips bidirectional and invisible formatting controls from display names', () => {
  const actor = normalizeActor({ user: { id: 'u-1', nickname: 'viewer\u202Egnp.exe\u2066' } });
  assert.equal(actor.displayName, 'viewergnp.exe');
});

test('drops gifts without a stable event identifier instead of inventing a non-deduplicable key', () => {
  assert.equal(normalizeGiftEvent({ giftId: 123, repeatCount: 1, repeatEnd: true, user: { id: 'u-2', nickname: 'Gift' } }), null);
});
