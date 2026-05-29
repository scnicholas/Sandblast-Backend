'use strict';

/**
 * LanguageSphere Final Authority Regression Test
 * ------------------------------------------------------------
 * Jest-compatible regression harness.
 *
 * Validates:
 * - LanguageSphere cannot claim final authority.
 * - LanguageSphere cannot bypass Marion.
 * - LanguageSphere cannot provide visible final answers.
 * - Final gate only passes safe prepared input.
 *
 * Critical patch:
 * - Removed node:test import so Jest owns the suite lifecycle.
 * - Runtime modules are loaded from the backend root using process.cwd().
 */

const assert = require('assert').strict;
const path = require('path');

function runtimeModule(...segments) {
  return require(path.resolve(process.cwd(), 'Data', 'marion', 'runtime', ...segments));
}

const {
  validateLanguageSphereAuthority,
  enforceLanguageSphereAuthority,
  createSafeAuthorityMetadata
} = runtimeModule('languagesphere', 'LanguageSphereAuthorityGuard.js');

const {
  gateLanguageSphereForMarion,
  stripLanguageSphereFinalFields,
  assertMarionFinalAuthority
} = runtimeModule('languagesphere', 'LanguageSphereFinalGate.js');

const {
  createLanguageSphereEnvelope
} = runtimeModule('languagesphere', 'LanguageSphereResultEnvelope.js');

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('LanguageSphere final authority regression', () => {
  test('Authority metadata factory always preserves Marion ownership', () => {
    const authority = createSafeAuthorityMetadata({
      finalAuthority: true,
      finalAuthorityOwner: 'LanguageSphere',
      mayBypassMarion: true
    });

    assert.equal(authority.finalAuthority, false);
    assert.equal(authority.finalAuthorityOwner, 'Marion');
    assert.equal(authority.mayBypassMarion, false);
    assert.equal(authority.marionBypassBlocked, true);
  });

  test('Authority guard passes valid LanguageSphere envelope', () => {
    const envelope = createLanguageSphereEnvelope({
      sourceText: 'Hello',
      normalizedText: 'Hello',
      translatedText: 'Hello',
      sourceLanguage: 'en',
      targetLanguage: 'en'
    });

    const result = validateLanguageSphereAuthority(envelope);

    assert.equal(result.ok, true);
    assert.equal(result.blocked, false);
  });

  test('Authority guard blocks LanguageSphere final authority claim', () => {
    const envelope = createLanguageSphereEnvelope({
      sourceText: 'Hello',
      normalizedText: 'Hello',
      translatedText: 'Hello',
      sourceLanguage: 'en',
      targetLanguage: 'en'
    });

    envelope.authority.finalAuthority = true;

    const result = validateLanguageSphereAuthority(envelope);

    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.equal(result.reason, 'languagesphere-final-authority-not-false');

    assert.throws(
      () => enforceLanguageSphereAuthority(envelope),
      /LanguageSphere authority violation/
    );
  });

  test('Authority guard blocks Marion bypass attempt', () => {
    const envelope = createLanguageSphereEnvelope({
      sourceText: 'Hello',
      normalizedText: 'Hello',
      translatedText: 'Hello',
      sourceLanguage: 'en',
      targetLanguage: 'en'
    });

    envelope.authority.mayBypassMarion = true;

    const result = validateLanguageSphereAuthority(envelope);

    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.equal(result.reason, 'marion-bypass-not-explicitly-blocked');
  });

  test('Authority guard blocks visible final answer fields', () => {
    const envelope = createLanguageSphereEnvelope({
      sourceText: 'Hello',
      normalizedText: 'Hello',
      translatedText: 'Hello',
      sourceLanguage: 'en',
      targetLanguage: 'en'
    });

    envelope.finalAnswer = 'LanguageSphere should not say this as final.';

    const result = validateLanguageSphereAuthority(envelope);

    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.equal(result.reason, 'languagesphere-attempted-final-visible-answer');
  });

  test('Final gate passes prepared input only', () => {
    const envelope = createLanguageSphereEnvelope({
      sourceText: 'Hola, necesito una traducción para este idioma.',
      normalizedText: 'Hola, necesito una traducción para este idioma.',
      translatedText: 'Hello, I need translation for this language.',
      sourceLanguage: 'es',
      targetLanguage: 'en',
      translationRequired: true,
      translationApplied: true
    });

    const result = gateLanguageSphereForMarion(envelope);

    assert.equal(result.ok, true);
    assert.equal(result.blocked, false);
    assert.equal(result.finalAuthorityOwner, 'Marion');
    assert.equal(result.preparedInputText, 'Hello, I need translation for this language.');
  });

  test('Final gate blocks empty prepared input by default', () => {
    const envelope = createLanguageSphereEnvelope({
      sourceText: '      ',
      normalizedText: '',
      translatedText: '',
      sourceLanguage: 'unknown',
      targetLanguage: 'en',
      fallbackApplied: true
    });

    const result = gateLanguageSphereForMarion(envelope);

    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.equal(result.reason, 'empty-prepared-input-blocked');
  });

  test('Strip function removes unsafe final fields from LanguageSphere object', () => {
    const envelope = createLanguageSphereEnvelope({
      sourceText: 'Hello',
      normalizedText: 'Hello',
      translatedText: 'Hello',
      sourceLanguage: 'en',
      targetLanguage: 'en'
    });

    envelope.final = 'Unsafe final';
    envelope.finalAnswer = 'Unsafe answer';
    envelope.visibleAnswer = 'Unsafe visible answer';
    envelope.response = {
      final: 'Nested unsafe final',
      finalAnswer: 'Nested unsafe answer',
      visibleAnswer: 'Nested unsafe visible answer',
      safeMetadata: true
    };

    const stripped = stripLanguageSphereFinalFields(envelope);

    assert.equal(stripped.final, undefined);
    assert.equal(stripped.finalAnswer, undefined);
    assert.equal(stripped.visibleAnswer, undefined);
    assert.equal(stripped.response.final, undefined);
    assert.equal(stripped.response.finalAnswer, undefined);
    assert.equal(stripped.response.visibleAnswer, undefined);
    assert.equal(stripped.response.safeMetadata, true);
  });

  test('Marion final authority assertion rejects LanguageSphere as final owner', () => {
    const result = assertMarionFinalAuthority({
      final: 'Unsafe',
      finalAuthorityOwner: 'LanguageSphere',
      finalAuthority: true
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'non-marion-final-authority-owner');
  });

  test('Marion final authority assertion passes Marion-owned final envelope', () => {
    const result = assertMarionFinalAuthority({
      final: 'Safe Marion final.',
      finalAuthorityOwner: 'Marion',
      finalAuthority: true
    });

    assert.equal(result.ok, true);
    assert.equal(result.reason, 'marion-final-authority-intact');
  });
});
