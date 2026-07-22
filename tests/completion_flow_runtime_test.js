"use strict";
const assert=require("assert");
const path=require("path");
const ROOT=path.resolve(__dirname,"..","..");
const registry=require(path.join(ROOT,"Data/marion/runtime/conversation/marionConversationLayerRegistry.js"));
const adapter=require(path.join(ROOT,"Data/marion/runtime/marionPrivateRuntimeAdapter.js"));
const contextMod=require(path.join(ROOT,"Data/marion/runtime/completion/marionCrossDomainContextIntegrator.js"));
const goalMod=require(path.join(ROOT,"Data/marion/runtime/completion/marionGoalRealignment.js"));
const closureMod=require(path.join(ROOT,"Data/marion/runtime/completion/marionDecisionClosure.js"));

const results=[];
function record(name,pass,detail={}){results.push({name,pass:!!pass,detail});if(!pass)throw new Error(`${name}: ${JSON.stringify(detail)}`);}
function turn(prompt,state={},id="t",extra={}){
  const input={prompt,turnId:id,sessionId:"completion-test",privateAdminConversation:true,marionAdminConversation:true,directMarionAdminInterface:true,privateRuntimeContext:{version:"test",activeDomain:"technical",activeSubject:"Marion completion architecture"},...extra};
  const flow=registry.analyzeTurn(input,state);
  const committed=registry.commitTurn(flow,"Acknowledged.",{statusCode:200});
  return {flow,state:registry.projectState(committed)};
}
function noLeak(value){return !/\b(?:completionFlowState|contextItems|invalidatedAssessments|closureCertificate|nyx\.marion\.|automaticExecutionAllowed|path_[a-z_]+)\b/i.test(String(value||""));}

