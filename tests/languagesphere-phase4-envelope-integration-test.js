'use strict';

/**
 * LanguageSphere Phase 4 Envelope Integration Test
 * ------------------------------------------------------------
 * Validates:
 * - LanguageSphereRuntime attaches domainTerminology metadata.
 * - LanguageSphereRuntime attaches domainTranslationPolicy metadata.
 * - Preserve-exact terms remain protected.
 * - Preserve-concept terms are detected.
 * - Translate-carefully terms are detected.
 * - Phase 4 remains metadata-only.
 * - Marion remains final authority.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runLanguageSphere
} = require('../Data/marion/runtime/languagesphere/LanguageSphereRuntime');

const {
  isLanguageSphereEnvelope
} = require('../Data/marion/runtime/languagesphere/LanguageSphereResultEnvelope');

test('Runtime attaches Phase 4 domain metadata to LanguageSphere envelope', async () => {
  const envelope = await runLanguageSphere({
    text: 'Protect StateSpine, the final authority gate, and intellectual property.',
    targetLanguage: 'es'
  });

  assert.equal(isLanguageSphereEnvelope(envelope), true);

  assert.equal(envelope.module, 'LanguageSphere');
  assert.equal(envelope.authority.finalAuthority, false);
  assert.equal(envelope.authority.finalAuthorityOwner, 'Marion');
  assert.equal(envelope.authority.mayBypassMarion, false);

  assert.ok(envelope.domainTerminology);
  assert.equal(envelope.domainTerminology.module, 'DomainTerminologyResolver');
  assert.equal(envelope.domainTerminology.authority.finalAuthority, false);
  assert.equal(envelope.domainTerminology.authority.finalAuthorityOwner, 'Marion');
  assert.equal(envelope.domainTerminology.authority.mayBypassMarion, false);

  assert.ok(envelope.domainTranslationPolicy);
  assert.equal(envelope.domainTranslationPolicy.module, 'DomainTranslationPolicy');
  assert.equal(envelope.domainTranslationPolicy.authority.finalAuthority, false);
  assert.equal(envelope.domainTranslationPolicy.authority.finalAuthorityOwner, 'Marion');
  assert.equal(envelope.domainTranslationPolicy.authority.mayBypassMarion, false);
});

test('Runtime Phase 4 detects preserve-exact terms', async () => {
  const envelope = await runLanguageSphere({
    text: 'StateSpine and MarionBridge must remain untouched.',
    targetLanguage: 'fr'
  });

  const terms = envelope.domainTerminology.detectedTerms;
  const decisions = envelope.domainTranslationPolicy.decisions;

  const stateSpineTerm = terms.find((item) => item.term === 'StateSpine');
  const marionBridgeTerm = terms.find((item) => item.term === 'MarionBridge');

  const stateSpineDecision = decisions.find((item) => item.term === 'StateSpine');
  const marionBridgeDecision = decisions.find((item) => item.term === 'MarionBridge');

  assert.ok(stateSpineTerm);
  assert.ok(marionBridgeTerm);

  assert.equal(stateSpineTerm.preserveExact, true);
  assert.equal(stateSpineTerm.allowTranslation, false);
  assert.equal(stateSpineTerm.mappedTranslation, 'StateSpine');

  assert.equal(marionBridgeTerm.preserveExact, true);
  assert.equal(marionBridgeTerm.allowTranslation, false);
  assert.equal(marionBridgeTerm.mappedTranslation, 'MarionBridge');

  assert.equal(stateSpineDecision.policy, 'preserve-exact');
  assert.equal(stateSpineDecision.action, 'preserve-exact');
  assert.equal(stateSpineDecision.allowTranslation, false);
  assert.equal(stateSpineDecision.allowRewrite, false);

  assert.equal(marionBridgeDecision.policy, 'preserve-exact');
  assert.equal(marionBridgeDecision.action, 'preserve-exact');
  assert.equal(marionBridgeDecision.allowTranslation, false);
  assert.equal(marionBridgeDecision.allowRewrite, false);
});

test('Runtime Phase 4 detects preserve-concept authority terms', async () => {
  const envelope = await runLanguageSphere({
    text: 'The final authority gate and final envelope must stay stable.',
    targetLanguage: 'es'
  });

  const decisions = envelope.domainTranslationPolicy.decisions;

  const finalAuthorityGate = decisions.find(
    (item) => item.term === 'final authority gate'
  );

  const finalEnvelope = decisions.find(
    (item) => item.term === 'final envelope'
  );

  assert.ok(finalAuthorityGate);
  assert.ok(finalEnvelope);

  assert.equal(finalAuthorityGate.policy, 'preserve-concept');
  assert.equal(finalAuthorityGate.action, 'use-approved-concept-map');
  assert.equal(finalAuthorityGate.mappedTranslation, 'puerta de autoridad final');
  assert.equal(finalAuthorityGate.allowTranslation, true);
  assert.equal(finalAuthorityGate.allowRewrite, false);

  assert.equal(finalEnvelope.policy, 'preserve-concept');
  assert.equal(finalEnvelope.action, 'use-approved-concept-map');
  assert.equal(finalEnvelope.mappedTranslation, 'envoltura final');
  assert.equal(finalEnvelope.allowTranslation, true);
  assert.equal(finalEnvelope.allowRewrite, false);
});

test('Runtime Phase 4 detects translate-carefully legal/business terms', async () => {
  const envelope = await runLanguageSphere({
    text: 'The intellectual property and licensing language must stay precise.',
    targetLanguage: 'fr'
  });

  const decisions = envelope.domainTranslationPolicy.decisions;

  const intellectualProperty = decisions.find(
    (item) => item.term === 'intellectual property'
  );

  const licensing = decisions.find(
    (item) => item.term === 'licensing'
  );

  assert.ok(intellectualProperty);
  assert.ok(licensing);

  assert.equal(intellectualProperty.domain, 'legal');
  assert.equal(intellectualProperty.policy, 'translate-carefully');
  assert.equal(intellectualProperty.action, 'use-approved-domain-map');
  assert.equal(intellectualProperty.mappedTranslation, 'propriété intellectuelle');
  assert.equal(intellectualProperty.allowTranslation, true);
  assert.equal(intellectualProperty.allowRewrite, true);

  assert.equal(licensing.domain, 'business');
  assert.equal(licensing.policy, 'translate-carefully');
  assert.equal(licensing.action, 'use-approved-domain-map');
  assert.equal(licensing.mappedTranslation, 'licence');
});

test('Runtime Phase 4 remains metadata-only and does not rewrite text', async () => {
  const sourceText = 'Protect StateSpine and the final authority gate.';

  const envelope = await runLanguageSphere({
    text: sourceText,
    targetLanguage: 'es'
  });

  assert.equal(envelope.text.sourceText, sourceText);
  assert.equal(envelope.text.normalizedText, sourceText);

  /**
   * LocalTranslationProvider is still passthrough unless an injected provider
   * is supplied, so Phase 4 must not rewrite the text itself.
   */
  assert.equal(envelope.text.translatedText, sourceText);
  assert.equal(envelope.text.marionInputText, sourceText);

  assert.equal(envelope.domainTranslationPolicy.module, 'DomainTranslationPolicy');
  assert.equal(envelope.domainTranslationPolicy.authority.finalAuthorityOwner, 'Marion');

  assert.equal(envelope.domainTranslationPolicy.safety.finalAnswerBlocked, true);
  assert.equal(envelope.domainTranslationPolicy.safety.authorityBypassBlocked, true);
  assert.equal(
    envelope.domainTranslationPolicy.safety.domainMeaningProtectionEnabled,
    true
  );
});

