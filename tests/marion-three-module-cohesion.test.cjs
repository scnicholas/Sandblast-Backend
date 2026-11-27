'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../Data/marion/runtime');
const bridge = require(path.join(root, 'marionBridge.js'));
const finalizer = require(path.join(root, 'marionFinalEnvelope.js'));
const composerSource = fs.readFileSync(path.join(root, 'composeMarionResponse.js'), 'utf8');
const bridgeSource = fs.readFileSync(path.join(root, 'marionBridge.js'), 'utf8');
const question = 'How can a small business improve cash flow? Give me three concise steps.';

// Exercise the real domain fallback implementation, not a second copy of its logic.
test('composer finance fallback answers explicit steps instead of defining cash flow', () => {
  const found = composerSource.match(/^function financeDomainAnswer\(text\)\{[^\n]+/m);
  assert.ok(found, 'finance domain fallback present');
  const sandbox = { lower: (s) => String(s).toLowerCase() };
  vm.runInNewContext(found[0], sandbox);
  const answer = sandbox.financeDomainAnswer(question);
  for (const step of ['1.', '2.', '3.']) assert.ok(answer.includes(step));
  assert.match(answer, /invoice|collection/i);
});

test('bridge prefers upstream session identity to optional command normalizer session', () => {
  assert.match(bridgeSource, /sessionId:firstText\(source\.sessionId,commandPacket\.sessionId\)/);
});

async function canonical() {
  return await finalizer.createMarionFinalEnvelope({
    reply: 'Improve collections by invoicing immediately, forecast weekly cash needs, and reduce unnecessary operating costs.',
    currentTurnBound: true, semanticAuthority: 'marion', turnId: 'synthetic-turn-01', sessionId: 'synthetic-session-01',
    routing: { domain: 'finance', knowledgeDomain: 'finance', intent: 'business_strategy' },
    meta: { turnId: 'synthetic-turn-01', bridgeVersion: 'test', composerVersion: 'test' },
    diagnostics: { singleContract: true }
  });
}

test('canonical finalizer certifies a valid bound synthetic finance reply', async () => {
  const p = await canonical();
  assert.equal(p.ok, true); assert.equal(p.final, true); assert.equal(p.canEmit, true);
  assert.equal(finalizer.validateReplyContract(p.finalEnvelope).ok, true);
});

test('final validator rejects inconsistent top-level turn ID without re-signing', async () => {
  const f = (await canonical()).finalEnvelope;
  const result = finalizer.validateReplyContract({ ...f, turnId: 'different-turn' });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('turn_id_alias_mismatch'));
});

test('final validator rejects blocked or awaiting states', async () => {
  const f = (await canonical()).finalEnvelope;
  for (const mutation of [{blocked:true},{awaitingMarion:true}]) {
    const result = finalizer.validateReplyContract({...f,...mutation});
    assert.equal(result.ok,false);
    assert.ok(result.reasons.includes('envelope_blocked_or_awaiting'));
  }
});

test('final validator rejects changed signed reply aliases', async () => {
  const f = (await canonical()).finalEnvelope;
  const result = finalizer.validateReplyContract({...f,displayReply:f.reply+' forged'});
  assert.equal(result.ok, false);assert.ok(result.reasons.includes('signed_reply_alias_mismatch'));
});

test('Bridge and composer produce an actually certified private-admin finance result', async () => {
  bridge.resolveRuntimeDependencies(true);
  const result = await bridge.handleMarionAdminConversation({
    text: question, turnId:'synthetic-turn-02', sessionId:'synthetic-session-02',
    privateAdminConversation:true, serverSideAdminAuth:true, trustedServerAuth:true,
    adminVerified:true, sessionVerified:true, authenticatedOperator:true
  }, {serverSideAdminAuth:true, sessionVerified:true, turnId:'synthetic-turn-02', sessionId:'synthetic-session-02'});
  assert.equal(result.ok,true,`Bridge: ${result.error || result.reason || 'unknown'}`);
  assert.equal(result.final,true);assert.equal(result.marionFinal,true);assert.equal(result.canEmit,true);
  assert.equal(result.finalEnvelope.currentTurnBound,true);
  assert.equal(finalizer.validateReplyContract(result.finalEnvelope).ok,true);
  assert.match(result.reply, /invoice|receivables|collections/i);
});
