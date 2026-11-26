'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const finalizer = require(path.resolve(__dirname, '..', 'Data', 'marion', 'runtime', 'marionFinalEnvelope.js'));
const bridge = require(path.resolve(__dirname, '..', 'Data', 'marion', 'runtime', 'marionBridge.js'));
const financeReply = 'Improve cash flow by collecting invoices promptly, forecasting weekly cash needs, and controlling unnecessary expenses.';
async function canonical(turnId = 'synthetic-validator-finance-turn-1') {
  return await finalizer.createMarionFinalEnvelope({
    reply: financeReply, currentTurnBound: true, semanticAuthority: 'marion', turnId,
    sessionId: 'synthetic-test-only', intent: 'business_strategy', domain: 'finance',
    routing: {intent:'business_strategy', domain:'finance', knowledgeDomain:'finance'},
    meta:{turnId, bridgeVersion:bridge.VERSION, composerVersion:'synthetic-probe'},
    diagnostics:{singleContract:true}
  });
}
function validated(p){return finalizer.validateReplyContract(p.finalEnvelope||p);}
test('canonical Builder certifies the explicit-turn synthetic finance contract',async()=>{
  const p=await canonical();
  assert.equal(p.ok,true);
  assert.equal(p.final,true);
  assert.equal(p.marionFinal,true);
  assert.equal(p.canEmit,true);
  assert.equal(p.finalEnvelope.currentTurnBound,true);
  assert.equal(p.finalEnvelope.completionStatus.complete,true);
  assert.equal(p.finalEnvelope.adaptiveTrustVerification.allowEmit,true);
  assert.deepEqual(validated(p).reasons,[]);
});
test('missing turn ID is not silently certified',async()=>{
  const p=await canonical('');
  assert.notEqual(p.final,true);
  assert.notEqual(p.canEmit,true);
});
test('validator rejects forged turn-binding and Marion authority',async()=>{
  const p=await canonical();
  const fe={...p.finalEnvelope,currentTurnBound:false,semanticAuthority:'unverified'};
  assert.equal(finalizer.validateReplyContract(fe).ok,false);
  assert.ok(finalizer.validateReplyContract(fe).reasons.includes('current_turn_authority_missing'));
});
test('validator rejects copied final signature with a mismatched turn identity',async()=>{
  const p=await canonical();
  const fe={...p.finalEnvelope,meta:{...p.finalEnvelope.meta,turnId:'different-turn'}};
  const reasons=finalizer.validateReplyContract(fe).reasons;
  assert.ok(reasons.includes('marion_final_signature_inconsistent'));
});
test('validator requires positive completion and adaptive-trust approval',async()=>{
  const p=await canonical();
  const f=p.finalEnvelope;
  const noCompletion=finalizer.validateReplyContract({...f,completionStatus:{...f.completionStatus,complete:undefined}});
  const noTrust=finalizer.validateReplyContract({...f,adaptiveTrustVerification:{...f.adaptiveTrustVerification,allowEmit:undefined}});
  assert.ok(noCompletion.reasons.includes('completion_or_trust_blocked'));
  assert.ok(noTrust.reasons.includes('completion_or_trust_blocked'));
});
test('validator rejects signature alias mismatch, retry marker, and altered reply',async()=>{
  const p=await canonical(); const f=p.finalEnvelope;
  assert.ok(finalizer.validateReplyContract({...f,finalSignature:'different'}).reasons.includes('final_signature_alias_mismatch'));
  assert.ok(finalizer.validateReplyContract({...f,requiresRetry:true}).reasons.includes('retry_marker_present'));
  assert.ok(finalizer.validateReplyContract({...f,reply:f.reply+' Tampered'}).reasons.includes('reply_signature_mismatch'));
});
