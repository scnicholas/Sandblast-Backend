'use strict';

const assert = require('assert');

const Gateway = require('../../Data/marion/runtime/ecosystem/MarionEcosystemGateway');
const Bootstrap = require('../../Data/marion/runtime/ecosystem/MarionEcosystemPhase3Bootstrap');
const Router = require('../../Data/marion/runtime/ecosystem/MarionCrmEventRouter');

(async () => {
  Gateway.registerMarionRunner(async input => ({
    summary: `Qualified lead analysis for ${input.crm.lead.company || 'unknown company'}.`,
    opportunity: 'advertising',
    recommendedAction: 'prepare_personalized_outreach',
    rationale: 'Strong engagement and advertising interest warrant human-reviewed outreach preparation.',
    risks: []
  }));

  Bootstrap.bootstrap();

  const result = await Router.route({
    requestId: 'crm-phase3-req-1',
    traceId: 'crm-phase3-trace-1',
    sessionId: 'crm-phase3-session-1',
    eventType: 'lead.created',
    provider: 'gohighlevel',
    lead: {
      contactId: 'crm-contact-1',
      company: 'Example Realty',
      industry: 'real estate',
      city: 'Toronto',
      region: 'Ontario',
      country: 'Canada',
      source: 'LinkedIn',
      tags: ['advertising', 'radio'],
      engagement: {
        formSubmissions: 1,
        replies: 1,
        pageViews: 8
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.handled, true);

  const intelligence = result.result;

  assert.equal(intelligence.ok, true);
  assert.equal(intelligence.requestId, 'crm-phase3-req-1');
  assert.equal(intelligence.traceId, 'crm-phase3-trace-1');
  assert.equal(intelligence.controls.readOnly, true);
  assert.equal(intelligence.controls.executeAutomatically, false);
  assert.equal(intelligence.recommendation.humanApprovalRequired, true);
  assert.equal(intelligence.recommendation.action, 'prepare_personalized_outreach');
  assert.match(intelligence.marion.summary, /Example Realty/);

  console.log('PASS marion_ecosystem_phase3_crm_integration_test');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
