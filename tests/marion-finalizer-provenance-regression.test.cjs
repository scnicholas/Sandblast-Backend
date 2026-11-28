'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const finalizer=require(path.resolve(__dirname,'../Data/marion/runtime/marionFinalEnvelope.js'));
const reply='Improve cash flow by collecting invoices promptly, forecasting weekly cash needs, and controlling discretionary expenses.';
const baseline={reply,turnId:'finance-test-1',sessionId:'finance-session-1',currentTurnBound:true,
  semanticAuthority:'marion',privateAdminConversation:true,marionAdminConversation:true,
  routing:{domain:'finance',knowledgeDomain:'finance',intent:'business_strategy'},
  meta:{turnId:'finance-test-1',bridgeVersion:'finance-test',composerVersion:'finance-test'}};

test('trusted finance response still returns certified final',async()=>{
  const r=await finalizer.createMarionFinalEnvelope(baseline);
  assert.equal(r.ok,true);assert.equal(r.final,true);assert.equal(r.marionFinal,true);
  assert.equal(r.finalEnvelope.currentTurnBound,true);
  assert.equal(r.finalEnvelope.completionStatus.complete,true);
  assert.equal(r.finalEnvelope.adaptiveTrustVerification.allowEmit,true);
  assert.equal(r.diagnostics?.financeFinalizerProvenance,undefined);
  assert.equal(finalizer.validateReplyContract(r.finalEnvelope).ok,true);
});

test('unbound candidate remains rejected and reports only safe flags',async()=>{
  const r=await finalizer.createMarionFinalEnvelope({...baseline,currentTurnBound:false});
  assert.notEqual(r.ok,true);assert.notEqual(r.final,true);
  assert.notEqual(r.canEmit,true);
  assert.equal(r.diagnostics.financeFinalizerProvenance.currentTurnBound,false);
  assert.equal(r.diagnostics.financeFinalizerProvenance.candidateReplyPresent,true);
  assert.equal(JSON.stringify(r.diagnostics.financeFinalizerProvenance).includes(reply),false);
});

test('a rejected input cannot be resurrected by diagnostic instrumentation',async()=>{
  const r=await finalizer.createMarionFinalEnvelope({...baseline,blocked:true,requiresRetry:true});
  assert.notEqual(r.ok,true); assert.notEqual(r.final,true);
  assert.notEqual(r.canEmit,true);
  assert.equal(r.diagnostics.financeFinalizerProvenance.upstreamBlocked,true);
  assert.equal(r.diagnostics.financeFinalizerProvenance.upstreamRetry,true);
});

test('reply policy failures carry safe validation codes',async()=>{
  const r=await finalizer.createMarionFinalEnvelope({...baseline,reply:'hi'});
  assert.notEqual(r.final,true);
  assert.ok(r.diagnostics.financeFinalizerProvenance.replyValidationReasons.includes('reply_too_short'));
  assert.equal(JSON.stringify(r.diagnostics.financeFinalizerProvenance).includes('hi'),false);
});

test('turn alias conflicts are surfaced, never silently treated as matching',async()=>{
  const r=await finalizer.createMarionFinalEnvelope({...baseline,currentTurnBound:false,meta:{turnId:'different-turn'}});
  assert.notEqual(r.final,true);
  assert.equal(r.diagnostics.financeFinalizerProvenance.turnMetaConsistent,false);
});

test('module retains existing validator and signed alias protections',()=>{
  assert.equal(typeof finalizer.validateReplyContract,'function');
  assert.equal(typeof finalizer.attachVisibleReplyAliases,'function');
  assert.equal(typeof finalizer.buildAdaptiveTrustVerification,'function');
});
