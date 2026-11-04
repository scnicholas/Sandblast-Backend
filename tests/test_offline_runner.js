'use strict';
const assert = require('node:assert/strict');
const {createMarionLearningOfflineRunner, VERSION} = require('../MarionLearningOfflineRunner');
const ids = Array.from({length:20},(_,i)=>`case.${i+1}`);
const opts = {mode:'offline',scope:'response_style',datasetId:'marion.response-style.synthetic.v2',datasetVersion:'2.1.0',fixtureStore:'synthetic.v2',manifestHash:'a'.repeat(64),fixtureSetHash:'b'.repeat(64)};
function fixture(id){return {caseId:id,synthetic:true,datasetId:opts.datasetId,datasetVersion:opts.datasetVersion,fixtureStore:opts.fixtureStore,scope:opts.scope,fixtureSetHash:opts.fixtureSetHash,input:{text:'Synthetic example',nested:{flag:true}}};}
function make({authorizeEvaluation=async()=>true,resolveVersion=async(v)=>({version:v,mode:'offline',bindings:[{datasetId:opts.datasetId,datasetVersion:opts.datasetVersion,scope:opts.scope}],runOffline:async()=>({text:'ok'})}),loadFixture=async id=>fixture(id),scoreFixture=async()=>({score:0.9,criticalFailure:false,failedChecks:[]}),maxCases=500}={}) { return createMarionLearningOfflineRunner({authorizeEvaluation,resolveVersion,loadFixture,scoreFixture,maxCases}); }
let n=0; async function test(name,fn){try{await fn();console.log('PASS',name);n++;}catch(e){console.error('FAIL',name,e);process.exitCode=1;}}
async function rejects(r,version='v1',cases=ids,context=opts,reason){await assert.rejects(()=>r.runVersion(version,cases,context),e=>!reason||e.message===reason);}
(async()=>{
await test('version contract preserved',()=>assert.match(VERSION,/learningOfflineRunner/));
await test('20-case normal report matches evaluator contract',async()=>{const x=await make().runVersion('v1',ids,opts);assert.equal(x.score,0.9);assert.equal(x.caseCount,20);assert.equal(x.diagnostics.failedCaseCount,0);assert.equal(x.diagnostics.complete,true);});
await test('owner registry denial fail closed',()=>rejects(make({authorizeEvaluation:async()=>false}),'v1',ids,opts,'manifest_not_registered_or_fixture_binding_invalid'));
await test('registry error fail closed',()=>rejects(make({authorizeEvaluation:async()=>{throw Error('secret')}}),'v1',ids,opts,'manifest_not_registered_or_fixture_binding_invalid'));
await test('wrong mode',()=>rejects(make(),'v1',ids,{...opts,mode:'live'},'offline_mode_required'));
await test('version whitespace rejected',()=>rejects(make(),' v1'));
await test('version nonstring rejected',()=>rejects(make(),3));
await test('duplicate ids rejected',()=>rejects(make(),'v1',ids.map((v,i)=>i? v:ids[1])));
await test('sparse case array rejected',()=>rejects(make(),'v1',Array(20)));
await test('case array extra key rejected',()=>{const x=[...ids];x.foo='bar';return rejects(make(),'v1',x);});
await test('maxCases strict',()=>assert.throws(()=>make({maxCases:'500'}),/maxCases/));
await test('version mismatch rejected',()=>rejects(make({resolveVersion:async()=>({version:'v2',mode:'offline',bindings:[{datasetId:opts.datasetId,datasetVersion:opts.datasetVersion,scope:opts.scope}],runOffline:async()=>({})})}),'v1'));
await test('binding fixture hash mismatch rejected',()=>rejects(make({resolveVersion:async v=>({version:v,mode:'offline',bindings:[{datasetId:opts.datasetId,datasetVersion:opts.datasetVersion,scope:opts.scope,fixtureSetHash:'c'.repeat(64)}],runOffline:async()=>({})})}),'v1'));
await test('fixture metadata mismatch rejected',()=>rejects(make({loadFixture:async id=>({...fixture(id),synthetic:false})}),'v1',ids,opts,'fixture_not_approved_synthetic_data'));
await test('fixture accessor rejected without execution',async()=>{let calls=0;const f=fixture(ids[0]);Object.defineProperty(f.input,'stealth',{enumerable:true,get(){calls++;return 'x'}});await rejects(make({loadFixture:async id=>id===ids[0]?f:fixture(id)}));assert.equal(calls,0);});
await test('fixture array hole rejected',()=>rejects(make({loadFixture:async id=>({...fixture(id),input:{items:new Array(3)}})})));
await test('fixture array accessory rejected without execution',async()=>{let calls=0;const a=['x'];Object.defineProperty(a,'bad',{enumerable:true,get(){calls++;return 'x'}});await rejects(make({loadFixture:async id=>({...fixture(id),input:{a}})}));assert.equal(calls,0);});
await test('fixture secret field rejected',()=>rejects(make({loadFixture:async id=>({...fixture(id),input:{api_token:'hidden'}})})));
await test('fixture cyclic graph rejected',()=>{const obj={};obj.self=obj;return rejects(make({loadFixture:async id=>({...fixture(id),input:obj})}));});
await test('fixture oversized string rejected',()=>rejects(make({loadFixture:async id=>({...fixture(id),input:{payload:'x'.repeat(32769)}})})));
await test('score numeric string rejected',()=>rejects(make({scoreFixture:async()=>({score:'0.9',criticalFailure:false,failedChecks:[]})}),'v1',ids,opts,'fixture_score_invalid'));
await test('score NaN rejected',()=>rejects(make({scoreFixture:async()=>({score:NaN,criticalFailure:false,failedChecks:[]})})));
await test('score accessor rejected without execution',async()=>{let calls=0;const scored={criticalFailure:false,failedChecks:[]};Object.defineProperty(scored,'score',{enumerable:true,get(){calls++;return .9}});await rejects(make({scoreFixture:async()=>scored}));assert.equal(calls,0);});
await test('delta numeric string rejected',()=>rejects(make({scoreFixture:async()=>({score:.9,criticalFailure:false,failedChecks:[],delta:'-.02'})}),'v1',ids,opts,'fixture_regression_delta_invalid'));
await test('delta out of bounds rejected',()=>rejects(make({scoreFixture:async()=>({score:.9,criticalFailure:false,failedChecks:[],delta:-2})})));
await test('critical diagnostic mismatch rejected',()=>rejects(make({scoreFixture:async()=>({score:.9,criticalFailure:true,failedChecks:[]})}),'v1',ids,opts,'fixture_diagnostics_inconsistent'));
await test('diagnostic unknown check rejected',()=>rejects(make({scoreFixture:async()=>({score:.9,criticalFailure:false,failedChecks:[{index:0,type:'bad',critical:false}]})}),'v1',ids,opts,'fixture_diagnostics_invalid'));
await test('negative delta included',async()=>{const x=await make({scoreFixture:async()=>({score:.9,criticalFailure:false,failedChecks:[],delta:-.005})}).runVersion('v1',ids,opts);assert.equal(x.regressions.length,20);});
await test('critical counts calculated',async()=>{const x=await make({scoreFixture:async()=>({score:.7,criticalFailure:true,failedChecks:[{index:0,type:'exact_match',critical:true}]})}).runVersion('v1',ids,opts);assert.equal(x.diagnostics.criticalCheckCount,20);assert.equal(x.diagnostics.criticalFailureCaseCount,20);assert.equal(x.criticalFailures.length,20);});
await test('handler mutation does not affect scoring fixture',async()=>{const x=await make({resolveVersion:async v=>({version:v,mode:'offline',bindings:[{datasetId:opts.datasetId,datasetVersion:opts.datasetVersion,scope:opts.scope}],runOffline:async input=>{input.nested.flag=false;return {}}}),scoreFixture:async (f)=>({score:f.input.nested.flag===true?.9:0,criticalFailure:false,failedChecks:[]})}).runVersion('v1',ids,opts);assert.equal(x.score,.9);});
await test('revocation during evaluation rejected',()=>{let i=0;return rejects(make({authorizeEvaluation:async()=>++i===1}),'v1',ids,opts,'manifest_revoked_during_offline_evaluation');});
await test('runner error does not return success report',()=>rejects(make({resolveVersion:async()=>{throw Error('fail')}})));
console.log(`RESULT ${n} passed`);
if(process.exitCode)process.exit(process.exitCode);
})();
