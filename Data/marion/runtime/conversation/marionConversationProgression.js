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
