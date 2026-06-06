'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MODES,
  DOMAINS,
  createLingoLinkRequestEnvelope,
  validateLingoLinkRequestEnvelope
} = require('../../Data/marion/runtime/LingoLinkRequestEnvelope');

test('creates valid LingoLink request envelope', () => {
  const envelope = createLingoLinkRequestEnvelope({
    requestId: 'll_req_1',
    text: 'Translate hello into French.',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    mode: 'translate',
    domain: 'general'
  });

  assert.equal(envelope.ok, true);
  assert.equal(envelope.requestId, 'll_req_1');
  assert.equal(envelope.gateway, 'marion-lingolink');
  assert.equal(envelope.text, 'Translate hello into French.');
  assert.equal(envelope.sourceLanguage, 'en');
  assert.equal(envelope.targetLanguage, 'fr');
  assert.equal(envelope.mode, MODES.TRANSLATE);
  assert.equal(envelope.domain, DOMAINS.GENERAL);
  assert.equal(envelope.requiresMarionReview, true);
});

test('defaults missing mode to translate', () => {
  const envelope = createLingoLinkRequestEnvelope({
    text: 'Hello',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    mode: 'unsupported-mode'
  });

  assert.equal(envelope.mode, MODES.TRANSLATE);
});

test('defaults missing domain to general', () => {
  const envelope = createLingoLinkRequestEnvelope({
    text: 'Hello',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    domain: 'unknown-domain'
  });

  assert.equal(envelope.domain, DOMAINS.GENERAL);
});

test('preserves tone and intent by default', () => {
  const envelope = createLingoLinkRequestEnvelope({
    text: 'Hello'
  });

  assert.equal(envelope.preserveTone, true);
  assert.equal(envelope.preserveIntent, true);
});

test('allows preserveTone and preserveIntent to be disabled explicitly', () => {
  const envelope = createLingoLinkRequestEnvelope({
    text: 'Hello',
    preserveTone: false,
    preserveIntent: false
  });

  assert.equal(envelope.preserveTone, false);
  assert.equal(envelope.preserveIntent, false);
});

test('validates correct request envelope', () => {
  const envelope = createLingoLinkRequestEnvelope({
    text: 'Translate hello.',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    mode: 'translate'
  });

  const validation = validateLingoLinkRequestEnvelope(envelope);

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});

test('rejects envelope without text', () => {
  const envelope = createLingoLinkRequestEnvelope({
    text: '',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    mode: 'translate'
  });

  const validation = validateLingoLinkRequestEnvelope(envelope);

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes('Envelope text is required.'));
});
