"use strict";
const path=require("path"),ROOT=path.resolve(__dirname,"../..");
const B=require(path.join(ROOT,"Data/marion/runtime/nuance/marionNuancePhaseBCoordinator.js"));
function assert(v,m){if(!v)throw new Error(m);}
const input={turnId:"integration-21-26",conversationId:"c-1",privateAdminConversation:true,directMarionAdminInterface:true,message:"No, that is not what I meant. Work through the current route piece by piece and then validate it.",intent:"technical_debug",domain:"technical"};
const result=B.run(input);
assert(result.contract==="nyx.marion.nuance.phaseB/1.0","Phase B contract mismatch.");
assert(result.phaseA.layer24.currentState==="correction","Phase A interaction state was lost.");
assert(result.layer25.layer===25&&result.layer26.layer===26,"Layer sequence is incomplete.");
assert(result.layer25.primaryStance==="corrective","Layer 25 did not honor correction precedence.");
assert(result.layer26.primaryPragmaticIntent==="direct_correction","Layer 26 did not honor direct correction.");
assert(result.subtextGate.literalIntentPreserved===true,"Literal intent was not preserved.");
assert(result.responsePosture.authorityBoundaries.executionAuthorityCreated===false,"Phase B created execution authority.");
assert(result.carryPolicy.approvedStatePatch.pragmaticIntentTtlTurns<=1,"Pragmatic intent carry is too durable.");
assert(result.health.phaseACalledOnce===true,"Coordinator does not certify single Phase A invocation.");
console.log(JSON.stringify({ok:true,stance:result.layer25.primaryStance,pragmatic:result.layer26.primaryPragmaticIntent,hardStop:result.hardStopLayer},null,2));
