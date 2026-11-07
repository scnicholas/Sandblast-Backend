"use strict";
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname,'../Data/marion/runtime/learning');
const Policy = require(path.join(root,'MarionLearningPolicy.js'));
const { createApprovalGate } = require(path.join(root,'MarionLearningApprovalGate.js'));
const { createMarionLearningAuditStore, sanitizeAuditEvent } = require(path.join(root,'MarionLearningAuditStore.js'));
const owner = {authenticated:true,role:'owner',verifiedBy:'server_middleware',actorId:'owner:0123456789abcdefabcdef01'};
let checks=0;
function check(value, label) { assert.ok(value,label); checks++; }
const goodSignal={signalId:'sig.12',signalClass:'task_success',scope:'retrieval',sourceSubsystem:'marion',outcomeScore:0.8};
check(Policy.validateSignal(goodSignal).ok,'signal accepted');
for (const id of ['',' invalid','s'.repeat(121),'__proto__','a/1','abc ']) check(!Policy.validateSignal({...goodSignal, signalId:id}).ok,`invalid id ${id}`);
check(Policy.validateSignal({...goodSignal,scope:'authorization'}).ok===false,'protected scope rejected');
const hidden = {...goodSignal}; Object.defineProperty(hidden,'hidden',{value:4});
check(!Policy.validateSignal(hidden).ok,'hidden metadata rejected');
check(!Policy.validateSafeRecord({items:[,3]}).ok,'sparse array rejected');
check(!Policy.validateSafeRecord({apiKey:'secret'}).ok,'secret rejected');
let calls=0; let record=null; let appended=[];
const proposalStore={get:async()=>record,set:async()=>true,insertWithAudit:async(id,r,e)=>{calls++;record=r;return true},decideWithAudit:async(id,dec,update,audit)=>{calls++;appended.push(audit);return true}};
const gate=createApprovalGate({proposalStore,auditStore:{append:async()=>{}},clock:()=> '2026-11-06T00:00:00.000Z'});
(async()=>{
  let r=await gate.submitEvaluation({proposalId:'a'.repeat(121),validated:true,state:'awaiting_owner_approval',liveBehaviorChanged:false});
  check(!r.ok && calls===0,'long proposal ID rejected');
  r=await gate.submitEvaluation({proposalId:'valid.1',validated:true,state:'awaiting_owner_approval',liveBehaviorChanged:true});
  check(!r.ok && calls===0,'activated proposal rejected');
  r=await gate.submitEvaluation({proposalId:'valid.1',validated:true,state:'awaiting_owner_approval',liveBehaviorChanged:false,candidateVersion:'r24'});
  check(r.ok && calls===1,'approved proposal persisted');
  r=await gate.decide({proposalId:'valid.1',decision:'approve',authContext:{authenticated:true,role:'owner',verifiedBy:'client',actorId:owner.actorId}});
  check(!r.ok && calls===1,'spoofed owner rejected');
  r=await gate.decide({proposalId:'valid.1',decision:'approve',authContext:owner,approvalId:'z'.repeat(121)});
  check(!r.ok && calls===1,'long approval identity rejected');
  r=await gate.decide({proposalId:'valid.1',decision:'approve',authContext:owner,approvalId:'approve.1'});
  check(r.ok && calls===2 && appended[0].approvalId==='approve.1','owner decision identity preserved');
  check(sanitizeAuditEvent({type:'test',password:'secret'}).password==='[REDACTED]','audit redacts secrets');
  check((()=>{try{sanitizeAuditEvent({type:'test',foo:[,2]});return false}catch{return true}})(),'audit rejects sparse arrays');
  let stored=[];
  const audit=createMarionLearningAuditStore({durableAppend:async e=>{stored.push(e);},clock:()=> '2026-11-06T00:00:00.000Z',sessionId:'session.123'.replace('.','_')});
  const first=await audit.append({type:'event'});
  const second=await audit.append({type:'event2'});
  check(stored.length===2 && second.previousHash===first.eventHash,'void acknowledgement accepted and chained');
  const failing=createMarionLearningAuditStore({durableAppend:async()=>false});
  let rejected=false;try{await failing.append({type:'event'})}catch{rejected=true}
  check(rejected,'negative audit acknowledgement rejected');
  const oversized=createMarionLearningAuditStore({durableAppend:async()=>{throw Error('must not call')}});
  rejected=false;try{await oversized.append({type:'event',value:'x'.repeat(16000)})}catch{rejected=true}
  check(rejected,'oversized audit rejected before persistence');
  console.log(`PASS ${checks} focused assertions`);
})().catch(e=>{console.error(e);process.exitCode=1});
