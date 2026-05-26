'use strict';

/**
 * LanguageSphere Fallback Safety Test
 * ------------------------------------------------------------
 * Validates:
 * - Fallback policy selects safe text.
 * - Empty input blocks.
 * - Runtime/provider errors do not leak details.
 * - API middleware degrades safely.
 * - Marion authority remains intact.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createFallbackDecision,
  resolveFallbackFromEnvelope,
  resolveFallbackFromError,
  shouldBlockRequest
} = require('../Data/marion/runtime/languagesphere/LanguageSphereFallbackPolicy');

const {
  prepareLanguageSphereForApiChat
} = require('../Data/marion/runtime/languagesphere/LanguageSphereApiMiddleware');

test('Fallback policy prefers marionInputText when available', () => {
  const decision = createFallbackDecision({
    originalText: 'original',
    normalizedText: 'normalized',
    translatedText: 'translated',
    marionInputText: 'marion-ready'
  });

  assert.equal(decision.blocked, false);
  assert.equal(decision.selectedText, 'marion-ready');
  assert.equal(decision.selectedSource, 'marionInputText');
  assert.equal(decision.authority.finalAuthorityOwner, 'Marion');
});

test('Fallback policy falls back to normalized text when translated text is empty', () => {
  const decision = createFallbackDecision({
    originalText: 'original',
    normalizedText: 'normalized',
    translatedText: '',
    marionInputText: ''
  });

  assert.equal(decision.blocked, false);
  assert.equal(decision.selectedText, 'normalized');
  assert.equal(decision.selectedSource, 'normalizedText');
});

test('Fallback policy blocks empty input', () => {
  const decision = createFallbackDecision({
    originalText: '   ',
    normalizedText: '',
    translatedText: '',
    marionInputText: ''
  });

  assert.equal(decision.blocked, true);
  assert.equal(shouldBlockRequest(decision), true);
  assert.equal(decision.safety.emptyInputBlocked, true);
});

test('Fallback from error does not expose internal error by default', () => {
  const decision = resolveFallbackFromError(
    new Error('secret stack trace should not leak'),
    {
      text: 'Original safe text.'
    }
  );

  assert.equal(decision.blocked, false);
  assert.equal(decision.selectedText, 'Original safe text.');
  assert.equal(decision.errors.includes('secret stack trace should not leak'), false);
  assert.ok(decision.errors.includes('LanguageSphere failed safely.'));
});

test('Fallback from envelope handles error status safely', () => {
  const decision = resolveFallbackFromEnvelope(
    {
      status: 'error',
      text: {
        sourceText: 'Source fallback.',
        normalizedText: 'Normalized fallback.',
        translatedText: '',
        marionInputText: ''
      },
      language: {
        confidence: 0.2,
        fallbackApplied: true
      },
      diagnostics: {
        warnings: ['safe warning'],
        errors: ['safe error']
      }
    },
    {
      text: 'Original fallback.'
    }
  );

  assert.equal(decision.blocked, false);
  assert.equal(decision.selectedText, 'Normalized fallback.');
  assert.equal(decision.selectedSource, 'normalizedText');
  assert.equal(decision.fallbackApplied, true);
});

test('API middleware blocks payload with no text-like field', async () => {
  const result = await prepareLanguageSphereForApiChat({
    requestId: 'req_no_text_001',
    sessionId: 'sess_no_text_001',
    inputSource: 'text',
    targetLanguage: 'en'
  });

  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
  assert.equal(result.marionPayload.languageSphereBlocked, true);
  assert.equal(result.marionPayload.authority.finalAuthorityOwner, 'Marion');
});

test('API middleware handles provider failure safely without debug leakage', async () => {
  const provider = {
    async translate() {
      throw new Error('sk-secret-provider-stack-should-not-leak');
    }
  };

  const result = await prepareLanguageSphereForApiChat(
    {
      text: 'Hola, necesito una traducción para este idioma.',
      requestId: 'req_provider_secret_001',
      sessionId: 'sess_provider_secret_001',
      inputSource: 'text',
      targetLanguage: 'en'
    },
    {
      provider
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.blocked, false);
  assert.equal(result.marionPayload.text, 'Hola, necesito una traducción para este idioma.');
  assert.equal(result.marionPayload.authority.finalAuthorityOwner, 'Marion');

  const joinedErrors = JSON.stringify(result.fallbackDecision.errors);
  assert.equal(joinedErrors.includes('sk-secret-provider-stack-should-not-leak'), false);
});
