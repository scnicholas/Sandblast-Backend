"use strict";
const assert = require('node:assert/strict');
const path = require('node:path');
const Policy = require('../Data/marion/runtime/learning/MarionLearningPolicy');
const valid = () => ({signalId:'sig-20261103-001',signalClass:'task_success',scope:'routing',sourceSubsystem:'marion_learning',outcomeScore:0.75,occurredAt:'2026-11-03T17:00:00.000Z'});
let count = 0;
function t(name, fn) { try { fn(); count++; console.log('PASS',name); } catch(e) { console.error('FAIL',name); throw e; } }
t('valid signal and no activation', () => { const r=Policy.validateSignal(valid()); assert.equal(r.ok,true); assert.equal(r.signal.activationAuthorized,false); });
t('all allowed classes/scopes', () => { for(const signalClass of Policy.ALLOWED_SIGNAL_CLASSES) for(const scope of Policy.ALLOWED_SCOPES) assert.equal(Policy.validateSignal({...valid(),signalClass,scope}).ok,true); });
t('protected scopes blocked', () => { for(const scope of Policy.PROTECTED_SCOPES) assert.equal(Policy.validateSignal({...valid(),scope}).reason,'protected_scope'); });
t('identifier too long rejects without truncation', () => assert.equal(Policy.validateSignal({...valid(), signalId:'a'.repeat(121)}).ok,false));
t('bad ID and whitespace rejected', () => {for(const signalId of ['a b','a@b','a/b',' a','a\n']) assert.equal(Policy.validateSignal({...valid(),signalId}).ok,false);});
t('subsystem length and character bounds', () => {assert.equal(Policy.validateSignal({...valid(),sourceSubsystem:'x'.repeat(61)}).ok,false);assert.equal(Policy.validateSignal({...valid(),sourceSubsystem:'contains space'}).ok,false);});
t('bad timestamps rejected',()=>{for(const occurredAt of ['2026-XX','yesterday','2026-13-42T01:00:00Z','2026-02-30T01:00:00Z',9])assert.equal(Policy.validateSignal({...valid(),occurredAt}).ok,false);});
t('missing optional timestamp allowed for legacy',()=> assert.equal(Policy.validateSignal({...valid(),occurredAt:undefined}).ok,true));
t('non-finite score rejected',()=>{for(const outcomeScore of [NaN,Infinity,-1,1.01,'0.5']) assert.equal(Policy.validateSignal({...valid(),outcomeScore}).ok,false);});
t('metadata injection refused',()=>{for(const extra of [{transcript:'secret'}, {token:'secret'}, {note:'unapproved text'}, {activationAuthorized:true}, {transcriptStored:true}, {privatePartition:'public'}])assert.equal(Policy.validateSignal({...valid(),...extra}).ok,false);});
t('adapter revalidation preserves recordedAt',()=>{const first=Policy.validateSignal(valid());const next=Policy.validateSignal({...first.signal,recordedAt:'2026-11-03T17:01:00.000Z'});assert.equal(next.ok,true);assert.equal(next.signal.recordedAt,'2026-11-03T17:01:00.000Z');});
t('reject accessor without executing getter',()=>{let invoked=false;const v=valid();Object.defineProperty(v,'signalId',{enumerable:true,get(){invoked=true;return 'a';}});assert.equal(Policy.validateSignal(v).ok,false);assert.equal(invoked,false);});
t('nonenumerable hidden sensitive property refused',()=>{const x={safe:true};Object.defineProperty(x,'privateToken',{value:'secret',enumerable:false});assert.equal(Policy.validateSafeRecord(x).ok,false);});
t('unsafe JSON types, sparse arrays, cycles, symbols',()=>{const a=[];a[1]='hole';assert.equal(Policy.validateSafeRecord({a}).ok,false);const b={};b.self=b;assert.equal(Policy.validateSafeRecord(b).ok,false);assert.equal(Policy.validateSafeRecord({a:undefined}).ok,false);assert.equal(Policy.validateSafeRecord({a:Symbol('x')}).ok,false);});
t('safe manifest fixture and audit shaped records',()=>{const rec={type:'learning_fixture_review',approvedBy:'owner:abcdef0123456789abcdef01',caseIds:['case-1','case-2'],ownerConsent:true,activationAuthorized:false};assert.equal(Policy.validateSafeRecord(rec).ok,true);});
t('safe JSON byte limit enforced',()=>{assert.equal(Policy.validateSafeRecord({data:'x'.repeat(100)},30).ok,false);assert.equal(Policy.validateSafeRecord({data:'x'},100).ok,true);});
(async()=>{
 const temp=require('node:fs').mkdtempSync('/tmp/marion-policy-test-');
 try {
  const fs=require('node:fs');const root=path.resolve(__dirname,'../Data/marion/runtime/learning');
  fs.copyFileSync(path.join(root,'MarionLearningPolicy.js'),path.join(temp,'MarionLearningPolicy.js'));
  fs.copyFileSync(path.join(__dirname,'fixtures/MarionLearningSignalAdapter.js'),path.join(temp,'MarionLearningSignalAdapter.js'));
  const Adapter=require(path.join(temp,'MarionLearningSignalAdapter.js'));
  let saved;
  const adapter=Adapter.createMarionLearningSignalAdapter({signalStore:{async appendSignal(signal){saved=Policy.validateSignal(signal); return {ok:true,persisted:true,signalId:signal.signalId};}}});
  const result=await adapter.record(valid()); assert.equal(result.ok,true); assert.equal(saved.ok,true);
  const denied=await Adapter.createMarionLearningSignalAdapter({signalStore:{async appendSignal(){}}}).record(valid());assert.equal(denied.ok,false);
  console.log('PASS signal adapter compatibility and fail-closed acknowledgment');
 }finally {require('node:fs').rmSync(temp,{force:true,recursive:true});}
 console.log('TOTAL',count+1,'PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
