"use strict";
const path=require("path"),ROOT=path.resolve(__dirname,"../..");
const A=require(path.join(ROOT,"Data/marion/runtime/nuance/marionNuancePhaseACoordinator.js"));
const P=require(path.join(ROOT,"Data/marion/runtime/nuance/marionPragmaticIntentResolver.js"));
function assert(v,m){if(!v)throw new Error(m);}
function run(message,extra={}){const input={turnId:`p-${Math.random()}`,message,...extra};return P.run(input,A.run(input),{});}
let r=run("Do you really think this is production-ready? Show me the critical gaps.");
assert(r.primaryPragmaticIntent==="request_for_critical_assessment","Readiness challenge did not resolve to critical assessment.");
assert(r.secondaryPragmaticIntents.includes("request_for_validation")||r.secondaryPragmaticIntents.includes("skepticism"),"Readiness challenge lost validation or skepticism.");
r=run("No, that is not the target. Fix the runtime file first, then tell me how we validate it.");
assert(r.primaryPragmaticIntent==="direct_correction","Direct correction was not primary.");
assert(r.secondaryPragmaticIntents.includes("request_for_action")||r.secondaryPragmaticIntents.includes("request_for_validation"),"Multi-intent turn was not preserved.");
r=run("Before that, one quick question. Give me this in point form.");
assert(r.conversationControl&&["temporary_branch","format_control"].includes(r.conversationControl.category),"Conversation control was not detected.");
assert(r.safeguards.subtextMayAuthorizeExecution===false,"Subtext created execution authority.");
console.log(JSON.stringify({ok:true,primary:r.primaryPragmaticIntent,control:r.conversationControl},null,2));
