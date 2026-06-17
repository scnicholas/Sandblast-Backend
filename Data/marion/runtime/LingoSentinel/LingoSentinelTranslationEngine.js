'use strict';

/**
 * LingoSentinelTranslationEngine
 * Dynamic translation orchestrator for spontaneous multilingual dialogue.
 *
 * This is the file that removes the hardcoded-sentence limitation.
 * It receives arbitrary language input, detects the source language, preserves
 * context/tone, calls a backend-safe provider, normalizes the response, and
 * records a bounded context turn.
 */

const { detectLanguage, normalizeLanguage, clampText } = require('./LingoSentinelLanguageDetector');
const { inferTone, buildProviderInstruction } = require('./LingoSentinelToneAdapter');
const { createContextMemory } = require('./LingoSentinelContextMemory');
const Provider = require('./LingoSentinelTranslationProvider');
const { normalizeTranslationResponse, normalizeError } = require('./LingoSentinelResponseNormalizer');

const VERSION = '2.1.0-spontaneous-translation-engine';
const memory = createContextMemory({
  maxTurns: Number(process.env.LINGOSENTINEL_CONTEXT_TURNS) || 12,
  ttlMs: Number(process.env.LINGOSENTINEL_CONTEXT_TTL_MS) || 30 * 60 * 1000
});

function safeString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix = 'lst') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveText(input = {}) {
  if (typeof input === 'string') return input;
  const payload = safeObject(input);
  return safeString(payload.text || payload.message || payload.body || payload.input || payload.prompt || '');
}

function resolveSessionId(input = {}) {
  const payload = safeObject(input);
  return safeString(payload.sessionId || payload.roomId || payload.conversationId || payload.channelId || 'lingosentinel-main');
}

function resolveSpeaker(input = {}) {
  const payload = safeObject(input);
  const sender = safeObject(payload.sender || payload.from);
  return {
    id: safeString(sender.id || payload.senderId || payload.userId || 'guest'),
    name: safeString(sender.name || payload.senderName || payload.name || 'Guest'),
    role: safeString(sender.role || payload.role || 'participant'),
    preferredLanguage: normalizeLanguage(sender.preferredLanguage || payload.sourceLanguage || payload.lang || 'auto', 'auto')
  };
}

function resolveTargetLanguage(input = {}, detection = {}) {
  const payload = safeObject(input);
  const recipient = safeObject(payload.recipient || payload.to);
  return normalizeLanguage(
    payload.targetLanguage ||
    payload.targetLang ||
    payload.recipientLanguage ||
    payload.toLanguage ||
    recipient.preferredLanguage ||
    payload.publicLanguage ||
    'en',
    'en'
  );
}

function isSameLanguage(sourceLanguage, targetLanguage) {
  const src = normalizeLanguage(sourceLanguage || 'auto', 'auto');
  const tgt = normalizeLanguage(targetLanguage || 'en', 'en');
  return src !== 'auto' && src !== 'mixed' && src === tgt;
}

async function translateTurn(input = {}, options = {}) {
  const text = clampText(resolveText(input), Number(options.maxTextChars || process.env.LINGOSENTINEL_MAX_TEXT_CHARS) || 6000);
  const sessionId = resolveSessionId(input);
  const speaker = resolveSpeaker(input);
  const turnId = safeString(input.turnId || input.id || createId('turn'));
  const sourceHint = normalizeLanguage(input.sourceLanguage || input.language || input.lang || speaker.preferredLanguage || 'auto', 'auto');
  const detection = detectLanguage(text, { sourceLanguage: sourceHint });
  const sourceLanguage = normalizeLanguage(detection.detectedLanguage || detection.language || sourceHint, 'auto');
  const targetLanguage = resolveTargetLanguage(input, detection);
  const tone = inferTone(text, input);
  const context = memory.snapshot(sessionId, Number(options.contextTurns || process.env.LINGOSENTINEL_CONTEXT_TURNS) || 12);
  const contextSummary = memory.summarize(sessionId, Number(options.contextTurns || process.env.LINGOSENTINEL_CONTEXT_TURNS) || 12);

  const base = {
    text,
    originalText: text,
    sourceLanguage,
    detectedLanguage: detection.detectedLanguage || detection.language || sourceLanguage,
    targetLanguage,
    sessionId,
    turnId,
    speaker,
    tone,
    context,
    contextUsed: context.length > 0,
    providerInstruction: buildProviderInstruction(tone),
    createdAt: nowIso(),
    engineVersion: VERSION,
    publicSurface: 'Nyx',
    finalAuthority: 'Marion',
    marionAuthority: true,
    lingoSentinelAdvisoryOnly: false
  };

  if (!text) {
    const result = normalizeTranslationResponse({ ok: false, error: 'empty_text' }, base);
    return { ...result, ...base, ok: false, stage: 'empty_text' };
  }

  if (isSameLanguage(sourceLanguage, targetLanguage)) {
    const result = normalizeTranslationResponse({ ok: true, translatedText: text, provider: 'same-language-bypass' }, base);
    memory.addTurn(sessionId, {
      id: turnId,
      role: speaker.role,
      speakerId: speaker.id,
      speakerName: speaker.name,
      text,
      translatedText: text,
      sourceLanguage,
      targetLanguage,
      tone: tone.tone,
      intent: tone.intent
    });
    return { ...result, ...base, ok: true, stage: 'same_language_bypass', provider: 'same-language-bypass' };
  }

  try {
    const providerResult = await Provider.translate({
      text,
      sourceLanguage,
      targetLanguage,
      context,
      contextSummary,
      tone,
      instruction: base.providerInstruction
    }, options.providerOptions || options);

    const normalized = normalizeTranslationResponse(providerResult, base);

    memory.addTurn(sessionId, {
      id: turnId,
      role: speaker.role,
      speakerId: speaker.id,
      speakerName: speaker.name,
      text,
      translatedText: normalized.translatedText,
      sourceLanguage: normalized.detectedLanguage || sourceLanguage,
      targetLanguage,
      tone: tone.tone,
      intent: tone.intent
    });

    return {
      ...base,
      ...normalized,
      ok: normalized.ok,
      stage: normalized.ok ? 'translated' : 'provider_fallback',
      detection,
      contextUsed: context.length > 0,
      diagnosticsRedacted: true
    };
  } catch (error) {
    const normalized = normalizeError(error, base);
    memory.addTurn(sessionId, {
      id: turnId,
      role: speaker.role,
      speakerId: speaker.id,
      speakerName: speaker.name,
      text,
      translatedText: normalized.translatedText,
      sourceLanguage,
      targetLanguage,
      tone: tone.tone,
      intent: tone.intent
    });
    return {
      ...base,
      ...normalized,
      ok: false,
      stage: 'translation_failed',
      diagnosticsRedacted: true
    };
  }
}

function detect(input = {}, options = {}) {
  const text = resolveText(input);
  return detectLanguage(text, options || input || {});
}

function health(options = {}) {
  return {
    ok: true,
    service: 'LingoSentinelTranslationEngine',
    version: VERSION,
    provider: Provider.health(options.providerOptions || options),
    contextMemory: memory.status(),
    spontaneousTranslation: true,
    controlledPhraseFallbackOnly: false,
    publicSurface: 'Nyx',
    finalAuthority: 'Marion',
    diagnosticsRedacted: true,
    timestamp: nowIso()
  };
}

module.exports = {
  VERSION,
  translateTurn,
  detect,
  health,
  memory
};
