"use strict";

/**
 * Layer 9 — Conversational Progression
 * Determines where the conversation is in its working cycle without composing
 * a user-visible answer or taking route authority from Marion's existing stack.
 */
const VERSION = "marion.conversationProgression/11.0-layer9";
const CONTRACT = "nyx.marion.conversation.progression/1.0";
const MAX_RESOLVED = 12;

function isObj(value){return !!value&&typeof value==="object"&&!Array.isArray(value);}
function text(value,max=4000){try{return String(value==null?"":value).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}catch(_){return"";}}
function norm(value){return text(value).toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function first(){for(const value of arguments){const out=text(value);if(out)return out;}return"";}
function clamp(value,min,max,fallback=0){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}
function unique(items){const seen=new Set(),out=[];for(const item of Array.isArray(items)?items:[]){const value=text(item,360);const key=norm(value);if(!value||!key||seen.has(key))continue;seen.add(key);out.push(value);if(out.length>=MAX_RESOLVED)break;}return out;}
function isGreeting(prompt){return /^(?:hello|hi|hey|hiya|good\s+(?:morning|afternoon|evening))(?:\s*,?\s*marion)?[.!?]*$/i.test(text(prompt));}
function isShortFollowup(prompt){
  const t=norm(prompt);
  return /^(?:go deeper|continue|keep going|why|why first|why is that|what next|next|then what|what happens after that|what changed|what is the main risk|what should we fix first|what should be fixed first|what should i examine first|how do we validate|how should we validate|how do we test it|what could break|what could go wrong|what is the safest implementation order)$/.test(t);
}
function stageFor(prompt,previous={},options={}){
  const t=norm(prompt), direction=text(options.direction||previous.direction).toLowerCase();
  if(options.reset===true||direction==="reset")return"intake";
  if(isGreeting(prompt)||direction==="social_pause")return"social";
  if(/\b(?:what do you mean|clarify|can you explain that|which one|what exactly)\b/.test(t))return"clarification";
  if(/\b(?:go deeper|deeper analysis|root cause|surgical autopsy|forensic|critical analysis)\b/.test(t))return"deep_analysis";
  if(/\b(?:what should (?:we|be|i) (?:fix|examine)|which comes first|first priority|priority first)\b/.test(t))return"prioritization";
  if(/^(?:why|why first|why is that|why is that the first priority)\b/.test(t)||/\b(?:reason|rationale)\b/.test(t))return"rationale";
  if(/\b(?:what could break|what could go wrong|main risk|regression risk|failure mode|risk)\b/.test(t))return"risk_evaluation";
  if(/\b(?:safest implementation order|implementation order|sequence|roadmap|plan|steps in order)\b/.test(t))return"planning";
  if(/\b(?:implement|apply the fix|make the changes|update the files|patch|deploy|execution)\b/.test(t))return"implementation";
  if(/\b(?:validate|validation|test the repair|test it|verify|certify|regression test|smoke test)\b/.test(t))return"validation";
  if(/^(?:what next|next|then what|what happens after that|after that|where do we go from here)\b/.test(t)||/\b(?:closeout|completion|freeze the baseline)\b/.test(t))return"next_phase";
  if(direction==="return")return first(previous.stage,"analysis");
  if(direction==="continue"||direction==="deepen"||isShortFollowup(prompt))return first(previous.stage,"analysis");
  if(/\?$/.test(text(prompt))||/^(?:analy[sz]e|review|examine|assess|look at|tell me|give me)\b/.test(t))return"analysis";
  return previous.stage&&direction==="continue"?previous.stage:"intake";
}
function nextActionFor(stage){
  const map={
    social:"wait_for_substantive_task", intake:"establish_subject_and_outcome", clarification:"resolve_ambiguity",
    analysis:"identify_primary_finding", deep_analysis:"expose_root_mechanism", prioritization:"select_first_action",
    rationale:"explain_dependency_and_consequence", risk_evaluation:"bound_failure_modes", planning:"order_safe_execution",
    implementation:"apply_smallest_safe_change", validation:"prove_behavior_and_regression_safety", next_phase:"freeze_result_or_open_next_layer"
  };
  return map[stage]||"advance_active_task";
}
function analyzeTurn({prompt="",previous={},domain="",subject="",direction="",turnId="",reset=false}={}){
  const prev=isObj(previous)?previous:{};
  const stage=stageFor(prompt,prev,{direction,reset});
  const sameWorkingThread=!reset&&stage!=="social"&&direction!=="pivot"&&direction!=="branch"&&direction!=="start";
  const depth=stage==="social"?0:(sameWorkingThread?clamp(prev.progressionDepth,0,50,0)+1:0);
  const question=text(prompt,600);
  return {
    version:VERSION,contract:CONTRACT,layer:9,turnId:text(turnId,120),stage,
    previousStage:text(prev.stage,80),stageChanged:stage!==text(prev.stage,80),
    progressionDepth:depth,activeDomain:text(domain||prev.activeDomain,80).toLowerCase(),
    activeSubject:text(subject||prev.activeSubject,320),currentQuestion:question,
    lastAcceptedResult:text(prev.lastAcceptedResult,700),
    resolvedQuestions:unique(prev.resolvedQuestions),unresolvedQuestions:question&&stage!=="social"?[question]:[],
    nextLogicalAction:nextActionFor(stage),continuation:isShortFollowup(prompt)||direction==="continue"||direction==="deepen",
    internalOnly:true
  };
}
function commitTurn(flow={},reply=""){
  const src=isObj(flow)?flow:{};const answer=text(reply,900);
  const resolved=unique([...(Array.isArray(src.resolvedQuestions)?src.resolvedQuestions:[]),...(answer&&src.currentQuestion?[src.currentQuestion]:[])]);
  const unresolved=answer?[]:unique(src.unresolvedQuestions);
  return {...src,lastAcceptedResult:answer,resolvedQuestions:resolved,unresolvedQuestions:unresolved,committed:true,committedAt:Date.now()};
}
function projectState(flow={}){
  const src=isObj(flow)?flow:{};
  return {version:VERSION,contract:CONTRACT,stage:text(src.stage,80),progressionDepth:clamp(src.progressionDepth,0,50,0),activeDomain:text(src.activeDomain,80),activeSubject:text(src.activeSubject,320),lastAcceptedResult:text(src.lastAcceptedResult,700),resolvedQuestions:unique(src.resolvedQuestions),unresolvedQuestions:unique(src.unresolvedQuestions),nextLogicalAction:text(src.nextLogicalAction,120)};
}
module.exports={VERSION,CONTRACT,isGreeting,isShortFollowup,stageFor,nextActionFor,analyzeTurn,commitTurn,projectState};

/* MARION_NUANCE_PHASE_A_LAYER9_COHESION_V1_START */
(function marionNuancePhaseALayer9CohesionV1(){
  "use strict";
  const api=module.exports&&typeof module.exports==="object"?module.exports:null;
  if(!api||api.__marionNuancePhaseALayer9CohesionV1)return;
  const PHASE_A_VERSION="marion.conversationProgression/11.1-layer9-nuance-phase-a";
  function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
  function clean(v,max=160){if(typeof v!=="string")return"";return v.replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}
  function phaseA(n){const x=obj(n),l24=obj(x.layer24);return {state:clean(l24.currentState,60),previous:clean(l24.previousState,60),confidence:Number.isFinite(Number(l24.confidence))?Math.max(0,Math.min(1,Number(l24.confidence))):0,flags:obj(l24.controlFlags),expected:Array.isArray(l24.expectedBehaviour)?l24.expectedBehaviour.filter(v=>typeof v==="string").slice(0,8):[]};}
  function applyNuance(flow={},nuanceContext={}){
    const base=obj(flow),n=phaseA(nuanceContext);if(!n.state)return {...base,version:PHASE_A_VERSION};
    let nextAction=base.nextLogicalAction;
    if(n.state==="correction"||n.state==="disagreement")nextAction="repair_current_work_without_restarting_topic";
    else if(n.state==="clarification")nextAction="resolve_current_ambiguity_before_progression";
    else if(n.state==="validation")nextAction="confirm_result_then_identify_next_gate";
    else if(n.state==="continuation")nextAction="advance_active_task_from_last_accepted_result";
    return {...base,version:PHASE_A_VERSION,phaseAInteractionState:n.state,phaseAInteractionConfidence:n.confidence,phaseAExpectedBehaviour:n.expected,nextLogicalAction:nextAction,continuation:base.continuation===true||n.state==="continuation"||n.state==="correction",currentTurnIntentPrimary:true,nuanceMetadataPrivate:true};
  }
  const originalAnalyze=api.analyzeTurn;
  api.analyzeTurn=function(args={}){const source=obj(args),out=originalAnalyze(source);return applyNuance(out,source.nuanceContext);};
  const originalProject=api.projectState;
  api.projectState=function(value={}){const out=originalProject(value);return {...out,version:PHASE_A_VERSION,phaseAInteractionState:clean(obj(value).phaseAInteractionState,60),phaseAInteractionConfidence:Number(obj(value).phaseAInteractionConfidence||0),nextLogicalAction:clean(obj(value).nextLogicalAction,160)};};
  api.applyNuance=applyNuance;
  api.VERSION=PHASE_A_VERSION;
  api.NUANCE_PHASE_A_CONTRACT="nyx.marion.nuance.phaseA/1.0";
  api.__marionNuancePhaseALayer9CohesionV1=true;
})();
/* MARION_NUANCE_PHASE_A_LAYER9_COHESION_V1_END */

/* MARION_NUANCE_PHASE_B_ProgressionCohesion_V1_START */
(function marionNuancePhaseBProgressionCohesionV1(){
  "use strict";
  const api=module.exports&&typeof module.exports==="object"?module.exports:null;
  if(!api||api.__marionNuancePhaseBProgressionCohesionV1)return;
  const PHASE_B_CONTRACT="nyx.marion.nuance.phaseB/1.0";
  const PHASE_A_CONTRACT="nyx.marion.nuance.phaseA/1.0";
  const HARD_STOP_LAYER=26;
  function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
  function clean(v,max=240){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}catch(_){return"";}}
  function phaseB(v){const x=obj(v),candidates=[x.phaseBNuance,x.nuancePhaseBContext,x.phaseBContext,x.nuanceContext,obj(x.payload).phaseBNuance,obj(x.payload).nuancePhaseBContext];for(const n of candidates){const q=obj(n);if(q.contract===PHASE_B_CONTRACT&&q.phase==="B")return q;}return{};}
  function phaseAFrom(n){const b=obj(n),a=obj(b.phaseA);return a.contract===PHASE_A_CONTRACT?a:{};}
  function summary(n){const b=obj(n),l25=obj(b.layer25),l26=obj(b.layer26),g=obj(b.subtextGate),p=obj(b.responsePosture),a=phaseAFrom(b),l24=obj(a.layer24);return{contract:PHASE_B_CONTRACT,phase:"B",turnId:clean(b.turnId,160),interactionState:clean(l24.currentState,60),primaryStance:clean(l25.primaryStance,80),secondaryStances:Array.isArray(l25.secondaryStances)?l25.secondaryStances.slice(0,2):[],modifiers:Array.isArray(l25.modifiers)?l25.modifiers.slice(0,4):[],stanceConfidence:Number(l25.confidence||0),literalIntent:clean(l26.literalIntent,120),primaryPragmaticIntent:clean(l26.primaryPragmaticIntent,120),secondaryPragmaticIntents:Array.isArray(l26.secondaryPragmaticIntents)?l26.secondaryPragmaticIntents.slice(0,2):[],conversationControl:clean(obj(l26.conversationControl).category,100),pragmaticConfidence:Number(l26.confidence||0),subtextPolicy:clean(g.subtextPolicy,80),answerStructure:Array.isArray(p.answerStructure)?p.answerStructure.slice(0,6):[],literalIntentPreserved:g.literalIntentPreserved!==false,noUserFacingDiagnostics:true};}

  const original=api.analyzeTurn;if(typeof original==="function")api.analyzeTurn=function(input={}){const out=original.call(this,input),b=phaseB(input),s=summary(b),control=clean(s.conversationControl,100),correction=["direct_correction","indirect_correction","explicit_disagreement","polite_disagreement"].includes(s.primaryPragmaticIntent)||s.interactionState==="correction";return {...obj(out),phaseBPrimaryStance:s.primaryStance,phaseBPragmaticIntent:s.primaryPragmaticIntent,phaseBConversationControl:control,phaseBCorrectionOverride:correction,literalIntentPreserved:true,nextLogicalAction:correction?"repair_current_work":clean(obj(out).nextLogicalAction,160),conversationArchitectureHardStop:HARD_STOP_LAYER};};

  api.MARION_NUANCE_PHASE_B_CONTRACT=PHASE_B_CONTRACT;
  api.MARION_LAYER_HARD_STOP=HARD_STOP_LAYER;
  api.__marionNuancePhaseBProgressionCohesionV1=true;
})();
/* MARION_NUANCE_PHASE_B_ProgressionCohesion_V1_END */

