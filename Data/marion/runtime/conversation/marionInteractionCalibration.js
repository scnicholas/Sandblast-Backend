"use strict";

/**
 * Layer 11 — Adaptive Interaction Calibration
 * Produces internal response-shaping metadata. It does not invent semantic
 * content and does not replace Marion's composer or final authority.
 */
const VERSION="marion.interactionCalibration/11.0-layer11";
const CONTRACT="nyx.marion.conversation.interactionCalibration/1.0";
function isObj(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function text(v,max=2400){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}catch(_){return"";}}
function norm(v){return text(v).toLowerCase().replace(/[’‘]/g,"'");}
function first(){for(const v of arguments){const t=text(v);if(t)return t;}return"";}
function clamp01(v,f=0){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):f;}
function emotionSignals(emotion){const e=isObj(emotion)?emotion:{};const s=isObj(e.state)?e.state:e;const support=isObj(s.support)?s.support:{};const guard=isObj(s.guard)?s.guard:{};return {emotion:first(s.primary_emotion,s.emotion,s.label,"neutral").toLowerCase(),urgency:clamp01(s.urgency||s.intensity||0),steady:/steady|calm/i.test(first(support.tone)),escalation:guard.escalation_needed===true};}
function analyzeTurn({prompt="",previous={},stage="",direction="",domain="",emotion={}}={}){
  const p=norm(prompt),prev=isObj(previous)?previous:{},es=emotionSignals(emotion);
  const direct=/\b(?:direct answer|just answer|be direct|straight answer|bottom line|no preamble|concise|briefly|keep it short)\b/.test(p);
  const deep=/\b(?:go deeper|deep dive|surgical autopsy|critical analysis|forensic|comprehensive|in detail|thorough)\b/.test(p)||stage==="deep_analysis";
  const simplify=/\b(?:plain english|simple terms|simplify|explain simply|without jargon)\b/.test(p);
  const frustration=/\b(?:frustrated|again|still not|keeps happening|we keep|same problem|not working|failed again|going in circles)\b/.test(p);
  const urgency=/\b(?:urgent|immediately|right now|critical|asap|today|before deployment|production down)\b/.test(p)||es.urgency>=0.65;
  const decision=/\b(?:what do you think|recommend|which should|should we|best option|make the call|your assessment)\b/.test(p)||stage==="prioritization";
  const technical=/\b(?:javascript|node|runtime|router|bridge|composer|envelope|adapter|module|api|http|code|index\.js|state)\b/.test(p)||domain==="technical";
  const resetProfile=stage==="social"||direction==="pivot"||direction==="branch";
  let responseLength=stage==="social"?"short":direct?"short":deep?"long":(resetProfile?"medium":first(prev.responseLength,"medium"));
  let depth=stage==="social"?"standard":deep?"deep":direct?"focused":(resetProfile?"standard":first(prev.depth,"standard"));
  let density=stage==="social"?"low":simplify?"low":technical?(deep?"high":"medium"):(resetProfile?"low":first(prev.technicalDensity,"low"));
  const warmth=frustration||es.emotion!=="neutral"?"steady":first(resetProfile?"":prev.warmth,"balanced");
  const directness=stage==="social"?"medium":direct||urgency||decision?"high":first(resetProfile?"":prev.directness,"medium");
  const confidenceRequired=decision||/\b(?:are you sure|confidence|certain)\b/.test(p);
  const responseBudget=responseLength==="short"?{sentences:4,words:140}:responseLength==="long"?{sentences:16,words:900}:{sentences:9,words:480};
  const directives=[];
  if(directness==="high")directives.push("lead_with_conclusion");
  if(deep)directives.push("show_mechanism_dependencies_and_risks");
  if(simplify)directives.push("use_plain_language");
  if(frustration)directives.push("acknowledge_once_then_resolve_root_cause");
  if(decision)directives.push("provide_recommendation_not_only_options");
  if(direction==="return")directives.push("signal_natural_return_to_previous_thread");
  if(direction==="pivot"||direction==="branch")directives.push("acknowledge_direction_change_without_exposing_state_metadata");
  return {version:VERSION,contract:CONTRACT,layer:11,responseLength,depth,technicalDensity:density,directness,warmth,urgency:urgency?"high":"normal",decisionRequired:decision,confidenceRequired,responseBudget,toneProfile:frustration?"calm_exacting":urgency?"focused_urgent":"natural_professional",acknowledgementBudget:frustration?1:0,recommendationMode:decision?"decisive":"conditional",directives,internalOnly:true};
}
function composerDirective(profile={}){const p=isObj(profile)?profile:{};const parts=[];if(p.directness==="high")parts.push("Lead with the conclusion.");if(p.depth==="deep")parts.push("Explain the mechanism, dependencies, risks, and concrete next action.");if(p.technicalDensity==="low")parts.push("Use plain language and define necessary technical terms.");if(p.decisionRequired)parts.push("Give a clear recommendation and rationale.");if(p.acknowledgementBudget===1)parts.push("Acknowledge frustration once, briefly, then move to root-cause resolution.");return parts.join(" ");}
function projectState(profile={}){const p=isObj(profile)?profile:{};return {version:VERSION,contract:CONTRACT,responseLength:text(p.responseLength,40),depth:text(p.depth,40),technicalDensity:text(p.technicalDensity,40),directness:text(p.directness,40),warmth:text(p.warmth,40),urgency:text(p.urgency,40),decisionRequired:p.decisionRequired===true,confidenceRequired:p.confidenceRequired===true,responseBudget:isObj(p.responseBudget)?p.responseBudget:{},toneProfile:text(p.toneProfile,80),directives:Array.isArray(p.directives)?p.directives.map(x=>text(x,100)).filter(Boolean).slice(0,8):[]};}
module.exports={VERSION,CONTRACT,emotionSignals,analyzeTurn,composerDirective,projectState};

