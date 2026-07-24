'use strict';

const MessagePolicy = require('./LingoSentinelMessagePolicy');
const PublicProjection = require('./LingoSentinelPublicMessageProjection');
const RoomRegistry = require('./LingoSentinelRoomRegistry');
const ConnectionState = require('./LingoSentinelConnectionState');

const VERSION = 'nyx.lingosentinel.messageValidator/5.0-room-connection-bound';

function validatePublishRequest(input = {}, context = {}, options = {}) {
  const policy = MessagePolicy.validateRawRequest(input);
  const errors = policy.errors.slice();
  const normalized = policy.normalized;
  const identity = {
    clientId: String(context.clientId || '').trim(),
    sessionId: String(context.sessionId || '').trim(),
    membershipCredential: String(context.membershipCredential || '').trim()
  };

  if (!identity.clientId) errors.push({ code: 'CLIENT_ID_REQUIRED', field: 'clientId' });
  if (!identity.sessionId) errors.push({ code: 'SESSION_ID_REQUIRED', field: 'sessionId' });
  if (!identity.membershipCredential) errors.push({ code: 'MEMBERSHIP_CREDENTIAL_REQUIRED', field: 'membershipCredential' });

  let authorization = { ok: false, error: 'room_membership_required' };
  if (normalized.roomId && identity.clientId && identity.sessionId && identity.membershipCredential) {
    authorization = RoomRegistry.authorize(normalized.roomId, identity, 'publish');
    if (!authorization.ok) errors.push({ code: String(authorization.error || 'ROOM_MEMBERSHIP_REQUIRED').toUpperCase(), field: 'roomId' });
  }

  let connection = null;
  const requireConnected = options.requireConnected !== false;
  if (requireConnected && identity.sessionId) {
    connection = ConnectionState.get(identity.sessionId);
    if (!connection) errors.push({ code: 'CONNECTION_REGISTRATION_REQUIRED', field: 'sessionId' });
    else {
      if (connection.clientId !== identity.clientId) errors.push({ code: 'CONNECTION_CLIENT_MISMATCH', field: 'clientId' });
      if (connection.roomId !== normalized.roomId) errors.push({ code: 'CONNECTION_ROOM_MISMATCH', field: 'roomId' });
      if (connection.state !== 'connected') errors.push({ code: 'CONNECTION_NOT_READY', field: 'connectionState', state: connection.state });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    normalized,
    identity,
    authorization,
    membership: authorization.ok ? authorization.membership : null,
    connection
  };
}

function validateEnvelope(envelope = {}) {
  const result = PublicProjection.validateProjection(envelope);
  const errors = result.errors.slice();
  if (!Number.isSafeInteger(envelope.sequence) || envelope.sequence < 1) errors.push({ code: 'MESSAGE_SEQUENCE_INVALID', field: 'sequence' });
  if (!envelope.translation || envelope.translation.status !== 'bypassed' || envelope.translation.required !== false) {
    errors.push({ code: 'TRANSLATION_BYPASS_REQUIRED', field: 'translation' });
  }
  if (envelope.originalText !== envelope.displayText) errors.push({ code: 'ENGLISH_DISPLAY_TEXT_DRIFT', field: 'displayText' });
  return { ok: errors.length === 0, errors };
}

function getHealth() {
  return {
    ok: true,
    service: 'LingoSentinelMessageValidator',
    version: VERSION,
    membershipCredentialRequired: true,
    connectedStateRequired: true,
    browserSenderAuthority: false,
    finalizedEnvelopeValidation: true
  };
}

module.exports = Object.freeze({ VERSION, validatePublishRequest, validateEnvelope, getHealth });
