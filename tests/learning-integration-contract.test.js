'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const integration = require('../Data/marion/runtime/learning/MarionLearningIntegration.js');
const good = {ok:true, final:true, marionFinal:true, reply:'Approved', finalEnvelope:{final:true,marionFinal:true}};
const context = {authenticated:true,ownerAuthenticated:true,role:'owner',verifiedBy:'server_middleware',learningConsent:true,actorId:'owner',signal:{signalId:'sig1',signalClass:'task_success',scope:'response_style',sourceSubsystem:'offline',outcomeScore:0.8}};
test('gateway-compatible public registration contract', () => {
  const runtime={captureFinalOutcome:async x=>({ok:true,data:x})};
  const r=integration.registerRuntime(runtime);
  assert.equal(r.ok,true);assert.equal(r.registered,true);assert.equal(integration.getRuntime(),runtime);
  assert.equal(integration.registerRuntime(runtime).registered,true);
  assert.throws(()=>integration.registerRuntime({captureFinalOutcome:()=>{}}),/already_registered/);
});
test('final verification remains fail closed even with permissive custom validator',async()=>{
  assert.equal(integration.isAcceptedMarionFinal({...good,blocked:true}),false);
  assert.equal((await integration.captureAcceptedAdminFinal({result:{...good,blocked:true},options:{marionLearningContext:context},gatewayAdminVerified:true,finalValidator:()=>true})).ok,false);
});
test('owner and consent required and metadata only',async()=>{
  assert.equal((await integration.captureAcceptedAdminFinal({result:good,options:{marionLearningContext:context},gatewayAdminVerified:false})).ok,false);
  const r=await integration.captureAcceptedAdminFinal({result:good,options:{marionLearningContext:context},gatewayAdminVerified:true});
  assert.equal(r.ok,true); assert.deepEqual(Object.keys(r.data).sort(), ['finalAccepted','learningConsent','signalId','signalClass','scope','sourceSubsystem','outcomeScore','occurredAt'].sort());
});
test('capture errors are redacted',async()=>{
  const runtime=integration.getRuntime();
  runtime.captureFinalOutcome=async()=>{throw new Error('database password leaked');};
  const r=await integration.captureAcceptedAdminFinal({result:good,options:{marionLearningContext:context},gatewayAdminVerified:true});
  assert.deepEqual(r,{ok:false,reason:'learning_capture_failed'});
});
test('malformed scores rejected',()=>{
  assert.equal(integration.trustedLearningContext({...context,signal:{...context.signal,outcomeScore:'0.5'}}),false);
});
