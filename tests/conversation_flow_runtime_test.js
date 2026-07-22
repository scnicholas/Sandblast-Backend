"use strict";
const fs=require("fs");
const path=require("path");
const root=path.resolve(__dirname,"..");
const adapter=require(path.join(root,"Data/marion/runtime/marionPrivateRuntimeAdapter.js"));
const registry=require(path.join(root,"Data/marion/runtime/conversation/marionConversationLayerRegistry.js"));
const ctx={adminVerified:true,sessionVerified:true};
const failures=[];const rows=[];
function check(condition,label,detail){if(!condition)failures.push({label,detail});}
async function send(sessionId,prompt,extra={}){
  const out=await adapter.invokePrivateRuntime({prompt,sessionId,...extra},ctx);
  const row={sessionId,prompt,statusCode:out.statusCode,stage:out.conversationFlow&&out.conversationFlow.stage,direction:out.conversationFlow&&out.conversationFlow.direction,domain:out.result&&out.result.domain,activeDomain:out.conversationFlowState&&out.conversationFlowState.activeDomain,activeSubject:out.conversationFlowState&&out.conversationFlowState.activeSubject,recoveryUsed:out.degraded===true,reply:String(out.reply||"").slice(0,260),calibration:out.conversationFlow&&out.conversationFlow.interactionCalibration,pausedThreads:out.conversationFlow&&out.conversationFlow.contextPivot&&out.conversationFlow.contextPivot.pausedThreads&&out.conversationFlow.contextPivot.pausedThreads.length||0};rows.push(row);return out;
}
(async()=>{
  const sid="layers-9-11-primary";
  let out=await send(sid,"Hello Marion.");
  check(out.statusCode===200,"greeting_http_200",out);
  check(out.conversationFlow.stage==="social","greeting_social_stage",out.conversationFlow);

  out=await send(sid,"Do a surgical autopsy on the JavaScript routing file.");
  check(out.result.domain==="technical","technical_domain",out.result.domain);
  check(out.conversationFlow.stage==="deep_analysis","layer9_deep_analysis",out.conversationFlow);
  check(out.conversationFlow.direction==="start","layer10_start",out.conversationFlow);

  out=await send(sid,"Go deeper.");
  check(out.conversationFlow.direction==="continue","layer10_continue",out.conversationFlow);
  check(out.conversationFlow.progression.progressionDepth>=1,"layer9_depth_increment",out.conversationFlow.progression);
  check(/JavaScript routing file/i.test(out.reply),"subject_alignment",out.reply);

  out=await send(sid,"What should we fix first?");
  check(out.conversationFlow.stage==="prioritization","layer9_prioritization",out.conversationFlow);
  check(out.conversationFlow.interactionCalibration.decisionRequired===true,"layer11_decision_mode",out.conversationFlow.interactionCalibration);

  out=await send(sid,"Before that, what is the business risk?");
  check(out.result.domain==="business","branch_business_domain",out.result.domain);
  check(out.conversationFlow.direction==="branch","layer10_branch",out.conversationFlow);
  check(out.conversationFlow.contextPivot.pausedThreads.length===1,"primary_thread_paused",out.conversationFlow.contextPivot);
  check(out.degraded!==true,"business_branch_canonical_no_recovery",out.bridgeAttempts);

  out=await send(sid,"Back to the routing repair.");
  check(out.conversationFlow.direction==="return","layer10_return",out.conversationFlow);
  check(out.result.domain==="technical","return_restores_technical",out.result.domain);
  check(/JavaScript routing file/i.test(out.conversationFlow.activeSubject),"return_restores_subject",out.conversationFlow.activeSubject);

  out=await send(sid,"Give me the direct answer.");
  check(out.conversationFlow.direction==="continue","calibration_command_is_continuation",out.conversationFlow);
  check(out.conversationFlow.interactionCalibration.directness==="high","layer11_directness",out.conversationFlow.interactionCalibration);
  check(out.conversationFlow.interactionCalibration.responseLength==="short","layer11_short_budget",out.conversationFlow.interactionCalibration);

  out=await send(sid,"I am frustrated that this keeps happening. Give me the root cause.");
  check(out.conversationFlow.direction==="continue","frustration_keeps_active_thread",out.conversationFlow);
  check(out.result.domain==="technical","frustration_preserves_domain",out.result.domain);
  check(out.conversationFlow.interactionCalibration.warmth==="steady","layer11_frustration_steady",out.conversationFlow.interactionCalibration);
  check(out.conversationFlow.interactionCalibration.acknowledgementBudget===1,"layer11_ack_budget",out.conversationFlow.interactionCalibration);

  out=await send(sid,"Good evening, Marion.");
  check(out.conversationFlow.direction==="social_pause","social_pause",out.conversationFlow);
  check(out.conversationFlowState.activeDomain==="general","visible_lane_exit",out.conversationFlowState);
  check(out.conversationFlow.contextPivot.pausedThreads.length>=1,"working_thread_preserved_while_social",out.conversationFlow.contextPivot);

  out=await send(sid,"Continue.");
  check(out.conversationFlow.direction==="return","social_resume_return",out.conversationFlow);
  check(out.result.domain==="technical","social_resume_domain",out.result.domain);
  check(/JavaScript routing file/i.test(out.reply),"social_resume_subject_alignment",out.reply);

  const legalSid="layers-9-11-legal";
  out=await send(legalSid,"Review the legal risks in this contract.");
  check(out.result.domain==="law","explicit_legal_domain",out.result.domain);
  out=await send(legalSid,"What should I examine first?");
  check(out.result.domain==="law","legal_followup_continuity",out.result.domain);

  const freshSid="layers-9-11-fresh";
  out=await send(freshSid,"Continue.",{newSession:true});
  check(out.result.domain==="general","fresh_session_no_domain_bleed",out.result.domain);
  check(["reset","clarify"].includes(out.conversationFlow.direction),"fresh_session_resets_or_clarifies",out.conversationFlow);
  check(!/JavaScript routing file/i.test(out.reply),"fresh_session_no_subject_bleed",out.reply);

  const publicInput={prompt:"Go deeper.",surfaceAgent:"Nyx",publicSurface:true};
  const publicPrepared=registry.applyToInput(publicInput,{});
  check(publicPrepared.conversationFlow.contract===registry.CONTRACT,"registry_standalone_contract",publicPrepared.conversationFlow);

  const result={ok:failures.length===0,version:registry.VERSION,adapterStatus:adapter.getStatus(),tests:rows.length,failures,rows,completedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(__dirname,"RUNTIME_RESULTS.json"),JSON.stringify(result,null,2));
  console.log(JSON.stringify({ok:result.ok,tests:result.tests,failures:result.failures},null,2));
  if(failures.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exit(1);});
