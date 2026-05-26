'use strict';

/**
 * Marion LanguageSphere Bridge Test
 * ------------------------------------------------------------
 * Validates:
 * - Bridge prepares text for Marion.
 * - LanguageSphere metadata is attached.
 * - Marion authority remains intact.
 * - Empty input fails safely.
 * - Injected translation provider works.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  prepareInputForMarion,
  mergePreparedInputIntoMarionPayload,
  verifyMarionFinalAfterLanguageSphere,
  extractIncomingText
} = require('../Data/marion/runtime/languagesphere/MarionLanguageSphereBridge');

test('Bridge extracts incoming text from supported payload shapes', () => {
  assert.equal(extractIncomingText('hello'), 'hello');
  assert.equal(extractIncomingText({ text: 'hello text' }), 'hello text');
  assert.equal(extractIncomingText({ userText: 'hello userText' }), 'hello userText');
  assert.equal(extractIncomingText({ message: 'hello message' }), 'hello message');
  assert.equal(extractIncomingText({ input: 'hello input' }), 'hello input');
});

test('Bridge prepares English input for Marion without taking final authority', async () => {
  const result = await prepareInputForMarion({
    text: 'Hello Marion, test the bridge.',
    targetLanguage: 'en',
    inputSource: 'text'
  });

  assert.equal(result.ok, true);
  assert.equal(result.bridge, 'MarionLanguageSphereBridge');
  assert.equal(result.authority.finalAuthority, false);
  assert.equal(result.authority.finalAuthorityOwner, 'Marion');
  assert.equal(result.authority.mayBypassMarion, false);

  assert.equal(result.marionInput.text, 'Hello Marion, test the bridge.');
  assert.equal(result.marionInput.userText, 'Hello Marion, test the bridge.');
  assert.equal(result.marionInput.originalText, 'Hello Marion, test the bridge.');
  assert.equal(result.marionInput.languageSphereApplied, true);

  assert.equal(result.marionInput.languageContext.sourceLanguage, 'en');
  assert.equal(result.marionInput.languageContext.targetLanguage, 'en');
  assert.equal(result.marionInput.languageContext.translationRequired, false);
});

test('Bridge uses injected provider for Spanish to English preparation', async () => {
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

  const result = await prepareInputForMarion(
    {
      text: 'Hola, necesito una traducción para este idioma.',
      targetLanguage: 'en'
    },
    {
      provider: fakeProvider
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.preparedText, 'Hello, I need translation for this language.');
  assert.equal(result.marionInput.text, 'Hello, I need translation for this language.');
  assert.equal(result.marionInput.originalText, 'Hola, necesito una traducción para este idioma.');

  assert.equal(result.marionInput.languageContext.sourceLanguage, 'es');
  assert.equal(result.marionInput.languageContext.targetLanguage, 'en');
  assert.equal(result.marionInput.languageContext.translationRequired, true);
  assert.equal(result.marionInput.languageContext.translationApplied, true);

  assert.equal(result.languageSphere.provider.name, 'FakeProvider');
  assert.equal(result.languageSphere.provider.mode, 'test');
});

test('Bridge fails safely on empty input', async () => {
  const result = await prepareInputForMarion({
    text: '      ',
    targetLanguage: 'en'
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'empty-input-before-languagesphere');
  assert.equal(result.marionInput.languageSphereApplied, false);
  assert.equal(result.marionInput.languageSphereFailedSafe, true);
  assert.equal(result.authority.finalAuthorityOwner, 'Marion');
  assert.equal(result.authority.mayBypassMarion, false);
});

test('Bridge merges prepared input into Marion payload', async () => {
  const result = await prepareInputForMarion({
    text: 'Hello Marion.',
    targetLanguage: 'en',
    requestId: 'req_test_001'
  });

  const merged = mergePreparedInputIntoMarionPayload(
    {
      text: 'Hello Marion.',
      requestId: 'req_test_001',
      inputSource: 'text'
    },
    result
  );

  assert.equal(merged.text, 'Hello Marion.');
  assert.equal(merged.userText, 'Hello Marion.');
  assert.equal(merged.originalText, 'Hello Marion.');
  assert.equal(merged.requestId, 'req_test_001');
  assert.equal(merged.inputSource, 'text');
  assert.equal(merged.languageSphereApplied, true);
  assert.equal(merged.finalAuthorityOwner, 'Marion');
  assert.equal(merged.languageSphereBridge.ok, true);
});

test('Bridge verifies Marion final authority after LanguageSphere', () => {
  const finalCheck = verifyMarionFinalAfterLanguageSphere({
    final: 'This is Marion final output.',
    finalAuthorityOwner: 'Marion',
    finalAuthority: true
  });

  assert.equal(finalCheck.ok, true);
  assert.equal(finalCheck.reason, 'marion-final-authority-intact');
});
