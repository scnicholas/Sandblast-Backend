'use strict';

/**
 * LanguageSphere Mic/Text Parity Test
 * ------------------------------------------------------------
 * Jest-compatible regression harness.
 *
 * Validates:
 * - Text input and mic input use the same middleware path.
 * - Language result remains equivalent.
 * - Translation behavior remains equivalent.
 * - Marion authority remains intact.
 *
 * Critical patch:
 * - Removed node:test import so Jest owns the test lifecycle.
 * - Runtime modules are loaded from the backend root using process.cwd().
 */

const assert = require('assert').strict;
const path = require('path');

function runtimeModule(...segments) {
  return require(path.resolve(process.cwd(), 'Data', 'marion', 'runtime', ...segments));
}

const {
  prepareLanguageSphereForApiChat
} = runtimeModule('languagesphere', 'LanguageSphereApiMiddleware.js');

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('LanguageSphere mic/text parity', () => {
  test('Text and mic input preserve equivalent English path behavior', async () => {
    const textPayload = {
      text: 'Hello Marion, test parity.',
      requestId: 'req_parity_text_001',
      sessionId: 'sess_parity_001',
      inputSource: 'text',
      targetLanguage: 'en'
    };

    const micPayload = {
      text: 'Hello Marion, test parity.',
      requestId: 'req_parity_mic_001',
      sessionId: 'sess_parity_001',
      inputSource: 'mic',
      targetLanguage: 'en'
    };

    const textResult = await prepareLanguageSphereForApiChat(textPayload);
    const micResult = await prepareLanguageSphereForApiChat(micPayload);

    assert.equal(textResult.ok, true);
    assert.equal(micResult.ok, true);

    assert.equal(textResult.marionPayload.text, micResult.marionPayload.text);
    assert.equal(textResult.marionPayload.languageContext.sourceLanguage, micResult.marionPayload.languageContext.sourceLanguage);
    assert.equal(textResult.marionPayload.languageContext.targetLanguage, micResult.marionPayload.languageContext.targetLanguage);
    assert.equal(textResult.marionPayload.languageContext.translationRequired, micResult.marionPayload.languageContext.translationRequired);

    assert.equal(textResult.marionPayload.inputSource, 'text');
    assert.equal(micResult.marionPayload.inputSource, 'mic');

    assert.equal(textResult.marionPayload.authority.finalAuthorityOwner, 'Marion');
    assert.equal(micResult.marionPayload.authority.finalAuthorityOwner, 'Marion');
  });

  test('Voice alias normalizes to mic and preserves parity', async () => {
    const result = await prepareLanguageSphereForApiChat({
      text: 'Hello Marion.',
      requestId: 'req_parity_voice_001',
      sessionId: 'sess_parity_001',
      inputSource: 'voice',
      targetLanguage: 'en'
    });

    assert.equal(result.ok, true);
    assert.equal(result.marionPayload.inputSource, 'mic');
    assert.equal(result.marionPayload.authority.finalAuthorityOwner, 'Marion');
  });

  test('Text and mic Spanish translation use equivalent provider behavior', async () => {
    const fakeProvider = {
      async translate(text) {
        return {
          text: `TRANSLATED: ${text}`,
          providerName: 'FakeProvider',
          providerMode: 'test',
          applied: true
        };
      }
    };

    const textResult = await prepareLanguageSphereForApiChat(
      {
        text: 'Hola, necesito una traducción para este idioma.',
        requestId: 'req_parity_es_text_001',
        sessionId: 'sess_parity_es_001',
        inputSource: 'text',
        targetLanguage: 'en'
      },
      {
        provider: fakeProvider
      }
    );

    const micResult = await prepareLanguageSphereForApiChat(
      {
        text: 'Hola, necesito una traducción para este idioma.',
        requestId: 'req_parity_es_mic_001',
        sessionId: 'sess_parity_es_001',
        inputSource: 'mic',
        targetLanguage: 'en'
      },
      {
        provider: fakeProvider
      }
    );

    assert.equal(textResult.ok, true);
    assert.equal(micResult.ok, true);

    assert.equal(textResult.marionPayload.text, micResult.marionPayload.text);
    assert.equal(textResult.marionPayload.languageContext.sourceLanguage, 'es');
    assert.equal(micResult.marionPayload.languageContext.sourceLanguage, 'es');
    assert.equal(textResult.marionPayload.languageContext.translationApplied, true);
    assert.equal(micResult.marionPayload.languageContext.translationApplied, true);
  });
});
