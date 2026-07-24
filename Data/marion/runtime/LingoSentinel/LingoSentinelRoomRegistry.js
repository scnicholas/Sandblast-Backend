'use strict';

/**
 * LingoSentinelRoomRegistry
 * ------------------------------------------------------------
 * Layer 3 authoritative room registry.
 * Stores only operational room metadata and delegates session membership to
 * LingoSentinelRoomMembership.
 */

const RoomPolicy = require('./LingoSentinelRoomPolicy');
const Membership = require('./LingoSentinelRoomMembership');

const VERSION = 'nyx.lingosentinel.roomRegistry/3.0-controlled-rooms';

function nowIso() { return new Date().toISOString(); }

function cloneRoom(room, membershipStore = Membership) {
  if (!room) return null;
  return {
    contract: RoomPolicy.ROOM_CONTRACT,
    roomId: room.roomId,
    roomType: room.roomType,
    displayName: room.displayName,
    createdBy: room.createdBy,
    joinPolicy: room.joinPolicy,
    maxParticipants: room.maxParticipants,
    participantCount: membershipStore.activeCount(room.roomId),
    status: room.status,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    expiresAt: room.expiresAt
  };
}

class LingoSentinelRoomRegistryStore {
  constructor(options = {}) {
    this.memberships = options.memberships || Membership;
    this.rooms = new Map();
    this.seedDefaultRoom(options.seedDefaultRoom !== false);
  }

  seedDefaultRoom(enabled = true) {
    if (!enabled || this.rooms.has(RoomPolicy.DEFAULT_ROOM_ID)) return;
    const timestamp = nowIso();
    this.rooms.set(RoomPolicy.DEFAULT_ROOM_ID, {
      contract: RoomPolicy.ROOM_CONTRACT,
      roomId: RoomPolicy.DEFAULT_ROOM_ID,
      roomType: 'group_room',
      displayName: 'LingoSentinel Main',
      createdBy: 'runtime',
      joinPolicy: 'open',
      maxParticipants: RoomPolicy.DEFAULT_MAX_PARTICIPANTS,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: null,
      systemSeeded: true,
      invitedClientIds: []
    });
  }

  create(input = {}, creator = {}) {
    const roomValidation = RoomPolicy.validateRoomInput(input);
    const identityValidation = RoomPolicy.validateIdentity(creator);
    const errors = roomValidation.errors.concat(identityValidation.errors);
    if (errors.length) return { ok: false, errors };
    const roomInput = roomValidation.normalized;
    if (this.rooms.has(roomInput.roomId)) return { ok: false, errors: ['Room already exists.'], code: 'ROOM_ALREADY_EXISTS' };
    const timestamp = nowIso();
    const room = {
      contract: RoomPolicy.ROOM_CONTRACT,
      roomId: roomInput.roomId,
      roomType: roomInput.roomType,
      displayName: roomInput.displayName,
      createdBy: identityValidation.normalized.clientId,
      joinPolicy: roomInput.joinPolicy,
      maxParticipants: roomInput.maxParticipants,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: new Date(Date.now() + roomInput.ttlMs).toISOString(),
      systemSeeded: false,
      invitedClientIds: roomInput.invitedClientIds.slice()
    };
    this.rooms.set(room.roomId, room);
    const joined = this.memberships.join(room.roomId, identityValidation.normalized, { role: 'creator' });
    if (!joined.ok) {
      this.rooms.delete(room.roomId);
      return joined;
    }
    return { ok: true, room: cloneRoom(room, this.memberships), membership: joined.membership };
  }

  get(roomId) {
    this.cleanup();
    const id = RoomPolicy.sanitizeIdentifier(roomId, '', 96);
    return cloneRoom(this.rooms.get(id), this.memberships);
  }

  exists(roomId) { return !!this.get(roomId); }

