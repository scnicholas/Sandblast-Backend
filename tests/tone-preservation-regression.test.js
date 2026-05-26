'use strict';

/**
 * Tone Preservation Regression Test
 * ------------------------------------------------------------
 * Validates:
 * - Tone signals are detected.
 * - Tone classification remains stable.
 * - Locale tone profiles are applied.
 * - Tone metadata never claims final authority.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectToneSignals,
  classifyTone,
  getToneProfile,
  recommendTonePreservation,
  attachToneMetadataToEnvelope
} = require('../Data/marion/runtime/languagesphere/TonePreservationEngine');

const {
  resolveLocaleContext
} = require('../Data/marion/runtime/languagesphere/LocaleContextResolver');

const {
  createLanguageSphereEnvelope
} = require('../Data/marion/runtime/languagesphere/LanguageSphereResultEnvelope');

test('Tone engine detects urgency', () => {
  const signals = detectToneSignals('This is urgent!! We need this fixed right now.');

  assert.equal(signals.urgency, true);
});

test('Tone engine detects frustration', () => {
  const signals = detectToneSignals('The API is broken and the regression test failed.');

  assert.equal(signals.frustration, true);
  assert.equal(signals.technical, true);
});

test('Tone engine detects gratitude', () => {
  const signals = detectToneSignals('Thank you, I appreciate the help.');

  assert.equal(signals.gratitude, true);
});

test('Tone engine classifies urgent-frustrated tone', () => {
  const tone = classifyTone('This is urgent!! The bridge failed and it is not working.');

  assert.equal(tone.primaryTone, 'urgent-frustrated');
  assert.equal(tone.signals.urgency, true);
  assert.equal(tone.signals.frustration, true);
  assert.ok(tone.confidence >= 0.7);
});

test('Tone engine classifies technical tone', () => {
  const tone = classifyTone('The runtime provider returned invalid JSON in the payload.');

  assert.equal(tone.primaryTone, 'technical');
  assert.equal(tone.signals.technical, true);
});

test('Tone profile resolves Spanish profile', () => {
  const locale = resolveLocaleContext({
    sourceLanguage: 'en',
    targetLanguage: 'es',
    locale: 'es'
  });

  const profile = getToneProfile(locale);

  assert.equal(profile.language, 'es');
  assert.equal(profile.defaultFormality, 'neutral-warm');
  assert.equal(profile.warmth, 'high');
});

test('Tone profile resolves Canadian French profile', () => {
  const locale = resolveLocaleContext({
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    locale: 'fr-CA'
  });

  const profile = getToneProfile(locale);

  assert.equal(profile.language, 'fr');
  assert.equal(profile.region, 'CA');
  assert.equal(profile.label, 'Canadian French');
});

test('Tone preservation recommends Spanish warmth and technical precision', () => {
  const result = recommendTonePreservation(
    'The API bridge failed, but we need to preserve Marion and StateSpine.',
    {
      sourceLanguage: 'en',
      targetLanguage: 'es',
      locale: 'es'
    }
  );

  assert.equal(result.module, 'TonePreservationEngine');
  assert.equal(result.status, 'ok');
  assert.equal(result.localeContext.targetLanguage, 'es');

  assert.ok(result.preserve.includes('technical specificity'));
  assert.ok(result.recommendations.includes('preserve technical precision and locked terminology'));
  assert.ok(result.recommendations.includes('preserve warmth and respectful phrasing'));

  assert.equal(result.authority.finalAuthority, false);
  assert.equal(result.authority.finalAuthorityOwner, 'Marion');
  assert.equal(result.authority.mayBypassMarion, false);
});

test('Tone preservation recommends French polished phrasing', () => {
  const result = recommendTonePreservation(
    'Please keep this business response professional and precise.',
    {
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      locale: 'fr'
    }
  );

  assert.equal(result.localeContext.targetLanguage, 'fr');
  assert.ok(result.recommendations.includes('preserve polished phrasing and register'));
  assert.equal(result.authority.finalAuthorityOwner, 'Marion');
});

test('Tone preservation attaches safely to LanguageSphere envelope', () => {
  const envelope = createLanguageSphereEnvelope({
    sourceText: 'This is urgent!! The API bridge failed.',
    normalizedText: 'This is urgent!! The API bridge failed.',
    translatedText: 'This is urgent!! The API bridge failed.',
    sourceLanguage: 'en',
    targetLanguage: 'fr'
  });

  const updated = attachToneMetadataToEnvelope(envelope, {
    locale: 'fr'
  });

  assert.equal(updated.module, 'LanguageSphere');
  assert.equal(updated.tonePreservation.module, 'TonePreservationEngine');
  assert.equal(updated.tonePreservation.tone.primaryTone, 'urgent-frustrated');
  assert.equal(updated.tonePreservation.authority.finalAuthority, false);
  assert.equal(updated.tonePreservation.authority.finalAuthorityOwner, 'Marion');
});
