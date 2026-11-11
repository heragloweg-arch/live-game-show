import { TikTokLiveConnection } from 'tiktok-live-connector';
import { normalizeChatEvent, normalizeGiftEvent, normalizeMemberEvent } from './tiktok-event-adapter.js';

export class LiveConnector {
  constructor({ sessionManager, logger = console, random = Math.random, setTimer = setTimeout, clearTimer = clearTimeout, connectionFactory = (handle, options) => new TikTokLiveConnection(handle, options) } = {}) {
    this.sessionManager = sessionManager;
    this.logger = logger;
    this.random = random;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.connectionFactory = connectionFactory;
    this.connections = new Map();
  }

  connect(sessionId, handle) {
    this.stop(sessionId, { updateState: false }).catch(() => {});
    const state = { sessionId, handle, attempts: 0, connecting: false, closed: false, retryRequested: false, retryAfterSeconds: 0, timer: null, connection: null };
    this.connections.set(sessionId, state);
    void this._connect(state);
  }

  async stop(sessionId, { updateState = true } = {}) {
    const state = this.connections.get(sessionId);
    if (!state) return;
    state.closed = true;
    if (state.timer) this.clearTimer(state.timer);
    state.timer = null;
    this.connections.delete(sessionId);
    try { await state.connection?.disconnect(); } catch { /* best-effort close */ }
    if (updateState) {
      try { this.sessionManager.setConnection(sessionId, 'offline'); } catch { /* session already ended */ }
    }
  }

  async _connect(state) {
    if (state.closed || state.connecting || this.connections.get(state.sessionId) !== state) return;
    state.connecting = true;
    const connection = this.connectionFactory(state.handle, {
      authenticateWs: false,
      enableExtendedGiftInfo: false,
      processInitialData: false,
    });
    state.connection = connection;
    connection.on('chat', (data) => {
      if (state.closed || state.connection !== connection) return;
      const event = normalizeChatEvent(data);
      if (event) this._safe(() => this.sessionManager.handleChat(state.sessionId, event));
    });
    connection.on('member', (data) => {
      if (state.closed || state.connection !== connection) return;
      const event = normalizeMemberEvent(data);
      if (event) this._safe(() => this.sessionManager.handleMember(state.sessionId, event));
    });
    connection.on('gift', (data) => {
      if (state.closed || state.connection !== connection) return;
      const event = normalizeGiftEvent(data);
      if (event) this._safe(() => this.sessionManager.handleGift(state.sessionId, event));
    });
    connection.on('disconnected', (event) => {
      if (state.closed || state.connection !== connection) return;
      state.attempts += 1;
      this._safe(() => this.sessionManager.setConnection(state.sessionId, 'reconnecting'));
      this._requestRetry(state, Number(event?.retryAfter) || 0);
    });
    connection.on('error', () => {
      if (state.closed || state.connection !== connection) return;
      this._safe(() => this.sessionManager.setConnection(state.sessionId, 'reconnecting'));
      state.attempts += 1;
      this._requestRetry(state, 0);
    });
    this._safe(() => this.sessionManager.setConnection(state.sessionId, state.attempts ? 'reconnecting' : 'connecting'));
    try {
      await connection.connect();
      if (state.closed || state.connection !== connection) return;
      if (state.retryRequested) {
        this._safe(() => this.sessionManager.setConnection(state.sessionId, 'reconnecting'));
        return;
      }
      state.attempts = 0;
      this._safe(() => this.sessionManager.setConnection(state.sessionId, 'connected'));
    } catch (error) {
      if (state.closed || state.connection !== connection) return;
      state.attempts += 1;
      const retryAfter = Number(error?.retryAfter) || 0;
      this._safe(() => this.sessionManager.setConnection(state.sessionId, 'reconnecting'));
      this._requestRetry(state, retryAfter);
    } finally {
      state.connecting = false;
      if (state.retryRequested && !state.closed && this.connections.get(state.sessionId) === state) {
        const retryAfterSeconds = state.retryAfterSeconds;
        state.retryRequested = false;
        state.retryAfterSeconds = 0;
        this._scheduleRetry(state, retryAfterSeconds);
      }
    }
  }

  _requestRetry(state, retryAfterSeconds = 0) {
    if (state.closed || this.connections.get(state.sessionId) !== state) return;
    if (state.connecting) {
      state.retryRequested = true;
      state.retryAfterSeconds = Math.max(state.retryAfterSeconds, Number(retryAfterSeconds) || 0);
      return;
    }
    this._scheduleRetry(state, retryAfterSeconds);
  }

  _scheduleRetry(state, retryAfterSeconds = 0) {
    if (state.closed || state.timer || this.connections.get(state.sessionId) !== state) return;
    const exponential = Math.min(30_000, 1_000 * (2 ** Math.min(state.attempts, 5)));
    const retryAfterMs = Math.min(120_000, Math.max(0, retryAfterSeconds * 1000));
    const delay = Math.max(exponential, retryAfterMs) + Math.floor(this.random() * 700);
    state.timer = this.setTimer(() => {
      state.timer = null;
      if (state.closed) return;
      const previous = state.connection;
      state.connection = null;
      Promise.resolve(previous?.disconnect()).catch(() => {}).finally(() => { void this._connect(state); });
    }, delay);
    state.timer.unref?.();
  }

  _safe(operation) {
    try { operation(); } catch (error) { this.logger.error?.('[space-lounge-worker] event rejected:', error?.message || 'unknown'); }
  }
}
