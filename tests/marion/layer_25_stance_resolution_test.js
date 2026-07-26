"use strict";
const path=require("path"),ROOT=path.resolve(__dirname,"../..");
const A=require(path.join(ROOT,"Data/marion/runtime/nuance/marionNuancePhaseACoordinator.js"));
const S=require(path.join(ROOT,"Data/marion/runtime/nuance/marionConversationalStanceResolver.js"));
function assert(v,m){if(!v)throw new Error(m);}
function run(message,extra={}){const input={turnId:`t-${Math.random()}`,message,...extra};return S.run(input,A.run(input));}
let r=run("No, that is not what I meant. Correct the current file without restarting the topic.",{intent:"technical_debug",domain:"technical"});
assert(r.primaryStance==="corrective","Correction did not select corrective stance.");
assert(r.modifiers.includes("continuity_preserving"),"Correction lost continuity preservation.");
r=run("Perform a surgical autopsy and identify the root cause of the 500 error.",{intent:"technical_debug",domain:"technical"});
assert(r.primaryStance==="diagnostic","Technical failure did not select diagnostic stance.");
assert(r.modifiers.includes("evidence_first"),"Diagnostic stance is not evidence-first.");
r=run("Are we still structurally intact, or did this destroy the backend?",{domain:"technical"});
assert(["reassuring","protective","diagnostic"].includes(r.primaryStance),"Containment question produced the wrong stance family.");
assert(r.safeguards.executionAuthorityCreated===false,"Stance created execution authority.");
console.log(JSON.stringify({ok:true,last:r.primaryStance},null,2));
