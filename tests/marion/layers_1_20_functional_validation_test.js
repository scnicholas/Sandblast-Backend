"use strict";
const assert=require("assert");
const path=require("path");
const ROOT=path.resolve(__dirname,"..","..");
function load(rel){return require(path.join(ROOT,rel));}
const current=load("Data/marion/runtime/marionCurrentTurnAuthority.js");
const router=load("Data/marion/runtime/marionIntentRouter.js");
const composer=load("Data/marion/runtime/composeMarionResponse.js");
const envelope=load("Data/marion/runtime/marionFinalEnvelope.js");
const bridge=load("Data/marion/runtime/marionBridge.js");
const stateSpine=load("Utils/stateSpine.js");
const chatEngine=load("Utils/chatEngine.js");
const adapter=load("Data/marion/runtime/marionPrivateRuntimeAdapter.js");
const registry=load("Data/marion/runtime/conversation/marionConversationLayerRegistry.js");

const checks=[];
function check(layer,name,pass,detail={}){checks.push({layer,name,pass:!!pass,detail});if(!pass)throw new Error(`Layer ${layer} ${name}: ${JSON.stringify(detail)}`);}
function noLeak(v){return !/\b(?:completionFlowState|strategicFlowState|outcomeFlowState|assessmentId|pathwayId|riskId|closureCertificate|nyx\.marion\.)\b/i.test(String(v||""));}

(async()=>{
  // Layers 1–8 are validated as established pre-Layer-9 runtime invariants; they are not redefined here.
  check(1,"current_turn_authority",typeof current.prepareInput==="function"&&typeof current.enforceResult==="function");
  check(2,"intent_domain_routing",typeof router.routeMarionIntent==="function"&&typeof router.inferIntentFromText==="function");
  check(3,"response_composition",typeof composer.composeMarionResponse==="function"||typeof composer.run==="function");
  check(4,"final_envelope_authority",typeof envelope.createMarionFinalEnvelope==="function"&&envelope.FINAL_SIGNATURE==="MARION_FINAL_AUTHORITY");
  check(5,"bridge_coordination",typeof bridge.processWithMarion==="function"&&bridge.CANONICAL_ENDPOINT==="marion://routeMarion.primary");
  check(6,"state_spine_continuity",typeof stateSpine.createState==="function"&&typeof stateSpine.finalizeTurn==="function");
  check(7,"chat_engine_coordinator_only",typeof chatEngine.handleChat==="function"&&String(chatEngine.CHAT_ENGINE_SIGNATURE||"").includes("COORDINATOR_ONLY"));
  const adapterStatus=adapter.getStatus();
  check(8,"private_runtime_recovery_and_isolation",adapterStatus.available===true&&adapterStatus.neverReturnsRecoverable502===true&&typeof adapter.resetSession==="function",adapterStatus);

  const status=registry.getStatus();
  for(let layer=9;layer<=20;layer++)check(layer,"registry_active",!!status.layers[layer],status.layers[layer]);
  check(20,"hard_stop_enforced",status.hardStopLayer===20&&status.additionalLayerRecommended===false&&status.humanFinalAuthority===true,status);

  const sid=`functional-1-20-${Date.now()}`;
  const prompts=[
    "Hello Marion.",
    "Do a surgical autopsy on the JavaScript routing system.",
    "Go deeper.",
    "Before that, what is the business risk?",
    "Back to the routing repair.",
    "We will use the direct-adapter route.",
    "Deploy the files and test Marion afterward.",
    "The runtime passed today.",
    "Our governing objective is to complete Marion through Layer 20 without destabilizing production.",
    "What could go wrong?",
    "What are our options?",
    "Keep the current baseline.",
    "How does the technical architecture affect business and legal risk?",
    "Actually, change the goal to complete functional validation across Layers 1 through 20.",
    "The full live validation passed.",
    "This is it. Hard stop at Layer 20. Freeze the baseline."
  ];
  let last=null;
  for(const prompt of prompts){
    last=await adapter.invokePrivateRuntime({prompt,sessionId:sid,adminVerified:true,sessionVerified:true},{adminVerified:true,sessionVerified:true});
    assert.strictEqual(last.statusCode,200);assert.ok(last.reply);check("runtime",`http_200:${prompt.slice(0,42)}`,last.statusCode===200);check("runtime",`clean_reply:${prompt.slice(0,42)}`,noLeak(last.reply),last.reply);
  }
  check(9,"progression_present",!!last.conversationFlowState.progression);
  check(10,"context_pivot_present",!!last.conversationFlowState.contextPivot);
  check(11,"interaction_calibration_present",!!last.conversationFlowState.interactionCalibration);
  check(12,"outcome_awareness_present",!!last.outcomeFlowState.outcomeAwareness);
  check(13,"commitment_tracking_present",!!last.outcomeFlowState.commitmentTracking);
  check(14,"anticipatory_guidance_present",!!last.outcomeFlowState.anticipatoryGuidance);
  check(15,"objective_alignment_present",!!last.strategicFlowState.objectiveAlignment);
  check(16,"predictive_risk_present",!!last.strategicFlowState.predictiveRisk);
  check(17,"pathway_synthesis_present",!!last.strategicFlowState.pathwaySynthesis);
  check(18,"cross_domain_context_present",!!last.completionFlowState.crossDomainContext);
  check(19,"goal_realignment_present",!!last.completionFlowState.goalRealignment);
  check(20,"decision_closure_closed",last.completionFlowState.decisionClosure.closureStatus==="closed",last.completionFlowState.decisionClosure);
  check(20,"no_autonomous_execution",last.completionFlowState.automaticExecutionAllowed===false&&last.completionFlowState.additionalLayerRecommended===false,last.completionFlowState);

  const fresh=await adapter.invokePrivateRuntime({prompt:"Which objective and closure did we approve?",sessionId:`fresh-${Date.now()}`,newSession:true,adminVerified:true,sessionVerified:true},{adminVerified:true,sessionVerified:true});
  check("isolation","fresh_session_http_200",fresh.statusCode===200);
  check("isolation","fresh_session_not_closed",fresh.completionFlowState.decisionClosure.closureStatus!=="closed",fresh.completionFlowState.decisionClosure);

  const publicProjected=registry.applyToInput({prompt:"What is the final strategy?",surfaceAgent:"Nyx",publicSurface:true},{});
  check("boundary","public_private_separation",publicProjected.publicStrategicNoOp===true&&publicProjected.publicCompletionNoOp===true&&!publicProjected.strategicFlow&&!publicProjected.completionFlow,Object.keys(publicProjected));

  console.log(JSON.stringify({ok:true,version:"marion.layers1-20.functionalValidation/1.0",total:checks.length,passed:checks.filter(x=>x.pass).length,baselineLayers1to8:"validated_as_existing_runtime_invariants_not_redefined",hardStopLayer:20,checks},null,2));
})().catch(error=>{console.error(JSON.stringify({ok:false,error:error.message,stack:error.stack,checks},null,2));process.exit(1);});
