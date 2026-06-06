/**
 * MarionRawInputEnvelope
 * Phase 1: Raw input capture and preservation.
 *
 * Purpose:
 * - Preserve the user's exact original input before any language, translation,
 *   tone, or intent transformation happens.
 * - Create a stable envelope Marion can authorize downstream.
 *
 * Authority rule:
 * Marion owns the raw input record.
 */

'use strict';

function nowIso() {
  return new Date().toISOString();
}

function normalizeSource(source) {
  const allowed = new Set(['chat', 'mic', 'api', 'system', 'unknown']);
  return allowed.has(source) ? source : 'unknown';
}

function createRawInputEnvelope(input, options = {}) {
  const rawInput = typeof input === 'string' ? input : '';

  const envelope = {
    phase: 'PHASE_1_RAW_INPUT_CAPTURE',
    authority: 'MARION',
    rawInput,
    preservedRawInput: rawInput,
    source: normalizeSource(options.source || 'chat'),
    sessionId: options.sessionId || null,
    userId: options.userId || null,
    messageId: options.messageId || `marion-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: options.timestamp || nowIso(),
    metadata: {
      inputLength: rawInput.length,
      emptyInput: rawInput.trim().length === 0,
      containsLineBreaks: /\r|\n/.test(rawInput),
      captureLocked: true
    },
    marionGate: {
      rawInputPreserved: true,
      mayProceedToLanguageDetection: rawInput.trim().length > 0,
      decision: rawInput.trim().length > 0 ? 'proceed' : 'reject_empty_input',
      reason: rawInput.trim().length > 0
        ? 'Raw user input captured and locked.'
        : 'Input is empty after trimming.'
    }
  };

  return Object.freeze(envelope);
}

module.exports = {
  createRawInputEnvelope
};
