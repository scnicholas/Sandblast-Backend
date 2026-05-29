'use strict';

/**
 * Domain Terminology Lock Regression Test
 * ------------------------------------------------------------
 * Validates:
 * - Locked terms are detected.
 * - Exact-preserve terms remain protected.
 * - Concept-preserve terms are identified.
 * - Marion authority remains intact.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveDomainTerminology,
  attachDomainTerminologyToEnvelope,
  getTermPolicy,
  termExistsInText
} = require('../Data/marion/runtime/languagesphere/DomainTerminologyResolver');

const {
  createLanguageSphereEnvelope
} = require('../Data/marion/runtime/languagesphere/LanguageSphereResultEnvelope');

test('Terminology resolver detects exact locked Marion/Nyx architecture terms', () => {
  const result = resolveDomainTerminology(
    'Marion, Nyx, StateSpine, MarionBridge, and ComposeMarionResponse must stay protected.',
    {
      targetLanguage: 'es'
    }
  );

  const terms = result.detectedTerms.map((item) => item.term);

  assert.ok(terms.includes('Marion'));
  assert.ok(terms.includes('Nyx'));
  assert.ok(terms.includes('StateSpine'));
  assert.ok(terms.includes('MarionBridge'));
  assert.ok(terms.includes('ComposeMarionResponse'));

  assert.equal(result.counts.preserveExact >= 5, true);
  assert.equal(result.authority.finalAuthority, false);
  assert.equal(result.authority.finalAuthorityOwner, 'Marion');
  assert.equal(result.authority.mayBypassMarion, false);
});

test('Terminology resolver detects concept-preserve authority terms', () => {
  const result = resolveDomainTerminology(
    'The final authority gate and final envelope must remain stable.',
    {
      targetLanguage: 'fr'
    }
  );

  const terms = result.detectedTerms.map((item) => item.term);

  assert.ok(terms.includes('final authority'));
  assert.ok(terms.includes('final authority gate'));
  assert.ok(terms.includes('final envelope'));

  assert.equal(result.counts.preserveConcept >= 2, true);
  assert.equal(result.authority.finalAuthority, false);
  assert.equal(result.authority.finalAuthorityOwner, 'Marion');
  assert.equal(result.authority.mayBypassMarion, false);
});

test('Term existence matcher detects whole protected phrase', () => {
  assert.equal(
    termExistsInText('Protect the final authority gate now.', 'final authority gate'),
    true
  );

  assert.equal(
    termExistsInText('Protect StateSpine now.', 'StateSpine'),
    true
  );

  assert.equal(
    termExistsInText('This is unrelated.', 'StateSpine'),
    false
  );
});

test('Term policy resolves preserve-exact for StateSpine', () => {
  const policy = getTermPolicy('StateSpine');

  assert.equal(policy.domain, 'architecture');
  assert.equal(policy.policy, 'preserve-exact');
});

test('Term policy resolves translate-carefully for intellectual property', () => {
  const policy = getTermPolicy('intellectual property');

  assert.equal(policy.domain, 'legal');
  assert.equal(policy.policy, 'translate-carefully');
});

test('Terminology resolver handles generic text without false positives', () => {
  const result = resolveDomainTerminology(
    'Hello, how are you today?',
    {
      targetLanguage: 'es'
    }
  );

  assert.equal(result.detectedTerms.length, 0);
  assert.equal(result.counts.detected, 0);
  assert.deepEqual(result.domains, []);
  assert.equal(result.status, 'ok');
});

test('Terminology resolver attaches metadata to LanguageSphere envelope', () => {
  const envelope = createLanguageSphereEnvelope({
    sourceText: 'Protect Marion and the final authority gate.',
    normalizedText: 'Protect Marion and the final authority gate.',
    translatedText: 'Protect Marion and the final authority gate.',
    sourceLanguage: 'en',
    targetLanguage: 'es'
  });

  const updated = attachDomainTerminologyToEnvelope(envelope, {
    targetLanguage: 'es'
  });

  assert.equal(updated.module, 'LanguageSphere');
  assert.equal(updated.domainTerminology.module, 'DomainTerminologyResolver');
  assert.equal(updated.domainTerminology.authority.finalAuthority, false);
  assert.equal(updated.domainTerminology.authority.finalAuthorityOwner, 'Marion');
  assert.equal(updated.domainTerminology.authority.mayBypassMarion, false);

  const terms = updated.domainTerminology.detectedTerms.map((item) => item.term);

  assert.ok(terms.includes('Marion'));
  assert.ok(terms.includes('final authority'));
});

test('Terminology resolver preserves exact mapped translations for internal names', () => {
  const result = resolveDomainTerminology(
    'StateSpine and MarionBridge must remain stable.',
    {
      targetLanguage: 'fr'
    }
  );

  const stateSpine = result.detectedTerms.find((item) => item.term === 'StateSpine');
  const bridge = result.detectedTerms.find((item) => item.term === 'MarionBridge');

  assert.equal(stateSpine.preserveExact, true);
  assert.equal(stateSpine.allowTranslation, false);
  assert.equal(stateSpine.mappedTranslation, 'StateSpine');

  assert.equal(bridge.preserveExact, true);
  assert.equal(bridge.allowTranslation, false);
  assert.equal(bridge.mappedTranslation, 'MarionBridge');
});