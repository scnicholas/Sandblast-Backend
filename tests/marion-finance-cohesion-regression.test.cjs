'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const bridge = require('../Data/marion/runtime/marionBridge.js');
const finalizer = require('../Data/marion/runtime/marionFinalEnvelope.js');
const composer = require('../Data/marion/runtime/composeMarionResponse.js');
const question = 'How can a small business improve cash flow? Give me three concise steps.';
const verified = () => ({
  text:question,turnId:'server-finance-001',sessionId:'operator-session-7',
  privateAdminConversation:true,marionAdminConversation:true,adminVerified:true,
  sessionVerified:true,serverSideAdminAuth:true,authenticatedOperator:true,
  partitionKey:'private:admin:operator-session-7'
});
function withGuard(guard, fn) {
  const prev = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === './marionCurrentTurnAuthority.js' &&
       parent?.filename.endsWith('/marionBridge.js')) return guard;
    return prev.apply(this,arguments);
  };
  return Promise.resolve().then(fn).finally(()=>{ Module._load=prev; });
}
const genuine = r => r && r.ok===true && r.final===true && r.marionFinal===true && r.canEmit===true &&
  r.finalEnvelope?.final===true && r.finalEnvelope?.currentTurnBound===true &&
  r.finalEnvelope?.completionStatus?.complete===true &&
  r.finalEnvelope?.adaptiveTrustVerification?.allowEmit===true &&
  finalizer.validateReplyContract(r.finalEnvelope).ok===true;

test('four uploaded files load through the canonical Bridge dependency graph',()=>{
  assert.equal(typeof bridge.handleMarionAdminConversation,'function');
  assert.equal(typeof finalizer.createMarionFinalEnvelope,'function');
  assert.equal(typeof composer.composeMarionResponse,'function');
  assert.ok(bridge.resolveRuntimeDependencies(true));
});
test('verified private finance response passes the real Bridge and finalizer', async()=>{
  const result=await bridge.handleMarionAdminConversation(verified(),verified());
  assert.equal(genuine(result),true,'the canonical final must be validated, not constructed as a fixture');
  assert.equal(result.finalEnvelope?.meta?.turnId,'server-finance-001');
  assert.match(result.reply,/invoice|cash|forecast/i);
});
test('missing verified session fails closed',async()=>{
  const payload={...verified(),sessionVerified:false};
  const r=await bridge.handleMarionAdminConversation(payload,payload);
  assert.notEqual(genuine(r),true);
  assert.equal(r.canEmit,false);
});
test('installed current-turn guard rejection cannot be re-signed',async()=>withGuard({
  isPrivateMarionContext(){return true;},
  enforceResult(old){return {...old,ok:false,blocked:true,requiresRetry:true};}
},async()=>{
  const r=await bridge.handleMarionAdminConversation(verified(),verified());
  assert.equal(r.ok,false); assert.equal(r.final,false); assert.equal(r.canEmit,false);
  assert.equal(r.diagnostics?.authorityFailureStage,'post_guard_candidate_rejected');
  assert.ok(r.diagnostics?.authorityFailureCodes?.includes("compose_not_ok") || r.diagnostics?.authorityFailureCodes?.includes("compose_not_complete"));
}));
test('installed current-turn guard exception fails closed without leaking text',async()=>withGuard({
  isPrivateMarionContext(){return true;},
  enforceResult(){throw new Error('private-user-token-DO-NOT-LOG');}
},async()=>{
  const r=await bridge.handleMarionAdminConversation(verified(),verified());
  assert.equal(r.ok,false); assert.equal(r.canEmit,false);
  assert.equal(r.diagnostics?.authorityFailureStage,'post_guard_candidate_rejected');
  assert.ok(!JSON.stringify(r).includes('private-user-token-DO-NOT-LOG'));
}));
test('guard returning an invalid type does not bypass current-turn denial',async()=>withGuard({
  isPrivateMarionContext(){return true;},enforceResult(){return null;}
},async()=>{
  const r=await bridge.handleMarionAdminConversation(verified(),verified());
  assert.equal(r.ok,false);assert.equal(r.canEmit,false);
}));
