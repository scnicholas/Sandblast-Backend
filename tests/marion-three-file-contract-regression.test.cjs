'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const bridge = require(path.join(root, 'Data/marion/runtime/marionBridge.js'));
const finalizer = require(path.join(root, 'Data/marion/runtime/marionFinalEnvelope.js'));
const question = 'How can a small business improve cash flow? Give me three concise steps.';
const reply = 'Improve cash flow by collecting invoices promptly, forecasting weekly cash needs, and controlling unnecessary expenses.';
function adminInput() { return {text:question,turnId:'finance-test-turn-1',sessionId:'finance-test-session',serverSideAdminAuth:true,trustedServerAuth:true,adminVerified:true,privateAdminConversation:true,authenticatedOperator:true}; }

test('canonical finalizer certifies a valid, turn-bound substantive reply', async()=>{
 const r = await finalizer.createMarionFinalEnvelope({reply,turnId:'finance-test-turn-1',sessionId:'finance-test-session',currentTurnBound:true,semanticAuthority:'marion',intent:'business_strategy',domain:'finance',routing:{intent:'business_strategy',domain:'finance',knowledgeDomain:'finance'},meta:{turnId:'finance-test-turn-1',bridgeVersion:'finance-test',composerVersion:'finance-test'}});
 assert.equal(r.ok,true);assert.equal(r.final,true);assert.equal(r.canEmit,true);assert.equal(r.finalEnvelope.currentTurnBound,true);assert.equal(r.finalEnvelope.completionStatus.complete,true);assert.equal(r.finalEnvelope.adaptiveTrustVerification.allowEmit,true);assert.equal(finalizer.validateReplyContract(r.finalEnvelope).ok,true);
});

test('bridge returns a legitimate signed finance final with available composer', async()=>{
 assert.equal(bridge.resolveRuntimeDependencies(true), true, 'composer must be loadable');
 const r=await bridge.handleMarionAdminConversation(adminInput());
 assert.equal(r.ok,true, 'bridge produced non-final. diagnostic codes: '+JSON.stringify(r.diagnostics?.authorityFailureCodes));
 assert.equal(r.final,true);assert.equal(r.canEmit,true);
 assert.equal(r.finalEnvelope.currentTurnBound,true);
 assert.equal(finalizer.validateReplyContract(r.finalEnvelope).ok,true);
});

test('bridge refuses a rejected finalizer packet and keeps specific code-only evidence', async()=>{
 assert.equal(bridge.resolveRuntimeDependencies(true), true);
 const previous=finalizer.createMarionFinalEnvelope;
 finalizer.createMarionFinalEnvelope=async()=>({ok:false,final:false,marionFinal:false,canEmit:false,requiresRetry:true,error:'MARION_FINAL_AUTHORITY_REQUIRED',finalEnvelope:{ok:false,final:false,marionFinal:false,canEmit:false,currentTurnBound:false,semanticAuthority:'unverified',reply:'',signature:'',completionStatus:{complete:false},adaptiveTrustVerification:{allowEmit:false}},diagnostics:{finalAuthorityTerminalReason:'missing_or_rejected_final'}});
 try {
  const r=await bridge.handleMarionAdminConversation(adminInput());
  assert.equal(r.ok,false);assert.equal(r.final,false);assert.equal(r.canEmit,false);
  assert.equal(r.diagnostics.authorityFailureStage,'final_envelope_invalid');
  assert.ok(r.diagnostics.authorityFailureCodes.includes('completion_not_approved'));
  assert.ok(r.diagnostics.authorityFailureCodes.includes('adaptive_trust_not_approved'));
  assert.equal(r.diagnostics.finalBuilderFailureReason,'missing_or_rejected_final');
  assert.equal(r.diagnostics.finalBuilderAuthoritySnapshot.signaturePresent,false);
  assert.equal(JSON.stringify({codes:r.diagnostics.authorityFailureCodes,snapshot:r.diagnostics.finalBuilderAuthoritySnapshot}).includes(question),false);
 } finally {finalizer.createMarionFinalEnvelope=previous;}
});

test('validator refuses altered aliases and denied emission',async()=>{
 const r=await finalizer.createMarionFinalEnvelope({reply,turnId:'finance-test-turn-2',currentTurnBound:true,semanticAuthority:'marion',routing:{intent:'business_strategy',domain:'finance'},meta:{turnId:'finance-test-turn-2'}});
 assert.equal(finalizer.validateReplyContract({...r.finalEnvelope,displayReply:'Changed text'}).ok,false);
 assert.equal(finalizer.validateReplyContract({...r.finalEnvelope,canEmit:false}).ok,false);
});
