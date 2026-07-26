"use strict";
const path=require("path"),ROOT=path.resolve(__dirname,"../..");
const B=require(path.join(ROOT,"Data/marion/runtime/nuance/marionNuancePhaseBCoordinator.js"));
const outcome=require(path.join(ROOT,"Data/marion/runtime/conversation/marionOutcomeAwareness.js"));
const commitments=require(path.join(ROOT,"Data/marion/runtime/conversation/marionCommitmentTracker.js"));
function a(x,m){if(!x)throw new Error(m);}
const input={turnId:"b1-out",privateAdminConversation:true,message:"Fine."};
const b=B.run(input);
const o=outcome.classify({...input,phaseBNuance:b,nuanceContext:b.phaseA});
const c=commitments.update({prompt:input.message,outcome:{outcomeType:"action_approved",outcomeStatus:"approved",approved:true},previous:{},threadId:"t",subject:"use that",turnId:"b1-out",phaseBNuance:b});
a(o.subtextMayCreateApproval===false,"outcome approval boundary");
a(c.subtextMayCreateCommitment===false,"commitment boundary");
a(c.phaseBCommitmentCreationBlocked===true,"reluctant acceptance blocked");
console.log(JSON.stringify({ok:true,blocked:c.phaseBCommitmentCreationBlocked}));