/* MARION_NUANCE_PHASE_A_LAYER11_COHESION_V1_START */
(function marionNuancePhaseALayer11CohesionV1(){
  "use strict";
  const api=module.exports&&typeof module.exports==="object"?module.exports:null;
  if(!api||api.__marionNuancePhaseALayer11CohesionV1)return;
  const PHASE_A_VERSION="marion.interactionCalibration/11.1-layer11-nuance-phase-a";
  function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
  function clean(v,max=160){return typeof v==="string"?v.replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max):"";}
  function uniq(values,max=12){const out=[];for(const value of Array.isArray(values)?values:[]){const v=clean(value,120);if(v&&!out.includes(v))out.push(v);if(out.length>=max)break;}return out;}
  function applyNuance(profile={},nuanceContext={}){
    const base=obj(profile),n=obj(nuanceContext),l22=obj(n.layer22),l23=obj(n.layer23),l24=obj(n.layer24),candidate=obj(l22.primaryCandidate),state=clean(l24.currentState,60),emotion=clean(candidate.state,60),band=clean(l23.confidenceBand,40),policy=clean(l23.responsePolicy,80),allowed=obj(l23.allowedAdjustments),directives=uniq(base.directives);
    if(state==="correction"||state==="disagreement")directives.push("acknowledge_distinction_once_then_repair_current_work");
    if(state==="clarification")directives.push("resolve_ambiguity_before_advancing");
    if(state==="validation")directives.push("confirm_result_then_name_next_gate");
    if(policy==="neutral_supportive")directives.push("do_not_name_an_unconfirmed_emotion");
    if(l23.explicitEmotionReferenceAllowed!==true)directives.push("keep_emotional_acknowledgement_implicit");
    let warmth=base.warmth,tone=base.toneProfile,ack=Number(base.acknowledgementBudget||0),responseLength=base.responseLength;
    if(allowed.warmth===true&&band!=="low")warmth="steady";
    if(state==="correction"||state==="disagreement"){tone="calm_corrective";ack=Math.max(ack,1);}
    if(state==="clarification")tone="calm_clarifying";
    if(emotion==="overwhelmed"&&band!=="low")responseLength="short";
    return {...base,version:PHASE_A_VERSION,responseLength,warmth,toneProfile:tone,acknowledgementBudget:Math.min(1,ack),directives:uniq(directives),phaseAInteractionState:state,phaseAEmotionalCandidate:emotion,phaseAConfidenceBand:band,phaseAResponsePolicy:policy,explicitEmotionReferenceAllowed:l23.explicitEmotionReferenceAllowed===true,currentTurnIntentPrimary:true,nuanceMetadataPrivate:true};
  }
  const originalAnalyze=api.analyzeTurn;
  api.analyzeTurn=function(args={}){const source=obj(args),out=originalAnalyze(source);return applyNuance(out,source.nuanceContext);};
  const originalProject=api.projectState;
  api.projectState=function(value={}){const out=originalProject(value),v=obj(value);return {...out,version:PHASE_A_VERSION,phaseAInteractionState:clean(v.phaseAInteractionState,60),phaseAConfidenceBand:clean(v.phaseAConfidenceBand,40),phaseAResponsePolicy:clean(v.phaseAResponsePolicy,80),explicitEmotionReferenceAllowed:v.explicitEmotionReferenceAllowed===true};};
  const originalDirective=api.composerDirective;
  api.composerDirective=function(profile={}){const base=originalDirective(profile),p=obj(profile),extra=[];if(p.phaseAInteractionState==="correction")extra.push("Acknowledge the distinction once, preserve the active task, and repair the current work.");if(p.explicitEmotionReferenceAllowed===false)extra.push("Do not state an emotion as fact.");return [base,...extra].filter(Boolean).join(" ");};
  api.applyNuance=applyNuance;
  api.VERSION=PHASE_A_VERSION;
  api.NUANCE_PHASE_A_CONTRACT="nyx.marion.nuance.phaseA/1.0";
  api.__marionNuancePhaseALayer11CohesionV1=true;
})();
/* MARION_NUANCE_PHASE_A_LAYER11_COHESION_V1_END */

