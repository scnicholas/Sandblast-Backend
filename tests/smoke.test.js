"use strict";
const assert = require('node:assert/strict');
const path = require('node:path');
const root=path.resolve(__dirname,'..');
const policy=require(path.join(root,'fixtures','MarionLearningPolicy.js'));
const {createMarionLearningSignalAdapter}=require(path.join(root,'fixtures','MarionLearningSignalAdapter.js'));
(async()=>{
 const input={signalId:'marion-diag-test',signalClass:'owner_confirmation',scope:'routing',sourceSubsystem:'marion_diag_isolated',outcomeScore:0.5,occurredAt:new Date().toISOString()};
 assert.equal(policy.validateSignal(input).ok,true);
 assert.equal(policy.validateSignal({...input,scope:'authorization'}).ok,false);
 const good=createMarionLearningSignalAdapter({signalStore:{appendSignal: async s=>({ok:true,persisted:true,signalId:s.signalId})}});
 assert.equal((await good.record(input)).accepted,true);
 const missingAck=createMarionLearningSignalAdapter({signalStore:{appendSignal: async()=>undefined}});
 assert.equal((await missingAck.record(input)).accepted,false);
 const falseAck=createMarionLearningSignalAdapter({signalStore:{appendSignal: async()=>({ok:true,persisted:true,signalId:'wrong'})}});
 assert.equal((await falseAck.record(input)).accepted,false);
 console.log('Policy / signal adapter offline smoke tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
