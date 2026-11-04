"use strict";
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === './MarionLearningPolicy') return {ALLOWED_SCOPES:['retrieval','routing','response_style'],PROTECTED_SCOPES:['identity','admin'],MINIMUM_EVALUATION_SAMPLES:20};
  return originalLoad.call(this, request, parent, isMain);
};
const base = path.join(__dirname,'..');
const {createCandidate} = require(path.join(base,'MarionLearningCandidate.js'));
const {validateEvaluationSet} = require(path.join(base,'MarionLearningDataset.js'));
Module._load = originalLoad;
const candidate = {proposalId:'proposal.a',scope:'response_style',baselineVersion:'1.0',candidateVersion:'2.0',datasetId:'marion.response-style.synthetic.v2',datasetVersion:'2.1.0',artifactRef:'artifact.alpha',sampleCount:20};
const dataset = {datasetId:candidate.datasetId,version:candidate.datasetVersion,fixtureStore:'fixture_store.alpha',cases:Array.from({length:20},(_,i)=>({caseId:`style.${i+1}`}))};
let tests=0;
function test(name,fn){fn();tests++;console.log('PASS',name);}
function rejectCandidate(input,name,reason){test(name,()=>{const r=createCandidate(input);assert.equal(r.ok,false);if(reason)assert.equal(r.reason,reason);});}
function rejectDataset(input,name,reason){test(name,()=>{const r=validateEvaluationSet(input);assert.equal(r.ok,false);if(reason)assert.equal(r.reason,reason);});}
test('valid candidate',()=>{const r=createCandidate(candidate);assert.equal(r.ok,true);assert.equal(Object.isFrozen(r.candidate),true);assert.equal(r.candidate.liveBehaviorChanged,false);});
test('valid dataset and immutable caseIds',()=>{const r=validateEvaluationSet(dataset);assert.equal(r.ok,true);assert.equal(Object.isFrozen(r.dataset.caseIds),true);assert.equal(r.dataset.caseIds.length,20);});
rejectCandidate({...candidate,sampleCount:'20'},'reject numeric-string sample count');
rejectCandidate({...candidate,sampleCount:20.5},'reject fractional sample count');
rejectCandidate({...candidate,sampleCount:501},'reject oversized sample count');
rejectCandidate({...candidate,proposalId:'x'.repeat(121)},'reject overlong identifier','invalid_candidate_reference');
rejectCandidate({...candidate,artifactRef:' artifact.alpha '},'reject whitespace identifier');
rejectCandidate({...candidate,scope:'identity'},'reject protected scope','protected_scope');
rejectCandidate({...candidate,baselineVersion:'2.0'},'reject identical versions','candidate_must_be_versioned');
rejectCandidate({...candidate,arbitrary:'yes'},'reject extra candidate keys');
rejectCandidate(Object.assign(Object.create({proposalId:'inherited'}),candidate),'reject inherited prototype');
const getterCandidate={...candidate};Object.defineProperty(getterCandidate,'proposalId',{enumerable:true,get(){throw Error('getter executed');}});
rejectCandidate(getterCandidate,'reject getter without execution');
rejectCandidate(new Proxy(candidate,{ownKeys(){throw Error('proxy trap');}}),'reject hostile proxy');
rejectDataset({...dataset,extra:'not permitted'},'reject extra dataset fields','dataset_must_contain_only_manifest_fields');
rejectDataset({...dataset,datasetId:'x'.repeat(121)},'reject invalid dataset identifier','invalid_evaluation_manifest');
rejectDataset({...dataset,cases:dataset.cases.slice(0,19)},'reject insufficient dataset cases','insufficient_evaluation_cases');
rejectDataset({...dataset,cases:[...dataset.cases,dataset.cases[0]]},'reject duplicate case id','duplicate_case_id');
rejectDataset({...dataset,cases:[...dataset.cases.slice(0,19),{caseId:'other',prompt:'secret'}]},'reject embedded content','case_must_use_external_fixture_reference');
const sparse=dataset.cases.slice();delete sparse[2];rejectDataset({...dataset,cases:sparse},'reject sparse cases');
const getterDataset={...dataset};Object.defineProperty(getterDataset,'cases',{enumerable:true,get(){throw Error('getter executed');}});rejectDataset(getterDataset,'reject dataset getter');
const getterCase={caseId:'x'};Object.defineProperty(getterCase,'caseId',{enumerable:true,get(){throw Error('getter executed');}});rejectDataset({...dataset,cases:[...dataset.cases.slice(0,19),getterCase]},'reject case getter');
rejectDataset({...dataset,cases:Array.from({length:501},(_,i)=>({caseId:`case${i}`}))},'reject excessive cases','too_many_evaluation_cases');
rejectDataset(new Proxy(dataset,{getPrototypeOf(){throw Error('trap');}}),'reject dataset proxy');
console.log(`TOTAL: ${tests} passed`);
