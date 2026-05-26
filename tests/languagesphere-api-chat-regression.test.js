'use strict';

/**
 * LanguageSphere API Chat Regression Test
 * ------------------------------------------------------------
 * Validates:
 * - API middleware prepares Marion payload safely.
 * - English, Spanish, and French paths work.
 * - Empty input blocks safely.
 * - Provider failure degrades safely.
 * - Marion remains final authority.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  prepareLanguageSphereForApiChat
} = require('../Data/marion/runtime/languagesphere/LanguageSphereApiMiddleware');

test('API middleware prepares English input for Marion', async () => {
  const result = await prepareLanguageSphereForApiChat({
    text: 'Hello Marion, test the LanguageSphere API path.',
    requestId: 'req_api_en_001',
    sessionId: 'sess_api_001',
    inputSource: 'text',
    targetLanguage: 'en'
  });

  assert.equal(result.ok, true);
  assert.equal(result.blocked, false);
  assert.equal(result.marionPayload.text, 'Hello Marion, test the LanguageSphere API path.');
  assert.equal(result.marionPayload.userText, 'Hello Marion, test the LanguageSphere API path.');
  assert.equal(result.marionPayload.originalText, 'Hello Marion, test the LanguageSphere API path.');
  assert.equal(result.marionPayload.inputSource, 'text');

  assert.equal(result.marionPayload.authority.finalAuthority, false);
  assert.equal(result.marionPayload.authority.finalAuthorityOwner, 'Marion');
  assert.equal(result.marionPayload.authority.mayBypassMarion, false);

  assert.ok(result.marionPayload.languageSphere);
  assert.ok(result.marionPayload.languageSphereTelemetry);
});

test('API middleware prepares Spanish input with injected provider', async () => {
  const fakeProvider = {
    async translate(text, context) {
      assert.equal(context.sourceLanguage, 'es');
      assert.equal(context.targetLanguage, 'en');

      return {
        text: 'Hello, I need translation for this language.',
        providerName: 'FakeProvider',
        providerMode: 'test',
        applied: true
      };
    }
  };

  const result = await prepareLanguageSphereForApiChat(
    {
      text: 'Hola, necesito una traducción para este idioma.',
      requestId: 'req_api_es_001',
      sessionId: 'sess_api_001',
      inputSource: 'text',
      targetLanguage: 'en'
    },
    {
      provider: fakeProvider
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.blocked, false);
  assert.equal(result.marionPayload.text, 'Hello, I need translation for this language.');
  assert.equal(result.marionPayload.originalText, 'Hola, necesito una traducción para este idioma.');

  assert.equal(result.marionPayload.languageContext.sourceLanguage, 'es');
  assert.equal(result.marionPayload.languageContext.targetLanguage, 'en');
  assert.equal(result.marionPayload.languageContext.translationRequired, true);
  assert.equal(result.marionPayload.languageContext.translationApplied, true);

  assert.equal(result.marionPayload.languageSphere.provider.name, 'FakeProvider');
  assert.equal(result.marionPayload.authority.finalAuthorityOwner, 'Marion');
});

test('API middleware prepares French input with injected provider', async () => {
  const fakeProvider = {
    async translate(text, context) {
      assert.equal(context.sourceLanguage, 'fr');
      assert.equal(context.targetLanguage, 'en');

      return {
        text: 'Hello, thank you for the French translation.',
        providerName: 'FakeProvider',
        providerMode: 'test',
        applied: true
      };
    }
  };

  const result = await prepareLanguageSphereForApiChat(
    {
      text: 'Bonjour, merci pour la traduction en français.',
      requestId: 'req_api_fr_001',
      sessionId: 'sess_api_001',
      inputSource: 'text',
      targetLanguage: 'en'
    },
    {
      provider: fakeProvider
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.blocked, false);
  assert.equal(result.marionPayload.text, 'Hello, thank you for the French translation.');
  assert.equal(result.marionPayload.languageContext.sourceLanguage, 'fr');
  assert.equal(result.marionPayload.languageContext.translationApplied, true);
  assert.equal(result.marionPayload.authority.finalAuthorityOwner, 'Marion');
});

test('API middleware blocks empty input safely', async () => {
  const result = await prepareLanguageSphereForApiChat({
    text: '      ',
    requestId: 'req_api_empty_001',
    sessionId: 'sess_api_001',
    inputSource: 'text',
    targetLanguage: 'en'
  });

  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
  assert.equal(result.reason, 'empty-api-chat-input-blocked');
  assert.equal(result.marionPayload.text, '');
  assert.equal(result.marionPayload.userText, '');
  assert.equal(result.marionPayload.languageSphereBlocked, true);
  assert.equal(result.marionPayload.authority.finalAuthorityOwner, 'Marion');
});

test('API middleware survives provider failure and falls back safely', async () => {
  const failingProvider = {
    async translate() {
      throw new Error('provider secret failure should not leak');
    }
  };

  const result = await prepareLanguageSphereForApiChat(
    {
      text: 'Hola, necesito una traducción para este idioma.',
      requestId: 'req_api_provider_fail_001',
      sessionId: 'sess_api_001',
      inputSource: 'text',
      targetLanguage: 'en'
    },
    {
      provider: failingProvider
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.blocked, false);
  assert.equal(result.marionPayload.languageSphereFailedSafe, true);
  assert.equal(result.marionPayload.text, 'Hola, necesito una traducción para este idioma.');
  assert.equal(result.marionPayload.authority.finalAuthorityOwner, 'Marion');

  const errors = result.fallbackDecision.errors.join(' ');
  assert.equal(errors.includes('provider secret failure should not leak'), false);
});
