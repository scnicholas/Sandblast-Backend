'use strict';

/**
 * LanguageSphere Runtime Smoke Test
 * ------------------------------------------------------------
 * Validates the Phase 1 spine:
 * - runtime loads
 * - text normalizes
 * - envelope remains Marion-safe
 * - English passthrough works
 * - Spanish/French detection works conservatively
 * - injected provider can translate
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runLanguageSphere,
  normalizeText,
  localDetectLanguage,
  shouldTranslate
} = require('../Data/marion/runtime/languagesphere/LanguageSphereRuntime');

const {
  isLanguageSphereEnvelope
} = require('../Data/marion/runtime/languagesphere/LanguageSphereResultEnvelope');

test('LanguageSphere normalizes smart quotes, repeated whitespace, and line breaks', () => {
  const result = normalizeText('  “Hello”   Mac,\n\nthis   is   clean.  ');

  assert.equal(result, '"Hello" Mac, this is clean.');
});

test('LanguageSphere returns a Marion-safe envelope for English input', async () => {
  const envelope = await runLanguageSphere({
    text: 'Hello Marion, can you help me test LanguageSphere?',
    targetLanguage: 'en'
  });

  assert.equal(isLanguageSphereEnvelope(envelope), true);
  assert.equal(envelope.module, 'LanguageSphere');
  assert.equal(envelope.authority.finalAuthority, false);
  assert.equal(envelope.authority.finalAuthorityOwner, 'Marion');
  assert.equal(envelope.authority.mayBypassMarion, false);

  assert.equal(envelope.language.sourceLanguage, 'en');
  assert.equal(envelope.language.targetLanguage, 'en');
  assert.equal(envelope.language.translationRequired, false);

  assert.equal(
    envelope.text.marionInputText,
    'Hello Marion, can you help me test LanguageSphere?'
  );
});

test('LanguageSphere detects Spanish marker input', () => {
  const detection = localDetectLanguage('Hola, necesito una traducción para este idioma.');

  assert.equal(detection.language, 'es');
  assert.ok(detection.confidence >= 0.55);
});

test('LanguageSphere detects French marker input', () => {
  const detection = localDetectLanguage('Bonjour, merci pour la traduction en français.');

  assert.equal(detection.language, 'fr');
  assert.ok(detection.confidence >= 0.55);
});

test('LanguageSphere determines translation requirement correctly', () => {
  assert.equal(shouldTranslate('en', 'en'), false);
  assert.equal(shouldTranslate('es', 'en'), true);
  assert.equal(shouldTranslate('fr', 'en'), true);
  assert.equal(shouldTranslate('unknown', 'en'), false);
});

test('LanguageSphere uses injected provider when translation is required', async () => {
  const fakeProvider = {
    async translate(text, context) {
      assert.equal(context.sourceLanguage, 'es');
      assert.equal(context.targetLanguage, 'en');

      return {
        text: `TRANSLATED: ${text}`,
        providerName: 'FakeProvider',
        providerMode: 'test',
        applied: true
      };
    }
  };

  const envelope = await runLanguageSphere(
    {
      text: 'Hola, necesito una traducción para este idioma.',
      targetLanguage: 'en'
    },
    {
      provider: fakeProvider
    }
  );

  assert.equal(isLanguageSphereEnvelope(envelope), true);
  assert.equal(envelope.language.sourceLanguage, 'es');
  assert.equal(envelope.language.targetLanguage, 'en');
  assert.equal(envelope.language.translationRequired, true);
  assert.equal(envelope.language.translationApplied, true);
  assert.equal(envelope.provider.name, 'FakeProvider');
  assert.equal(envelope.provider.mode, 'test');
  assert.ok(envelope.text.translatedText.startsWith('TRANSLATED:'));
});

test('LanguageSphere fails safely on empty input', async () => {
  const envelope = await runLanguageSphere({
    text: '      ',
    targetLanguage: 'en'
  });

  assert.equal(isLanguageSphereEnvelope(envelope), true);
  assert.equal(envelope.status, 'empty');
  assert.equal(envelope.language.fallbackApplied, true);
  assert.equal(envelope.text.marionInputText, '');
  assert.equal(envelope.authority.finalAuthority, false);
});