  join(roomId, identity = {}, options = {}) {
    this.cleanup();
    const id = RoomPolicy.sanitizeIdentifier(roomId, '', 96);
    const room = this.rooms.get(id);
    if (!room) return { ok: false, errors: ['Room was not found.'], code: 'ROOM_NOT_FOUND' };
    const alreadyMember = this.memberships.isMember(id, identity);
    const joiningClientId = RoomPolicy.sanitizeIdentifier(identity.clientId || identity.id, '', 80);
    const permission = RoomPolicy.canJoin(cloneRoom(room, this.memberships), identity, {
      alreadyMember,
      invited: Array.isArray(room.invitedClientIds) && room.invitedClientIds.includes(joiningClientId),
      isCreator: room.createdBy === joiningClientId
    });
    if (!permission.ok) return { ok: false, errors: permission.errors, code: 'ROOM_JOIN_REJECTED' };
    const result = this.memberships.join(id, permission.identity, {
      role: room.createdBy === permission.identity.clientId ? 'creator' : 'participant'
    });
    room.updatedAt = nowIso();
    this.rooms.set(id, room);
    return { ...result, room: cloneRoom(room, this.memberships) };
  }

  leave(roomId, identity = {}) {
    const id = RoomPolicy.sanitizeIdentifier(roomId, '', 96);
    const room = this.rooms.get(id);
    if (!room) return { ok: false, errors: ['Room was not found.'], code: 'ROOM_NOT_FOUND' };
    const result = this.memberships.leave(id, identity);
    room.updatedAt = nowIso();
    this.rooms.set(id, room);
    return { ...result, room: cloneRoom(room, this.memberships) };
  }

  authorize(roomId, identity = {}, action = 'subscribe') {
    const id = RoomPolicy.sanitizeIdentifier(roomId, '', 96);
    const room = this.get(id);
    if (!room || room.status !== 'active') return { ok: false, error: 'room_not_active', roomId: id, action };
    return this.memberships.authorize(id, identity, action);
  }

  listParticipants(roomId) {
    const room = this.get(roomId);
    if (!room) return { ok: false, errors: ['Room was not found.'], participants: [] };
    return { ok: true, room, participants: this.memberships.list(room.roomId) };
  }

  close(roomId, identity = {}) {
    const id = RoomPolicy.sanitizeIdentifier(roomId, '', 96);
    const room = this.rooms.get(id);
    if (!room) return { ok: false, errors: ['Room was not found.'] };
    const clientId = RoomPolicy.sanitizeIdentifier(identity.clientId || identity.id, '', 80);
    if (room.systemSeeded || room.createdBy !== clientId) return { ok: false, errors: ['Only the room creator may close this room.'] };
    room.status = 'closed';
    room.updatedAt = nowIso();
    this.rooms.set(id, room);
    return { ok: true, room: cloneRoom(room, this.memberships) };
  }

  cleanup(now = Date.now()) {
    let expiredRooms = 0;
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.systemSeeded || !room.expiresAt) continue;
      const expiry = Date.parse(room.expiresAt);
      if (Number.isFinite(expiry) && expiry <= now) {
        this.rooms.delete(roomId);
        this.memberships.removeRoom(roomId);
        expiredRooms += 1;
      }
    }
    this.memberships.prune(now);
    return expiredRooms;
  }

  reset(options = {}) {
    this.rooms.clear();
    this.memberships.reset();
    this.seedDefaultRoom(options.seedDefaultRoom !== false);
  }

  getHealth() {
    this.cleanup();
    return {
      ok: true,
      service: 'LingoSentinelRoomRegistry',
      version: VERSION,
      storage: 'in_memory',
      activeRooms: Array.from(this.rooms.values()).filter((room) => room.status === 'active').length,
      defaultRoomSeeded: this.rooms.has(RoomPolicy.DEFAULT_ROOM_ID),
      roomPolicy: RoomPolicy.getHealth(),
      membership: this.memberships.getHealth(),
      crossRoomIsolation: true,
      membershipRequiredForToken: true,
      serverVerifiedInvitations: true,
      multiInstanceReady: false,
      storageBoundary: 'single_process_in_memory'
    };
  }
}

const singleton = new LingoSentinelRoomRegistryStore();

module.exports = singleton;
module.exports.VERSION = VERSION;
module.exports.LingoSentinelRoomRegistryStore = LingoSentinelRoomRegistryStore;
module.exports.cloneRoom = cloneRoom;