/* MARION_NUANCE_PHASE_B_InteractionCalibrationCohesion_V1_START */
(function marionNuancePhaseBInteractionCalibrationCohesionV1(){
  "use strict";
  const api=module.exports&&typeof module.exports==="object"?module.exports:null;
  if(!api||api.__marionNuancePhaseBInteractionCalibrationCohesionV1)return;
  const PHASE_B_CONTRACT="nyx.marion.nuance.phaseB/1.0";
  const PHASE_A_CONTRACT="nyx.marion.nuance.phaseA/1.0";
  const HARD_STOP_LAYER=26;
  function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
  function clean(v,max=240){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}catch(_){return"";}}
  function phaseB(v){const x=obj(v),candidates=[x.phaseBNuance,x.nuancePhaseBContext,x.phaseBContext,x.nuanceContext,obj(x.payload).phaseBNuance,obj(x.payload).nuancePhaseBContext];for(const n of candidates){const q=obj(n);if(q.contract===PHASE_B_CONTRACT&&q.phase==="B")return q;}return{};}
  function phaseAFrom(n){const b=obj(n),a=obj(b.phaseA);return a.contract===PHASE_A_CONTRACT?a:{};}
  function summary(n){const b=obj(n),l25=obj(b.layer25),l26=obj(b.layer26),g=obj(b.subtextGate),p=obj(b.responsePosture),a=phaseAFrom(b),l24=obj(a.layer24);return{contract:PHASE_B_CONTRACT,phase:"B",turnId:clean(b.turnId,160),interactionState:clean(l24.currentState,60),primaryStance:clean(l25.primaryStance,80),secondaryStances:Array.isArray(l25.secondaryStances)?l25.secondaryStances.slice(0,2):[],modifiers:Array.isArray(l25.modifiers)?l25.modifiers.slice(0,4):[],stanceConfidence:Number(l25.confidence||0),literalIntent:clean(l26.literalIntent,120),primaryPragmaticIntent:clean(l26.primaryPragmaticIntent,120),secondaryPragmaticIntents:Array.isArray(l26.secondaryPragmaticIntents)?l26.secondaryPragmaticIntents.slice(0,2):[],conversationControl:clean(obj(l26.conversationControl).category,100),pragmaticConfidence:Number(l26.confidence||0),subtextPolicy:clean(g.subtextPolicy,80),answerStructure:Array.isArray(p.answerStructure)?p.answerStructure.slice(0,6):[],literalIntentPreserved:g.literalIntentPreserved!==false,noUserFacingDiagnostics:true};}

  const original=api.analyzeTurn;if(typeof original==="function")api.analyzeTurn=function(input={}){const out=original.call(this,input),b=phaseB(input),s=summary(b),posture=obj(b.responsePosture);return {...obj(out),phaseBPrimaryStance:s.primaryStance,phaseBSecondaryStances:s.secondaryStances,phaseBModifiers:s.modifiers,phaseBPragmaticIntent:s.primaryPragmaticIntent,responsePosture:{directness:Number(posture.directness||0),warmth:Number(posture.warmth||0),challenge:Number(posture.challenge||0),reassurance:Number(posture.reassurance||0),humourAllowed:posture.humourAllowed===true,answerStructure:Array.isArray(posture.answerStructure)?posture.answerStructure.slice(0,6):[]},stanceAuthority:"marionConversationalStanceResolver",pragmaticIntentAuthority:"marionPragmaticIntentResolver",duplicateStanceAuthority:false,literalIntentPreserved:true};};
  const directive=api.composerDirective;if(typeof directive==="function")api.composerDirective=function(value={}){const base=clean(directive.call(this,value),2400),v=obj(value),parts=[base];if(v.phaseBPrimaryStance)parts.push(`Use the ${clean(v.phaseBPrimaryStance,80)} stance without changing facts, route, approval, or execution authority.`);if(v.phaseBPragmaticIntent)parts.push(`Address ${clean(v.phaseBPragmaticIntent,120)} while preserving the literal request.`);return parts.filter(Boolean).join(" ");};

  api.MARION_NUANCE_PHASE_B_CONTRACT=PHASE_B_CONTRACT;
  api.MARION_LAYER_HARD_STOP=HARD_STOP_LAYER;
  api.__marionNuancePhaseBInteractionCalibrationCohesionV1=true;
})();
/* MARION_NUANCE_PHASE_B_InteractionCalibrationCohesion_V1_END */


