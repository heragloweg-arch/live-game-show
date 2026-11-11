import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { LiveConnector } from '../src/live-connector.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('schedules one retry when disconnect arrives while initial connect is pending', async () => {
  const connections = [];
  const timers = [];
  const states = [];
  let resolveFirstConnect;

  class FakeConnection extends EventEmitter {
    constructor(handle) {
      super();
      this.handle = handle;
      connections.push(this);
    }

    connect() {
      if (connections.length === 1) return new Promise((resolve) => { resolveFirstConnect = resolve; });
      return Promise.resolve();
    }

    disconnect() {
      return Promise.resolve();
    }
  }

  const connector = new LiveConnector({
    sessionManager: { setConnection: (_sessionId, state) => states.push(state) },
    connectionFactory: (handle) => new FakeConnection(handle),
    logger: { error() {} },
    random: () => 0,
    setTimer: (callback, delayMs) => {
      const timer = { callback, delayMs, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => { timer.cleared = true; },
  });

  connector.connect('session-1', 'qaddaha');
  connections[0].emit('disconnected', { retryAfter: 0 });
  assert.equal(timers.length, 0);
  resolveFirstConnect();
  await flush();
  assert.equal(timers.length, 1);
  assert.equal(states.at(-1), 'reconnecting');

  timers[0].callback();
  await flush();
  await flush();
  assert.equal(connections.length, 2);
  assert.equal(states.at(-1), 'connected');
  await connector.stop('session-1', { updateState: false });
});
