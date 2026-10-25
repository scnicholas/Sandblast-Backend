'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requestIntelligence, config } = require('../Utils/marionNeonIntelligence');
const env = { NEON_AI_GATEWAY_TOKEN: 'dummy', NEON_AI_GATEWAY_BASE_URL: 'https://example.invalid', MARION_NEON_MODEL: 'gpt-5-mini' };
const session = { source: 'server-verified-session', authorized: true, scope: 'private_admin', sessionId: 'session-123', audience: 'owner' };
test('rejects untrusted clients without network call', async () => {
  let calls = 0;
  const result = await requestIntelligence({ prompt: 'hello', session: { ...session, source: 'client' } }, { env, fetchImpl: async () => { calls++; } });
  assert.equal(result.reason, 'private_authorization_required'); assert.equal(calls, 0);
});
test('rejects malformed config', () => {
  assert.equal(config({ ...env, NEON_AI_GATEWAY_BASE_URL: 'http://example.invalid' }), null);
  assert.equal(config({ ...env, NEON_AI_GATEWAY_BASE_URL: 'https://user:password@example.invalid' }), null);
});
test('returns an advisory from a valid model reply', async () => {
  const result = await requestIntelligence({ prompt: 'hello', session }, { env, fetchImpl: async (_url, args) => {
    const body = JSON.parse(args.body);
    assert.equal(body.model, 'gpt-5-mini');
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Helpful answer.' } }] }) };
  }});
  assert.equal(result.ok, true); assert.equal(result.advisory, 'Helpful answer.');
});
test('upstream errors fail closed', async () => {
  const result = await requestIntelligence({ prompt: 'hello', session }, { env, fetchImpl: async () => ({ ok: false, status: 503 }) });
  assert.equal(result.ok, false); assert.equal(result.reason, 'upstream_http_error');
});
