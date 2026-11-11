import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';

const ACTIONS = new Set(['DANCE', 'FLIP', 'RUN', 'CHAOS', 'ZERO_GRAVITY']);
const APPEARANCES = new Set(['masculine', 'feminine']);
const JOIN_KEYWORD = /^[\p{L}\p{N}_-]{2,20}$/u;
const CONTROL_CODE = /^!verify\s+(\d{8})$/i;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const CLAIM_TTL_MS = 3 * 60 * 1000;
const MAX_PENDING_CLAIMS = 100;
const MAX_TOTAL_CLAIMS = 1000;
const MAX_PROCESSED_EVENTS = 5000;

function opaqueToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest();
}

function secureEqual(left, right) {
  const a = Buffer.isBuffer(left) ? left : Buffer.from(String(left));
  const b = Buffer.isBuffer(right) ? right : Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function cleanDisplayName(value) {
  return String(value || 'ضيف')
    .replace(/[\u0000-\u001f\u007f<>\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32) || 'ضيف';
}

function normalizedKeyword(value) {
  const keyword = String(value || '').trim().toLocaleUpperCase('en');
  if (!JOIN_KEYWORD.test(keyword)) throw new Error('invalid_join_keyword');
  return keyword;
}

function boundedPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(12, Math.min(88, number)) : null;
}

export class SessionManager extends EventEmitter {
  constructor({ maxParticipants = 24, idleTimeoutMs = IDLE_TIMEOUT_MS, now = () => Date.now() } = {}) {
    super();
    this.maxParticipants = maxParticipants;
    this.idleTimeoutMs = idleTimeoutMs;
    this.now = now;
    this.session = null;
  }

  start({ hostUserId, tiktokHandle, joinKeyword = 'SPACE', durationMinutes = 75, title = 'استراحة الفضاء', sponsorLabel = '' }) {
    if (this.session && this.session.status !== 'ended') throw Object.assign(new Error('session_already_active'), { statusCode: 409 });
    const keyword = normalizedKeyword(joinKeyword);
    const duration = Number(durationMinutes);
    if (!Number.isInteger(duration) || duration < 60 || duration > 90) throw Object.assign(new Error('invalid_duration'), { statusCode: 400 });
    const handle = String(tiktokHandle || '').replace(/^@/, '').trim();
    if (!/^[A-Za-z0-9._]{2,24}$/.test(handle)) throw Object.assign(new Error('invalid_tiktok_handle'), { statusCode: 400 });

    const startedAt = this.now();
    this.session = {
      id: randomUUID(),
      hostUserId,
      tiktokHandle: handle,
      status: 'live',
      connection: 'connecting',
      startedAt,
      endsAt: startedAt + duration * 60_000,
      durationMinutes: duration,
      title: cleanDisplayName(title),
      joinKeyword: keyword,
      sponsor: sponsorLabel ? { name: cleanDisplayName(sponsorLabel), message: '', nextMomentAt: null } : null,
      overlayToken: opaqueToken(),
      participants: new Map(),
      participantByPlatformId: new Map(),
      claims: new Map(),
      claimsCreated: 0,
      giftRules: new Map(),
      supporters: new Map(),
      processedEvents: new Set(),
      lastMessageAt: startedAt,
      timers: new Set(),
    };
    this.emitSnapshot();
    this.emit('started', this.session.id);
    this._timer(() => this.end(this.session?.id), duration * 60_000);
    this._timer(() => this.sweep(), 15_000, true);
    return { snapshot: this.snapshot(), overlayToken: this.session.overlayToken };
  }

  get id() { return this.session?.id ?? null; }
  get status() { return this.session?.status ?? 'idle'; }

  isHost(sessionId, hostUserId) {
    return Boolean(this.session && this.session.id === String(sessionId) && this.session.status !== 'ended' && this.session.hostUserId === hostUserId);
  }

  activeSessionForHost(hostUserId) {
    const session = this.session;
    if (!session || session.status === 'ended') return null;
    if (session.hostUserId !== hostUserId) throw Object.assign(new Error('forbidden'), { statusCode: 403 });
    return {
      snapshot: this.snapshot(),
      overlayToken: session.overlayToken,
      giftRules: [...session.giftRules.values()].map((rule) => ({ ...rule })),
    };
  }

  snapshot() {
    const session = this.session;
    if (!session) return null;
    const participants = [...session.participants.values()].map((participant) => ({
      participantId: participant.id,
      displayName: participant.displayName,
      x: participant.x,
      y: participant.y,
      appearance: participant.appearance,
      ...(participant.action ? { action: participant.action, actionUntil: participant.actionUntil } : {}),
      ...(participant.supportCount ? { supportCount: participant.supportCount } : {}),
      ...(participant.isExiting ? { isExiting: true } : {}),
    }));
    const topSupporters = [...session.supporters.values()]
      .sort((a, b) => b.giftCount - a.giftCount)
      .slice(0, 3)
      .map(({ displayName, giftCount }) => ({ displayName, giftCount }));
    return {
      sessionId: session.id,
      title: session.title,
      status: session.status,
      connection: session.connection,
      startedAt: session.startedAt,
      endsAt: session.endsAt,
      joinKeyword: session.joinKeyword,
      participants,
      topSupporters,
      sponsor: session.sponsor,
    };
  }

  isOverlayTokenValid(sessionId, token) {
    const session = this._requireSession(sessionId);
    return secureEqual(digest(session.overlayToken), digest(token || ''));
  }

  setConnection(sessionId, state) {
    const session = this._requireSession(sessionId);
    if (!['idle', 'connecting', 'connected', 'reconnecting', 'offline'].includes(state)) return false;
    session.connection = state;
    this.emitSnapshot();
    return true;
  }

  createClaim(sessionId) {
    const session = this._requireSession(sessionId);
    if (session.status !== 'live') throw Object.assign(new Error('session_not_live'), { statusCode: 409 });
    for (const [claimId, claim] of session.claims) {
      if (claim.status !== 'pending' || claim.expiresAt <= this.now()) session.claims.delete(claimId);
    }
    if (session.claimsCreated >= MAX_TOTAL_CLAIMS) throw Object.assign(new Error('claim_session_capacity_reached'), { statusCode: 429 });
    if ([...session.claims.values()].filter((claim) => claim.status === 'pending').length >= MAX_PENDING_CLAIMS) {
      throw Object.assign(new Error('claim_capacity_reached'), { statusCode: 429 });
    }
    const code = String(randomInt(10_000_000, 100_000_000));
    const claimId = opaqueToken(24);
    session.claims.set(claimId, {
      id: claimId,
      codeHash: digest(code),
      status: 'pending',
      expiresAt: this.now() + CLAIM_TTL_MS,
      controlToken: null,
    });
    session.claimsCreated += 1;
    return { claimId, code, expiresAt: this.now() + CLAIM_TTL_MS, instruction: `اكتب في تعليق TikTok: !verify ${code}` };
  }

  claimStatus(sessionId, claimId) {
    const session = this._requireSession(sessionId);
    const claim = session.claims.get(String(claimId));
    if (!claim) return { status: 'not_found' };
    if (claim.expiresAt <= this.now()) {
      session.claims.delete(claim.id);
      return { status: 'expired' };
    }
    if (claim.status === 'verified') {
      session.claims.delete(claim.id);
      const participant = session.participants.get(claim.participantId);
      if (!participant || participant.isExiting) return { status: 'expired' };
      return {
        status: 'verified',
        participantId: claim.participantId,
        controlToken: claim.controlToken,
        position: { x: participant.x, y: participant.y },
        appearance: participant.appearance,
      };
    }
    if (claim.status !== 'pending') {
      session.claims.delete(claim.id);
      return { status: claim.status };
    }
    return { status: claim.status };
  }

  handleChat(sessionId, event) {
    const session = this._requireSession(sessionId);
    const actor = this._validActor(event);
    if (!actor) return false;
    const comment = String(event.comment || '').trim().slice(0, 512);
    if (!comment) return false;
    session.lastMessageAt = this.now();
    const verification = CONTROL_CODE.exec(comment);
    if (verification && this._verifyClaim(session, actor, verification[1])) return true;
    const existingId = session.participantByPlatformId.get(actor.userId);
    const existing = existingId ? session.participants.get(existingId) : null;
    if (existing) existing.lastActivityAt = this.now();
    if (comment.toLocaleUpperCase('en') === session.joinKeyword) {
      return Boolean(this._upsertParticipant(session, actor));
    }
    return Boolean(existing);
  }

  handleMember(sessionId, event) {
    const session = this._requireSession(sessionId);
    const actor = this._validActor(event);
    if (!actor) return false;
    const participantId = session.participantByPlatformId.get(actor.userId);
    const participant = participantId ? session.participants.get(participantId) : null;
    if (participant) participant.lastActivityAt = this.now();
    return Boolean(participant);
  }

  handleGift(sessionId, event) {
    const session = this._requireSession(sessionId);
    if (!event || (Number(event.giftType) === 1 && event.repeatEnd !== true)) return false;
    const actor = this._validActor(event);
    const giftId = String(event.giftId || '').trim();
    const eventId = String(event.eventId || '').slice(0, 180);
    if (!actor || !giftId || !eventId || this._alreadyProcessed(session, eventId)) return false;
    const rule = session.giftRules.get(giftId);
    if (!rule) return false;
    const participantId = session.participantByPlatformId.get(actor.userId);
    const sender = participantId ? session.participants.get(participantId) : null;
    if (!sender || sender.isExiting) return false;
    sender.lastActivityAt = this.now();
    sender.supportCount = (sender.supportCount || 0) + Math.max(1, Math.min(10000, Number(event.repeatCount) || 1));
    const supporter = session.supporters.get(actor.userId) || { displayName: actor.displayName, giftCount: 0 };
    supporter.displayName = actor.displayName;
    supporter.giftCount += Math.max(1, Math.min(10000, Number(event.repeatCount) || 1));
    session.supporters.set(actor.userId, supporter);

    const targets = rule.target === 'sender'
      ? [sender]
      : rule.target === 'all'
        ? [...session.participants.values()].filter((participant) => !participant.isExiting)
        : [...session.participants.values()]
          .filter((participant) => !participant.isExiting)
          .sort((a, b) => Math.hypot(a.x - sender.x, a.y - sender.y) - Math.hypot(b.x - sender.x, b.y - sender.y))
          .slice(0, 8);
    const until = this.now() + rule.durationSeconds * 1000;
    for (const participant of targets) {
      participant.action = rule.action;
      participant.actionUntil = until;
    }
    this.emitSnapshot();
    return true;
  }

  setGiftRules(sessionId, rawRules) {
    const session = this._requireSession(sessionId);
    if (!Array.isArray(rawRules) || rawRules.length > 40) throw Object.assign(new Error('invalid_gift_rules'), { statusCode: 400 });
    const rules = new Map();
    for (const raw of rawRules) {
      const giftId = String(raw?.giftId || '').trim();
      const action = String(raw?.action || '').toUpperCase();
      const durationSeconds = Number(raw?.durationSeconds);
      const target = String(raw?.target || 'sender');
      if (!/^\d{1,24}$/.test(giftId) || !ACTIONS.has(action) || !Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 60 || !['sender', 'group', 'all'].includes(target)) {
        throw Object.assign(new Error('invalid_gift_rule'), { statusCode: 400 });
      }
      rules.set(giftId, { giftId, action, durationSeconds, target });
    }
    session.giftRules = rules;
    return rules.size;
  }

  setSponsor(sessionId, sponsor) {
    const session = this._requireSession(sessionId);
    if (!sponsor || !String(sponsor.name || '').trim()) session.sponsor = null;
    else session.sponsor = {
      name: cleanDisplayName(sponsor.name),
      message: sponsor.message ? cleanDisplayName(sponsor.message) : '',
      nextMomentAt: Number.isFinite(Number(sponsor.nextMomentAt)) ? Number(sponsor.nextMomentAt) : null,
    };
    this.emitSnapshot();
  }

  moveParticipant(sessionId, participantId, token, x, y, appearance) {
    const session = this._requireSession(sessionId);
    const participant = session.participants.get(String(participantId));
    if (!participant || participant.isExiting || !secureEqual(digest(participant.controlToken), digest(token || ''))) return false;
    const nextX = boundedPercent(x);
    const nextY = boundedPercent(y);
    if (nextX === null || nextY === null) return false;
    if (appearance !== undefined && !APPEARANCES.has(appearance)) return false;
    participant.x = nextX;
    participant.y = nextY;
    if (appearance !== undefined) participant.appearance = appearance;
    participant.lastActivityAt = this.now();
    this.emitSnapshot();
    return true;
  }

  hostMoveParticipant(sessionId, participantId, x, y, action) {
    const session = this._requireSession(sessionId);
    const participant = session.participants.get(String(participantId));
    if (!participant || participant.isExiting) return false;
    const nextX = boundedPercent(x);
    const nextY = boundedPercent(y);
    if (nextX === null || nextY === null) return false;
    let normalizedAction;
    if (action !== undefined) {
      normalizedAction = String(action).toUpperCase();
      if (!ACTIONS.has(normalizedAction)) return false;
    }
    participant.x = nextX;
    participant.y = nextY;
    if (normalizedAction) {
      participant.action = normalizedAction;
      participant.actionUntil = this.now() + 5000;
    }
    this.emitSnapshot();
    return true;
  }

  setSceneAction(sessionId, action) {
    const session = this._requireSession(sessionId);
    const normalizedAction = String(action || '').toUpperCase();
    if (!ACTIONS.has(normalizedAction)) throw Object.assign(new Error('invalid_action'), { statusCode: 400 });
    const until = this.now() + 5000;
    for (const participant of session.participants.values()) {
      if (participant.isExiting) continue;
      participant.action = normalizedAction;
      participant.actionUntil = until;
    }
    this.emitSnapshot();
    return session.participants.size;
  }

  authorizeParticipant(sessionId, participantId, token) {
    const session = this._requireSession(sessionId);
    const participant = session.participants.get(String(participantId));
    return Boolean(participant && !participant.isExiting && secureEqual(digest(participant.controlToken), digest(token || '')));
  }

  sweep() {
    const session = this.session;
    if (!session || session.status !== 'live') return;
    const now = this.now();
    let changed = false;
    for (const participant of session.participants.values()) {
      if (!participant.isExiting && now - participant.lastActivityAt >= this.idleTimeoutMs) {
        participant.isExiting = true;
        participant.exitGeneration = (participant.exitGeneration || 0) + 1;
        const exitGeneration = participant.exitGeneration;
        participant.x = 88;
        participant.y = 12;
        changed = true;
        const exitTimer = this._timer(() => {
          session.timers.delete(exitTimer);
          participant.exitTimer = null;
          if (this.session?.id !== session.id) return;
          if (session.participants.get(participant.id) !== participant || !participant.isExiting || participant.exitGeneration !== exitGeneration) return;
          session.participants.delete(participant.id);
          session.participantByPlatformId.delete(participant.platformUserId);
          session.supporters.delete(participant.platformUserId);
          this.emitSnapshot();
        }, 1200);
        participant.exitTimer = exitTimer;
      }
    }
    for (const [claimId, claim] of session.claims) {
      if (claim.status !== 'pending' || claim.expiresAt <= now) session.claims.delete(claimId);
    }
    for (const participant of session.participants.values()) {
      if (participant.actionUntil && participant.actionUntil <= now) {
        participant.action = null;
        participant.actionUntil = null;
        changed = true;
      }
    }
    if (changed) this.emitSnapshot();
  }

  end(sessionId = this.session?.id) {
    const session = this.session;
    if (!session || session.id !== sessionId || session.status === 'ended') return false;
    session.status = 'ended';
    session.connection = 'offline';
    session.participants.clear();
    session.participantByPlatformId.clear();
    session.claims.clear();
    session.giftRules.clear();
    session.supporters.clear();
    session.processedEvents.clear();
    this.emitSnapshot();
    this.emit('ended', session.id);
    for (const timer of session.timers) clearTimeout(timer);
    session.timers.clear();
    this._timer(() => { if (this.session?.id === session.id) this.session = null; }, 30_000);
    return true;
  }

  emitSnapshot() {
    if (this.session) this.emit('snapshot', { sessionId: this.session.id, snapshot: this.snapshot() });
  }

  _timer(callback, delay, interval = false) {
    const session = this.session;
    const timer = interval ? setInterval(callback, delay) : setTimeout(callback, delay);
    timer.unref?.();
    session?.timers.add(timer);
    return timer;
  }

  _requireSession(sessionId) {
    const session = this.session;
    if (!session || session.id !== String(sessionId) || session.status === 'ended') throw Object.assign(new Error('session_not_found'), { statusCode: 404 });
    return session;
  }

  _validActor(event) {
    const userId = String(event?.userId || '').trim().slice(0, 160);
    if (!userId) return null;
    return { userId, displayName: cleanDisplayName(event?.displayName) };
  }

  _upsertParticipant(session, actor) {
    const existingId = session.participantByPlatformId.get(actor.userId);
    const existing = existingId ? session.participants.get(existingId) : null;
    if (existing) {
      if (existing.exitTimer) {
        clearTimeout(existing.exitTimer);
        session.timers.delete(existing.exitTimer);
        existing.exitTimer = null;
      }
      existing.exitGeneration = (existing.exitGeneration || 0) + 1;
      existing.displayName = actor.displayName;
      existing.lastActivityAt = this.now();
      existing.isExiting = false;
      this.emitSnapshot();
      return existing;
    }
    if (session.participants.size >= this.maxParticipants) return null;
    const id = randomUUID();
    const participant = {
      id,
      platformUserId: actor.userId,
      controlToken: opaqueToken(),
      displayName: actor.displayName,
      x: Math.round(38 + Math.random() * 24),
      y: Math.round(55 + Math.random() * 24),
      appearance: 'masculine',
      action: null,
      actionUntil: null,
      supportCount: 0,
      lastActivityAt: this.now(),
      isExiting: false,
      exitGeneration: 0,
    };
    session.participants.set(id, participant);
    session.participantByPlatformId.set(actor.userId, id);
    this.emitSnapshot();
    return participant;
  }

  _verifyClaim(session, actor, code) {
    const codeHash = digest(code);
    for (const claim of session.claims.values()) {
      if (claim.status !== 'pending' || claim.expiresAt <= this.now() || !secureEqual(claim.codeHash, codeHash)) continue;
      const participant = this._upsertParticipant(session, actor);
      if (!participant) {
        claim.status = 'full';
        claim.codeHash = null;
        return true;
      }
      claim.status = 'verified';
      claim.codeHash = null;
      claim.participantId = participant.id;
      claim.controlToken = participant.controlToken;
      return true;
    }
    return false;
  }

  _alreadyProcessed(session, eventId) {
    if (session.processedEvents.has(eventId)) return true;
    session.processedEvents.add(eventId);
    if (session.processedEvents.size > MAX_PROCESSED_EVENTS) {
      const first = session.processedEvents.values().next().value;
      if (first) session.processedEvents.delete(first);
    }
    return false;
  }
}

export const sessionConstants = { IDLE_TIMEOUT_MS, CLAIM_TTL_MS, MAX_PROCESSED_EVENTS };
