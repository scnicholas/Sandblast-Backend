'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'MarionLearningManifestRegistry.js'),'utf8');
const fixtureManifest={datasetId:'marion.response-style.synthetic.v2',version:'2.1.0',scope:'response_style',fixtureStore:'marion.fx.style.v2',caseIds:Array.from({length:66},(_,i)=>`case.${i+1}`)};
const dataset={validateEvaluationSet(raw){return {ok:true,dataset:raw}}};
const mod={exports:{}};
vm.runInThisContext(`(function(require,module,exports){${source}\n})`,{filename:'MarionLearningManifestRegistry.js'})((name)=>name==='./MarionLearningDataset'?dataset:name==='./MarionLearningRuntime'?{isVerifiedOwner:v=>v?.verified===true}:require(name),mod,mod.exports);
const api=mod.exports, hash=api.hashManifest(fixtureManifest), fxHash='b'.repeat(64), owner={verified:true,actorId:'owner:'+'a'.repeat(24)};
const record={status:'approved',datasetId:fixtureManifest.datasetId,version:fixtureManifest.version,scope:'response_style',fixtureStore:fixtureManifest.fixtureStore,caseIds:[...fixtureManifest.caseIds],manifestHash:hash,fixtureSetHash:fxHash,reviewRef:'review.1',reviewId:'review.1',approvedBy:owner.actorId,approvedAt:'2026-10-05T04:00:13.997Z'};
function setup({mismatch=false,revoked=false,goodReview=true}={}){
 const entries=new Map([[api.registrationKey(record.datasetId,record.version),record]]);
 let revokedFlag=revoked;
 const store={get:async key=>mismatch?null:entries.get(key)||null,putIfAbsent:async(k,v)=>{if(entries.has(k))return false;entries.set(k,v);return true},getRevocation:async()=>revokedFlag?{status:'revoked'}:null,putRevocationIfAbsent:async()=>true,listApproved:async()=>[record]};
 const src={load:async()=>fixtureManifest,list:async()=>[fixtureManifest]};
 const fx=async()=>({ok:true,syntheticOnly:true,datasetId:record.datasetId,version:record.version,fixtureStore:record.fixtureStore,scope:record.scope,caseCount:66,fixtureSetHash:fxHash,caseIds:record.caseIds});
 const review={approved:true,ownerConsent:true,reviewRef:'review.1',reviewId:'review.1',datasetId:record.datasetId,version:record.version,scope:record.scope,fixtureStore:record.fixtureStore,manifestHash:hash,fixtureSetHash:fxHash,caseIds:goodReview?record.caseIds:['wrong'],caseCount:66};
 const reg=api.createMarionLearningManifestRegistry({manifestSource:src,registrationStore:store,verifyFixtureSet:fx,verifyFixtureReview:async()=>review,issueFixtureReview:async()=>review,auditStore:{append:async()=>{}}});
 return {reg,entries,revoke:()=>revokedFlag=true};
}
let count=0;
async function check(name,func){try{await func();count++;console.log('PASS',name);}catch(err){console.error('FAIL',name,err);process.exitCode=1}}
(async()=>{
 await check('canonical key',()=>assert.equal(api.registrationKey(record.datasetId,record.version),'marion.response-style.synthetic.v2@2.1.0'));
 await check('approved list passes consistent canonical lookup',async()=>assert.equal((await setup().reg.listApproved(undefined,owner)).registrations.length,1));
 await check('approved list excludes mismatch',async()=>assert.equal((await setup({mismatch:true}).reg.listApproved(undefined,owner)).registrations.length,0));
 await check('selection succeeds on canonical lookup',async()=>assert.equal((await setup().reg.selectApprovedManifest({datasetId:record.datasetId,version:record.version,scope:record.scope},owner)).ok,true));
 await check('selection detects mismatch instead of bypass',async()=>assert.equal((await setup({mismatch:true}).reg.selectApprovedManifest({datasetId:record.datasetId,version:record.version,scope:record.scope},owner)).reason,'manifest_registration_lookup_mismatch'));
 await check('evaluation authorization succeeds for exact context',async()=>assert.equal(await setup().reg.authorizeEvaluation({datasetId:record.datasetId,datasetVersion:record.version,scope:record.scope,fixtureStore:record.fixtureStore,caseIds:record.caseIds,manifestHash:hash,fixtureSetHash:fxHash}),true));
 await check('evaluation authorization rejects missing keyed registration',async()=>assert.equal(await setup({mismatch:true}).reg.authorizeEvaluation({datasetId:record.datasetId,datasetVersion:record.version,scope:record.scope,fixtureStore:record.fixtureStore,caseIds:record.caseIds,manifestHash:hash,fixtureSetHash:fxHash}),false));
 await check('revocation prevents selection',async()=>assert.equal((await setup({revoked:true}).reg.selectApprovedManifest({datasetId:record.datasetId,version:record.version,scope:record.scope},owner)).reason,'manifest_registration_revoked'));
 await check('revocation prevents listing',async()=>assert.equal((await setup({revoked:true}).reg.listApproved(undefined,owner)).registrations.length,0));
 await check('revocation prevents authorization',async()=>assert.equal(await setup({revoked:true}).reg.authorizeEvaluation({datasetId:record.datasetId,datasetVersion:record.version,scope:record.scope,fixtureStore:record.fixtureStore,caseIds:record.caseIds,manifestHash:hash,fixtureSetHash:fxHash}),false));
 await check('unverified owner denied',async()=>assert.equal((await setup().reg.listApproved(undefined,{})).reason,'owner_authentication_required'));
 await check('approval requires exact signed-review cases',async()=>assert.equal((await setup({goodReview:false}).reg.approveManifest({datasetId:record.datasetId,version:record.version,scope:record.scope,reviewRef:'review.1'},owner)).reason,'fixture_review_not_approved'));
 await check('already approved remains idempotent',async()=>assert.equal((await setup().reg.approveManifest({datasetId:record.datasetId,version:record.version,scope:record.scope,reviewRef:'review.1'},owner)).status,'already_approved'));
 console.log(`RESULT ${count} tests ${process.exitCode?'FAILED':'PASSED'}`);
})().catch(e=>{console.error(e);process.exitCode=1});
