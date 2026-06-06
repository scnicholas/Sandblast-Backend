'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  processLingoLinkRequest,
  detectLanguage,
  applyGlossary,
  localFallbackTranslate
} = require('../../Data/marion/runtime/LingoLinkCoreAdapter');

const {
  createLingoLinkRequestEnvelope
} = require('../../Data/marion/runtime/LingoLinkRequestEnvelope');

test('detects English fallback language', async () => {
  const result = await detectLanguage('Hello, how are you?');

  assert.equal(result, 'en');
});

test('detects French fallback language', async () => {
  const result = await detectLanguage('Bonjour, comment allez-vous?');

  assert.equal(result, 'fr');
});

test('detects Spanish fallback language', async () => {
  const result = await detectLanguage('Hola, ¿cómo estás?');

  assert.equal(result, 'es');
});

test('applies glossary safely even when glossary runtime is absent', () => {
  const result = applyGlossary('Hello world.', {
    sourceLanguage: 'en',
    targetLanguage: 'fr'
  });

  assert.equal(result.text, 'Hello world.');
  assert.equal(typeof result.glossaryUsed, 'boolean');
});

test('local fallback returns normalized source text when source equals target', () => {
  const result = localFallbackTranslate({
    text: 'Hello world.',
    sourceLanguage: 'en',
    targetLanguage: 'en'
  });

  assert.equal(result.ok, true);
  assert.equal(result.text, 'Hello world.');
  assert.equal(result.translatedText, 'Hello world.');
  assert.equal(result.provider, 'local-fallback');
});

test('local fallback warns when source and target differ', () => {
  const result = localFallbackTranslate({
    text: 'Hello world.',
    sourceLanguage: 'en',
    targetLanguage: 'fr'
  });

  assert.equal(result.ok, true);
  assert.equal(result.text, 'Hello world.');
  assert.equal(result.provider, 'local-fallback');
  assert.ok(Array.isArray(result.warnings));
});

test('processes empty LingoLink request as fallback response', async () => {
  const response = await processLingoLinkRequest({
    requestId: 'core_empty_1',
    text: '',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    mode: 'translate'
  });

  assert.equal(response.ok, false);
  assert.equal(response.fallbackUsed, true);
  assert.equal(response.requiresMarionReview, true);
});

test('processes detect request', async () => {
  const request = createLingoLinkRequestEnvelope({
    requestId: 'core_detect_1',
    text: 'Bonjour mon ami.',
    sourceLanguage: 'auto',
    targetLanguage: 'en',
    mode: 'detect'
  });

  const response = await processLingoLinkRequest(request);

  assert.equal(response.ok, true);
  assert.equal(response.mode, 'detect');
  assert.equal(response.detectedLanguage, 'fr');
  assert.equal(response.requiresMarionReview, true);
});

test('processes translate request without crashing', async () => {
  const request = createLingoLinkRequestEnvelope({
    requestId: 'core_translate_1',
    text: 'Translate hello into French.',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    mode: 'translate'
  });

  const response = await processLingoLinkRequest(request);

  assert.equal(response.gateway, 'marion-lingolink');
  assert.equal(response.requestId, 'core_translate_1');
  assert.equal(response.requiresMarionReview, true);
  assert.equal(typeof response.ok, 'boolean');
});
