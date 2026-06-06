/**
 * MarionLanguageDetectionGate
 * Phase 2: Language detection validation gate.
 *
 * Purpose:
 * - Accept a detector result from LanguageDetect / LingoLink.
 * - Normalize it into Marion's authority format.
 * - Decide whether detection confidence is sufficient to proceed.
 *
 * Authority rule:
 * LingoLink detects language. Marion validates whether the detection is safe.
 */

'use strict';

const DEFAULT_LANGUAGE_CONFIDENCE_THRESHOLD = 0.75;

const LANGUAGE_ALIASES = {
  en: 'English',
  eng: 'English',
  english: 'English',
  fr: 'French',
  fra: 'French',
  fre: 'French',
  french: 'French',
  es: 'Spanish',
  spa: 'Spanish',
  spanish: 'Spanish'
};

function normalizeLanguageCode(value) {
  if (!value || typeof value !== 'string') return 'unknown';
  const cleaned = value.trim().toLowerCase();
  if (cleaned === 'english') return 'en';
  if (cleaned === 'french') return 'fr';
  if (cleaned === 'spanish') return 'es';
  if (['en', 'eng'].includes(cleaned)) return 'en';
  if (['fr', 'fra', 'fre'].includes(cleaned)) return 'fr';
  if (['es', 'spa'].includes(cleaned)) return 'es';
  return cleaned || 'unknown';
}

function languageNameFromCode(code) {
  return LANGUAGE_ALIASES[String(code || '').toLowerCase()] || 'Unknown';
}

function normalizeConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric < 0) return 0;
  if (numeric > 1) return 1;
  return numeric;
}

function buildFallbackDetector(rawInput) {
  const text = String(rawInput || '');

  const spanishSignals = /[¿¡]|\b(que|cómo|puedes|explicarme|gracias|hola|esto|forma|sencilla)\b/i;
  const frenchSignals = /\b(bonjour|merci|pouvez|expliquer|ceci|simplement|français|quoi)\b/i;

  if (spanishSignals.test(text)) {
    return { language: 'es', confidence: 0.82, script: 'Latin', mixedLanguage: false, provider: 'fallback_heuristic' };
  }

  if (frenchSignals.test(text)) {
    return { language: 'fr', confidence: 0.82, script: 'Latin', mixedLanguage: false, provider: 'fallback_heuristic' };
  }

  if (text.trim()) {
    return { language: 'en', confidence: 0.78, script: 'Latin', mixedLanguage: false, provider: 'fallback_heuristic' };
  }

  return { language: 'unknown', confidence: 0, script: 'unknown', mixedLanguage: false, provider: 'fallback_heuristic' };
}

function validateLanguageDetection(rawEnvelope, detectorResult = {}, options = {}) {
  const threshold = normalizeConfidence(
    options.languageConfidenceThreshold ?? DEFAULT_LANGUAGE_CONFIDENCE_THRESHOLD
  );

  const rawInput = rawEnvelope && typeof rawEnvelope.rawInput === 'string'
    ? rawEnvelope.rawInput
    : '';

  const supplied = detectorResult && Object.keys(detectorResult).length
    ? detectorResult
    : buildFallbackDetector(rawInput);

  const detectedLanguage = normalizeLanguageCode(
    supplied.detectedLanguage || supplied.language || supplied.lang || 'unknown'
  );

  const confidence = normalizeConfidence(
    supplied.confidence ?? supplied.score ?? supplied.probability ?? 0
  );

  const mixedLanguage = Boolean(supplied.mixedLanguage || supplied.isMixedLanguage);
  const script = supplied.script || 'unknown';

  const mayProceed = confidence >= threshold && detectedLanguage !== 'unknown';

  return Object.freeze({
    phase: 'PHASE_2_LANGUAGE_DETECTION',
    authority: 'MARION_VALIDATED',
    rawEnvelope,
    detection: {
      detectedLanguage,
      languageName: languageNameFromCode(detectedLanguage),
      confidence,
      threshold,
      script,
      mixedLanguage,
      provider: supplied.provider || supplied.source || 'unspecified'
    },
    marionGate: {
      languageDetectionValidated: mayProceed,
      mayProceedToIntentPreservation: mayProceed,
      decision: mayProceed ? 'proceed' : 'clarify_language',
      reason: mayProceed
        ? 'Language detection confidence meets Marion threshold.'
        : 'Language detection is too uncertain for safe downstream translation or adaptation.'
    }
  });
}

module.exports = {
  DEFAULT_LANGUAGE_CONFIDENCE_THRESHOLD,
  buildFallbackDetector,
  normalizeLanguageCode,
  validateLanguageDetection
};
