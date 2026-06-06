/**
 * MarionLingoLinkAuthorityPhaseOneThree
 *
 * Initiation pipeline for Marion -> LingoLink phases 1 through 3:
 * 1. Raw input capture
 * 2. Language detection validation
 * 3. Intent preservation
 *
 * This file intentionally stops BEFORE translation.
 */

'use strict';

const { createRawInputEnvelope } = require('./MarionRawInputEnvelope');
const {
  buildFallbackDetector,
  validateLanguageDetection
} = require('./MarionLanguageDetectionGate');
const { preserveIntent } = require('./MarionIntentPreservationGate');

function initiateMarionLingoLinkAuthority(input, options = {}) {
  const rawEnvelope = createRawInputEnvelope(input, {
    source: options.source || 'chat',
    sessionId: options.sessionId || null,
    userId: options.userId || null,
    messageId: options.messageId || null,
    timestamp: options.timestamp || null
  });

  if (!rawEnvelope.marionGate.mayProceedToLanguageDetection) {
    return Object.freeze({
      phase: 'MARION_LINGOLINK_AUTHORITY_PHASES_1_3',
      completedThroughPhase: 1,
      rawEnvelope,
      languageEnvelope: null,
      intentEnvelope: null,
      marionDecision: rawEnvelope.marionGate.decision,
      mayProceedToPhase4: false
    });
  }

  const detectorResult =
    typeof options.languageDetector === 'function'
      ? options.languageDetector(rawEnvelope.rawInput)
      : options.detectorResult || buildFallbackDetector(rawEnvelope.rawInput);

  const languageEnvelope = validateLanguageDetection(rawEnvelope, detectorResult, {
    languageConfidenceThreshold: options.languageConfidenceThreshold
  });

  if (!languageEnvelope.marionGate.mayProceedToIntentPreservation) {
    return Object.freeze({
      phase: 'MARION_LINGOLINK_AUTHORITY_PHASES_1_3',
      completedThroughPhase: 2,
      rawEnvelope,
      languageEnvelope,
      intentEnvelope: null,
      marionDecision: languageEnvelope.marionGate.decision,
      mayProceedToPhase4: false
    });
  }

  const intentEnvelope = preserveIntent(languageEnvelope, {
    intentConfidenceThreshold: options.intentConfidenceThreshold
  });

  return Object.freeze({
    phase: 'MARION_LINGOLINK_AUTHORITY_PHASES_1_3',
    completedThroughPhase: intentEnvelope.marionGate.intentPreserved ? 3 : 2,
    rawEnvelope,
    languageEnvelope,
    intentEnvelope,
    marionDecision: intentEnvelope.marionGate.decision,
    mayProceedToPhase4: Boolean(intentEnvelope.marionGate.mayProceedToTranslationNormalization)
  });
}

module.exports = {
  initiateMarionLingoLinkAuthority
};
