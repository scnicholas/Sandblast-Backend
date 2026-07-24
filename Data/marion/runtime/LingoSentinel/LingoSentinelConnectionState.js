'use strict';

const RoomPolicy = require('./LingoSentinelRoomPolicy');

const VERSION = 'nyx.lingosentinel.connectionState/4.0-lifecycle';
const STATES = Object.freeze(['initialized', 'connecting', 'connected', 'reconnecting', 'suspended', 'disconnected', 'failed', 'closed']);
const TRANSITIONS = Object.freeze({
  initialized: ['connecting', 'closed'],
  connecting: ['connected', 'reconnecting', 'failed', 'closed'],
  connected: ['reconnecting', 'suspended', 'disconnected', 'failed', 'closed'],
  reconnecting: ['connected', 'suspended', 'failed', 'closed'],
  suspended: ['reconnecting', 'connected', 'failed', 'closed'],
  disconnected: ['connecting', 'reconnecting', 'closed'],
  failed: ['connecting', 'closed'],
  closed: []
});
const DEFAULT_RETENTION_MS = RoomPolicy.clampNumber(process.env.LINGOSENTINEL_CONNECTION_RETENTION_MS, 60 * 60 * 1000, 5 * 60 * 1000, 24 * 60 * 60 * 1000);

function nowIso() { return new Date().toISOString(); }
function cleanState(value) { const state = RoomPolicy.safeString(value).toLowerCase(); return STATES.includes(state) ? state : null; }
function clone(record) {
  if (!record) return null;
  return {
    contract: 'lingosentinel.connectionState/1.0',
    clientId: record.clientId,
    sessionId: record.sessionId,
    roomId: record.roomId,
    state: record.state,
    previousState: record.previousState || null,
    attempt: record.attempt,
    connectedAt: record.connectedAt || null,
    disconnectedAt: record.disconnectedAt || null,
    updatedAt: record.updatedAt,
    errorCode: record.errorCode || ''
  };
}

class LingoSentinelConnectionStateStore {
  constructor(options = {}) {
    this.retentionMs = RoomPolicy.clampNumber(options.retentionMs, DEFAULT_RETENTION_MS, 5 * 60 * 1000, 24 * 60 * 60 * 1000);
    this.records = new Map();
  }
  register(input = {}) {
    const identity = RoomPolicy.validateIdentity(input);
    if (!identity.ok) return { ok: false, errors: identity.errors };
    const roomId = RoomPolicy.sanitizeIdentifier(input.roomId, '', 96);
    if (!roomId) return { ok: false, errors: ['roomId is required.'] };
    const existing = this.records.get(identity.normalized.sessionId);
    const timestamp = nowIso();
    const record = {
      clientId: identity.normalized.clientId,
      sessionId: identity.normalized.sessionId,
      roomId,
      state: existing && existing.state !== 'closed' ? existing.state : 'initialized',
      previousState: existing && existing.previousState || null,
      attempt: existing && existing.attempt || 0,
      connectedAt: existing && existing.connectedAt || null,
      disconnectedAt: existing && existing.disconnectedAt || null,
      updatedAt: timestamp,
      errorCode: ''
    };
    this.records.set(record.sessionId, record);
    return { ok: true, connection: clone(record), alreadyRegistered: !!existing };
  }
  update(sessionId, nextState, details = {}) {
    const key = RoomPolicy.sanitizeIdentifier(sessionId, '', 96);
    const state = cleanState(nextState);
    const record = this.records.get(key);
    if (!record) return { ok: false, errors: ['Connection session was not registered.'] };
    if (!state) return { ok: false, errors: ['Invalid connection state.'] };
    if (state !== record.state && !TRANSITIONS[record.state].includes(state)) {
      return { ok: false, errors: [`Invalid connection transition: ${record.state} -> ${state}.`] };
    }
    const timestamp = nowIso();
    const previousState = record.state;
    record.previousState = previousState;
    record.state = state;
    record.updatedAt = timestamp;
    record.errorCode = RoomPolicy.sanitizeIdentifier(details.errorCode || '', '', 64);
    if (state === 'connecting' || state === 'reconnecting') record.attempt += 1;
    if (state === 'connected') {
      record.connectedAt = timestamp;
      record.disconnectedAt = null;
      record.errorCode = '';
    }
    if (['disconnected', 'failed', 'closed'].includes(state)) record.disconnectedAt = timestamp;
    this.records.set(key, record);
    return { ok: true, connection: clone(record) };
  }
  get(sessionId) { return clone(this.records.get(RoomPolicy.sanitizeIdentifier(sessionId, '', 96))); }
  remove(sessionId) { return this.records.delete(RoomPolicy.sanitizeIdentifier(sessionId, '', 96)); }
  list(roomId) {
    const id = RoomPolicy.sanitizeIdentifier(roomId, '', 96);
    return Array.from(this.records.values()).filter((item) => !id || item.roomId === id).map(clone);
  }
  prune(now = Date.now()) {
    let removed = 0;
    for (const [sessionId, item] of this.records.entries()) {
      const updated = Date.parse(item.updatedAt || 0);
      if (['closed', 'failed', 'disconnected'].includes(item.state) && Number.isFinite(updated) && now - updated > this.retentionMs) {
        this.records.delete(sessionId); removed += 1;
      }
    }
    return removed;
  }
  reset() { this.records.clear(); }
  getHealth() {
    this.prune();
    const counts = Object.fromEntries(STATES.map((state) => [state, 0]));
    for (const item of this.records.values()) counts[item.state] += 1;
    return { ok: true, service: 'LingoSentinelConnectionState', version: VERSION, storage: 'in_memory', states: STATES.slice(), counts, activeRecords: this.records.size, transitionValidation: true };
  }
}

const singleton = new LingoSentinelConnectionStateStore();
module.exports = singleton;
module.exports.VERSION = VERSION;
module.exports.STATES = STATES;
module.exports.TRANSITIONS = TRANSITIONS;
module.exports.LingoSentinelConnectionStateStore = LingoSentinelConnectionStateStore;