/* MARION_ROUND2_PROGRESSION_CONTINUITY_V1_START */
(function marionRound2ProgressionContinuityV1(){
  "use strict";
  const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(!api||api.__marionRound2ProgressionContinuityV1)return;
  const VERSION="nyx.marion.round2.progressionContinuity/1.0",H=28;
  function text(v){try{return String(v==null?"":v).replace(/\s+/g," ").trim()}catch(_){return""}}
  function matched(q){const n=text(q).toLowerCase();return /(?:continue from (?:your|the) previous answer|observe[–—-]analy[sz]e[–—-]recommend boundary)/i.test(n)&&/(?:why|important|separat(?:e|ing)|three stages)/i.test(n)}
  const oldShort=api.isShortFollowup;api.isShortFollowup=function(q){return matched(q)||(typeof oldShort==="function"&&oldShort.call(this,q))};
  const oldAnalyze=api.analyzeTurn;api.analyzeTurn=function(input={}){const out=oldAnalyze.call(this,input);if(!matched(input.prompt))return out;return{...out,stage:"rationale",stageChanged:out.stage!=="rationale",continuation:true,activeSubject:"observe-analyze-recommend boundary",currentQuestion:text(input.prompt).slice(0,600),nextLogicalAction:"explain_dependency_and_consequence",conversationArchitectureHardStop:H,internalOnly:true}}
  api.MARION_ROUND2_PROGRESSION_CONTINUITY_VERSION=VERSION;api.MARION_LAYER_HARD_STOP=H;api.__marionRound2ProgressionContinuityV1=true;
})();
/* MARION_ROUND2_PROGRESSION_CONTINUITY_V1_END */

