'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runMarionLingoLinkGateway
} = require('../../Data/marion/runtime/MarionLingoLinkGateway');

test('integration smoke: Marion-only path does not route to LingoLink', async () => {
  const result = await runMarionLingoLinkGateway({
    requestId: 'integration_marion_only_1',
    text: 'Give me a short summary of Sandblast Channel.'
  });

  assert.equal(result.ok, true);
  assert.equal(result.routed, false);
  assert.equal(result.route, 'MARION_ONLY');
  assert.equal(result.finalText, 'Give me a short summary of Sandblast Channel.');
  assert.equal(result.marionFinalAuthority, true);
});

test('integration smoke: English to French translation route does not crash', async () => {
  const result = await runMarionLingoLinkGateway({
    requestId: 'integration_en_fr_1',
    text: 'Translate good morning into French.',
    sourceLanguage: 'en',
    targetLanguage: 'fr'
  });

  assert.equal(result.gateway, 'marion-lingolink');
  assert.equal(result.routed, true);
  assert.equal(result.route, 'LINGOLINK_TRANSLATE');
  assert.equal(result.sourceLanguage, 'en');
  assert.equal(result.targetLanguage, 'fr');
  assert.equal(result.marionFinalAuthority, true);
  assert.equal(result.telemetry.ok, true);
  assert.equal(typeof result.ok, 'boolean');
});

test('integration smoke: French to English route does not crash', async () => {
  const result = await runMarionLingoLinkGateway({
    requestId: 'integration_fr_en_1',
    text: 'Bonjour, comment allez-vous?',
    sourceLanguage: 'fr',
    targetLanguage: 'en'
  });

  assert.equal(result.gateway, 'marion-lingolink');
  assert.equal(result.routed, true);
  assert.equal(result.route, 'LINGOLINK_TRANSLATE');
  assert.equal(result.sourceLanguage, 'fr');
  assert.equal(result.targetLanguage, 'en');
  assert.equal(result.marionFinalAuthority, true);
});

test('integration smoke: Spanish to English route does not crash', async () => {
  const result = await runMarionLingoLinkGateway({
    requestId: 'integration_es_en_1',
    text: 'Hola, ¿cómo estás?',
    sourceLanguage: 'es',
    targetLanguage: 'en'
  });

  assert.equal(result.gateway, 'marion-lingolink');
  assert.equal(result.routed, true);
  assert.equal(result.route, 'LINGOLINK_TRANSLATE');
  assert.equal(result.sourceLanguage, 'es');
  assert.equal(result.targetLanguage, 'en');
  assert.equal(result.marionFinalAuthority, true);
});

test('integration smoke: adaptation route does not crash', async () => {
  const result = await runMarionLingoLinkGateway({
    requestId: 'integration_adapt_1',
    text: 'Adapt this creator message for a French audience.',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    domain: 'media'
  });

  assert.equal(result.gateway, 'marion-lingolink');
  assert.equal(result.routed, true);
  assert.equal(result.route, 'LINGOLINK_ADAPT');
  assert.equal(result.marionFinalAuthority, true);
});

test('integration smoke: learning route does not crash', async () => {
  const result = await runMarionLingoLinkGateway({
    requestId: 'integration_learning_1',
    text: 'Teach me how to say thank you in Spanish.',
    sourceLanguage: 'en',
    targetLanguage: 'es',
    domain: 'education'
  });

  assert.equal(result.gateway, 'marion-lingolink');
  assert.equal(result.routed, true);
  assert.equal(result.route, 'LINGOLINK_LEARNING');
  assert.equal(result.marionFinalAuthority, true);
});

test('integration smoke: empty input safely falls back', async () => {
  const result = await runMarionLingoLinkGateway({
    requestId: 'integration_empty_1',
    text: ''
  });

  assert.equal(result.ok, false);
  assert.equal(result.routed, false);
  assert.equal(result.marionFinalAuthority, true);
  assert.ok(Array.isArray(result.warnings));
});
