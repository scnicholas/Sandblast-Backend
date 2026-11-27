'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'gateway-contract.test.js'), 'utf8');
const start = source.indexOf('function bridgeHandoffSnapshot(');
const end = source.indexOf('\nfunction safeDiagnosticCode(', start);
assert.ok(start !== -1 && end > start, 'diagnostic routines must exist');
const context = {
  authoritySnapshot: (x) => ({ ok: x.ok, final: x.final }),
  safeDiagnosticCode: (x) => typeof x === 'string' ? x : 'unknown',
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context, { timeout: 1000 });
const snapshot = context.bridgeHandoffSnapshot;
const trace = context.traceBridgeAuthority;

test('consistent server turn/session/partition is recorded without exposing IDs', () => {
  const secret = 'never-expose-session-abc';
  const payload = { turnId: secret, sessionId: secret, partitionKey: secret, adminVerified: true, sessionVerified: true, authenticatedOperator: true, text: secret };
  const ctx = { turnId: secret, sessionId: secret, partitionKey: secret, adminVerified: true, sessionVerified: true, serverSideAdminAuth: true };
  const result = snapshot(payload, ctx);
  assert.equal(result.turnIdsMatch, true);
  assert.equal(result.sessionIdsMatch, true);
  assert.equal(result.contextServerAuth, true);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('mismatched and missing turn identifiers remain visible as booleans', () => {
  const result = snapshot({ turnId: 'a', sessionId: 'x' }, { turnId: 'b', sessionId: 'x' });
  assert.equal(result.turnIdsMatch, false);
  assert.equal(result.sessionIdsMatch, true);
  assert.equal(snapshot({}, {}).turnIdsMatch, false);
});

test('trace invokes one delegate and retains rejected result identity', async () => {
  const output = { ok: false, final: false };
  const events = [];
  const original = { async handleMarionAdminConversation() { return output; } };
  const traced = trace(original, (x) => events.push(x));
  assert.equal(await traced.bridge.handleMarionAdminConversation({ turnId: 'a' }, { turnId: 'a' }), output);
  assert.equal(traced.getCalls(), 1);
  assert.equal(events[0].handoff.turnIdsMatch, true);
  assert.equal(events[0].snapshot.ok, false);
});

test('trace sink errors cannot alter result or exception', async () => {
  const output = { ok: false };
  const t = trace({ handleMarionAdminConversation: () => output }, () => { throw new Error('observer'); });
  assert.equal(await t.bridge.handleMarionAdminConversation(), output);
  const secretError = new Error('sensitive message');
  const rejecting = trace({ handleMarionAdminConversation() { throw secretError; } }, () => { throw new Error('observer'); });
  await assert.rejects(rejecting.bridge.handleMarionAdminConversation(), e => e === secretError);
});
