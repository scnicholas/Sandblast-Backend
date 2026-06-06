'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ACTIONS,
  reviewLingoLinkOutput
} = require('../../Data/marion/runtime/MarionLingoLinkAuthorityGuard');

test('approves a valid LingoLink response', () => {
  const result = reviewLingoLinkOutput({
    originalText: 'Translate hello into French.',
    route: 'LINGOLINK_TRANSLATE',
    responseEnvelope: {
      ok: true,
      translatedText: 'Bonjour',
      finalText: 'Bonjour',
      confidence: 0.92,
      fallbackUsed: false,
      requiresMarionReview: true,
      warnings: []
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.approved, true);
  assert.equal(result.action, ACTIONS.ALLOW_FINAL_RESPONSE);
  assert.equal(result.marionFinalAuthority, true);
});

test('rejects missing original text', () => {
  const result = reviewLingoLinkOutput({
    originalText: '',
    route: 'LINGOLINK_TRANSLATE',
    responseEnvelope: {
      ok: true,
      finalText: 'Bonjour',
      confidence: 0.9,
      requiresMarionReview: true
    }
  });

  assert.equal(result.approved, false);
  assert.equal(result.action, ACTIONS.FALLBACK_TO_MARION_ONLY);
});

test('rejects missing final text', () => {
  const result = reviewLingoLinkOutput({
    originalText: 'Translate hello into French.',
    route: 'LINGOLINK_TRANSLATE',
    responseEnvelope: {
      ok: false,
      finalText: '',
      confidence: 0.9,
      requiresMarionReview: true
    }
  });

  assert.equal(result.approved, false);
  assert.equal(result.action, ACTIONS.ASK_CLARIFYING_QUESTION);
});

test('rejects low confidence LingoLink response', () => {
  const result = reviewLingoLinkOutput({
    originalText: 'Translate hello into French.',
    route: 'LINGOLINK_TRANSLATE',
    responseEnvelope: {
      ok: true,
      finalText: 'Bonjour',
      confidence: 0.31,
      requiresMarionReview: true
    }
  });

  assert.equal(result.approved, false);
  assert.equal(result.action, ACTIONS.ASK_CLARIFYING_QUESTION);
});

test('allows fallback output only with caution when otherwise valid', () => {
  const result = reviewLingoLinkOutput({
    originalText: 'Tell me what this means.',
    route: 'LINGOLINK_TRANSLATE',
    responseEnvelope: {
      ok: true,
      finalText: 'Tell me what this means.',
      confidence: 0.7,
      fallbackUsed: true,
      requiresMarionReview: true
    }
  });

  assert.equal(result.approved, true);
  assert.equal(result.action, ACTIONS.ALLOW_WITH_CAUTION);
});

test('rejects unsupported-addition warnings', () => {
  const result = reviewLingoLinkOutput({
    originalText: 'Translate hello.',
    route: 'LINGOLINK_TRANSLATE',
    responseEnvelope: {
      ok: true,
      finalText: 'Bonjour plus extra unsupported content.',
      confidence: 0.8,
      requiresMarionReview: true,
      warnings: ['unsupported addition detected']
    }
  });

  assert.equal(result.approved, false);
  assert.equal(result.action, ACTIONS.FALLBACK_TO_MARION_ONLY);
});

test('preserves Marion final authority flag', () => {
  const result = reviewLingoLinkOutput({
    originalText: 'Translate hello.',
    route: 'LINGOLINK_TRANSLATE',
    responseEnvelope: {
      ok: true,
      finalText: 'Bonjour',
      confidence: 0.85,
      requiresMarionReview: true
    }
  });

  assert.equal(result.marionFinalAuthority, true);
});
