"use strict";
const assert=require("assert");
const path=require("path");
const ROOT=path.resolve(__dirname,"..","..");
const registry=require(path.join(ROOT,"Data/marion/runtime/conversation/marionConversationLayerRegistry.js"));
const adapter=require(path.join(ROOT,"Data/marion/runtime/marionPrivateRuntimeAdapter.js"));
const riskModel=require(path.join(ROOT,"Data/marion/runtime/strategy/marionPredictiveRiskModel.js"));

const results=[];
function record(name,pass,detail={}){results.push({name,pass:!!pass,detail});if(!pass)throw new Error(`${name}: ${JSON.stringify(detail)}`);}
function turn(prompt,state={},id="t",extra={}){
  const input={prompt,turnId:id,sessionId:"strategic-test",privateAdminConversation:true,marionAdminConversation:true,directMarionAdminInterface:true,privateRuntimeContext:{version:"test",activeDomain:"technical",activeSubject:"Marion strategic runtime integration"},...extra};
  const flow=registry.analyzeTurn(input,state);
  const committed=registry.commitTurn(flow,"Acknowledged.",{statusCode:200});
  return {flow,state:registry.projectState(committed)};
}
function noLeak(text){return !/\b(?:assessmentId|pathwayId|riskId|alignmentScore|strategicFlowState|nyx\.marion\.|automaticExecutionAllowed)\b/i.test(String(text||""));}

