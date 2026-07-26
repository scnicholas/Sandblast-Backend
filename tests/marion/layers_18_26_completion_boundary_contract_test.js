"use strict";
const path=require("path"),ROOT=path.resolve(__dirname,"../..");
const B=require(path.join(ROOT,"Data/marion/runtime/nuance/marionNuancePhaseBCoordinator.js"));
function assert(v,m){if(!v)throw new Error(m);}
const result=B.run({turnId:"completion-boundary",message:"Fine. Do you really think we can close this now?",intent:"simple_chat"});
assert(result.layer26.safeguards.subtextMayCreateApproval===false,"Reluctant acceptance created approval.");
assert(result.layer26.safeguards.subtextMayCreateCommitment===false,"Subtext created a commitment.");
assert(result.layer26.safeguards.subtextMayChangeGoverningGoal===false,"Subtext changed the governing goal.");
assert(result.layer26.safeguards.subtextMayAuthorizeExecution===false,"Subtext authorized execution.");
assert(result.responsePosture.authorityBoundaries.goalChangeAuthorityCreated===false,"Response posture created goal authority.");
assert(result.hardStopLayer===26,"Phase B hard stop mismatch.");
console.log(JSON.stringify({ok:true,hardStop:result.hardStopLayer,primary:result.layer26.primaryPragmaticIntent},null,2));
