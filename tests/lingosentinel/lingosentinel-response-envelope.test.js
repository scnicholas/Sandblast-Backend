'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createLingoSentinelResponseEnvelope,
  createLingoSentinelFallbackResponse,
  validateLingoSentinelResponseEnvelope
} = require('../../Data/marion/runtime/LingoSentinel/LingoSentinelResponseEnvelope');

test('creates successful LingoSentinel response envelope', () => {
  const envelope = createLingoSentinelResponseEnvelope({
    requestId: 'ls_res_1',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    mode: 'translate',
    translatedText: 'Bonjour',
    finalText: 'Bonjour',
    confidence: 0.93
  });

  assert.equal(envelope.ok, true);
  assert.equal(envelope.gateway, 'marion-lingosentinel');
  assert.equal(envelope.requestId, 'ls_res_1');
  assert.equal(envelope.sourceLanguage, 'en');
  assert.equal(envelope.targetLanguage, 'fr');
  assert.equal(envelope.finalText, 'Bonjour');
  assert.equal(envelope.confidence, 0.93);
  assert.equal(envelope.requiresMarionReview, true);
});

test('uses adaptedText as finalText when finalText is missing', () => {
  const envelope = createLingoSentinelResponseEnvelope({
    adaptedText: 'Natural adapted text.',
    confidence: 0.8
  });

  assert.equal(envelope.ok, true);
  assert.equal(envelope.finalText, 'Natural adapted text.');
});

test('uses translatedText as finalText when finalText and adaptedText are missing', () => {
  const envelope = createLingoSentinelResponseEnvelope({
    translatedText: 'Bonjour',
    confidence: 0.8
  });

  assert.equal(envelope.ok, true);
  assert.equal(envelope.finalText, 'Bonjour');
});

test('clamps confidence over 1', () => {
  const envelope = createLingoSentinelResponseEnvelope({
    finalText: 'Bonjour',
    confidence: 2
  });

  assert.equal(envelope.confidence, 1);
});

test('clamps confidence below 0', () => {
  const envelope = createLingoSentinelResponseEnvelope({
    finalText: 'Bonjour',
    confidence: -2
  });

  assert.equal(envelope.confidence, 0);
});

test('creates fallback response', () => {
  const envelope = createLingoSentinelFallbackResponse({
    requestId: 'fallback_res_1',
    text: 'Hello',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    reason: 'Provider unavailable.'
  });

  assert.equal(envelope.ok, false);
  assert.equal(envelope.requestId, 'fallback_res_1');
  assert.equal(envelope.fallbackUsed, true);
  assert.equal(envelope.confidence, 0);
  assert.equal(envelope.requiresMarionReview, true);
  assert.ok(envelope.warnings.includes('Provider unavailable.'));
});

test('validates successful response envelope', () => {
  const envelope = createLingoSentinelResponseEnvelope({
    finalText: 'Bonjour',
    confidence: 0.9
  });

  const validation = validateLingoSentinelResponseEnvelope(envelope);

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});

test('rejects successful response without finalText', () => {
  const validation = validateLingoSentinelResponseEnvelope({
    ok: true,
    finalText: '',
    confidence: 0.9,
    requiresMarionReview: true
  });

  assert.equal(validation.ok, false);
});
