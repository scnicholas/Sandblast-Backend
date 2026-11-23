'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, 'gateway-contract.test.js'), 'utf8');

function isolatedTrace() {
  const start = src.indexOf('// Test-only adapter:');
  const end = src.indexOf('function assertCertified(', start);
  assert.ok(start >= 0 && end > start, 'tracer must be present');
  const logs = [];
  const context = {
    authoritySnapshot(packet) {
      return { ok: packet?.ok === true, marionFinal: packet?.marionFinal === true };
    },
    process: { stderr: { write(message) { logs.push(message); } } },
  };
  vm.runInNewContext(src.slice(start, end) + '\nthis.traceBridgeAuthority = traceBridgeAuthority; this.emitAuthorityTrace = emitAuthorityTrace;', context);
  return { ...context, logs };
}

test('trace adapter delegates once with original receiver and unmodified result', async () => {
  const { traceBridgeAuthority } = isolatedTrace();
  const events = [];
  const packet = { ok: true, marionFinal: true, reply: 'secret', token: 'secret-token' };
  const bridge = {
    otherMethod() { return 19; },
    async handleMarionAdminConversation(input, context) {
      assert.equal(this, bridge);
      assert.equal(input.turn, 't1');
      assert.equal(context.testing, true);
      return packet;
    },
  };
  const wrapped = traceBridgeAuthority(bridge, (e) => events.push(e));
  assert.equal(wrapped.bridge.otherMethod(), 19);
  assert.equal(await wrapped.bridge.handleMarionAdminConversation({turn:'t1'}, {testing:true}), packet);
  assert.equal(wrapped.getCalls(), 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].snapshot.marionFinal, true);
  assert.ok(!JSON.stringify(events).includes('secret'));
});

test('trace adapter propagates thrown errors but not their messages', async () => {
  const { traceBridgeAuthority } = isolatedTrace();
  const events = [];
  const error = new Error('PRIVATE_DO_NOT_PRINT');
  const wrapped = traceBridgeAuthority({ async handleMarionAdminConversation() { throw error; }}, (e) => events.push(e));
  await assert.rejects(() => wrapped.bridge.handleMarionAdminConversation(), (caught) => caught === error);
  assert.equal(events[0].status, 'threw');
  assert.ok(!JSON.stringify(events).includes('PRIVATE_DO_NOT_PRINT'));
});

test('finance test invokes traced bridge and keeps hard authority assertions', () => {
  const start = src.indexOf("test('a private finance turn recovers");
  const end = src.indexOf("test('public Neon polishing", start);
  assert.ok(start >= 0 && end > start);
  const finance = src.slice(start, end);
  assert.match(finance, /serverOptions\(trace\.bridge\)/);
  assert.match(finance, /RAW_BRIDGE_AUTHORITY/);
  assert.match(finance, /FINANCE_GATEWAY_AUTHORITY/);
  assert.match(finance, /assertCertified\(out && out\.ok === true/);
  assert.match(finance, /out\.final === true && out\.marionFinal === true && out\.canEmit === true/);
  assert.match(finance, /assert\.equal\(out\.finalEnvelope\.replySignature, replyHash\(out\.reply\)\)/);
});
