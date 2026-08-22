'use strict';

const assert = require('assert');
const crypto = require('crypto');

const BASE = String(
  process.env.MARION_ECOSYSTEM_BACKEND ||
  'http://localhost:3000'
).replace(/\/$/, '');

const TOKEN =
  process.env.MARION_DOMAIN_INTERNAL_TOKEN ||
  process.env.MARION_INTERNAL_TOKEN ||
  '';

function headers() {
  return {
    'Content-Type': 'application/json',
    ...(TOKEN
      ? { 'x-marion-domain-token': TOKEN }
      : {})
  };
}

async function json(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  return {
    response,
    data
  };
}

(async () => {
  const health = await json(
    BASE + '/api/marion/ecosystem/domain/health'
  );

  assert.ok(
    health.response.status === 200 ||
    health.response.status === 503,
    JSON.stringify(health.data)
  );

  const requestId = 'phase5-live-' + crypto.randomUUID();

  const chronicle = await json(
    BASE + '/api/marion/ecosystem/domain/chronicle',
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        requestId,
        traceId: 'trace-' + crypto.randomUUID(),
        sessionId: 'phase5-live-session',
        intent: 'evidence_query',
        query: 'Return evidence-governed historical claims for the requested context.',
        context: {
          requestedDate: '1954-06-01'
        }
      })
    }
  );

  assert.ok(
    [200, 503].includes(chronicle.response.status),
    JSON.stringify(chronicle.data)
  );

  if (chronicle.response.status === 200) {
    assert.equal(chronicle.data.response.requestId, requestId);
    assert.equal(chronicle.data.response.domain, 'chronicle');
  }

  const guardians = await json(
    BASE + '/api/marion/ecosystem/domain/guardians',
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        requestId: 'guard-' + crypto.randomUUID(),
        traceId: 'trace-' + crypto.randomUUID(),
        sessionId: 'phase5-live-session',
        intent: 'strategy_review',
        query: 'Perform advisory strategic review for Marion.'
      })
    }
  );

  assert.ok(
    [200, 503].includes(guardians.response.status),
    JSON.stringify(guardians.data)
  );

  console.log('PASS MARION ECOSYSTEM PHASE 5 DOMAIN LIVE SMOKE TEST');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
