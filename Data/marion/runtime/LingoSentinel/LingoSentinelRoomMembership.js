'use strict';

/**
 * LingoSentinelRoomMembership
 * ------------------------------------------------------------
 * Layer 3 in-memory membership authority.
 * Membership is session-bound and room-scoped. No private provider tokens are stored.
 */

const RoomPolicy = require('./LingoSentinelRoomPolicy');

const VERSION = 'nyx.lingosentinel.roomMembership/3.0-session-bound';
const DEFAULT_IDLE_TTL_MS = RoomPolicy.clampNumber(
  process.env.LINGOSENTINEL_MEMBERSHIP_IDLE_TTL_MS,
  60 * 60 * 1000,
  5 * 60 * 1000,
  24 * 60 * 60 * 1000
);

function nowIso() { return new Date().toISOString(); }

function cloneMembership(item) {
  if (!item) return null;
  return {
    contract: RoomPolicy.MEMBERSHIP_CONTRACT,
    roomId: item.roomId,
    clientId: item.clientId,
    sessionId: item.sessionId,
    displayName: item.displayName,
    role: item.role,
    authenticated: item.authenticated === true,
    joinedAt: item.joinedAt,
    updatedAt: item.updatedAt,
    leftAt: item.leftAt || null,
    active: item.active === true
  };
}

class LingoSentinelRoomMembershipStore {
  constructor(options = {}) {
    this.idleTtlMs = RoomPolicy.clampNumber(options.idleTtlMs, DEFAULT_IDLE_TTL_MS, 5 * 60 * 1000, 24 * 60 * 60 * 1000);
    this.rooms = new Map();
  }

  _roomMap(roomId, create = false) {
    const id = RoomPolicy.sanitizeIdentifier(roomId, '', 96);
    if (!id) return null;
    if (!this.rooms.has(id) && create) this.rooms.set(id, new Map());
    return this.rooms.get(id) || null;
  }

  join(roomId, identity = {}, options = {}) {
    const validation = RoomPolicy.validateIdentity(identity);
    if (!validation.ok) return { ok: false, errors: validation.errors };
    const id = RoomPolicy.sanitizeIdentifier(roomId, '', 96);
    if (!id) return { ok: false, errors: ['roomId is required.'] };
    const normalized = validation.normalized;
    const roomMap = this._roomMap(id, true);
    const key = normalized.sessionId;
    const existing = roomMap.get(key);
    const timestamp = nowIso();
    const membership = {
      contract: RoomPolicy.MEMBERSHIP_CONTRACT,
      roomId: id,
      clientId: normalized.clientId,
      sessionId: normalized.sessionId,
      displayName: normalized.displayName,
      role: options.role === 'creator' ? 'creator' : existing && existing.role === 'creator' ? 'creator' : 'participant',
      authenticated: normalized.authenticated === true,
      joinedAt: existing && existing.joinedAt ? existing.joinedAt : timestamp,
      updatedAt: timestamp,
      leftAt: null,
      active: true
    };
    roomMap.set(key, membership);
    return { ok: true, membership: cloneMembership(membership), alreadyMember: !!(existing && existing.active) };
  }

  leave(roomId, identity = {}) {
    const id = RoomPolicy.sanitizeIdentifier(roomId, '', 96);
    const sessionId = RoomPolicy.sanitizeIdentifier(identity.sessionId || identity.session, '', 96);
    const roomMap = this._roomMap(id, false);
    if (!id || !sessionId || !roomMap || !roomMap.has(sessionId)) {
      return { ok: false, errors: ['Active room membership was not found.'] };
    }
    const item = roomMap.get(sessionId);
    item.active = false;
    item.updatedAt = nowIso();
    item.leftAt = item.updatedAt;
    roomMap.set(sessionId, item);
    return { ok: true, membership: cloneMembership(item) };
  }

  get(roomId, sessionId) {
    const roomMap = this._roomMap(roomId, false);
    const key = RoomPolicy.sanitizeIdentifier(sessionId, '', 96);
    return cloneMembership(roomMap && key ? roomMap.get(key) : null);
  }

  isMember(roomId, identity = {}) {
    const membership = this.get(roomId, identity.sessionId || identity.session);
    return !!(
      membership &&
      membership.active &&
      membership.clientId === RoomPolicy.sanitizeIdentifier(identity.clientId || identity.id, '', 80)
    );
  }

  authorize(roomId, identity = {}, action = 'subscribe') {
    const membership = this.get(roomId, identity.sessionId || identity.session);
    const clientId = RoomPolicy.sanitizeIdentifier(identity.clientId || identity.id, '', 80);
    const validAction = ['join', 'subscribe', 'publish', 'presence', 'leave'].includes(action) ? action : 'subscribe';
    const ok = !!(membership && membership.active && membership.clientId === clientId);
    return {
      ok,
      action: validAction,
      roomId: RoomPolicy.sanitizeIdentifier(roomId, '', 96),
      membership: ok ? membership : null,
      error: ok ? '' : 'room_membership_required'
    };
  }

  list(roomId, options = {}) {
    const roomMap = this._roomMap(roomId, false);
    if (!roomMap) return [];
    const includeInactive = options.includeInactive === true;
    return Array.from(roomMap.values())
      .filter((item) => includeInactive || item.active)
      .map(cloneMembership)
      .sort((a, b) => String(a.joinedAt).localeCompare(String(b.joinedAt)));
  }

  activeCount(roomId) {
    return this.list(roomId).length;
  }

  removeRoom(roomId) {
    return this.rooms.delete(RoomPolicy.sanitizeIdentifier(roomId, '', 96));
  }

  prune(now = Date.now()) {
    let removed = 0;
    for (const [roomId, roomMap] of this.rooms.entries()) {
      for (const [sessionId, item] of roomMap.entries()) {
        const updatedAt = Date.parse(item.updatedAt || item.joinedAt || 0);
        if (!item.active && Number.isFinite(updatedAt) && now - updatedAt > this.idleTtlMs) {
          roomMap.delete(sessionId);
          removed += 1;
        }
      }
      if (roomMap.size === 0) this.rooms.delete(roomId);
    }
    return removed;
  }

  reset() { this.rooms.clear(); }

  getHealth() {
    let activeMemberships = 0;
    for (const roomId of this.rooms.keys()) activeMemberships += this.activeCount(roomId);
    return {
      ok: true,
      service: 'LingoSentinelRoomMembership',
      version: VERSION,
      storage: 'in_memory',
      roomCount: this.rooms.size,
      activeMemberships,
      sessionBound: true,
      clientBound: true,
      idleTtlMs: this.idleTtlMs
    };
  }
}

const singleton = new LingoSentinelRoomMembershipStore();

module.exports = singleton;
module.exports.VERSION = VERSION;
module.exports.LingoSentinelRoomMembershipStore = LingoSentinelRoomMembershipStore;
module.exports.cloneMembership = cloneMembership;
