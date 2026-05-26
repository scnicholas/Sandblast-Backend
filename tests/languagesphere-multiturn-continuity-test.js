'use strict';

/**
 * LanguageSphere Multiturn Continuity Test
 * ------------------------------------------------------------
 * Validates:
 * - LanguageSphere evaluates language per turn.
 * - Spanish/French/English switching does not become sticky.
 * - Session continuity metadata is preserved.
 * - Marion authority remains intact.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  prepareLanguageSphereForApiChat
} = require('../Data/marion/runtime/languagesphere/LanguageSphereApiMiddleware');

test('LanguageSphere handles language switching across turns without sticky language state', async () => {
  const sessionId = 'sess_multiturn_001';

  const provider = {
    async translate(text, context) {
      return {
        text: `[${context.sourceLanguage}->${context.targetLanguage}] ${text}`,
        providerName: 'FakeProvider',
        providerMode: 'test',
        applied: true
      };
    }
  };

  const turn1 = await prepareLanguageSphereForApiChat(
    {
      text: 'Hola, necesito una traducción para este idioma.',
      requestId: 'req_multi_001',
      sessionId,
      inputSource: 'text',
      targetLanguage: 'en'
    },
    { provider }
  );

  const turn2 = await prepareLanguageSphereForApiChat(
    {
      text: 'Bonjour, merci pour la traduction en français.',
      requestId: 'req_multi_002',
      sessionId,
      inputSource: 'text',
      targetLanguage: 'en'
    },
    { provider }
  );

  const turn3 = await prepareLanguageSphereForApiChat(
    {
      text: 'Hello Marion, switch back to English.',
      requestId: 'req_multi_003',
      sessionId,
      inputSource: 'text',
      targetLanguage: 'en'
    },
    { provider }
  );

  assert.equal(turn1.ok, true);
  assert.equal(turn2.ok, true);
  assert.equal(turn3.ok, true);

  assert.equal(turn1.marionPayload.sessionId, sessionId);
  assert.equal(turn2.marionPayload.sessionId, sessionId);
  assert.equal(turn3.marionPayload.sessionId, sessionId);

  assert.equal(turn1.marionPayload.languageContext.sourceLanguage, 'es');
  assert.equal(turn2.marionPayload.languageContext.sourceLanguage, 'fr');
  assert.equal(turn3.marionPayload.languageContext.sourceLanguage, 'en');

  assert.equal(turn1.marionPayload.languageContext.translationRequired, true);
  assert.equal(turn2.marionPayload.languageContext.translationRequired, true);
  assert.equal(turn3.marionPayload.languageContext.translationRequired, false);

  assert.equal(turn1.marionPayload.authority.finalAuthorityOwner, 'Marion');
  assert.equal(turn2.marionPayload.authority.finalAuthorityOwner, 'Marion');
  assert.equal(turn3.marionPayload.authority.finalAuthorityOwner, 'Marion');
});

test('LanguageSphere preserves requestId per turn', async () => {
  const first = await prepareLanguageSphereForApiChat({
    text: 'Hello first turn.',
    requestId: 'req_keep_001',
    sessionId: 'sess_keep_001',
    inputSource: 'text',
    targetLanguage: 'en'
  });

  const second = await prepareLanguageSphereForApiChat({
    text: 'Hello second turn.',
    requestId: 'req_keep_002',
    sessionId: 'sess_keep_001',
    inputSource: 'text',
    targetLanguage: 'en'
  });

  assert.equal(first.marionPayload.requestId, 'req_keep_001');
  assert.equal(second.marionPayload.requestId, 'req_keep_002');
  assert.equal(first.marionPayload.sessionId, second.marionPayload.sessionId);
});
