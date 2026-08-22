'use strict';

const assert = require('assert');

const Bootstrap = require('../../Data/marion/runtime/ecosystem/MarionEcosystemPhase5Bootstrap');
const ChronicleProvider = require('../../Data/marion/runtime/ecosystem/MarionChronicleProviderAdapter');
const GuardianProviders = require('../../Data/marion/runtime/ecosystem/MarionGuardiansProviderAdapter');
const Router = require('../../Data/marion/runtime/ecosystem/MarionDomainIntelligenceRouter');

(async () => {
  Bootstrap.resetForTests();

  ChronicleProvider.registerProvider({
    async queryEvidence(input) {
      assert.equal(input.readOnly, true);
      assert.equal(input.requireProvenance, true);
      assert.equal(input.allowFabrication, false);

      return {
        ok: true,
        summary: 'Evidence query complete.',
        claims: [{
          claimId: 'route-claim-1',
          statement: 'The address occupancy is supported for the requested period.',
          validFrom: '1950-01-01',
          validTo: '1958-12-31',
          confidence: 'A',
          reconstructionEligible: true,
          sources: [{
            sourceId: 'route-source-1',
            title: 'Archival directory',
            evidenceClass: 'primary'
          }]
        }]
      };
    }
  });

  GuardianProviders.registerProvider('aster', {
    async analyzeSignal(input) {
      assert.equal(input.advisoryOnly, true);
      assert.equal(input.finalAuthority, false);
      return {
        summary: 'Aster identified a bounded pattern for Marion review.'
      };
    }
  });

  GuardianProviders.registerProvider('thalon', {
    async strategyReview(input) {
      assert.equal(input.advisoryOnly, true);
      assert.equal(input.finalAuthority, false);
      return {
        summary: 'Thalon completed advisory strategy review.'
      };
    }
  });

  Bootstrap.bootstrap();

  const chronicle = await Router.route({
    requestId: 'phase5-chronicle-1',
    traceId: 'phase5-trace-1',
    sessionId: 'phase5-session-1',
    source: 'marion',
    domain: 'chronicle',
    intent: 'historical_reconstruction',
    query: 'What is supported for 1954?',
    context: {
      requestedDate: '1954-06-01'
    }
  });

  assert.equal(chronicle.ok, true);
  assert.equal(chronicle.response.requestId, 'phase5-chronicle-1');
  assert.equal(chronicle.domainOutput.payload.reconstructionEligible, true);

  const duplicate = await Router.route({
    requestId: 'phase5-chronicle-1',
    traceId: 'phase5-trace-1',
    sessionId: 'phase5-session-1',
    source: 'marion',
    domain: 'chronicle',
    intent: 'historical_reconstruction',
    query: 'What is supported for 1954?',
    context: {
      requestedDate: '1954-06-01'
    }
  });

  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);

  const guardians = await Router.route({
    requestId: 'phase5-guardians-1',
    traceId: 'phase5-trace-2',
    sessionId: 'phase5-session-1',
    source: 'marion',
    domain: 'project-guardians',
    intent: 'signal_analysis',
    query: 'Analyze the signal pattern.'
  });

  assert.equal(guardians.ok, true);
  assert.equal(guardians.domainOutput.payload.guardian, 'aster');
  assert.equal(guardians.domainOutput.payload.review.requiresMarionReview, true);
  assert.equal(guardians.domainOutput.payload.review.finalAuthority, false);

  console.log('PASS marion_ecosystem_phase5_routing_test');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
