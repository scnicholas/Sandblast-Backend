'use strict';

// Self-contained tests of the diagnostics in gateway-contract.test.js.
// They do not stub a real Marion final or claim to certify the full runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'gateway-contract.test.js'), 'utf8');
const from = source.indexOf('function booleanOrMissing(');
const to = source.indexOf("test('raw Bridge tracing", from);
assert.ok(from >= 0 && to > from, 'diagnostic section must be present');
const logged = [];
const context = vm.createContext({
  assert, path, root: process.cwd(), gatewayPath: 'MarionVoiceGateway.js',
  process: { stderr: { write(text) { logged.push(text); } } },
});
vm.runInContext(source.slice(from, to), context, { timeout: 2000 });

function trace(bridge, callback) {
  return context.traceBridgeAuthority(bridge, callback);
}

test('observer failure does not mutate successful Bridge result', async () => {
  const result = { ok: true, reply: 'synthetic fixture' };
  const traced = trace({ async handleMarionAdminConversation() { return result; } },
    () => { throw new Error('observer broke'); });
  assert.equal(await traced.bridge.handleMarionAdminConversation({}), result);
  assert.equal(traced.getCalls(), 1);
});

test('observer failure does not replace original Bridge exception', async () => {
  const original = new Error('sensitive exception text');
  const traced = trace({ async handleMarionAdminConversation() { throw original; } },
    () => { throw new Error('observer broke'); });
  await assert.rejects(() => traced.bridge.handleMarionAdminConversation({}), (e) => e === original);
  assert.equal(traced.getCalls(), 1);
});

test('authority diagnostics omit raw reply, token, and session', async () => {
  const events = [];
  const packet = {
    ok: false,
    error: 'MARION_FINAL_AUTHORITY_REQUIRED',
    reply: 'PRIVATE_REPLY_MARKER',
    token: 'PRIVATE_TOKEN_MARKER',
    sessionId: 'PRIVATE_SESSION_MARKER',
    finalEnvelope: {
      reply: 'PRIVATE_REPLY_MARKER',
      signature: 'MARION_FINAL_AUTHORITY',
      replySignature: '0',
      currentTurnBound: false,
      validation: { finalReply: { reasons: ['valid_code', 'contains secret should be redacted'] } },
    },
  };
  const traced = trace({ async handleMarionAdminConversation() { return packet; } },
    (event) => events.push(event));
  assert.equal(await traced.bridge.handleMarionAdminConversation({}), packet);
  assert.equal(events.length, 1);
  const serialized = JSON.stringify(events[0]);
  for (const secret of ['PRIVATE_REPLY_MARKER', 'PRIVATE_TOKEN_MARKER', 'PRIVATE_SESSION_MARKER', 'contains secret']) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(events[0].snapshot.errorCode, 'MARION_FINAL_AUTHORITY_REQUIRED');
  assert.equal(events[0].snapshot.signaturePresent, true);
  assert.equal(events[0].snapshot.replyHashMatches, false);
});

test('the positive private finance contract cannot treat an unsigned raw Bridge as a pass', () => {
  const finance = source.slice(source.indexOf("test('a private finance turn recovers"),
    source.indexOf("test('public Neon polishing"));
  assert.match(finance, /rawBridgeSnapshot\.signaturePresent === true/);
  assert.match(finance, /rawBridgeSnapshot\.currentTurnBound === true/);
  assert.match(finance, /rawBridgeSnapshot\.replyHashMatches === true/);
  assert.match(finance, /assert\.fail\(`private Bridge failed before Gateway normalization/);
  assert.match(finance, /assertCertified\(out && out\.ok === true/);
});
