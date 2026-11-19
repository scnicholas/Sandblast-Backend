"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const base=path.resolve(__dirname,'../deploy');
let passed=0;
async function test(name, fn) { await fn(); passed++; process.stdout.write(`PASS ${name}\n`); }
function loadLocal(filename, mocks={}) {
 const Module=require('node:module');
 const filenameAbs=path.join(base,filename);
 const mod=new Module(filenameAbs,module);mod.filename=filenameAbs;mod.paths=Module._nodeModulePaths(base);
 const original=mod.require.bind(mod);
 mod.require=(id)=>Object.hasOwn(mocks,id)?mocks[id]:original(id);
 mod._compile(fs.readFileSync(filenameAbs,'utf8'),filenameAbs);
 return mod.exports;
}
function evidenceFixtures(n=20){
 return Array.from({length:n},(_,i)=>({caseId:`style.concise.${String(i+1).padStart(3,'0')}`,synthetic:true,datasetId:'marion.response-style.synthetic.v2',datasetVersion:'2.1.0',fixtureStore:'style-store',scope:'response_style',input:{request:'Write one concise sentence.'},reference:{},fixtureSetHash:'0'.repeat(64)}));
}
(async()=>{
 const FixtureStore=loadLocal('MarionLearningFixtureStore.js',{
  './MarionLearningDataset':{MINIMUM_CASES:20,MAXIMUM_CASES:500},
  './MarionLearningFixtureContract':{validateFixture:()=>({ok:true})}
 });
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'marion-phase25-'));
 try {
  fs.mkdirSync(path.join(folder,'style-store'));
  const fixtures=evidenceFixtures();
  const hash=FixtureStore.hashFixtureSet('marion.response-style.synthetic.v2','2.1.0','style-store',fixtures);
  fixtures.forEach(f=>{f.fixtureSetHash=hash;fs.writeFileSync(path.join(folder,'style-store',f.caseId+'.json'),JSON.stringify(f));});
  const store=FixtureStore.createMarionLearningFixtureStore({directory:folder});
  const req={datasetId:'marion.response-style.synthetic.v2',version:'2.1.0',fixtureStore:'style-store',caseIds:fixtures.map(f=>f.caseId)};
  await test('approved full-set verification async/sync', async()=>{
   assert.equal((await store.verifyFixtureSet(req)).ok,true);
   assert.equal(store.verifyFixtureSetSync(req).ok,true);
  });
  await test('exact hash unchanged from legacy format',async()=>{
   assert.equal(FixtureStore.hashFixtureSet(req.datasetId,req.version,req.fixtureStore,fixtures),hash);
  });
  await test('approved single-case load retains full-set verification',async()=>{
   const f=await store.loadFixture(fixtures[0].caseId,{mode:'offline',scope:'response_style',datasetId:req.datasetId,datasetVersion:req.version,fixtureStore:req.fixtureStore,caseIds:req.caseIds,fixtureSetHash:hash});
   assert.equal(f.caseId,fixtures[0].caseId);
  });
  await test('tampered fixture denied under unchanged approved hash',async()=>{
   const f=fixtures[0];const file=path.join(folder,'style-store',f.caseId+'.json');
   fs.writeFileSync(file,JSON.stringify({...f,input:{request:'TAMPERED'}}));
   assert.equal((await store.verifyFixtureSet(req)).ok,false);
   await assert.rejects(store.loadFixture(f.caseId,{mode:'offline',scope:'response_style',datasetId:req.datasetId,datasetVersion:req.version,fixtureStore:req.fixtureStore,caseIds:req.caseIds,fixtureSetHash:hash}),/fixture_binding_mismatch/);
   fs.writeFileSync(file,JSON.stringify(f));
  });
  await test('symlink substitution rejected where supported',async()=>{
   const file=path.join(folder,'style-store',fixtures[0].caseId+'.json');
   const target=path.join(folder,'outside.json');
   fs.writeFileSync(target,JSON.stringify(fixtures[0]));
   fs.unlinkSync(file);
   try {fs.symlinkSync(target,file);} catch(err){ if(err.code==='EPERM') {fs.writeFileSync(file,JSON.stringify(fixtures[0]));return;} throw err; }
   assert.equal((await store.verifyFixtureSet(req)).ok,false);
   fs.unlinkSync(file);fs.writeFileSync(file,JSON.stringify(fixtures[0]));
  });
 } finally {fs.rmSync(folder,{recursive:true,force:true});}
 const Composer=loadLocal('MarionLearningOfflineComposerVersions.js',{'./MarionLearningDataset':{validateEvaluationSet:x=>({ok:true,dataset:x})}});
 const fixtureHash='a'.repeat(64), manifestHash='b'.repeat(64);
 const dataset={datasetId:'marion.response-style.synthetic.v2',version:'2.1.0',scope:'response_style',fixtureStore:'style-store',caseIds:evidenceFixtures().map(f=>f.caseId)};
 const ctx={mode:'offline',scope:'response_style',datasetId:dataset.datasetId,datasetVersion:dataset.version,fixtureStore:dataset.fixtureStore,fixtureSetHash:fixtureHash,manifestHash,caseId:dataset.caseIds[0],sideEffectsAllowed:false,activationAllowed:false};
 function regWith(fn){
  const versions=new Map();
  const composer={composeMarionResponseBeforeR24:fn,composeMarionResponseR24OfflineCandidate:async()=>({}),MARION_COMPOSE_BASELINE_VERSION:'composeMarionResponse.v9.5.r23',MARION_COMPOSE_CURRENT_VERSION:'composeMarionResponse.v9.6.r24'};
  const outcome=Composer.registerMarionLearningOfflineComposerVersions({versionRegistry:versions,manifestSource:{listSync:()=>[dataset]},fixtureStore:{verifyFixtureSetSync:()=>({ok:true,syntheticOnly:true,scope:'response_style',datasetId:dataset.datasetId,version:dataset.version,fixtureStore:dataset.fixtureStore,caseCount:20,fixtureSetHash:fixtureHash,caseIds:dataset.caseIds})},composer});
  assert.equal(outcome.ok,true,JSON.stringify(outcome));
  return versions.get('composeMarionResponse.v9.5.r23');
 }
 async function failureCategory(result, expected){
  const entry=regWith(async()=>result);
  let err;try {await entry.runOffline({request:'test'}, {...ctx, version:entry.version});}catch(e){err=e;}
  assert.equal(err?.message,'offline_composer_did_not_return_accepted_final');
  assert.equal(Object.getOwnPropertyDescriptor(err,'offlineDiagnosticCategory')?.value,expected);
  assert.equal(Object.keys(err).includes('offlineDiagnosticCategory'),false);
 }
 await test('non-final top-level returns fixed category, not text',()=>failureCategory({ok:false,final:false,marionFinal:false,awaitingMarion:true},'top_level_not_final'));
 await test('non-final envelope returns fixed category',()=>failureCategory({ok:true,final:true,marionFinal:true,finalEnvelope:{final:false,marionFinal:false}},'envelope_not_final'));
 await test('missing reply returns fixed category',()=>failureCategory({ok:true,final:true,marionFinal:true,finalEnvelope:{final:true,marionFinal:true}},'reply_missing'));
 await test('malformed result returns fixed category',()=>failureCategory(null,'result_not_plain_object'));
 await test('valid final preserves reply structure and text',async()=>{
  const entry=regWith(async()=>({ok:true,final:true,marionFinal:true,reply:'Hello\nWorld',finalEnvelope:{final:true,marionFinal:true,reply:'Hello\nWorld'}}));
  const res=await entry.runOffline({request:'test'}, {...ctx,version:entry.version});
  assert.equal(res.reply,'Hello\nWorld');assert.equal(res.visibleReply,res.reply);
 });
 await test('disagreeing reply surfaces still fail closed',async()=>{
  const entry=regWith(async()=>({ok:true,final:true,marionFinal:true,reply:'One',finalEnvelope:{final:true,marionFinal:true,reply:'Two'}}));
  await assert.rejects(entry.runOffline({request:'test'},{...ctx,version:entry.version}),/offline_composer_reply_surfaces_disagree/);
 });
 const Runner=loadLocal('MarionLearningOfflineRunner.js');
 await test('runner observer sees approved category and original stage error',async()=>{
  const events=[];let called=0;
  const runner=Runner.createMarionLearningOfflineRunner({
   resolveVersion:async()=>({version:'composeMarionResponse.v9.5.r23',mode:'offline',bindings:[{datasetId:dataset.datasetId,datasetVersion:dataset.version,scope:'response_style',fixtureStore:dataset.fixtureStore,fixtureSetHash:fixtureHash}],runOffline:async()=>{const err=new Error('offline_composer_did_not_return_accepted_final');Object.defineProperty(err,'offlineDiagnosticCategory',{value:'top_level_not_final'});throw err;}}),
   loadFixture:async()=>{called++;throw Error('should not reach fixture source in this test');},
   scoreFixture:async()=>({score:1,criticalFailure:false,failedChecks:[]}),authorizeEvaluation:async()=>true,onCaseFailure:e=>events.push(e)
  });
  // Fixture-load stage is isolated independently; test composition using approved data in a second runner.
  await assert.rejects(runner.runVersion('composeMarionResponse.v9.5.r23',dataset.caseIds,{...ctx,mode:'offline'}),/fixture_not_approved_synthetic_data/);
  assert.equal(events.length,0);
  const runner2=Runner.createMarionLearningOfflineRunner({
   resolveVersion:async()=>({version:'composeMarionResponse.v9.5.r23',mode:'offline',bindings:[{datasetId:dataset.datasetId,datasetVersion:dataset.version,scope:'response_style',fixtureStore:dataset.fixtureStore,fixtureSetHash:fixtureHash}],runOffline:async()=>{const err=new Error('offline_composer_did_not_return_accepted_final');Object.defineProperty(err,'offlineDiagnosticCategory',{value:'top_level_not_final'});throw err;}}),
   loadFixture:async id=>({...evidenceFixtures()[0],caseId:id,fixtureSetHash:fixtureHash}),
   scoreFixture:async()=>({score:1,criticalFailure:false,failedChecks:[]}),authorizeEvaluation:async()=>true,onCaseFailure:e=>events.push(e)
  });
  await assert.rejects(runner2.runVersion('composeMarionResponse.v9.5.r23',dataset.caseIds,{...ctx,mode:'offline'}),/offline_composer_execution_failed/);
  assert.equal(events.length,1);assert.deepEqual({stage:events[0].stage,caseId:events[0].caseId,code:events[0].code,category:events[0].category},{stage:'compose',caseId:dataset.caseIds[0],code:'offline_composer_did_not_return_accepted_final',category:'top_level_not_final'});
  assert.equal(Object.isFrozen(events[0]),true);
 });
 await test('runner rejects fewer than 20 case IDs',async()=>{
  const runner=Runner.createMarionLearningOfflineRunner({resolveVersion:async()=>{},loadFixture:async()=>{},scoreFixture:async()=>{},authorizeEvaluation:async()=>true});
  await assert.rejects(runner.runVersion('version',['one'],{...ctx,mode:'offline'}),/invalid_offline_fixture_set/);
 });
 console.log(`\n${passed} focused regression checks passed`);
})().catch(err=>{console.error('TEST FAILURE',err);process.exitCode=1;});