/* MARION_CONTINUATION_STATE_EXECUTION_V2_START */
(function marionContinuationStateExecutionV2(){
  "use strict";
  const api=module.exports&&typeof module.exports==="object"?module.exports:null;
  if(!api||api.__marionContinuationStateExecutionV2)return;
  const VERSION="nyx.marion.continuationStateExecution/2.0",HARD_STOP=28;
  function clean(v,max=800){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max)}catch(_){return""}}
  function match(q){const t=clean(q).toLowerCase();return /(?:continue from (?:your|the) previous answer|you mentioned|previous answer)/i.test(t)&&/observe[–—-]analy[sz]e[–—-]recommend(?:\s+boundary)?/i.test(t)&&/(?:why|important|separat(?:e|ing)|stages?)/i.test(t)}
  const originalAnalyze=api.analyzeTurn;
  api.analyzeTurn=function(input={}){
    const q=clean(input&&input.prompt);
    if(match(q))return{version:VERSION,contract:api.CONTRACT||"nyx.marion.conversation.progression/1.0",layer:9,turnId:clean(input&&input.turnId,120),stage:"rationale",previousStage:clean(input&&input.previous&&input.previous.stage,80),stageChanged:true,progressionDepth:Math.min(50,Math.max(1,Number(input&&input.previous&&input.previous.progressionDepth||0)+1)),activeDomain:clean(input&&input.domain||"ai",80).toLowerCase(),activeSubject:"observe-analyze-recommend boundary",currentQuestion:q,lastAcceptedResult:clean(input&&input.previous&&input.previous.lastAcceptedResult,700),resolvedQuestions:[],unresolvedQuestions:[q],nextLogicalAction:"explain_dependency_and_consequence",continuation:true,singlePass:true,internalOnly:true,conversationArchitectureHardStop:HARD_STOP};
    return typeof originalAnalyze==="function"?originalAnalyze.call(this,input):{};
  };
  const oldShort=api.isShortFollowup;
  api.isShortFollowup=function(q){return match(q)||(typeof oldShort==="function"&&oldShort.call(this,q))};
  api.MARION_CONTINUATION_STATE_EXECUTION_VERSION=VERSION;
  api.MARION_LAYER_HARD_STOP=HARD_STOP;
  api.__marionContinuationStateExecutionV2=true;
})();
/* MARION_CONTINUATION_STATE_EXECUTION_V2_END */

