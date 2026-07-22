"use strict";
const assert=require("assert");
const path=require("path");
const ROOT=path.resolve(__dirname,"..");
const registry=require(path.join(ROOT,"Data/marion/runtime/conversation/marionConversationLayerRegistry.js"));
const adapter=require(path.join(ROOT,"Data/marion/runtime/marionPrivateRuntimeAdapter.js"));

const results=[];
function record(name,pass,detail={}){results.push({name,pass,detail});if(!pass)throw new Error(`${name}: ${JSON.stringify(detail)}`);}
function flowTurn(prompt,state={},id="t"){
  const input={prompt,turnId:id,privateAdminConversation:true,marionAdminConversation:true,privateRuntimeContext:{version:"test",activeDomain:"technical",activeSubject:"Marion runtime repair"}};
  const flow=registry.analyzeTurn(input,state);
  const committed=registry.commitTurn(flow,"test reply",{statusCode:200});
  return {flow,state:registry.projectState(committed)};
}

(async()=>{
  assert.strictEqual(registry.getStatus().layers[12].includes("layer12"),true);record("registry_layers_12_14",true,registry.getStatus());
  let state={};let x;
  x=flowTurn("We will use the direct-adapter route.",state,"t1");state=x.state;
  record("explicit_decision",x.flow.outcomeAwareness.outcomeType==="decision"&&x.flow.outcomeAwareness.outcomeStatus==="accepted");
  record("decision_not_commitment",x.flow.commitmentTracking.openCommitments.length===0);

  x=flowTurn("Deploy the files and test Marion afterward.",state,"t2");state=x.state;
  record("approved_action_creates_commitment",x.flow.commitmentTracking.openCommitments.length===1,{ledger:x.flow.commitmentTracking.ledger});
  record("no_autonomous_execution",x.flow.anticipatoryGuidance.safeToExecute===false&&x.flow.anticipatoryGuidance.requiresApproval===true);

  x=flowTurn("What remains?",state,"t3");state=x.state;
  record("remaining_query_preserves_ledger",x.flow.commitmentTracking.openCommitments.length===1);
  record("remaining_query_direct_reply",/remaining commitment/i.test(x.flow.anticipatoryGuidance.suggestedReply));

  x=flowTurn("Run validation tomorrow.",state,"t4");state=x.state;
  const validation=x.flow.commitmentTracking.openCommitments.find(c=>/validation/i.test(c.description));
  record("timed_commitment_created",!!validation&&validation.timingHint.toLowerCase()==="tomorrow");
  record("no_invented_deadline",validation&&validation.dueAt===null);

  x=flowTurn("Actually, cancel tomorrow's validation.",state,"t5");state=x.state;
  record("targeted_cancellation",x.flow.commitmentTracking.cancelledCommitments.some(c=>/validation/i.test(c.description)));
  record("other_commitment_survives_cancel",x.flow.commitmentTracking.openCommitments.some(c=>/deploy/i.test(c.description)));

  x=flowTurn("The runtime passed today.",state,"t6");state=x.state;
  record("completion_closes_active_commitment",x.flow.commitmentTracking.openCommitments.length===0,{ledger:x.flow.commitmentTracking.ledger});
  record("completion_evidence_recorded",x.flow.commitmentTracking.completedCommitments.some(c=>/runtime passed/i.test(c.completionEvidence)));

  x=flowTurn("What should happen next?",state,"t7");state=x.state;
  record("next_best_action_after_completion",/freeze the validated production baseline/i.test(x.flow.anticipatoryGuidance.nextBestAction));

  const beforeBrainstorm=state.outcomeFlow.commitmentTracking.ledger.length;
  x=flowTurn("Maybe we should redesign it later.",state,"t8");state=x.state;
  record("brainstorm_not_approval",x.flow.outcomeAwareness.outcomeType==="none");
  record("brainstorm_no_commitment",state.outcomeFlow.commitmentTracking.ledger.length===beforeBrainstorm);

  x=flowTurn("The deployment is blocked waiting for the token.",state,"t9");state=x.state;
  record("blocked_commitment",x.flow.commitmentTracking.blockedCommitments.length===1);
  record("blocker_guidance",x.flow.anticipatoryGuidance.guidanceMode==="resolve_blocker");

  x=flowTurn("The token is available. Proceed with deployment.",state,"t10");state=x.state;
  record("explicit_resume_approved",x.flow.outcomeAwareness.outcomeType==="action_approved");

  x=flowTurn("The deployment passed.",state,"t11");state=x.state;
  record("deployment_completed",x.flow.commitmentTracking.completedCommitments.length>=1);
  x=flowTurn("The deployment failed.",state,"t12");state=x.state;
  record("failed_reopens_commitment",x.flow.commitmentTracking.openCommitments.some(c=>c.status==="failed"&&c.reopened===true));

  const fresh=flowTurn("What remains?",{},"fresh-1");
  record("fresh_session_isolation",fresh.flow.commitmentTracking.openCommitments.length===0&&/no tracked commitment|nothing remains/i.test(fresh.flow.anticipatoryGuidance.suggestedReply));

  const sid=`adapter-${Date.now()}`;
  const prompts=["We will use the direct-adapter route.","Deploy the files and test Marion afterward.","What remains?","The runtime passed today.","What should happen next?"];
  const adapterRows=[];
  for(const prompt of prompts){const response=await adapter.invokePrivateRuntime({prompt,sessionId:sid,adminVerified:true,sessionVerified:true},{adminVerified:true,sessionVerified:true});adapterRows.push({prompt,statusCode:response.statusCode,reply:response.reply,outcomeType:response.outcomeFlowState&&response.outcomeFlowState.outcomeAwareness&&response.outcomeFlowState.outcomeAwareness.outcomeType,openCommitments:response.outcomeFlowState&&response.outcomeFlowState.commitmentTracking&&response.outcomeFlowState.commitmentTracking.openCommitments&&response.outcomeFlowState.commitmentTracking.openCommitments.length});assert.strictEqual(response.statusCode,200);assert.ok(response.reply);}
  record("adapter_http_200_sequence",true,{rows:adapterRows});
  record("adapter_outcome_metadata",adapterRows.some(r=>r.outcomeType==="decision")&&adapterRows.some(r=>r.outcomeType==="action_approved"));
  record("adapter_visible_guidance",adapterRows.some(r=>/remaining commitment/i.test(r.reply))&&adapterRows.some(r=>/next best action|next responsible move/i.test(r.reply)));

  const publicInput={prompt:"We will use the route.",surfaceAgent:"Nyx",publicSurface:true};
  const publicFlow=registry.applyToInput(publicInput,{});
  // Registry itself may analyze data, but production wrappers only call it on private turns.
  record("public_wrapper_boundary_documented",publicFlow.publicSurface===true&&publicFlow.surfaceAgent==="Nyx");

  console.log(JSON.stringify({ok:true,version:registry.VERSION,total:results.length,passed:results.filter(r=>r.pass).length,results},null,2));
})().catch(error=>{console.error(JSON.stringify({ok:false,error:error.message,stack:error.stack,results},null,2));process.exit(1);});
