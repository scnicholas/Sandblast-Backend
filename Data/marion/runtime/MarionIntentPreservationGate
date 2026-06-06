/**
 * MarionIntentPreservationGate
 * Phase 3: Intent preservation before translation.
 *
 * Purpose:
 * - Identify the user's core intent from raw input and detection context.
 * - Preserve meaning before translation normalization happens.
 * - Prevent the translation layer from flattening intent, idioms, or requested style.
 *
 * Authority rule:
 * Marion preserves intent before any transformation layer rewrites the user.
 */

'use strict';

const DEFAULT_INTENT_CONFIDENCE_THRESHOLD = 0.70;

function normalizeConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric < 0) return 0;
  if (numeric > 1) return 1;
  return numeric;
}

function detectRequestedStyle(text) {
  const t = String(text || '').toLowerCase();

  if (/\b(simple|simply|sencilla|simplement|plain|basic|beginner)\b/.test(t)) return 'simple';
  if (/\b(technical|developer|code|architecture|production|regression|test)\b/.test(t)) return 'technical';
  if (/\b(short|brief|concise|three sentences|quick)\b/.test(t)) return 'concise';
  if (/\b(deep|full|autopsy|critical|thorough|detailed)\b/.test(t)) return 'deep';
  return 'standard';
}

function detectEmotionalTone(text) {
  const t = String(text || '').toLowerCase();

  if (/\b(urgent|asap|critical|failed|broken|error|fix)\b/.test(t)) return 'urgent';
  if (/\b(great|beautiful|passed|good|love)\b/.test(t)) return 'positive';
  if (/\b(frustrated|horrible|bad|wrong|annoying)\b/.test(t)) return 'frustrated';
  return 'neutral';
}

function detectIntent(text) {
  const t = String(text || '').toLowerCase().trim();

  const patterns = [
    {
      intent: 'request_file_update',
      confidence: 0.88,
      test: /\b(update|fix|patch|resend|zip|downloadable|file|files)\b/
    },
    {
      intent: 'request_step_breakdown',
      confidence: 0.86,
      test: /\b(step-by-step|breakdown|phase|progression|map out|sequence)\b/
    },
    {
      intent: 'request_explanation',
      confidence: 0.82,
      test: /\b(explain|what does|tell me|explicarme|expliquer|meaning)\b/
    },
    {
      intent: 'request_confirmation',
      confidence: 0.78,
      test: /\b(confirm|is this|are we|does this|passed)\b/
    },
    {
      intent: 'general_chat',
      confidence: 0.72,
      test: /.+/
    }
  ];

  const match = patterns.find((entry) => entry.test.test(t));

  return match || {
    intent: 'unknown',
    confidence: 0,
    test: null
  };
}

function preserveIntent(languageEnvelope, options = {}) {
  const rawInput =
    languageEnvelope &&
    languageEnvelope.rawEnvelope &&
    typeof languageEnvelope.rawEnvelope.rawInput === 'string'
      ? languageEnvelope.rawEnvelope.rawInput
      : '';

  const threshold = normalizeConfidence(
    options.intentConfidenceThreshold ?? DEFAULT_INTENT_CONFIDENCE_THRESHOLD
  );

  const detected = detectIntent(rawInput);
  const requestedStyle = detectRequestedStyle(rawInput);
  const emotionalTone = detectEmotionalTone(rawInput);

  const mayProceed =
    Boolean(languageEnvelope?.marionGate?.mayProceedToIntentPreservation) &&
    detected.confidence >= threshold &&
    detected.intent !== 'unknown';

  return Object.freeze({
    phase: 'PHASE_3_INTENT_PRESERVATION',
    authority: 'MARION',
    languageEnvelope,
    intentProfile: {
      intent: detected.intent,
      confidence: detected.confidence,
      threshold,
      requestedStyle,
      emotionalTone,
      urgency: emotionalTone === 'urgent' ? 'elevated' : 'normal',
      originalMeaningLocked: true
    },
    marionGate: {
      intentPreserved: mayProceed,
      mayProceedToTranslationNormalization: mayProceed,
      decision: mayProceed ? 'proceed' : 'clarify_intent',
      reason: mayProceed
        ? 'Intent is sufficiently preserved before translation.'
        : 'Intent confidence is too uncertain for safe translation normalization.'
    }
  });
}

module.exports = {
  DEFAULT_INTENT_CONFIDENCE_THRESHOLD,
  detectIntent,
  detectRequestedStyle,
  detectEmotionalTone,
  preserveIntent
};
