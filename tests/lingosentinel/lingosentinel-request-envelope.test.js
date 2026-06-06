'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MODES,
  DOMAINS,
  createLingoSentinelRequestEnvelope,
  validateLingoSentinelRequestEnvelope
} = require('../../Data/marion/runtime/LingoSentinel/LingoSentinelRequestEnvelope');

test('creates valid LingoSentinel request envelope', () => {
  const envelope = createLingoSentinelRequestEnvelope({
    requestId: 'ls_req_1',
    text: 'Translate hello into French.',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    mode: 'translate',
    domain: 'general'
  });

  assert.equal(envelope.ok, true);
  assert.equal(envelope.requestId, 'ls_req_1');
  assert.equal(envelope.gateway, 'marion-lingosentinel');
  assert.equal(envelope.text, 'Translate hello into French.');
  assert.equal(envelope.sourceLanguage, 'en');
  assert.equal(envelope.targetLanguage, 'fr');
  assert.equal(envelope.mode, MODES.TRANSLATE);
  assert.equal(envelope.domain, DOMAINS.GENERAL);
  assert.equal(envelope.requiresMarionReview, true);
});

test('defaults missing mode to translate', () => {
  const envelope = createLingoSentinelRequestEnvelope({
    text: 'Hello',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    mode: 'unsupported-mode'
  });

  assert.equal(envelope.mode, MODES.TRANSLATE);
});

test('defaults missing domain to general', () => {
  const envelope = createLingoSentinelRequestEnvelope({
    text: 'Hello',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    domain: 'unknown-domain'
  });

  assert.equal(envelope.domain, DOMAINS.GENERAL);
});

test('preserves tone and intent by default', () => {
  const envelope = createLingoSentinelRequestEnvelope({
    text: 'Hello'
  });

  assert.equal(envelope.preserveTone, true);
  assert.equal(envelope.preserveIntent, true);
});

test('allows preserveTone and preserveIntent to be disabled explicitly', () => {
  const envelope = createLingoSentinelRequestEnvelope({
    text: 'Hello',
    preserveTone: false,
    preserveIntent: false
  });

  assert.equal(envelope.preserveTone, false);
  assert.equal(envelope.preserveIntent, false);
});

test('validates correct request envelope', () => {
  const envelope = createLingoSentinelRequestEnvelope({
    text: 'Translate hello.',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    mode: 'translate'
  });

  const validation = validateLingoSentinelRequestEnvelope(envelope);

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});

test('rejects envelope without text', () => {
  const envelope = createLingoSentinelRequestEnvelope({
    text: '',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    mode: 'translate'
  });

  const validation = validateLingoSentinelRequestEnvelope(envelope);

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes('Envelope text is required.'));
});