(async()=>{
  const status=registry.getStatus();
  record("registry_layers_18_20",[18,19,20].every(n=>status.layers[n]),status);
  record("completion_metadata_only",status.routeAuthority===false&&status.replyAuthority===false&&status.metadataOnly===true);
  record("hard_stop_declared",status.hardStopLayer===20&&status.additionalLayerRecommended===false);
  record("execution_boundary",status.automaticExecutionAllowed===false&&status.humanFinalAuthority===true);

  record("layer18_direct_query_detection",contextMod.isCrossDomainQuery("How does this affect the technical, business, and legal threads?"));
  record("layer19_explicit_goal_detection",/functional validation/i.test(goalMod.extractExplicitGoal("Change the goal to complete functional validation across Layers 1 through 20.")));
  record("layer20_closure_signal",closureMod.closureSignal("This is it. Hard stop at Layer 20."));

  let state={},x;
  x=turn("Our governing objective is to complete Marion through Layer 20 without destabilizing production.",state,"c1");state=x.state;
  record("governing_goal_carried",/complete Marion through Layer 20/i.test(x.flow.goalRealignment.activeGoal),x.flow.goalRealignment);
  record("closure_initially_open",x.flow.decisionClosure.closureStatus==="open",x.flow.decisionClosure);

  x=turn("The hard stop is at Layer 20.",state,"c2");state=x.state;
  record("hard_stop_constraint_normalized",x.flow.goalRealignment.constraint==="Hard stop at Layer 20",x.flow.goalRealignment);
  record("hard_stop_does_not_fake_validation",x.flow.decisionClosure.validationPassed===false,x.flow.decisionClosure);

  x=turn("Before we close, what is the business and legal impact of the technical architecture?",state,"c3");state=x.state;
  record("cross_domain_synthesis_active",x.flow.crossDomainContext.synthesisStatus==="integrated",x.flow.crossDomainContext);
  record("cross_domain_has_multiple_domains",x.flow.crossDomainContext.domains.length>=3,x.flow.crossDomainContext.domains);
  record("cross_domain_source_bound",x.flow.crossDomainContext.sourceBound===true&&x.flow.crossDomainContext.sessionBound===true);
  record("cross_domain_reply_clean",noLeak(x.flow.crossDomainContext.suggestedReply),x.flow.crossDomainContext.suggestedReply);

  x=turn("Actually, change the goal to complete functional validation across Layers 1 through 20.",state,"c4");state=x.state;
  record("explicit_goal_realigns",x.flow.goalRealignment.status==="explicitly_realigned"&&x.flow.goalRealignment.goalChanged===true,x.flow.goalRealignment);
  record("stale_assessments_invalidated",x.flow.goalRealignment.invalidatedAssessments.includes("prior_pathway_ranking"),x.flow.goalRealignment);
  record("realignment_requires_reassessment",x.flow.goalRealignment.requiresStrategicReassessment===true);

  x=turn("Maybe we could add another layer someday.",state,"c5");state=x.state;
  record("speculation_does_not_change_goal",x.flow.goalRealignment.goalChanged===false&&/functional validation/i.test(x.flow.goalRealignment.activeGoal),x.flow.goalRealignment);
  record("hard_stop_persists",x.flow.goalRealignment.hardStopAtLayer20===true);

  x=turn("Keep the current validated baseline.",state,"c6");state=x.state;
  record("baseline_pathway_resolved",/baseline/i.test(x.flow.pathwaySynthesis.selectedPathwayId||x.flow.pathwaySynthesis.recommendedPathwayId),x.flow.pathwaySynthesis);

  x=turn("The full live validation passed.",state,"c7");state=x.state;
  record("validation_evidence_recognized",x.flow.decisionClosure.validationPassed===true,x.flow.decisionClosure);
  record("closure_ready",["ready_to_close","ready_for_resolution","closed"].includes(x.flow.decisionClosure.closureStatus),x.flow.decisionClosure);

  x=turn("This is it. Hard stop at Layer 20. Freeze the baseline.",state,"c8");state=x.state;
  record("decision_closed",x.flow.decisionClosure.closureStatus==="closed",x.flow.decisionClosure);
  record("closure_certificate",x.flow.decisionClosure.closureCertificate&&x.flow.decisionClosure.closureCertificate.layersValidated==="1-20",x.flow.decisionClosure.closureCertificate);
  record("no_layer_21_recommendation",x.flow.decisionClosure.additionalLayerRecommended===false);
  record("human_final_authority",x.flow.decisionClosure.humanFinalAuthority===true&&x.flow.decisionClosure.automaticExecutionAllowed===false);
  record("closure_reply_clean",noLeak(x.flow.decisionClosure.suggestedReply),x.flow.decisionClosure.suggestedReply);

  const fresh=turn("Are we done and ready to freeze the baseline?",{},"fresh-completion",{newSession:true});
  record("fresh_session_goal_isolation",fresh.flow.goalRealignment.activeGoal==="",fresh.flow.goalRealignment);
  record("fresh_session_not_closed",fresh.flow.decisionClosure.closureStatus!=="closed",fresh.flow.decisionClosure);

  const publicProjected=registry.applyToInput({prompt:"Are we done?",surfaceAgent:"Nyx",publicSurface:true},{});
  record("public_completion_no_op",publicProjected.publicCompletionNoOp===true&&!publicProjected.completionFlow&&!publicProjected.goalRealignment&&!publicProjected.decisionClosure,Object.keys(publicProjected));

  const sid=`adapter-completion-${Date.now()}`;
  const prompts=[
    "Our governing objective is to complete Marion through Layer 20 without destabilizing production.",
    "The hard stop is at Layer 20.",
    "Keep the current validated baseline.",
    "The full live validation passed.",
    "This is it. Hard stop at Layer 20. Freeze the baseline."
  ];
  const rows=[];
  for(const prompt of prompts){
    const response=await adapter.invokePrivateRuntime({prompt,sessionId:sid,adminVerified:true,sessionVerified:true},{adminVerified:true,sessionVerified:true});
    assert.strictEqual(response.statusCode,200);assert.ok(response.reply);
    rows.push({prompt,statusCode:response.statusCode,reply:response.reply,layers:response.result&&response.result.meta&&response.result.meta.conversationLayers,closure:response.completionFlowState&&response.completionFlowState.decisionClosure&&response.completionFlowState.decisionClosure.closureStatus});
  }
  record("adapter_http_200_completion_sequence",rows.every(r=>r.statusCode===200),rows);
  record("adapter_layers_9_20_metadata",rows.every(r=>Array.isArray(r.layers)&&[9,10,11,12,13,14,15,16,17,18,19,20].every(n=>r.layers.includes(n))),rows);
  record("adapter_closes_at_20",rows[rows.length-1].closure==="closed",rows[rows.length-1]);
  record("adapter_visible_reply_clean",rows.every(r=>noLeak(r.reply)),rows.map(r=>r.reply));

  console.log(JSON.stringify({ok:true,version:registry.VERSION,total:results.length,passed:results.filter(r=>r.pass).length,results},null,2));
})().catch(error=>{console.error(JSON.stringify({ok:false,error:error.message,stack:error.stack,results},null,2));process.exit(1);});
