'use strict';

/**
 * LingQPatternLayer
 * Lightweight pattern scanner for LingoSentinel messages.
 *
 * Purpose:
 * - Detect likely language hints.
 * - Detect conversational lane: one-to-one, group, live translate, delivered.
 * - Flag uncertainty without blocking the message.
 * - Preserve Marion's authority by returning structured signals only.
 *
 * This layer does NOT publish to Ably.
 * This layer does NOT translate.
 * This layer only reads the message and produces routing intelligence.
 */

const DEFAULT_MODE = 'one_to_one';

const MODE_ALIASES = Object.freeze({
  one_to_one: 'one_to_one',
  oneToOne: 'one_to_one',
  direct: 'one_to_one',
  dm: 'one_to_one',
  group: 'group_room',
  group_room: 'group_room',
  room: 'group_room',
  live: 'live_translate',
  live_translate: 'live_translate',
  translate: 'live_translate',
  delivered: 'delivered',
  delivery: 'delivered'
});

const LANGUAGE_PATTERNS = Object.freeze([
  {
    code: 'ja',
    label: 'Japanese',
    pattern: /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/
  },
  {
    code: 'ar',
    label: 'Arabic',
    pattern: /[\u0600-\u06ff]/
  },
  {
    code: 'ko',
    label: 'Korean',
    pattern: /[\uac00-\ud7af]/
  },
  {
    code: 'zh',
    label: 'Chinese',
    pattern: /[\u4e00-\u9fff]/
  },
  {
    code: 'hi',
    label: 'Hindi',
    pattern: /[\u0900-\u097f]/
  },
  {
    code: 'ru',
    label: 'Russian',
    pattern: /[\u0400-\u04ff]/
  },
  {
    code: 'el',
    label: 'Greek',
    pattern: /[\u0370-\u03ff]/
  },
  {
    code: 'es',
    label: 'Spanish',
    pattern: /\b(hola|gracias|perfecto|diseño|mañana|señor|señora)\b/i
  },
  {
    code: 'fr',
    label: 'French',
    pattern: /\b(bonjour|merci|oui|non|très|français|connexion)\b/i
  },
  {
    code: 'pt',
    label: 'Portuguese',
    pattern: /\b(olá|obrigado|obrigada|conexão|tradução|português)\b/i
  },
  {
    code: 'it',
    label: 'Italian',
    pattern: /\b(ciao|grazie|possiamo|oggi|italiano|coordinare)\b/i
  },
  {
    code: 'de',
    label: 'German',
    pattern: /\b(hallo|danke|bitte|deutsch|verbindung)\b/i
  },
  {
    code: 'en',
    label: 'English',
    pattern: /[a-z]/i
  }
]);

function normalizeMode(mode) {
  if (!mode) return DEFAULT_MODE;
  return MODE_ALIASES[mode] || DEFAULT_MODE;
}

function safeString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function detectLanguage(text) {
  const value = safeString(text);

  if (!value) {
    return {
      code: 'und',
      label: 'Unknown',
      confidence: 0,
      source: 'empty'
    };
  }

  const hits = LANGUAGE_PATTERNS
    .filter(entry => entry.pattern.test(value))
    .map(entry => ({
      code: entry.code,
      label: entry.label
    }));

  if (!hits.length) {
    return {
      code: 'und',
      label: 'Unknown',
      confidence: 0.18,
      source: 'no_pattern_match'
    };
  }

  const primary = hits[0];

  return {
    code: primary.code,
    label: primary.label,
    confidence: primary.code === 'en' ? 0.62 : 0.84,
    source: 'pattern_match',
    alternatives: hits.slice(1, 4)
  };
}

function classifyUrgency(text) {
  const value = safeString(text).toLowerCase();

  if (!value) return 'normal';

  if (
    /\b(urgent|emergency|danger|risk|now|immediately|critical|failed|broken)\b/i.test(value)
  ) {
    return 'high';
  }

  if (/\b(check|verify|confirm|review|issue|problem)\b/i.test(value)) {
    return 'medium';
  }

  return 'normal';
}

function detectContentFlags(text) {
  const value = safeString(text);

  return {
    empty: value.length === 0,
    longMessage: value.length > 1200,
    hasUrl: /https?:\/\//i.test(value),
    hasCodeHint: /```|function\s+|const\s+|let\s+|module\.exports|export\s+/i.test(value),
    hasPrivateHint: /\b(api key|secret|password|token|private key)\b/i.test(value)
  };
}

function scanMessage(input = {}) {
  const text = safeString(input.text || input.message || input.body);
  const mode = normalizeMode(input.mode || input.lane);
  const language = detectLanguage(text);
  const urgency = classifyUrgency(text);
  const flags = detectContentFlags(text);

  const needsReview =
    flags.hasPrivateHint ||
    urgency === 'high' ||
    language.code === 'und' ||
    flags.longMessage;

  return {
    ok: !flags.empty,
    mode,
    text,
    language,
    urgency,
    flags,
    needsReview,
    confidence: Math.min(
      0.98,
      Math.max(
        0.1,
        language.confidence +
          (flags.empty ? -0.5 : 0) +
          (needsReview ? -0.12 : 0)
      )
    ),
    scannedAt: new Date().toISOString()
  };
}

module.exports = {
  scanMessage,
  detectLanguage,
  normalizeMode,
  classifyUrgency,
  detectContentFlags
};
