'use strict';

/**
 * Domain Translation Policy Test
 * ------------------------------------------------------------
 * Validates:
 * - Domain policy decisions are correct.
 * - Preserve-exact terms block loose translation.
 * - Preserve-concept terms use approved mappings where available.
 * - Domain policy remains metadata-only.
 * - Marion remains final authority.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveTranslationPolicy,
  applyTerminologyPolicyToText,
  attachDomainPolicyToEnvelope,
  shouldBlockLooseTranslation
} = require('../Data/marion/runtime/languagesphere/DomainTranslationPolicy');

const {
  createLanguageSphereEnvelope
} = require('../Data/marion/runtime/languagesphere/LanguageSphereResultEnvelope');

test('Translation policy preserves exact internal architecture terms', () => {
  const result = resolveTranslationPolicy(
    'StateSpine and MarionBridge must not be translated loosely.',
    {
      targetLanguage: 'es'
    }
  );

  const stateSpine = result.decisions.find((item) => item.term === 'StateSpine');
  const bridge = result.decisions.find((item) => item.term === 'MarionBridge');

  assert.equal(stateSpine.policy, 'preserve-exact');
  assert.equal(stateSpine.action, 'preserve-exact');
  assert.equal(stateSpine.allowTranslation, false);
  assert.equal(stateSpine.allowRewrite, false);

  assert.equal(bridge.policy, 'preserve-exact');
  assert.equal(bridge.action, 'preserve-exact');
  assert.equal(bridge.allowTranslation, false);
  assert.equal(bridge.allowRewrite, false);

  assert.equal(result.riskLevel, 'high');
  assert.equal(result.authority.finalAuthority, false);
  assert.equal(result.authority.finalAuthorityOwner, 'Marion');
  assert.equal(result.authority.mayBypassMarion, false);
});

test('Translation policy uses approved concept map for final authority gate', () => {
  const result = resolveTranslationPolicy(
    'The final authority gate protects Marion.',
    {
      targetLanguage: 'fr'
    }
  );

  const decision = result.decisions.find((item) => item.term === 'final authority gate');

  assert.equal(decision.policy, 'preserve-concept');
  assert.equal(decision.action, 'use-approved-concept-map');
  assert.equal(decision.mappedTranslation, "porte d'autorité finale");
  assert.equal(decision.allowTranslation, true);
  assert.equal(decision.allowRewrite, false);
  assert.equal(decision.preserveConcept, true);
});

test('Translation policy handles translate-carefully business/legal terms', () => {
  const result = resolveTranslationPolicy(
    'The intellectual property and licensing plan need stable wording.',
    {
      targetLanguage: 'es'
    }
  );

  const ip = result.decisions.find((item) => item.term === 'intellectual property');
  const licensing = result.decisions.find((item) => item.term === 'licensing');

  assert.equal(ip.policy, 'translate-carefully');
  assert.equal(ip.action, 'use-approved-domain-map');
  assert.equal(ip.mappedTranslation, 'propiedad intelectual');
  assert.equal(ip.allowTranslation, true);
  assert.equal(ip.allowRewrite, true);

  assert.equal(licensing.policy, 'translate-carefully');
  assert.equal(licensing.action, 'use-approved-domain-map');
  assert.equal(licensing.mappedTranslation, 'licenciamiento');
});

test('Translation policy handles finance and engineering terms carefully', () => {
  const result = resolveTranslationPolicy(
    'The revenue projection and regression test must stay accurate.',
    {
      targetLanguage: 'fr'
    }
  );

  const revenue = result.decisions.find((item) => item.term === 'revenue projection');
  const regression = result.decisions.find((item) => item.term === 'regression test');

  assert.equal(revenue.domain, 'finance');
  assert.equal(revenue.policy, 'translate-carefully');
  assert.equal(revenue.mappedTranslation, 'projection de revenus');

  assert.equal(regression.domain, 'engineering');
  assert.equal(regression.policy, 'translate-carefully');
  assert.equal(regression.mappedTranslation, 'test de régression');
});

test('Policy layer remains metadata-only and does not rewrite text', () => {
  const sourceText = 'Protect StateSpine and the final authority gate.';

  const result = applyTerminologyPolicyToText(sourceText, {
    targetLanguage: 'fr'
  });

  assert.equal(result.originalText, sourceText);
  assert.equal(result.policyAppliedText, sourceText);
  assert.equal(result.rewriteApplied, false);
  assert.equal(result.reason, 'metadata-only-domain-policy');
  assert.equal(result.authority.finalAuthority, false);
  assert.equal(result.authority.finalAuthorityOwner, 'Marion');
  assert.equal(result.authority.mayBypassMarion, false);
});

test('Policy layer blocks loose translation when exact or concept terms exist', () => {
  const result = resolveTranslationPolicy(
    'Protect StateSpine and the final authority gate.',
    {
      targetLanguage: 'es'
    }
  );

  assert.equal(shouldBlockLooseTranslation(result), true);
});

test('Policy layer does not block loose translation for generic text', () => {
  const result = resolveTranslationPolicy(
    'Hello, how are you today?',
    {
      targetLanguage: 'es'
    }
  );

  assert.equal(result.decisions.length, 0);
  assert.equal(result.summary.totalTerms, 0);
  assert.equal(result.riskLevel, 'low');
  assert.equal(shouldBlockLooseTranslation(result), false);
});

test('Domain policy attaches metadata to LanguageSphere envelope', () => {
  const envelope = createLanguageSphereEnvelope({
    sourceText: 'Protect the final envelope and loop hardlock.',
    normalizedText: 'Protect the final envelope and loop hardlock.',
    translatedText: 'Protect the final envelope and loop hardlock.',
    sourceLanguage: 'en',
    targetLanguage: 'fr'
  });

  const updated = attachDomainPolicyToEnvelope(envelope, {
    targetLanguage: 'fr'
  });

  assert.equal(updated.module, 'LanguageSphere');
  assert.equal(updated.domainTranslationPolicy.module, 'DomainTranslationPolicy');
  assert.equal(updated.domainTranslationPolicy.authority.finalAuthority, false);
  assert.equal(updated.domainTranslationPolicy.authority.finalAuthorityOwner, 'Marion');
  assert.equal(updated.domainTranslationPolicy.authority.mayBypassMarion, false);

  const terms = updated.domainTranslationPolicy.decisions.map((item) => item.term);

  assert.ok(terms.includes('final envelope'));
  assert.ok(terms.includes('loop hardlock'));
});

test('Translation policy summary counts exact, concept, and careful terms', () => {
  const result = resolveTranslationPolicy(
    'Marion uses the final authority gate for intellectual property protection.',
    {
      targetLanguage: 'es'
    }
  );

  assert.equal(result.summary.totalTerms >= 3, true);
  assert.equal(result.summary.preserveExact >= 1, true);
  assert.equal(result.summary.preserveConcept >= 1, true);
  assert.equal(result.summary.translateCarefully >= 1, true);
});
