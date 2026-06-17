'use strict';

/**
 * LingoSentinelRealtimeTranslationBridge
 * Bridges spontaneous translation into the existing live/publish pathway.
 *
 * This file does not replace Ably token policy. It prepares translated message
 * payloads before an existing realtime bridge/engine publishes them.
 */

const TranslationEngine = require('./LingoSentinelTranslationEngine');

const VERSION = '2.1.0-spontaneous-realtime-translation-bridge';

function safeString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeMode(value) {
  const raw = safeString(value || 'one_to_one').toLowerCase();
  if (['group', 'group_room', 'room'].includes(raw)) return 'group_room';
  if (['live', 'live_translate', 'translation'].includes(raw)) return 'live_translate';
  if (['delivered', 'delivery', 'sent'].includes(raw)) return 'delivered';
  return 'one_to_one';
}

function readText(input = {}) {
  return safeString(input.text || input.message || input.body || input.originalText || '');
}

async function buildTranslatedPublishInput(input = {}, options = {}) {
  const mode = normalizeMode(input.mode || input.lane);
  const sender = input.sender || input.from || {
    id: safeString(input.senderId || input.userId || 'guest'),
    name: safeString(input.senderName || input.name || 'Guest'),
    preferredLanguage: safeString(input.sourceLanguage || input.lang || 'auto')
  };
  const recipient = input.recipient || input.to || null;
  const targetLanguage = safeString(
    input.targetLanguage ||
    input.recipientLanguage ||
    (recipient && recipient.preferredLanguage) ||
    'en'
  );

  const translation = await TranslationEngine.translateTurn({
    ...input,
    text: readText(input),
    sender,
    recipient,
    targetLanguage,
    sessionId: input.sessionId || input.roomId || input.conversationId || 'lingosentinel-main',
    mode
  }, options.translationOptions || options);

  const message = {
    id: safeString(input.id || translation.turnId),
    originalText: translation.originalText || translation.text,
    text: translation.translatedText,
    translatedText: translation.translatedText,
    displayText: translation.translatedText,
    sourceLanguage: translation.detectedLanguage || translation.sourceLanguage,
    targetLanguage: translation.targetLanguage,
    provider: translation.provider,
    fallback: translation.fallback === true,
    tone: translation.tone,
    contextUsed: translation.contextUsed,
    createdAt: nowIso()
  };

  return {
    ...input,
    mode,
    sender,
    recipient,
    targetLanguage,
    text: message.displayText,
    originalText: message.originalText,
    translatedText: message.translatedText,
    message,
    language: {
      sourceLanguage: message.sourceLanguage,
      targetLanguage: message.targetLanguage,
      detectedLanguage: translation.detectedLanguage
    },
    translation,
    publicSurface: 'Nyx',
    finalAuthority: 'Marion',
    marionAuthority: true,
    translationBridgeVersion: VERSION
  };
}

async function publishTranslatedMessage(input = {}, options = {}) {
  const translatedInput = await buildTranslatedPublishInput(input, options);
  const publisher = options.publisher || options.engine || options.realtimeBridge || null;

  if (publisher && typeof publisher.publishMessage === 'function') {
    return publisher.publishMessage(translatedInput, options.publishOptions || options);
  }

  if (publisher && typeof publisher.publishRoomMessage === 'function') {
    const ok = await publisher.publishRoomMessage(
      translatedInput.roomId || 'lingosentinel-main',
      translatedInput.message,
      translatedInput.metadata || {}
    );
    return { ok: !!ok, stage: ok ? 'published' : 'local_only', translatedInput };
  }

  return {
    ok: true,
    stage: 'translated_not_published',
    translatedInput,
    diagnosticsRedacted: true,
    version: VERSION
  };
}

module.exports = {
  VERSION,
  buildTranslatedPublishInput,
  publishTranslatedMessage
};