test('Runtime Phase 4 marks loose translation blocking when exact/concept terms exist', async () => {
  const envelope = await runLanguageSphere({
    text: 'Protect Marion, StateSpine, and the final authority gate.',
    targetLanguage: 'fr'
  });

  assert.equal(envelope.domainTranslationPolicy.summary.preserveExact >= 2, true);
  assert.equal(envelope.domainTranslationPolicy.summary.preserveConcept >= 1, true);
  assert.equal(envelope.domainTranslationPolicy.riskLevel, 'high');

  const exactTerms = envelope.domainTranslationPolicy.decisions.filter(
    (item) => item.preserveExact
  );

  const conceptTerms = envelope.domainTranslationPolicy.decisions.filter(
    (item) => item.preserveConcept
  );

  assert.equal(exactTerms.length >= 2, true);
  assert.equal(conceptTerms.length >= 1, true);
});

test('Runtime Phase 4 handles generic text without false positives', async () => {
  const envelope = await runLanguageSphere({
    text: 'Hello, how are you today?',
    targetLanguage: 'es'
  });

  assert.equal(envelope.domainTerminology.detectedTerms.length, 0);
  assert.equal(envelope.domainTerminology.counts.detected, 0);
  assert.equal(envelope.domainTranslationPolicy.decisions.length, 0);
  assert.equal(envelope.domainTranslationPolicy.summary.totalTerms, 0);
  assert.equal(envelope.domainTranslationPolicy.riskLevel, 'low');

  assert.equal(envelope.authority.finalAuthority, false);
  assert.equal(envelope.authority.finalAuthorityOwner, 'Marion');
  assert.equal(envelope.authority.mayBypassMarion, false);
});

test('Runtime Phase 4 survives injected translation provider while preserving policy metadata', async () => {
  const fakeProvider = {
    async translate(text, context) {
      assert.equal(context.sourceLanguage, 'es');
      assert.equal(context.targetLanguage, 'en');

      return {
        text: 'Protect StateSpine and the final authority gate.',
        providerName: 'FakeProvider',
        providerMode: 'test',
        applied: true
      };
    }
  };

  const envelope = await runLanguageSphere(
    {
      text: 'Hola, protege StateSpine y la final authority gate.',
      targetLanguage: 'en'
    },
    {
      provider: fakeProvider
    }
  );

  assert.equal(isLanguageSphereEnvelope(envelope), true);
  assert.equal(envelope.language.translationRequired, true);
  assert.equal(envelope.language.translationApplied, true);
  assert.equal(envelope.provider.name, 'FakeProvider');

  /**
   * Phase 4 metadata should still be present after provider translation.
   * Depending on runtime implementation, policy may inspect sourceText,
   * normalizedText, translatedText, or marionInputText. The critical condition:
   * it exists and remains Marion-safe.
   */
  assert.ok(envelope.domainTerminology);
  assert.ok(envelope.domainTranslationPolicy);

  assert.equal(envelope.domainTerminology.authority.finalAuthorityOwner, 'Marion');
  assert.equal(envelope.domainTranslationPolicy.authority.finalAuthorityOwner, 'Marion');
  assert.equal(envelope.domainTranslationPolicy.authority.mayBypassMarion, false);
});