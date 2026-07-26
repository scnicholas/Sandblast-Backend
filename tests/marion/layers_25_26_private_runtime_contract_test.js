"use strict";
const path=require("path"),ROOT=path.resolve(__dirname,"../..");
const B=require(path.join(ROOT,"Data/marion/runtime/nuance/marionNuancePhaseBCoordinator.js"));
function assert(v,m){if(!v)throw new Error(m);}
const result=B.run({turnId:"private-b",conversationId:"private-c",scope:"private_admin",privateAdminConversation:true,marionAdminConversation:true,directMarionAdminInterface:true,message:"Good morning, Marion. Before we continue, one quick question."});
assert(result.scope==="private_admin","Private scope was not preserved.");
assert(result.partitionClass==="private_admin","Private partition was not preserved.");
assert(result.phaseA.scope==="private_admin","Phase A private scope drifted.");
assert(result.diagnostics.noUserFacingDiagnostics===true,"Diagnostics were allowed to surface.");
assert(result.carryPolicy.approvedStatePatch.policies.crossPartitionCarryAllowed===false,"Cross-partition carry was allowed.");
console.log(JSON.stringify({ok:true,scope:result.scope,control:result.layer26.conversationControl},null,2));
