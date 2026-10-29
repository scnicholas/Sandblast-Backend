"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const root=path.resolve(__dirname,"../Data/marion/runtime/learning");
const mod=(name)=>require(path.join(root,name));
test("all supplied canonical modules load and export contracts",()=>{
 const fs=require("node:fs");
 for(const file of fs.readdirSync(root).filter(f=>f.endsWith(".js"))){
   const loaded=mod(file); assert.equal(typeof loaded,"object",file);
   assert.ok(typeof loaded.VERSION==="string",file);
 }
});
test("approval requires atomic durable storage instead of unlogged writes",async()=>{
 const {createApprovalGate}=mod("MarionLearningApprovalGate.js");
 const gate=createApprovalGate({proposalStore:{get:async()=>null,set:async()=>{}},auditStore:{append:async()=>{}}});
 const report={validated:true,state:"awaiting_owner_approval",proposalId:"proposal_1",candidateVersion:"v2",liveBehaviorChanged:false};
 assert.deepEqual((await gate.submitEvaluation(report)).reason,"atomic_proposal_storage_required");
});
test("registration acknowledgement is strict",()=>{
 const integration=mod("MarionLearningIntegration.js");
 const runtime={captureFinalOutcome:async()=>({ok:false})};
 assert.equal(integration.registerRuntime(runtime).registered,true);
 assert.equal(integration.registerRuntime(runtime).alreadyRegistered,true);
 assert.throws(()=>integration.registerRuntime({captureFinalOutcome:async()=>({ok:false})}),/already_registered/);
});
test("no live capture when disabled",async()=>{
 const {createMarionLearningRuntime}=mod("MarionLearningRuntime.js");
 const registry={listAvailable(){},issueFixtureReview(){},approveManifest(){},revokeManifest(){},listApproved(){},selectApprovedManifest(){}};
 const runtime=createMarionLearningRuntime({signalAdapter:{record:async()=>({ok:true})}, evaluator:{evaluate:async()=>({ok:true})},approvalGate:{submitEvaluation:async()=>({ok:true}),decide:async()=>({ok:true})},manifestRegistry:registry});
 assert.equal((await runtime.captureFinalOutcome({finalAccepted:true,learningConsent:true})).reason,"learning_disabled");
});
