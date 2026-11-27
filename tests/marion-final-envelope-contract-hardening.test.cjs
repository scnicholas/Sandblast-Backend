'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const finalizer = require(path.resolve(__dirname, '../Data/marion/runtime/marionFinalEnvelope.js'));
const REPLY = 'Improve cash flow by collecting invoices promptly, forecasting weekly cash needs, and controlling unnecessary expenses.';
const turnId = 'isolated-contract-finance-001';
function candidate(override = {}) {
  return {
    reply: REPLY,
    currentTurnBound: true,
    semanticAuthority: 'marion',
    turnId,
    sessionId: 'synthetic-local-only',
    intent: 'business_strategy',
    domain: 'finance',
    routing: { intent: 'business_strategy', domain: 'finance', knowledgeDomain: 'finance' },
    meta: { turnId, bridgeVersion: 'isolated-fixture', composerVersion: 'isolated-fixture' },
    ...override,
  };
}
async function final(input = candidate()) {
  return await finalizer.createMarionFinalEnvelope(input);
}
function validate(packet) {
  return finalizer.validateReplyContract(packet.finalEnvelope);
}
test('canonical finance final contains an independently validated current-turn contract', async () => {
  const out = await final();
  assert.equal(out.ok, true);
  assert.equal(out.final, true);
  assert.equal(out.marionFinal, true);
  assert.equal(out.finalEnvelope.currentTurnBound, true);
  assert.equal(out.finalEnvelope.completionStatus.complete, true);
  assert.equal(out.finalEnvelope.adaptiveTrustVerification.allowEmit, true);
  assert.equal(validate(out).ok, true, validate(out).reasons?.join(', '));
});
test('contract validator rejects altered visible reply aliases without signing again', async () => {
  const out = await final();
  for (const alias of ['text', 'answer', 'output', 'response', 'message', 'finalReply', 'displayReply', 'visibleReply', 'authoritativeReply']) {
    const changed = { ...out.finalEnvelope, [alias]: `Different ${alias} content` };
    const result = finalizer.validateReplyContract(changed);
    assert.equal(result.ok, false, `${alias} was accepted`);
    assert.ok(result.reasons.includes('signed_reply_alias_mismatch'), `${alias}: ${result.reasons.join(',')}`);
  }
});
test('contract validator rejects explicit canEmit false even with a previously signed reply', async () => {
  const out = await final();
  const invalid = finalizer.validateReplyContract({ ...out.finalEnvelope, canEmit: false });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.reasons.includes('can_emit_blocked'));
});
test('missing current-turn binding fails closed', async () => {
  const out = await final(candidate({ currentTurnBound: false }));
  assert.equal(out.ok, false);
  assert.equal(out.canEmit, false);
  assert.equal(out.reply, '');
});
test('missing turn ID fails closed', async () => {
  const out = await final(candidate({ turnId: '', meta: {} }));
  assert.equal(out.ok, false);
  assert.equal(out.canEmit, false);
});
test('explicit upstream failure cannot become a final', async () => {
  const out = await final(candidate({ ok: false, error: 'COMPOSER_INVALID' }));
  assert.equal(out.ok, false);
  assert.equal(out.final, false);
  assert.equal(out.canEmit, false);
  assert.equal(out.reply, '');
});
test('holding reply is not certified', async () => {
  const out = await final(candidate({ reply: 'Please retry, the response path was interrupted.' }));
  assert.equal(out.ok, false);
  assert.equal(out.canEmit, false);
});
test('contract rejects modifications to a signed reply hash', async () => {
  const out = await final();
  const changed = { ...out.finalEnvelope, reply: `${REPLY} Modified.` };
  const result = finalizer.validateReplyContract(changed);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('reply_signature_mismatch'));
});
test('final transport output is JSON-safe', async () => {
  const out = await final();
  assert.equal(typeof JSON.stringify(out), 'string');
});