/* MARION_LAYERS_27_29_INTERACTION_CALIBRATION_V1_START */
(function marionLayers2729InteractionCalibrationV1(){"use strict";const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(!api||api.__marionLayers2729InteractionCalibrationV1)return;function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}function clamp(v){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;}const original=api.analyzeTurn;if(typeof original==="function")api.analyzeTurn=function(input={}){const out=obj(original.call(this,input)),m=obj(obj(input).metacognition),confidence=clamp(m.confidence),gap=m.knowledgeGap===true;return{...out,cognitiveCalibration:{confidence,knowledgeGap:gap,askClarifyingQuestion:gap&&confidence<0.45,reduceAssertion:confidence<0.55,internalOnly:true},semanticAuthorityChanged:false,layer29Integrated:true};};api.MARION_LAYER_HARD_STOP=29;api.__marionLayers2729InteractionCalibrationV1=true;})();
/* MARION_LAYERS_27_29_INTERACTION_CALIBRATION_V1_END */

/* MARION_ROUND3_COGNITIVE_RESILIENCE_COHESION_V1_START */
(function(){"use strict";const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(!api||api.__marionRound3CognitiveResilienceCohesionV1)return;const VERSION="nyx.marion.round3.interactionCalibration/1.0";api.MARION_ROUND3_COGNITIVE_RESILIENCE_VERSION=VERSION;api.MARION_LAYER_HARD_STOP=28;api.MARION_CURRENT_EVIDENCE_WINS=true;api.MARION_ASSUMPTION_DISCLOSURE_REQUIRED=true;api.MARION_EXECUTION_AUTHORIZED=false;api.__marionRound3CognitiveResilienceCohesionV1=true;})();
/* MARION_ROUND3_COGNITIVE_RESILIENCE_COHESION_V1_END */
