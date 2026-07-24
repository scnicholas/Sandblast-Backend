'use strict';

/**
 * LingoSentinelRoomMembership
 * ------------------------------------------------------------
 * Session-bound, room-scoped membership authority with opaque credentials.
 */

const RoomPolicy = require('./LingoSentinelRoomPolicy');
const MembershipCredential = require('./LingoSentinelMembershipCredential');

const VERSION = 'nyx.lingosentinel.roomMembership/5.0-credential-bound';
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
    displayName: item.displayName,
    role: item.role,
    authenticated: item.authenticated === true,
    joinedAt: item.joinedAt,
    updatedAt: item.updatedAt,
    leftAt: item.leftAt || null,
    active: item.active === true,
    credentialExpiresAt: item.credentialExpiresAt || null
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

  _record(roomId, sessionId) {
    const roomMap = this._roomMap(roomId, false);
    const key = RoomPolicy.sanitizeIdentifier(sessionId, '', 96);
    return roomMap && key ? roomMap.get(key) || null : null;
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
    if (existing && existing.clientId !== normalized.clientId) {
      return { ok: false, errors: ['Session is already bound to another client.'], code: 'SESSION_CLIENT_COLLISION' };
    }

    const issued = MembershipCredential.issueCredential({ ttlMs: options.credentialTtlMs });
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
      active: true,
      credentialHash: issued.credentialHash,
      credentialId: issued.credentialId,
      credentialIssuedAt: issued.issuedAt,
      credentialExpiresAt: issued.expiresAt
    };
    roomMap.set(key, membership);
    return {
      ok: true,
      membership: cloneMembership(membership),
      membershipCredential: issued.credential,
      credentialExpiresAt: issued.expiresAt,
      alreadyMember: !!(existing && existing.active),
      credentialRotated: !!existing
    };
  }

  leave(roomId, identity = {}) {
    const authorization = this.authorize(roomId, identity, 'leave');
    if (!authorization.ok) return { ok: false, errors: [authorization.error], code: authorization.code };
    const item = this._record(roomId, identity.sessionId || identity.session);
    item.active = false;
    item.updatedAt = nowIso();
    item.leftAt = item.updatedAt;
    item.credentialHash = '';
    item.credentialId = '';
    item.credentialExpiresAt = item.updatedAt;
    return { ok: true, membership: cloneMembership(item) };
  }

  get(roomId, sessionId) {
    return cloneMembership(this._record(roomId, sessionId));
  }

  isMember(roomId, identity = {}) {
    const item = this._record(roomId, identity.sessionId || identity.session);
    const clientId = RoomPolicy.sanitizeIdentifier(identity.clientId || identity.id, '', 80);
    return !!(item && item.active && item.clientId === clientId);
  }

  authorize(roomId, identity = {}, action = 'subscribe') {
    const id = RoomPolicy.sanitizeIdentifier(roomId, '', 96);
    const sessionId = RoomPolicy.sanitizeIdentifier(identity.sessionId || identity.session, '', 96);
    const clientId = RoomPolicy.sanitizeIdentifier(identity.clientId || identity.id, '', 80);
    const credential = String(identity.membershipCredential || identity.credential || '').trim();
    const validAction = ['subscribe', 'publish', 'presence', 'leave', 'connection', 'read'].includes(action) ? action : 'subscribe';
    const item = this._record(id, sessionId);

    if (!item || !item.active) {
      return { ok: false, action: validAction, roomId: id, membership: null, error: 'room_membership_required', code: 'ROOM_MEMBERSHIP_REQUIRED' };
    }
    if (!clientId || item.clientId !== clientId) {
      return { ok: false, action: validAction, roomId: id, membership: null, error: 'membership_identity_mismatch', code: 'MEMBERSHIP_IDENTITY_MISMATCH' };
    }
    if (!credential) {
      return { ok: false, action: validAction, roomId: id, membership: null, error: 'membership_credential_required', code: 'MEMBERSHIP_CREDENTIAL_REQUIRED' };
    }
    const proof = MembershipCredential.verifyCredential(item, credential);
    if (!proof.ok) {
      return { ok: false, action: validAction, roomId: id, membership: null, error: proof.error, code: proof.code };
    }

    item.updatedAt = nowIso();
    return {
      ok: true,
      action: validAction,
      roomId: id,
      membership: cloneMembership(item),
      credentialId: proof.credentialId,
      credentialExpiresAt: proof.expiresAt,
      error: ''
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

  activeCount(roomId) { return this.list(roomId).length; }
  removeRoom(roomId) { return this.rooms.delete(RoomPolicy.sanitizeIdentifier(roomId, '', 96)); }

  prune(now = Date.now()) {
    let removed = 0;
    for (const [roomId, roomMap] of this.rooms.entries()) {
      for (const [sessionId, item] of roomMap.entries()) {
        const updatedAt = Date.parse(item.updatedAt || item.joinedAt || 0);
        const credentialExpiry = Date.parse(item.credentialExpiresAt || 0);
        if (item.active && Number.isFinite(credentialExpiry) && credentialExpiry <= now) {
          item.active = false;
          item.leftAt = nowIso();
          item.updatedAt = item.leftAt;
          item.credentialHash = '';
        }
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
    this.prune();
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
      credentialBound: true,
      plaintextCredentialStored: false,
      publicSessionIdsExposed: false,
      idleTtlMs: this.idleTtlMs,
      credential: MembershipCredential.getHealth()
    };
  }
}

const singleton = new LingoSentinelRoomMembershipStore();
module.exports = singleton;
module.exports.VERSION = VERSION;
module.exports.LingoSentinelRoomMembershipStore = LingoSentinelRoomMembershipStore;
module.exports.cloneMembership = cloneMembership;
