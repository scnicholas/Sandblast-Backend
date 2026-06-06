'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ROUTES,
  classifyLanguageRoute,
  inferSourceLanguage,
  detectExplicitTargetLanguage
} = require('../../Data/marion/runtime/MarionLanguageRouteClassifier');

test('classifies normal English input as Marion-only', () => {
  const result = classifyLanguageRoute('Tell me about Sandblast Channel.');

  assert.equal(result.ok, true);
  assert.equal(result.route, ROUTES.MARION_ONLY);
  assert.equal(result.requiresLingoLink, false);
  assert.equal(result.sourceLanguage, 'en');
});

test('classifies explicit translation request as LingoLink translate', () => {
  const result = classifyLanguageRoute('Translate this into French: hello world.');

  assert.equal(result.ok, true);
  assert.equal(result.route, ROUTES.LINGOLINK_TRANSLATE);
  assert.equal(result.requiresLingoLink, true);
  assert.equal(result.targetLanguage, 'fr');
});

test('classifies cultural adaptation request as LingoLink adapt', () => {
  const result = classifyLanguageRoute('Adapt this message for a Spanish audience.');

  assert.equal(result.ok, true);
  assert.equal(result.route, ROUTES.LINGOLINK_ADAPT);
  assert.equal(result.requiresLingoLink, true);
  assert.equal(result.targetLanguage, 'es');
});

test('classifies language learning request as LingoLink learning', () => {
  const result = classifyLanguageRoute('Teach me how to say this phrase in French.');

  assert.equal(result.ok, true);
  assert.equal(result.route, ROUTES.LINGOLINK_LEARNING);
  assert.equal(result.requiresLingoLink, true);
});

test('classifies language detection request as LingoLink detect', () => {
  const result = classifyLanguageRoute('What language is this: bonjour mon ami?');

  assert.equal(result.ok, true);
  assert.equal(result.route, ROUTES.LINGOLINK_DETECT);
  assert.equal(result.requiresLingoLink, true);
});

test('infers French from French signals', () => {
  const result = inferSourceLanguage('Bonjour, comment allez-vous?');

  assert.equal(result, 'fr');
});

test('infers Spanish from Spanish signals', () => {
  const result = inferSourceLanguage('Hola, ¿cómo estás?');

  assert.equal(result, 'es');
});

test('detects explicit target language aliases', () => {
  assert.equal(detectExplicitTargetLanguage('Translate this into French.'), 'fr');
  assert.equal(detectExplicitTargetLanguage('Translate this into Spanish.'), 'es');
  assert.equal(detectExplicitTargetLanguage('Translate this into English.'), 'en');
});

test('returns fallback route for empty input', () => {
  const result = classifyLanguageRoute('');

  assert.equal(result.ok, false);
  assert.equal(result.route, ROUTES.LINGOLINK_FALLBACK);
  assert.equal(result.requiresLingoLink, false);
});
