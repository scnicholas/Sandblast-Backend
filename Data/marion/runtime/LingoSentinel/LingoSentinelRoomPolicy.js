'use strict';

/**
 * LingoSentinelRoomPolicy
 * ------------------------------------------------------------
 * Layer 3 policy authority for rooms and memberships.
 *
 * Boundaries:
 * - Pure validation/normalization only; no network or provider access.
 * - English relay enables one_to_one and group_room rooms.
 * - Translation rooms remain disabled until the translation layer is certified.
 * - Marion/system identities and reserved room names are rejected.
 */

const crypto = require('crypto');

const VERSION = 'nyx.lingosentinel.roomPolicy/3.0-room-boundary';
const ROOM_CONTRACT = 'lingosentinel.room/1.0';
const MEMBERSHIP_CONTRACT = 'lingosentinel.roomMembership/1.0';
const DEFAULT_ROOM_ID = 'lingosentinel-main';
const DEFAULT_ROOM_TYPE = 'group_room';
const MAX_ROOM_ID_LENGTH = 96;
const MAX_DISPLAY_NAME_LENGTH = 96;
const MAX_CLIENT_ID_LENGTH = 80;
const MAX_SESSION_ID_LENGTH = 96;
const DEFAULT_MAX_PARTICIPANTS = clampNumber(process.env.LINGOSENTINEL_ROOM_MAX_PARTICIPANTS, 50, 2, 500);
const MAX_ROOM_TTL_MS = clampNumber(process.env.LINGOSENTINEL_ROOM_MAX_TTL_MS, 24 * 60 * 60 * 1000, 5 * 60 * 1000, 7 * 24 * 60 * 60 * 1000);
const DEFAULT_ROOM_TTL_MS = clampNumber(process.env.LINGOSENTINEL_ROOM_TTL_MS, 2 * 60 * 60 * 1000, 5 * 60 * 1000, MAX_ROOM_TTL_MS);

const ROOM_TYPES = Object.freeze(['one_to_one', 'group_room']);
const ROOM_TYPE_ALIASES = Object.freeze({
  one: 'one_to_one',
  one_to_one: 'one_to_one',
  oneToOne: 'one_to_one',
  direct: 'one_to_one',
  private: 'one_to_one',
  dm: 'one_to_one',
  group: 'group_room',
  group_room: 'group_room',
  groupRoom: 'group_room',
  room: 'group_room',
  community: 'group_room',
  translation_room: 'translation_room',
  live_translate: 'translation_room',
  translate: 'translation_room'
});

const RESERVED_PATTERN = /(?:^|[^a-z0-9])(marion|admin|administrator|root|system|operator|moderator|support|telemetry|internal)(?:$|[^a-z0-9])/i;

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function safeString(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const text = typeof value === 'string' ? value : String(value);
  return text.trim() || fallback;
}

function sanitizeIdentifier(value, fallback = '', maxLength = MAX_ROOM_ID_LENGTH) {
  const clean = safeString(value || fallback)
    .replace(/[^a-zA-Z0-9:_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_:]+|[-_:]+$/g, '')
    .slice(0, maxLength);
  return clean || fallback;
}

function sanitizeDisplayName(value, fallback = 'Conversation') {
  const clean = safeString(value || fallback)
    .replace(/[<>\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_DISPLAY_NAME_LENGTH);
  return clean || fallback;
}

function normalizeRoomType(value, fallback = DEFAULT_ROOM_TYPE) {
  const raw = safeString(value || fallback);
  return ROOM_TYPE_ALIASES[raw] || ROOM_TYPE_ALIASES[raw.toLowerCase()] || null;
}

function isReserved(value) {
  const raw = safeString(value);
  if (!raw) return false;
  return RESERVED_PATTERN.test(raw) || /^(?:marion|admin|root|system|internal|telemetry)$/i.test(raw);
}


function normalizeInvitees(value) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(new Set(source
    .map((item) => sanitizeIdentifier(item && typeof item === 'object' ? (item.clientId || item.id) : item, '', MAX_CLIENT_ID_LENGTH))
    .filter((item) => item && item.length >= 8 && !isReserved(item))
  )).slice(0, 50);
}

