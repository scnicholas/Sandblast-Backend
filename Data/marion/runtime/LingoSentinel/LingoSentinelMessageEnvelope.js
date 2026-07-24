'use strict';

const crypto = require('crypto');
const MessagePolicy = require('./LingoSentinelMessagePolicy');

const VERSION = 'nyx.lingosentinel.messageEnvelope/5.0-canonical';

function createMessageId() {
  return `lsm_${Date.now().toString(36)}_${crypto.randomBytes(12).toString('hex')}`.slice(0, 96);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((name) => deepFreeze(value[name]));
  return Object.freeze(value);
}

function buildEnvelope(input = {}) {
  const sender = input.sender && typeof input.sender === 'object' ? input.sender : {};
  const timestamp = new Date().toISOString();
  const envelope = {
    contract: MessagePolicy.CONTRACT,
    messageId: createMessageId(),
    clientRequestId: MessagePolicy.safeString(input.clientRequestId).slice(0, MessagePolicy.MAX_REQUEST_ID_LENGTH),
    roomId: MessagePolicy.safeString(input.roomId).slice(0, 96),
    mode: MessagePolicy.normalizeMode(input.mode),
    type: MessagePolicy.MESSAGE_TYPE,
    eventType: MessagePolicy.EVENT_TYPE,
    sequence: Number.isSafeInteger(input.sequence) && input.sequence > 0 ? input.sequence : 1,
    sender: {
      clientId: MessagePolicy.safeString(sender.clientId || sender.id).slice(0, 80),
      displayName: MessagePolicy.safeString(sender.displayName || sender.name || 'Participant').slice(0, 80),
      role: sender.role === 'creator' ? 'creator' : 'participant'
    },
    sourceLanguage: 'en',
    targetLanguage: 'en',
    originalText: String(input.originalText == null ? input.text || '' : input.originalText),
    displayText: String(input.displayText == null ? input.text || '' : input.displayText),
    translation: {
      status: 'bypassed',
      required: false,
      source: 'en',
      target: 'en'
    },
    createdAt: timestamp,
    publishedAt: null,
    version: 1
  };
  return deepFreeze(envelope);
}

function withPublishedAt(envelope, publishedAt) {
  return deepFreeze({ ...envelope, publishedAt: publishedAt || new Date().toISOString() });
}

function getHealth() {
  return {
    ok: true,
    service: 'LingoSentinelMessageEnvelope',
    version: VERSION,
    contract: MessagePolicy.CONTRACT,
    eventType: MessagePolicy.EVENT_TYPE,
    originalTextImmutable: true,
    serverGeneratedMessageId: true,
    serverAssignedSequence: true
  };
}

module.exports = Object.freeze({ VERSION, createMessageId, deepFreeze, buildEnvelope, withPublishedAt, getHealth });
