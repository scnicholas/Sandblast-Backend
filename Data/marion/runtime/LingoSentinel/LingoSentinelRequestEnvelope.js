'use strict';

/**
 * LingoSentinelRequestEnvelope
 *
 * Standard input contract for LingoSentinel.
 * Marion sends structured requests here instead of loose text.
 */

const MODES = Object.freeze({
  DETECT: 'detect',
  TRANSLATE: 'translate',
  ADAPT: 'adapt',
  LEARN: 'learn'
});

const DOMAINS = Object.freeze({
  GENERAL: 'general',
  BUSINESS: 'business',
  MEDIA: 'media',
  EDUCATION: 'education',
  EMERGENCY: 'emergency',
  TECHNICAL: 'technical'
});

function normalizeText(value) {
  return String(value || '').trim();
}

function generateRequestId(prefix = 'll') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeMode(mode) {
  const value = normalizeText(mode).toLowerCase();

  if (Object.values(MODES).includes(value)) {
    return value;
  }

  return MODES.TRANSLATE;
}

function normalizeDomain(domain) {
  const value = normalizeText(domain).toLowerCase();

  if (Object.values(DOMAINS).includes(value)) {
    return value;
  }

  return DOMAINS.GENERAL;
}

function createLingoSentinelRequestEnvelope(input = {}) {
  const text = normalizeText(input.text || input.originalText || input.message);

  const envelope = {
    ok: Boolean(text),
    requestId: input.requestId || input.marionRequestId || generateRequestId('marion_lingosentinel'),
    gateway: 'marion-lingosentinel',
    text,
    sourceLanguage: input.sourceLanguage || 'auto',
    targetLanguage: input.targetLanguage || 'en',
    mode: normalizeMode(input.mode),
    domain: normalizeDomain(input.domain),
    preserveTone: input.preserveTone !== false,
    preserveIntent: input.preserveIntent !== false,
    requiresMarionReview: true,
    marionRequestId: input.marionRequestId || input.requestId || null,
    safetyContext: input.safetyContext || {},
    glossaryHints: Array.isArray(input.glossaryHints) ? input.glossaryHints : [],
    metadata: {
      createdAt: new Date().toISOString(),
      source: input.source || 'marion',
      route: input.route || null,
      userLocale: input.userLocale || null,
      ...input.metadata
    },
    warnings: []
  };

  if (!text) {
    envelope.warnings.push('Request envelope created without text.');
  }

  if (!envelope.targetLanguage) {
    envelope.targetLanguage = 'en';
    envelope.warnings.push('Target language missing; defaulted to English.');
  }

  return envelope;
}

function validateLingoSentinelRequestEnvelope(envelope = {}) {
  const errors = [];

  if (!envelope || typeof envelope !== 'object') {
    errors.push('Envelope must be an object.');
  }

  if (!normalizeText(envelope.text)) {
    errors.push('Envelope text is required.');
  }

  if (!normalizeText(envelope.sourceLanguage)) {
    errors.push('Source language is required.');
  }

  if (!normalizeText(envelope.targetLanguage)) {
    errors.push('Target language is required.');
  }

  if (!Object.values(MODES).includes(envelope.mode)) {
    errors.push(`Unsupported mode: ${envelope.mode}`);
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

module.exports = {
  MODES,
  DOMAINS,
  createLingoSentinelRequestEnvelope,
  validateLingoSentinelRequestEnvelope
};
