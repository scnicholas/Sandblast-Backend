'use strict';

const assert = require('assert');

const Contract = require('../../Data/marion/runtime/ecosystem/MarionDomainIntelligenceContract');
const Router = require('../../Data/marion/runtime/ecosystem/MarionDomainIntelligenceRouter');
const ChronicleProvider = require('../../Data/marion/runtime/ecosystem/MarionChronicleProviderAdapter');
const Bootstrap = require('../../Data/marion/runtime/ecosystem/MarionEcosystemPhase5Bootstrap');

(async () => {
  Bootstrap.resetForTests();

  ChronicleProvider.registerProvider({
    async queryEvidence() {
      return {
        ok: true,
        summary: 'Cohesion render answer.',
        claims: [{
          claimId: 'cohesion-claim-1',
          statement: 'The historical claim is supported for the requested period.',
          validFrom: '1950-01-01',
          validTo: '1958-12-31',
          confidence: 'A',
          reconstructionEligible: true,
          sources: [{
            sourceId: 'cohesion-source-1',
            title: 'Archival directory',
            evidenceClass: 'primary'
          }]
        }]
      };
    }
  });

  Bootstrap.bootstrap();

  const input = {
    requestId: 'cohesion-r1',
    traceId: 'cohesion-t1',
    sessionId: 'cohesion-s1',
    source: 'marion',
    domain: 'chronicle',
    intent: 'evidence_query',
    query: 'Return a supported domain answer.',
    context: { requestedDate: '1954-01-01' }
  };

  const result = await Router.route(input);

  assert.equal(result.ok, true);
  assert.equal(typeof result.response, 'object');
  assert.equal(result.response.contract, Contract.CONTRACT);
  assert.equal(result.response.answer, 'Cohesion render answer.');

  assert.equal(result.reply, 'Cohesion render answer.');
  assert.equal(result.text, result.reply);
  assert.equal(result.answer, result.reply);
  assert.equal(result.payload.reply, result.reply);
  assert.equal(result.renderable, true);

  assert.equal(result.marionFinal, false);
  assert.equal(result.finalAuthority, false);
  assert.equal(result.renderMeta.replyAuthority, 'domain_advisory');

  const duplicate = await Router.route(input);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.reply, 'Cohesion render answer.');
  assert.equal(duplicate.payload.reply, 'Cohesion render answer.');

  console.log('PASS marion_domain_intelligence_render_cohesion_test');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
