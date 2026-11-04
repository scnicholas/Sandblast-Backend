'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
const load = Module._load;
const handlerPath = require.resolve('../MarionLearningAdminHandlers');
Module._load = function(request, parent, isMain) {
  if (request === './MarionLearningRuntime' && parent && parent.filename === handlerPath) {
    return require('./fixtures/MarionLearningRuntime');
  }
  return load.apply(this, arguments);
};
const {createMarionLearningAdminHandlers} = require('../MarionLearningAdminHandlers');
Module._load = load;
const owner = {authenticated:true,role:'owner',verifiedBy:'server_middleware',actorId:'owner:test'};
const calls=[];
const runtime={
  listAvailableManifests:async a=>({ok:true,items:[],role:a.role}),
  issueFixtureReview:async (s,a)=>{calls.push(['review',s,a]);return {ok:true,ref:s.reviewRef}},
  approveManifest:async(s,a)=>{calls.push(['approve',s,a]);return {ok:true}},
  revokeManifest:async(s,a)=>{calls.push(['revoke',s,a]);return {ok:true}},
  listApprovedManifests:async(s,a)=>({ok:true,scope:s,items:[]}),
  evaluateCandidate:async(c,s,a)=>{calls.push(['evaluate',c,s,a]);return {ok:true,score:0.9,secret:'hidden'}},
  getPrivateHealth:async a=>({ok:true,status:503,ready:false,reason:'offline_evaluation_handlers_not_registered',dependencies:{privateDurableStores:true,offlineEvaluation:false},credential:'not-for-client'})
};
const h=createMarionLearningAdminHandlers({runtime,getVerifiedOwnerContext:async req=>req.auth});
async function check(){
  const valid={auth:owner,body:{datasetId:'set1',version:'v1',scope:'routing'}};
  assert.deepEqual((await h.health({auth:{}})),{status:403,body:{ok:false,reason:'owner_authentication_required'}});
  assert.equal((await h.health({auth:owner})).status,503);
  assert.equal((await h.health({auth:owner})).body.dependencies.privateDurableStores,true);
  assert.equal('credential' in (await h.health({auth:owner})).body,false);
  const noHealth={...runtime};delete noHealth.getPrivateHealth;
  const noH=createMarionLearningAdminHandlers({runtime:noHealth,getVerifiedOwnerContext:async req=>req.auth});
  assert.equal((await noH.health({auth:owner})).status,503);
  assert.equal((await h.listAvailable({auth:owner})).status,200);
  assert.equal((await h.issueReview({...valid,body:{...valid.body,ownerConsent:true}})).status,200);
  assert.equal(calls[0][1].ownerConsent,true);
  assert.equal((await h.issueReview({...valid,body:{...valid.body,ownerConsent:false}})).status,422);
  assert.equal((await h.issueReview({...valid,body:{...valid.body,ownerConsent:true,reviewRef:'fake'}})).status,422);
  assert.equal((await h.approve({...valid,body:{...valid.body,reviewRef:'review_ok'}})).status,200);
  assert.equal((await h.approve({...valid,body:{...valid.body,reviewRef:'review_ok',unknown:true}})).status,422);
  assert.equal((await h.revoke({...valid,body:{datasetId:'set1',version:'v1',reasonCode:'owner_requested'}})).status,200);
  assert.equal((await h.listApproved({...valid,body:{scope:'routing'}})).status,200);
  assert.equal((await h.listApproved({...valid,body:{scope:'system_prompt'}})).status,422);
  assert.equal((await h.evaluate({...valid,body:{manifest:valid.body,candidate:{x:[1,2],x2:{flag:true}}}})).status,200);
  assert.equal('secret' in (await h.evaluate({...valid,body:{manifest:valid.body,candidate:{x:1}}})).body,false);
  const candidateWithGetter={};Object.defineProperty(candidateWithGetter,'x',{get(){throw new Error('executed')},enumerable:true});
  assert.equal((await h.evaluate({...valid,body:{manifest:valid.body,candidate:candidateWithGetter}})).status,422);
  const arr=[1];arr.extra='bad';
  assert.equal((await h.evaluate({...valid,body:{manifest:valid.body,candidate:{a:arr}}})).status,422);
  const sparse=[];sparse.length=2;sparse[0]=1;
  assert.equal((await h.evaluate({...valid,body:{manifest:valid.body,candidate:{a:sparse}}})).status,422);
  const proto=JSON.parse('{"__proto__":{"polluted":true}}');
  assert.equal((await h.evaluate({...valid,body:{manifest:valid.body,candidate:proto}})).status,422);
  const cyclic={};cyclic.self=cyclic;
  assert.equal((await h.evaluate({...valid,body:{manifest:valid.body,candidate:cyclic}})).status,422);
  const symbol={a:1};symbol[Symbol('s')]=1;
  assert.equal((await h.evaluate({...valid,body:{manifest:valid.body,candidate:symbol}})).status,422);
  assert.equal((await h.evaluate({...valid,body:{manifest:valid.body,candidate:{x:'a'.repeat(65536)}}})).status,422);
  assert.equal((await h.evaluate({...valid,body:{manifest:valid.body,candidate:{x:NaN}}})).status,422);
  assert.equal((await h.evaluate({...valid,body:{manifest:{datasetId:'x',version:'v1',scope:'authorization'},candidate:{}}})).status,422);
  assert.equal((await h.evaluate({...valid,body:{manifest:valid.body,candidate:{},activationAuthorized:true}})).status,422);
  const getFail=createMarionLearningAdminHandlers({runtime,getVerifiedOwnerContext:async()=>{throw Error('bad')}});
  assert.equal((await getFail.health({})).status,403);
  const handlerFail=createMarionLearningAdminHandlers({runtime:{...runtime,evaluateCandidate:async()=>{throw Error('database credentials')}} ,getVerifiedOwnerContext:async()=>owner});
  assert.equal((await handlerFail.evaluate({body:{manifest:valid.body,candidate:{}}})).body.reason,'learning_registry_unavailable');
  console.log('PASS: 27 owner, readiness, manifest, input, response and failure checks');
}
check().catch(e=>{console.error(e);process.exitCode=1});
