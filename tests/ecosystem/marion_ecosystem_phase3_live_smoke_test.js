'use strict';

const assert = require('assert');
const crypto = require('crypto');

const BASE = String(
  process.env.MARION_ECOSYSTEM_BACKEND ||
  process.env.LS_BACKEND ||
  'http://localhost:3000'
).replace(/\/$/, '');

const TOKEN = process.env.CRM_ECOSYSTEM_INGEST_TOKEN || '';

function headers() {
  return {
    'Content-Type': 'application/json',
    ...(TOKEN ? { 'x-sb-crm-token': TOKEN } : {})
  };
}

async function readJson(url, options = {}) {
  const response = await fetch(url, options);
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

(async () => {
  const health = await readJson(
    BASE + '/api/marion/ecosystem/crm/health'
  );

  assert.ok(
    health.response.status === 200 ||
    health.response.status === 503,
    JSON.stringify(health.json)
  );

  const requestId = 'crm-live-' + crypto.randomUUID();
  const traceId = 'crm-trace-' + crypto.randomUUID();

  const result = await readJson(
    BASE + '/api/marion/ecosystem/crm/lead',
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        requestId,
        traceId,
        sessionId: 'crm-live-session',
        eventType: 'lead.created',
        provider: 'gohighlevel',
        lead: {
          contactId: 'live-test-contact',
          company: 'Live Test Company',
          industry: 'real estate',
          city: 'Toronto',
          region: 'Ontario',
          country: 'Canada',
          source: 'LinkedIn',
          tags: ['advertising', 'tv'],
          engagement: {
            formSubmissions: 1,
            pageViews: 6,
            replies: 1
          }
        }
      })
    }
  );

  assert.equal(result.response.ok, true, JSON.stringify(result.json));
  assert.equal(result.json.ok, true);
  assert.equal(result.json.result.requestId, requestId);
  assert.equal(result.json.result.traceId, traceId);
  assert.equal(result.json.result.controls.readOnly, true);
  assert.equal(result.json.result.controls.executeAutomatically, false);
  assert.equal(result.json.result.recommendation.humanApprovalRequired, true);

  console.log('PASS MARION ECOSYSTEM PHASE 3 CRM LIVE SMOKE TEST');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
