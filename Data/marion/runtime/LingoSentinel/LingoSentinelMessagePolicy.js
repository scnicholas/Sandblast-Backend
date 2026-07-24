'use strict';

const EnglishRelayPolicy = require('./LingoSentinelEnglishRelayPolicy');

const VERSION = 'nyx.lingosentinel.messagePolicy/5.0-canonical-text';
const CONTRACT = 'lingosentinel.message/1.0';
const EVENT_TYPE = 'LINGOSENTINEL_MESSAGE_CREATED';
const MESSAGE_TYPE = 'text';
const MAX_TEXT_LENGTH = 4000;
const MAX_REQUEST_ID_LENGTH = 96;
const ACCEPTED_MODES = Object.freeze(['one_to_one', 'group_room']);
const SERVER_CONTROLLED_FIELDS = Object.freeze([
  'messageId', 'sequence', 'sender', 'displayText', 'originalText', 'translation',
  'eventType', 'contract', 'createdAt', 'publishedAt', 'version', 'governance',
  'provider', 'capability', 'tokenRequest', 'sessionId'
]);

function safeString(value) { return String(value == null ? '' : value).trim(); }
function normalizeMode(value) {
  const raw = safeString(value || 'group_room');
  if (['one', 'one_to_one', 'direct', 'dm', 'private'].includes(raw)) return 'one_to_one';
  if (['group', 'group_room', 'room', 'community'].includes(raw)) return 'group_room';
  return raw;
}
function normalizeText(value) {
  return String(value == null ? '' : value).replace(/\r\n?/g, '\n');
}
function containsBlockedControl(text) {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text);
}
function containsExecutableMarkup(text) {
  return /<\s*(?:script|iframe|object|embed|meta|link)\b/i.test(text) ||
    /\bon[a-z]+\s*=\s*["']/i.test(text) ||
    /javascript\s*:/i.test(text);
}
function clientControlsServerField(input = {}) {
  return SERVER_CONTROLLED_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(input, field));
}
function validateRawRequest(input = {}) {
  const errors = [];
  const text = normalizeText(input.text || input.message || input.input || '');
  const roomId = safeString(input.roomId || input.conversationId || input.channelId);
  const clientRequestId = safeString(input.clientRequestId || input.requestId);
  const type = safeString(input.type || MESSAGE_TYPE).toLowerCase();
  const mode = normalizeMode(input.mode || 'group_room');
  const controlled = clientControlsServerField(input);
  const relay = EnglishRelayPolicy.evaluate(input);

  if (!roomId) errors.push({ code: 'ROOM_ID_REQUIRED', field: 'roomId' });
  if (!clientRequestId) errors.push({ code: 'CLIENT_REQUEST_ID_REQUIRED', field: 'clientRequestId' });
  if (clientRequestId.length > MAX_REQUEST_ID_LENGTH) errors.push({ code: 'CLIENT_REQUEST_ID_TOO_LONG', field: 'clientRequestId' });
  if (type !== MESSAGE_TYPE) errors.push({ code: 'TEXT_MESSAGES_ONLY', field: 'type' });
  if (!ACCEPTED_MODES.includes(mode)) errors.push({ code: 'MESSAGE_MODE_NOT_ENABLED', field: 'mode' });
  if (!text.trim()) errors.push({ code: 'MESSAGE_TEXT_REQUIRED', field: 'text' });
  if (text.length > MAX_TEXT_LENGTH) errors.push({ code: 'MESSAGE_TEXT_TOO_LONG', field: 'text' });
  if (containsBlockedControl(text)) errors.push({ code: 'MESSAGE_CONTROL_CHARACTER_BLOCKED', field: 'text' });
  if (containsExecutableMarkup(text)) errors.push({ code: 'EXECUTABLE_MARKUP_BLOCKED', field: 'text' });
  if (controlled.length) errors.push({ code: 'SERVER_CONTROLLED_FIELDS_REJECTED', fields: controlled });
  if (!relay.ok) errors.push(...relay.errors);

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      roomId,
      clientRequestId,
      type: MESSAGE_TYPE,
      mode,
      text,
      sourceLanguage: relay.sourceLanguage,
      targetLanguage: relay.targetLanguage
    }
  };
}

function getHealth() {
  return {
    ok: true,
    service: 'LingoSentinelMessagePolicy',
    version: VERSION,
    contract: CONTRACT,
    eventType: EVENT_TYPE,
    messageType: MESSAGE_TYPE,
    maxTextLength: MAX_TEXT_LENGTH,
    acceptedModes: ACCEPTED_MODES.slice(),
    serverControlledFields: SERVER_CONTROLLED_FIELDS.slice(),
    attachmentsEnabled: false,
    executableMarkupAllowed: false
  };
}

module.exports = Object.freeze({
  VERSION, CONTRACT, EVENT_TYPE, MESSAGE_TYPE, MAX_TEXT_LENGTH, MAX_REQUEST_ID_LENGTH,
  ACCEPTED_MODES, SERVER_CONTROLLED_FIELDS, safeString, normalizeMode, normalizeText,
  containsBlockedControl, containsExecutableMarkup, clientControlsServerField,
  validateRawRequest, getHealth
});
