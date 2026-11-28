'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const runtime=path.resolve(__dirname,'../Data/marion/runtime');
const finalizer=require(path.join(runtime,'marionFinalEnvelope.js'));
const bridge=require(path.join(runtime,'marionBridge.js'));
bridge.resolveRuntimeDependencies(true);
const finance='How can a small business improve cash flow? Give me three concise steps.';
const makeInput=()=>({text:finance,rawUserText:finance,userText:finance,privateAdminConversation:true,marionAdminConversation:true,directMarionAdminInterface:true,
  serverSideAdminAuth:true,trustedServerAuth:true,adminVerified:true,sessionVerified:true,authenticatedOperator:true,
  turnId:'synthetic-finance-turn',sessionId:'synthetic-finance-session',partitionKey:'private:admin:synthetic-finance-session'});
test('rejected finalizer remains non-emitting and provides only safe provenance codes',async()=>{
  const old=finalizer.createMarionFinalEnvelope;
  let invoked=0;
  finalizer.createMarionFinalEnvelope=function(){invoked++;return {
    ok:false,final:false,marionFinal:false,canEmit:false,requiresRetry:true,
    diagnostics:{finalAuthorityTerminalReason:'missing_or_rejected_final',financeFinalizerProvenance:{
      terminalReason:'missing_or_rejected_final',candidateReplyPresent:true,currentTurnBound:true,
      semanticAuthorityMarion:true,turnIdPresent:true,sessionIdPresent:true,turnMetaConsistent:true,
      replyValidationReasons:['hard_failure_marker_present','private secret should not leak'],
      envelopeContractReasons:['completion_or_trust_blocked']}}};};
  try {
    const result=await bridge.handleMarionAdminConversation(makeInput());
    assert.ok(invoked>=1,'expected canonical builder to execute');
    assert.equal(result.ok,false);
    assert.notEqual(result.final,true);
    assert.notEqual(result.marionFinal,true);
    assert.notEqual(result.canEmit,true);
    assert.equal(result.diagnostics?.authorityFailureStage,'final_envelope_invalid');
    const provenance=result.diagnostics?.finalBuilderRejectionProvenance;
    assert.equal(provenance?.present,true,'rejection evidence must survive cloning');
    assert.equal(provenance?.terminalReason,'missing_or_rejected_final');
    assert.deepEqual(provenance.replyValidationReasons,['hard_failure_marker_present']);
    assert.deepEqual(provenance.envelopeContractReasons,['completion_or_trust_blocked']);
    assert.equal(typeof provenance,'object');
    assert.equal(JSON.stringify(provenance).includes('private secret should not leak'),false);
    assert.equal(result.diagnostics?.finalBuilderRejectionProvenance?.upstreamFatal,'missing');
  } finally {finalizer.createMarionFinalEnvelope=old;}
});