function generateRoomId(type = DEFAULT_ROOM_TYPE) {
  const prefix = normalizeRoomType(type) === 'one_to_one' ? 'lsd' : 'lsr';
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`.slice(0, MAX_ROOM_ID_LENGTH);
}

function validateIdentity(identity = {}) {
  const clientId = sanitizeIdentifier(identity.clientId || identity.id, '', MAX_CLIENT_ID_LENGTH);
  const sessionId = sanitizeIdentifier(identity.sessionId || identity.session, '', MAX_SESSION_ID_LENGTH);
  const displayName = sanitizeDisplayName(identity.displayName || identity.name, 'Participant');
  const errors = [];
  if (!clientId || clientId.length < 8) errors.push('clientId must contain at least 8 characters.');
  if (!sessionId || sessionId.length < 8) errors.push('sessionId must contain at least 8 characters.');
  if (isReserved(clientId) || isReserved(sessionId) || isReserved(displayName)) {
    errors.push('Reserved Marion, system, admin, or operator identities are not available to public rooms.');
  }
  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      clientId,
      sessionId,
      displayName,
      role: safeString(identity.role || 'participant').toLowerCase() === 'creator' ? 'creator' : 'participant',
      authenticated: identity.authenticated === true
    }
  };
}

function validateRoomInput(input = {}) {
  const roomType = normalizeRoomType(input.roomType || input.type || input.mode, DEFAULT_ROOM_TYPE);
  const roomId = sanitizeIdentifier(input.roomId || input.id || generateRoomId(roomType), '', MAX_ROOM_ID_LENGTH);
  const displayName = sanitizeDisplayName(input.displayName || input.name || 'LingoSentinel Room');
  const maxParticipants = clampNumber(
    input.maxParticipants,
    roomType === 'one_to_one' ? 2 : DEFAULT_MAX_PARTICIPANTS,
    roomType === 'one_to_one' ? 2 : 2,
    roomType === 'one_to_one' ? 2 : 500
  );
  const ttlMs = clampNumber(input.ttlMs, DEFAULT_ROOM_TTL_MS, 5 * 60 * 1000, MAX_ROOM_TTL_MS);
  const joinPolicy = safeString(input.joinPolicy || (roomType === 'one_to_one' ? 'invite_only' : 'open')).toLowerCase() === 'invite_only' ? 'invite_only' : 'open';
  const invitedClientIds = normalizeInvitees(input.invitedClientIds || input.invitees || input.invitedClientId || input.recipientClientId);
  const errors = [];
  if (!roomType || !ROOM_TYPES.includes(roomType)) {
    errors.push('Only one_to_one and group_room are enabled before translation certification.');
  }
  if (!roomId || roomId.length < 6) errors.push('roomId must contain at least 6 characters.');
  if (isReserved(roomId) || isReserved(displayName)) errors.push('Reserved room names are not allowed.');
  if (roomType === 'one_to_one' && maxParticipants !== 2) errors.push('one_to_one rooms must have exactly two participants.');
  if (roomType === 'one_to_one' && invitedClientIds.length !== 1) errors.push('one_to_one rooms require exactly one invitedClientId.');
  if (roomType === 'group_room' && joinPolicy === 'invite_only' && invitedClientIds.length === 0) errors.push('Invite-only group rooms require at least one invitedClientId.');
  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      roomId,
      roomType,
      displayName,
      maxParticipants,
      ttlMs,
      joinPolicy,
      invitedClientIds,
      status: 'active'
    }
  };
}

function canJoin(room = {}, identity = {}, options = {}) {
  const identityResult = validateIdentity(identity);
  const errors = identityResult.errors.slice();
  if (!room || room.status !== 'active') errors.push('Room is not active.');
  const count = Number(room.participantCount || 0);
  const max = Number(room.maxParticipants || DEFAULT_MAX_PARTICIPANTS);
  if (count >= max && options.alreadyMember !== true) errors.push('Room participant limit reached.');
  if (room.joinPolicy === 'invite_only' && options.invited !== true && options.isCreator !== true && options.alreadyMember !== true) {
    errors.push('Room requires an invitation.');
  }
  return { ok: errors.length === 0, errors, identity: identityResult.normalized };
}

function getHealth() {
  return {
    ok: true,
    service: 'LingoSentinelRoomPolicy',
    version: VERSION,
    roomContract: ROOM_CONTRACT,
    membershipContract: MEMBERSHIP_CONTRACT,
    enabledRoomTypes: ROOM_TYPES.slice(),
    translationRoomsEnabled: false,
    defaultMaxParticipants: DEFAULT_MAX_PARTICIPANTS,
    defaultRoomTtlMs: DEFAULT_ROOM_TTL_MS,
    reservedIdentitiesBlocked: true,
    serverVerifiedInvitations: true
  };
}

module.exports = Object.freeze({
  VERSION,
  ROOM_CONTRACT,
  MEMBERSHIP_CONTRACT,
  DEFAULT_ROOM_ID,
  DEFAULT_ROOM_TYPE,
  DEFAULT_MAX_PARTICIPANTS,
  DEFAULT_ROOM_TTL_MS,
  MAX_ROOM_TTL_MS,
  ROOM_TYPES,
  ROOM_TYPE_ALIASES,
  clampNumber,
  safeString,
  sanitizeIdentifier,
  sanitizeDisplayName,
  normalizeRoomType,
  isReserved,
  generateRoomId,
  normalizeInvitees,
  validateIdentity,
  validateRoomInput,
  canJoin,
  getHealth
});
