'use strict';
const assert=require('node:assert/strict');
const {createMarionLearningRuntime,isVerifiedOwner}=require('../MarionLearningRuntime');
const owner={authenticated:true, role:'owner',verifiedBy:'server_middleware',actorId:'owner-1'};
const sel={datasetId:'marion.response-style.synthetic.v2',version:'2.1.0',scope:'response_style'};
let calls={select:0,eval:0,approve:0,decision:0,signal:0,submit:0};
let storage=true, offline=true, revoked=false, throwEval=false, wrong=false;
const deps={
 signalAdapter:{record:async()=>{calls.signal++;return {ok:true,accepted:true};}},
 evaluator:{evaluate:async(c,m,r)=>{calls.eval++;if(throwEval)throw Error('secret');return {ok:true,score:0.9,candidate:c};}},
 approvalGate:{submitEvaluation:async()=>{calls.submit++;return {ok:true};},decide:async(v)=>{calls.decision++;assert.equal(v.authContext,owner);return {ok:true};}},
 manifestRegistry:{listAvailable:async()=>({ok:true}),issueFixtureReview:async()=>({ok:true}),approveManifest:async()=>{calls.approve++;return {ok:true}},revokeManifest:async()=>({ok:true}),listApproved:async()=>({ok:true}),selectApprovedManifest:async()=>{calls.select++;if(revoked)return {ok:false,reason:'manifest_registration_revoked'};return {ok:true,manifest:{},registration:{status:'approved',...sel,...(wrong?{version:'0.0.0'}:{})}};}},
 healthProbe:async()=>({ready:storage}),offlineEvaluationReady:async()=>offline
};
let count=0;async function test(name,fn){await fn();count++;console.log('PASS',name)}
(async()=>{
const r=createMarionLearningRuntime(deps);
await test('owner accepts server middleware',()=>assert.equal(isVerifiedOwner(owner),true));
await test('no owner denial',async()=>assert.equal((await r.evaluateCandidate({},sel,{})).reason,'owner_authentication_required'));
await test('health denial',async()=>assert.equal((await r.getPrivateHealth({})).status,403));
await test('health top-level ready',async()=>{const h=await r.getPrivateHealth(owner);assert.deepEqual([h.ready,h.storageReady,h.offlineReady,h.liveActivationEnabled],[true,true,true,false]);});
await test('storage outage failclosed',async()=>{storage=false;assert.equal((await r.getPrivateHealth(owner)).reason,'durable_storage_not_ready');assert.equal((await r.evaluateCandidate({},sel,owner)).reason,'durable_storage_not_ready');storage=true});
await test('offline outage failclosed',async()=>{offline=false;assert.equal((await r.evaluateCandidate({},sel,owner)).reason,'offline_evaluation_handlers_not_registered');offline=true});
await test('valid candidate evaluation',async()=>{const x=await r.evaluateCandidate({weight:1},sel,owner);assert.equal(x.ok,true);assert.equal(x.candidate.weight,1)});
await test('invalid manifest blocked',async()=>assert.equal((await r.evaluateCandidate({}, {...sel,scope:'garbage'},owner)).reason,'invalid_manifest_selection'));
await test('revoked manifest blocked',async()=>{revoked=true;assert.equal((await r.evaluateCandidate({},sel,owner)).reason,'manifest_registration_revoked');revoked=false});
await test('mismatched registration blocked',async()=>{wrong=true;assert.equal((await r.evaluateCandidate({},sel,owner)).reason,'approved_manifest_contract_invalid');wrong=false});
await test('cyclic candidate blocked',async()=>{let a={};a.loop=a;assert.equal((await r.evaluateCandidate(a,sel,owner)).reason,'invalid_learning_candidate')});
await test('candidate getter blocked',async()=>{const a={};Object.defineProperty(a,'danger',{enumerable:true,get(){throw Error('executed')}});assert.equal((await r.evaluateCandidate(a,sel,owner)).reason,'invalid_learning_candidate')});
await test('oversized candidate blocked',async()=>assert.equal((await r.evaluateCandidate({blob:'a'.repeat(66000)},sel,owner)).reason,'invalid_learning_candidate'));
await test('prototype pollution blocked',async()=>{const a=JSON.parse('{"__proto__":{"polluted":true}}');assert.equal((await r.evaluateCandidate(a,sel,owner)).reason,'invalid_learning_candidate')});
await test('evaluation exception redacted',async()=>{throwEval=true;assert.equal((await r.evaluateCandidate({},sel,owner)).reason,'offline_evaluation_unavailable');throwEval=false});
await test('submit evaluation authorized',async()=>assert.equal((await r.submitEvaluation({pass:true},owner)).ok,true));
await test('submit evaluation invalid',async()=>assert.equal((await r.submitEvaluation({value:Infinity},owner)).reason,'invalid_evaluation_report'));
await test('decision server auth overrides spoofed',async()=>assert.equal((await r.decideProposal({authContext:{role:'intruder'}},owner)).ok,true));
await test('capture off by default',async()=>assert.equal((await r.captureFinalOutcome({})).reason,'learning_disabled'));
await test('invalid owner accessor never executed',()=>{const o={...owner};Object.defineProperty(o,'role',{get(){throw Error('bad')}});assert.equal(isVerifiedOwner(o),false)});
await test('manifest approve validates reviewref',async()=>assert.equal((await r.approveManifest(sel,owner)).reason,'invalid_manifest_approval_request'));
await test('manifest approve succeeds',async()=>assert.equal((await r.approveManifest({...sel,reviewRef:'review_123'},owner)).ok,true));
await test('review consent required',async()=>assert.equal((await r.issueFixtureReview(sel,owner)).reason,'explicit_owner_review_consent_required'));
await test('scope invalid rejected',async()=>assert.equal((await r.listApprovedManifests('invalid',owner)).reason,'invalid_manifest_scope'));
await test('constructor missing dependency rejected',()=>assert.throws(()=>createMarionLearningRuntime({}),TypeError));
assert.equal(calls.signal,0);console.log('TOTAL',count,'checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
