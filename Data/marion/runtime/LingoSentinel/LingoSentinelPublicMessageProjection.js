'use strict';

const MessagePolicy = require('./LingoSentinelMessagePolicy');

const VERSION = 'nyx.lingosentinel.publicMessageProjection/5.0-whitelist';
const BLOCKED_KEY = /(?:token|secret|password|authorization|cookie|api[_-]?key|private|sessionId|membershipCredential|credentialHash|governance|telemetry|capability|providerDiagnostics)/i;

function project(envelope = {}) {
  return {
    contract: MessagePolicy.CONTRACT,
    messageId: String(envelope.messageId || ''),
    clientRequestId: String(envelope.clientRequestId || ''),
    roomId: String(envelope.roomId || ''),
    mode: String(envelope.mode || 'group_room'),
    type: MessagePolicy.MESSAGE_TYPE,
    eventType: MessagePolicy.EVENT_TYPE,
    sequence: Number(envelope.sequence) || 0,
    sender: {
      clientId: String(envelope.sender && envelope.sender.clientId || ''),
      displayName: String(envelope.sender && envelope.sender.displayName || 'Participant'),
      role: envelope.sender && envelope.sender.role === 'creator' ? 'creator' : 'participant'
    },
    sourceLanguage: 'en',
    targetLanguage: 'en',
    originalText: String(envelope.originalText == null ? '' : envelope.originalText),
    displayText: String(envelope.displayText == null ? '' : envelope.displayText),
    translation: { status: 'bypassed', required: false, source: 'en', target: 'en' },
    createdAt: String(envelope.createdAt || ''),
    publishedAt: envelope.publishedAt ? String(envelope.publishedAt) : null,
    version: 1
  };
}

function findPrivateField(value, path = '') {
  if (!value || typeof value !== 'object') return '';
  for (const [key, child] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (BLOCKED_KEY.test(key)) return next;
    const nested = findPrivateField(child, next);
    if (nested) return nested;
  }
  return '';
}

function validateProjection(value = {}) {
  const errors = [];
  const privateField = findPrivateField(value);
  if (privateField) errors.push({ code: 'PRIVATE_FIELD_IN_PUBLIC_MESSAGE', field: privateField });
  if (value.contract !== MessagePolicy.CONTRACT) errors.push({ code: 'MESSAGE_CONTRACT_INVALID', field: 'contract' });
  if (value.eventType !== MessagePolicy.EVENT_TYPE) errors.push({ code: 'MESSAGE_EVENT_INVALID', field: 'eventType' });
  if (!value.messageId) errors.push({ code: 'MESSAGE_ID_REQUIRED', field: 'messageId' });
  if (!value.roomId) errors.push({ code: 'ROOM_ID_REQUIRED', field: 'roomId' });
  if (!value.sender || !value.sender.clientId) errors.push({ code: 'SENDER_REQUIRED', field: 'sender' });
  if (typeof value.originalText !== 'string' || typeof value.displayText !== 'string') errors.push({ code: 'MESSAGE_TEXT_INVALID', field: 'displayText' });
  return { ok: errors.length === 0, errors };
}

function getHealth() {
  return {
    ok: true,
    service: 'LingoSentinelPublicMessageProjection',
    version: VERSION,
    whitelistOnly: true,
    sessionIdsExposed: false,
    credentialsExposed: false,
    providerDiagnosticsExposed: false
  };
}

module.exports = Object.freeze({ VERSION, BLOCKED_KEY, project, findPrivateField, validateProjection, getHealth });
