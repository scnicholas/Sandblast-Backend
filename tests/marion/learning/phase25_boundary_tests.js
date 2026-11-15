'use strict';
const assert = require('node:assert/strict');
const { createMarionLearningAdminHandlers } = require('./MarionLearningAdminHandlers');
const { createMarionLearningRuntime } = require('./MarionLearningRuntime');
const owner = Object.freeze({ authenticated:true, role:'owner', verifiedBy:'server_middleware', actorId:'test_owner' });
const manifest = { datasetId:'marion.response-style.synthetic.v2', version:'2.1.0', scope:'response_style' };
const candidate = { proposalId:'test_proposal', scope:'response_style' };
const request = { body:{manifest,candidate} };
let next = null, invoked=0;
const api = createMarionLearningAdminHandlers({
 getVerifiedOwnerContext:async req => req.denied ? null : owner,
 runtime: {
  listAvailableManifests:async()=>({ok:true,manifests:[]}),
  issueFixtureReview:async()=>({ok:false,reason:'not_ready'}),
  approveManifest:async()=>({ok:false,reason:'not_ready'}),
  revokeManifest:async()=>({ok:false,reason:'not_ready'}),
  listApprovedManifests:async()=>({ok:true,manifests:[]}),
  evaluateCandidate:async()=>{invoked++; return next;},
  getPrivateHealth:async()=>({ok:true,ready:true,status:200,liveActivationEnabled:false})
 }
});
const RUNNER_CODE = 'offline_composer_execution_failed';
const validFailure = {ok:false,reason:'offline_runner_failed',diagnosticStage:'baseline_offline_runner',diagnosticCode:RUNNER_CODE,diagnosticVersion:'marion.offlineRunnerFailureDiagnostic/1.0',secret:'DO_NOT_EXPOSE',stack:'DO_NOT_EXPOSE'};
async function main(){
 process.env.SB_MARION_LEARNING_EVAL_DIAGNOSTICS='true';
 next=validFailure;
 let r=await api.evaluate(request);
 assert.equal(r.status,503); assert.deepEqual(r.body,{ok:false,reason:'offline_runner_failed',diagnosticStage:'baseline_offline_runner',diagnosticCode:RUNNER_CODE,diagnosticVersion:'marion.offlineRunnerFailureDiagnostic/1.0'});
 next={...validFailure, diagnosticCode:'ARBITRARY_STACK_TRACE'};
 r=await api.evaluate(request); assert.deepEqual(r.body,{ok:false,reason:'offline_runner_failed'});
 next={...validFailure, diagnosticStage:'unsafe_stage'};
 r=await api.evaluate(request); assert.deepEqual(r.body,{ok:false,reason:'offline_runner_failed'});
 next={...validFailure,diagnosticVersion:'bad_version'};
 r=await api.evaluate(request); assert.equal(r.body.diagnosticVersion,undefined);
 process.env.SB_MARION_LEARNING_EVAL_DIAGNOSTICS='false';
 next=validFailure;
 r=await api.evaluate(request); assert.deepEqual(r.body,{ok:false,reason:'offline_runner_failed'});
 process.env.SB_MARION_LEARNING_EVAL_DIAGNOSTICS='true';
 const candidateTypes={proposalId:'string',scope:'string',baselineVersion:'string',candidateVersion:'string',datasetId:'string',datasetVersion:'string',artifactRef:'string',sampleCount:'number'};
 next={ok:false,reason:'candidate_validation_failed',diagnosticStage:'candidate_validation',diagnosticCode:'invalid_candidate',candidateValidatorVersion:'candidate_validation_contract_v1',candidateFieldTypes:candidateTypes};
 r=await api.evaluate(request); assert.equal(r.status,503); assert.equal(r.body.diagnosticStage,'candidate_validation'); assert.deepEqual({...r.body.candidateFieldTypes},candidateTypes);
 const prev=invoked; r=await api.evaluate({denied:true,body:request.body}); assert.equal(r.status,403);assert.equal(invoked,prev);assert.deepEqual(r.body,{ok:false,reason:'owner_authentication_required'});
 next={ok:false,reason:'offline_runner_failed',diagnosticStage:'baseline_offline_runner',diagnosticCode:RUNNER_CODE,toJSON(){throw Error('unsafe')}};
 r=await api.evaluate(request); assert.equal(r.status,503); assert.deepEqual(r.body,{ok:false,reason:'learning_response_invalid'});
 const h=await api.health({body:{}});assert.equal(h.status,200);
 console.log('PASS admin handler: allowlisted metadata, redaction, flag-off, auth gate, invalid response, health');

 const runtime = createMarionLearningRuntime({
  signalAdapter:{record:async()=>({ok:true,accepted:true})},
  evaluator:{evaluate:async()=>next},
  approvalGate:{submitEvaluation:async()=>({ok:true}),decide:async()=>({ok:false})},
  manifestRegistry:{listAvailable:async()=>({ok:true}),issueFixtureReview:async()=>({ok:false}),approveManifest:async()=>({ok:false}),revokeManifest:async()=>({ok:false}),listApproved:async()=>({ok:true}),selectApprovedManifest:async()=>({ok:true,manifest:{},registration:{status:'approved',...manifest}})},
  healthProbe:async()=>({ready:true}),offlineEvaluationReady:async()=>true,captureEnabled:false
 });
 next={...validFailure};
 r=await runtime.evaluateCandidate(candidate, manifest, owner); assert.equal(r.reason,'offline_runner_failed');assert.equal(r.diagnosticCode,RUNNER_CODE);assert.equal(r.secret,undefined);
 process.env.SB_MARION_LEARNING_EVAL_DIAGNOSTICS='false';
 r=await runtime.evaluateCandidate(candidate, manifest, owner);assert.deepEqual(r,{ok:false,reason:'offline_runner_failed'});
 process.env.SB_MARION_LEARNING_EVAL_DIAGNOSTICS='true';
 next={...validFailure, diagnosticStage:'injected_stage'};
 r=await runtime.evaluateCandidate(candidate, manifest, owner);assert.deepEqual(r,{ok:false,reason:'offline_runner_failed'});
 console.log('PASS runtime: bounded runner projection, flag-off, injected stage');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