/* MARION_ROUND2_2_TO_2_5_PROGRESSIVE_REASONING_V1_START */
(function marionRound2UnifiedProgressiveReasoningV1(){
  "use strict";
  const api=module.exports&&typeof module.exports==="object"?module.exports:null;
  if(!api||api.__marionRound2UnifiedProgressiveReasoningV1)return;
  const VERSION="nyx.marion.round2.unifiedProgressiveReasoning/1.0",HARD_STOP=28;
  function clean(v,max=800){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max)}catch(_){return""}}
  function classify(q){const t=clean(q).toLowerCase();
    if(/(?:suppose|if) i disagreed with one of your recommendations|how should you respond/.test(t))return{test:"2.2",stage:"adaptive_reasoning",subject:"recommendation disagreement",action:"explain_evidence_reassess_and_preserve_user_authority"};
    if(/direct access to sensors tomorrow|what would you refuse to do/.test(t))return{test:"2.3",stage:"boundary_reasoning",subject:"sensor access boundaries",action:"state_prohibited_actions_and_required_oversight"};
    if(/role (?:inside|within) the sandblast ecosystem|how would you describe your role/.test(t))return{test:"2.4",stage:"role_continuity",subject:"Marion role in Sandblast",action:"describe_advisory_coordination_role_without_agency_claims"};
    if(/conversation continues for several hours|keep the discussion productive without becoming repetitive/.test(t))return{test:"2.5",stage:"long_session_stability",subject:"long-session conversational productivity",action:"track_objectives_and_prevent_repetition"};
    return null;}
  const original=api.analyzeTurn;
  api.analyzeTurn=function(input={}){const c=classify(input&&input.prompt);if(!c)return typeof original==="function"?original.call(this,input):{};const p=input&&input.previous&&typeof input.previous==="object"?input.previous:{};return{version:VERSION,contract:api.CONTRACT||"nyx.marion.conversation.progression/1.0",layer:9,turnId:clean(input.turnId,120),stage:c.stage,previousStage:clean(p.stage,80),stageChanged:c.stage!==clean(p.stage,80),progressionDepth:Math.min(50,Math.max(1,Number(p.progressionDepth||0)+1)),activeDomain:"ai",activeSubject:c.subject,currentQuestion:clean(input.prompt,600),lastAcceptedResult:clean(p.lastAcceptedResult,700),resolvedQuestions:Array.isArray(p.resolvedQuestions)?p.resolvedQuestions.slice(0,12):[],unresolvedQuestions:[clean(input.prompt,600)],nextLogicalAction:c.action,continuation:true,singlePass:true,round2Test:c.test,internalOnly:true,conversationArchitectureHardStop:HARD_STOP,executionAuthorized:false};};
  api.classifyRound2UnifiedPrompt=classify;
  api.MARION_ROUND2_UNIFIED_PROGRESSIVE_REASONING_VERSION=VERSION;api.MARION_LAYER_HARD_STOP=HARD_STOP;api.__marionRound2UnifiedProgressiveReasoningV1=true;
})();
/* MARION_ROUND2_2_TO_2_5_PROGRESSIVE_REASONING_V1_END */