(async()=>{
  const status=registry.getStatus();
  record("registry_layers_9_17",Object.keys(status.layers).map(Number).join(",")==="9,10,11,12,13,14,15,16,17",status);
  record("strategic_metadata_only",status.routeAuthority===false&&status.replyAuthority===false&&status.metadataOnly===true);
  record("automatic_execution_disabled",status.automaticExecutionAllowed===false&&status.approvalBoundaryPreserved===true);

  let state={},x;
  x=turn("Our governing objective is to expand Marion without destabilizing the certified production runtime.",state,"s1");state=x.state;
  record("explicit_governing_objective",/expand Marion/i.test(x.flow.objectiveAlignment.governingObjective),x.flow.objectiveAlignment);
  record("objective_is_not_execution",x.flow.pathwaySynthesis.safeToExecute===false&&x.flow.pathwaySynthesis.automaticExecutionAllowed===false);
  record("objective_reply_private_and_clean",noLeak(x.flow.pathwaySynthesis.suggestedReply),{reply:x.flow.pathwaySynthesis.suggestedReply});

  x=turn("Our program goal is to increase commercial value through stable licensing.",state,"s2");state=x.state;
  record("multiple_objectives_retained",x.flow.objectiveAlignment.objectives.length>=2,{objectives:x.flow.objectiveAlignment.objectives});
  const governingEntry=x.flow.objectiveAlignment.objectives.find(o=>o.level==="governing");
  record("governing_objective_id_bound",!!governingEntry&&x.flow.objectiveAlignment.objectiveId===governingEntry.objectiveId,x.flow.objectiveAlignment);

  x=turn("Replace the certified direct-adapter route and deploy everything at once.",state,"s3");state=x.state;
  record("objective_conflict_detected",x.flow.objectiveAlignment.alignmentStatus==="objective_conflict",x.flow.objectiveAlignment);
  record("high_risk_detected",["high","critical"].includes(x.flow.predictiveRisk.overallRisk),x.flow.predictiveRisk);
  record("baseline_pathway_present",x.flow.pathwaySynthesis.pathways.some(p=>p.pathwayId==="path_retain_baseline"));
  record("pathway_count_bounded",x.flow.pathwaySynthesis.pathways.length<=3);
  record("recommendation_not_execution",x.flow.pathwaySynthesis.safeToExecute===false&&x.flow.pathwaySynthesis.automaticExecutionAllowed===false);

  x=turn("What could go wrong?",state,"s4");state=x.state;
  record("risk_query_retains_proposal",/replace the certified/i.test(x.flow.objectiveAlignment.proposedAction),x.flow.objectiveAlignment);
  record("risk_query_retains_high_risk",["high","critical"].includes(x.flow.predictiveRisk.overallRisk));
  record("risk_scenarios_bounded",x.flow.predictiveRisk.scenarios.length<=4&&x.flow.predictiveRisk.risks.length<=20);

  x=turn("What are our options?",state,"s5");state=x.state;
  record("pathways_ranked",x.flow.pathwaySynthesis.rankedPathwayIds.length===x.flow.pathwaySynthesis.pathways.length,x.flow.pathwaySynthesis);
  record("recommendation_explicit",!!x.flow.pathwaySynthesis.recommendedPathwayId);
  record("strategic_reply_no_internal_ids",noLeak(x.flow.pathwaySynthesis.suggestedReply),{reply:x.flow.pathwaySynthesis.suggestedReply});

  x=turn("Proceed with Path B.",state,"s6");state=x.state;
  record("path_b_bound_to_existing_set",x.flow.pathwaySynthesis.approvedPathwayId==="path_reframe_additive",x.flow.pathwaySynthesis);
  record("approved_still_not_executing",x.flow.pathwaySynthesis.status==="approved"&&x.flow.pathwaySynthesis.safeToExecute===false);
  record("approval_reply_boundary",/does not create autonomous execution/i.test(x.flow.pathwaySynthesis.suggestedReply));

  x=turn("Keep the current baseline.",state,"s7");state=x.state;
  record("current_turn_baseline_override",x.flow.pathwaySynthesis.selectedPathwayId==="path_retain_baseline"&&x.flow.pathwaySynthesis.recommendedPathwayId==="path_retain_baseline",x.flow.pathwaySynthesis);

  x=turn("What should happen next?",state,"s8");state=x.state;
  record("baseline_selection_persists",x.flow.pathwaySynthesis.selectedPathwayId==="path_retain_baseline"&&x.flow.pathwaySynthesis.recommendedPathwayId==="path_retain_baseline");
  record("layer14_not_hijacked",x.flow.anticipatoryGuidance&&typeof x.flow.anticipatoryGuidance.nextBestAction==="string");

  x=turn("Change the governing objective to maximize deployment speed even if rollback is unavailable.",state,"s9");state=x.state;
  record("explicit_objective_change",x.flow.objectiveAlignment.objectiveChanged===true&&/maximize deployment speed/i.test(x.flow.objectiveAlignment.governingObjective));
  record("stale_pathways_invalidated",x.flow.pathwaySynthesis.staleRankingsInvalidated===true&&x.flow.pathwaySynthesis.invalidatedPathwayIds.length>0,x.flow.pathwaySynthesis);
  record("stale_approval_cleared",x.flow.pathwaySynthesis.approvedPathwayId==="");

  const irreversible=riskModel.analyze({prompt:"Permanently delete the state archive with no rollback.",alignment:{proposedAction:"Permanently delete the state archive with no rollback.",alignmentStatus:"aligned",confidence:.8}});
  record("irreversible_risk_requires_human_review",irreversible.humanReviewRequired===true&&irreversible.risks.some(r=>r.reversibility==="irreversible"),irreversible);
  const dedup=riskModel.dedupe([...irreversible.risks,...irreversible.risks]);
  record("duplicate_risk_suppression",dedup.length===irreversible.risks.length,{before:irreversible.risks.length*2,after:dedup.length});

  const ambiguous=turn("What is the strongest strategic pathway?",{},"fresh-strategy");
  record("insufficient_objective_context",ambiguous.flow.objectiveAlignment.alignmentStatus==="insufficient_objective_context",ambiguous.flow.objectiveAlignment);
  record("fresh_session_strategic_isolation",ambiguous.flow.pathwaySynthesis.approvedPathwayId===""&&ambiguous.flow.objectiveAlignment.objectives.length===0);

  // Preserve prior layers while strategic flow is active.
  let oldState={};
  let old=turn("Deploy the files and test Marion afterward.",oldState,"r1");oldState=old.state;
  old=turn("What remains?",oldState,"r2");oldState=old.state;
  record("layer13_commitment_preserved",old.flow.commitmentTracking.openCommitments.length===1);
  record("layer14_guidance_preserved",/remaining commitment/i.test(old.flow.anticipatoryGuidance.suggestedReply));
  old=turn("The runtime passed today.",oldState,"r3");oldState=old.state;
  record("layer12_completion_preserved",old.flow.outcomeAwareness.completed===true&&old.flow.commitmentTracking.openCommitments.length===0);

  const sid=`adapter-strategy-${Date.now()}`;
  const prompts=[
    "Our governing objective is to expand Marion without destabilizing the certified production runtime.",
    "Replace the certified direct-adapter route and deploy everything at once.",
    "What could go wrong?",
    "What are our options?",
    "Proceed with Path B."
  ];
  const rows=[];
  for(const prompt of prompts){
    const response=await adapter.invokePrivateRuntime({prompt,sessionId:sid,adminVerified:true,sessionVerified:true},{adminVerified:true,sessionVerified:true});
    assert.strictEqual(response.statusCode,200);assert.ok(response.reply);
    rows.push({prompt,statusCode:response.statusCode,reply:response.reply,recommended:response.strategicFlowState&&response.strategicFlowState.pathwaySynthesis&&response.strategicFlowState.pathwaySynthesis.recommendedPathwayId,approved:response.strategicFlowState&&response.strategicFlowState.pathwaySynthesis&&response.strategicFlowState.pathwaySynthesis.approvedPathwayId,layers:response.result&&response.result.meta&&response.result.meta.conversationLayers});
  }
  record("adapter_http_200_strategic_sequence",rows.every(r=>r.statusCode===200),{rows});
  record("adapter_layers_9_17_metadata",rows.every(r=>Array.isArray(r.layers)&&r.layers.join(",")==="9,10,11,12,13,14,15,16,17"));
  record("adapter_path_approval",rows[rows.length-1].approved==="path_reframe_additive",rows[rows.length-1]);
  record("adapter_visible_replies_clean",rows.every(r=>noLeak(r.reply)),{replies:rows.map(r=>r.reply)});

  const publicInput={prompt:"What are our strategic options?",surfaceAgent:"Nyx",publicSurface:true};
  const publicProjected=registry.applyToInput(publicInput,{});
  record("public_fields_preserved",publicProjected.surfaceAgent==="Nyx"&&publicProjected.publicSurface===true);
  record("public_strategic_no_op",publicProjected.publicStrategicNoOp===true&&!publicProjected.strategicFlow&&!publicProjected.objectiveAlignment&&!publicProjected.predictiveRisk&&!publicProjected.pathwaySynthesis,{keys:Object.keys(publicProjected)});

  console.log(JSON.stringify({ok:true,version:registry.VERSION,total:results.length,passed:results.filter(r=>r.pass).length,results},null,2));
})().catch(error=>{console.error(JSON.stringify({ok:false,error:error.message,stack:error.stack,results},null,2));process.exit(1);});


