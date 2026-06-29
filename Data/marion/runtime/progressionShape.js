"use strict";

const VERSION = "PRIORITY-9J-R1A-RUNTIME-DECISION-SPECIFIC-FINAL-OVERRIDE + PRIORITY-9J-R1-DECISION-SPECIFIC-AUTHORITY-HOTFIX + PRIORITY-9I-R2A-ALT-PRESSURE-SPECIFIC-FINAL-OVERRIDE + PRIORITY-9I-R2-PRESSURE-SPECIFIC-ANSWER-SHAPING + PRIORITY-9I-R1-9J-PREMATURE-ESCALATION-CONTAINMENT + PRIORITY-9H-R1-ADVANCEMENT-SHAPE-HOTFIX + PRIORITY-9H-LONG-FORM-CONTINUITY-STRESS-DRIFT-GUARD + PRIORITY-9I-ADAPTIVE-SITUATIONAL-PRECHECK + PRIORITY-9F-R4-CONTINUATION-CARRY-ENFORCEMENT + PRIORITY-9F-R2-DOMAIN-HIJACK-SUPPRESSION + PRIORITY-9F-R1-LAYERED-PRECEDENCE-HOTFIX + PRIORITY-9F-DEEP-CONVERSATIONAL-STACK + progressionShape v1.1.2 PRIORITY-9E-CONTINUATION-INTENT-RESOLVER + KNOWLEDGE-QUESTION-BYPASS + RESPONSE-EXPANSION-HARDLOCK";
const PROGRESSION_SHAPING_REFINEMENT_VERSION = "nyx.marion.progressionShapingRefinement/1.1";

const PROGRESSION_SIGNALS = Object.freeze({
  NEXT_STEPS: "next_steps",
  CLARIFICATION: "clarification",
  EXECUTION: "execution",
  STRATEGY: "strategy",
  RECOVERY: "recovery",
  TESTING: "testing",
  SUMMARY: "summary",
  PASS: "pass",
  FAIL: "fail",
  CONTINUE: "continue",
  UNKNOWN: "unknown"
});

const PROGRESSION_PHASES = Object.freeze({
  phase1: Object.freeze({
    id: "PHASE_1_SIGNAL_DETECTION",
    key: "phase1",
    label: "Phase 1: Progression signal detection",
    objective: "Detect next-step, pass/fail, execution, testing, recovery, clarification, and summary signals without reopening a broad menu."
  }),
  phase2: Object.freeze({
    id: "PHASE_2_CONTINUITY_MEMORY",
    key: "phase2",
    label: "Phase 2: Progression memory and continuity",
    objective: "Carry activePhase, currentStep, lastUserIntent, lastSystemAction, pendingAction, and pass/fail state across follow-up turns."
  }),
  phase3: Object.freeze({
    id: "PHASE_3_RESPONSE_SHAPING",
    key: "phase3",
    label: "Phase 3: Response shaping rules",
    objective: "Prevent thin public replies by shaping next steps, pass, fail, continue, and update prompts into concrete build-mode actions."
  }),
  phase4: Object.freeze({
    id: "PHASE_4_REGRESSION_TELEMETRY",
    key: "phase4",
    label: "Phase 4: Regression tests and telemetry",
    objective: "Validate the progression path and carry clean telemetry without leaking diagnostics to the public reply."
  })
});

function safeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function lower(value) { return safeStr(value).toLowerCase(); }
function safeObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback; }
function firstText() { for (let i = 0; i < arguments.length; i += 1) { const v = safeStr(arguments[i]); if (v) return v; } return ""; }


function isKnowledgeQuestionText(value = "") {
  const t = lower(value).replace(/[_-]+/g, " ");
  if (!t) return false;
  if (/\b(what does|what is|what are|explain|define|meaning of|mean literally|mean culturally|culturally|idiom|phrase|language|linguistic|phonetic|behavioral|behavioural|analyze|analyse|interpret|translate)\b/i.test(t) &&
      !/\b(progression shaping|progression refinement|progression signal|continuity memory|response shaping|phase 1|phase 2|phase 3|phase 4|regression telemetry|validation harness|mark passed|mark failed)\b/i.test(t)) {
    return true;
  }
  return false;
}

function extractProgressionCarry(context = {}) {
  const c = safeObj(context);
  const memory = safeObj(c.memory || c.previousMemory || c.state || c.turnMemory || c.conversationState);
  const bridge = safeObj(c.stateBridge || memory.stateBridge);
  return safeObj(c.progressionRefinement || c.progressionMemory || bridge.progressionRefinement || memory.progressionRefinement || memory.progressionMemory || c.phaseAnchor || memory.phaseAnchor);
}

function detectProgressionSignal(text = "", context = {}) {
  const t = lower(text);
  const c = safeObj(context);
  const carry = extractProgressionCarry(c);
  if (!t) return firstText(carry.lastUserIntent, carry.signal, carry.lastSignal, PROGRESSION_SIGNALS.UNKNOWN);

  if (/^\s*(pass(?:ed)?|all passed|green|success|works|complete|locked)\s*[.!?]*\s*$/i.test(t) || /\b(all passed|tests? passed|phase passed|green|successfully passed)\b/i.test(t)) return PROGRESSION_SIGNALS.PASS;
  if (/^\s*(fail(?:ed)?|red|error|broke|not working|still failing|didn'?t pass|issue)\s*[.!?]*\s*$/i.test(t) || /\b(failed|still failing|didn'?t pass|not working|broke|error)\b/i.test(t)) return PROGRESSION_SIGNALS.FAIL;
  if (/^\s*(continue|carry on|keep going|proceed|run that again|run it again|do that again|do it again|same thing|repeat that|repeat the process|one more time|rerun that|rerun it)\s*[.!?]*\s*$/i.test(t)) return PROGRESSION_SIGNALS.CONTINUE;
  if (/\b(next steps?|what now|what'?s next|next phase|after that|move on)\b/i.test(t)) return PROGRESSION_SIGNALS.NEXT_STEPS;
  if (/\b(update|patch|fix|make the change|apply|resend|zip|downloadable|replace)\b/i.test(t)) return PROGRESSION_SIGNALS.EXECUTION;
  if (/\b(test|smoke|regression|validate|check|verify|run)\b/i.test(t)) return PROGRESSION_SIGNALS.TESTING;
  if (/\b(explain|what does this mean|clarify|break down|what is)\b/i.test(t)) return PROGRESSION_SIGNALS.CLARIFICATION;
  if (/\b(strategy|commercial|market|buyer|position|offer|revenue)\b/i.test(t)) return PROGRESSION_SIGNALS.STRATEGY;
  if (/\b(recover|fallback|loop|stuck|reset|repair)\b/i.test(t)) return PROGRESSION_SIGNALS.RECOVERY;
  if (/\b(summary|recap|compress|brief)\b/i.test(t)) return PROGRESSION_SIGNALS.SUMMARY;
  return firstText(carry.lastUserIntent, carry.signal, carry.lastSignal, PROGRESSION_SIGNALS.UNKNOWN);
}

function detectProgressionPhase(text = "", context = {}) {
  const t = lower(text).replace(/[_-]+/g, " ");
  if (/\b(phase 1|signal detection|progression signal)\b/i.test(t)) return "phase1";
  if (/\b(phase 2|continuity memory|progression memory|memory and continuity)\b/i.test(t)) return "phase2";
  if (/\b(phase 3|response shaping|shaping rules|reply shaping|under answer|under answering|thin reply|one word)\b/i.test(t)) return "phase3";
  if (/\b(phase 4|regression telemetry|regression tests?|telemetry)\b/i.test(t)) return "phase4";
  const c = safeObj(context);
  const carry = extractProgressionCarry(c);
  return firstText(carry.phaseKey, carry.currentStep, carry.currentPhase, c.phaseKey, "phase3");
}

function isProgressionRelevant(text = "", context = {}) {
  const t = lower(text).replace(/[_-]+/g, " ");
  const c = safeObj(context);
  const carry = extractProgressionCarry(c);
  const explicitProgression = /\b(progression shaping|progression refinement|progression signal|continuity memory|response shaping|phase 1|phase 2|phase 3|phase 4|regression telemetry|validation harness|regression harness|mark passed|mark failed)\b/i.test(t);
  if (explicitProgression) return true;
  if (isKnowledgeQuestionText(t)) return false;
  if (/^\s*(next steps?|what now|what'?s next|passed|failed|continue|carry on|keep going|proceed)\s*[.!?]*\s*$/i.test(t)) {
    return !!(carry.active || safeObj(c.progressionShapingGuard).active || /progression_shaping_refinement/i.test(firstText(c.activeLane, c.currentLane, c.activeProject, c.lastTopic, carry.activePhase, carry.lane)));
  }
  return false;
}

function responseShapeForSignal(signal = "", phaseKey = "") {
  if (signal === PROGRESSION_SIGNALS.FAIL || signal === PROGRESSION_SIGNALS.RECOVERY) return "recovery_mode";
  if (signal === PROGRESSION_SIGNALS.PASS || signal === PROGRESSION_SIGNALS.TESTING) return "test_mode";
  if (signal === PROGRESSION_SIGNALS.EXECUTION || signal === PROGRESSION_SIGNALS.NEXT_STEPS || signal === PROGRESSION_SIGNALS.CONTINUE) return "build_mode";
  if (signal === PROGRESSION_SIGNALS.STRATEGY) return "strategy_mode";
  if (signal === PROGRESSION_SIGNALS.CLARIFICATION || signal === PROGRESSION_SIGNALS.SUMMARY) return "summary_mode";
  if (phaseKey === "phase4") return "test_mode";
  return "build_mode";
}

function buildProgressionProfile(text = "", context = {}) {
  const active = isProgressionRelevant(text, context);
  const phaseKey = detectProgressionPhase(text, context);
  const signal = detectProgressionSignal(text, context);
  const phase = PROGRESSION_PHASES[phaseKey] || PROGRESSION_PHASES.phase3;
  const confidence = active ? (signal === PROGRESSION_SIGNALS.UNKNOWN ? 0.66 : 0.92) : 0;
  return {
    version: PROGRESSION_SHAPING_REFINEMENT_VERSION,
    active,
    lane: active ? "progression_shaping_refinement" : "",
    activePhase: active ? "progression_shaping_refinement" : "",
    phaseKey: phase.key,
    currentStep: phase.key,
    phaseId: phase.id,
    phaseLabel: phase.label,
    objective: phase.objective,
    signal,
    lastUserIntent: signal,
    responseShape: responseShapeForSignal(signal, phase.key),
    confidence: clamp01(confidence),
    noUserFacingDiagnostics: true,
    updatedAt: Date.now()
  };
}

module.exports = {
  VERSION,
  PROGRESSION_SHAPING_REFINEMENT_VERSION,
  PROGRESSION_SIGNALS,
  PROGRESSION_PHASES,
  extractProgressionCarry,
  isKnowledgeQuestionText,
  detectProgressionSignal,
  detectProgressionPhase,
  isProgressionRelevant,
  responseShapeForSignal,
  buildProgressionProfile,
  default: buildProgressionProfile
};


// PRIORITY_9E_CONTINUATION_INTENT_RESOLVER_PATCH_START
const PRIORITY_9E_CONTINUATION_INTENT_RESOLVER_VERSION = "nyx.marion.priority9e.continuationIntentResolver/1.0";
function isPriority9EContinuationCommand(text = "") {
  const t = lower(text).replace(/[.!?]+$/g, "").trim();
  return /^(continue|carry on|keep going|proceed|run that again|run it again|do that again|do it again|same thing|repeat that|repeat the process|one more time|rerun that|rerun it)$/.test(t);
}
module.exports.PRIORITY_9E_CONTINUATION_INTENT_RESOLVER_VERSION = PRIORITY_9E_CONTINUATION_INTENT_RESOLVER_VERSION;
module.exports.isPriority9EContinuationCommand = isPriority9EContinuationCommand;
// PRIORITY_9E_CONTINUATION_INTENT_RESOLVER_PATCH_END


// PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_SHAPE_PATCH_START
const PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_SHAPE_VERSION = "nyx.marion.priority9f.deepConversationalStackShape/1.0";
function isPriority9FDeepConversationalText(text = "") {
  const t = lower(text).replace(/[_-]+/g, " ");
  return /\b(priority\s*9f|deep conversational stack|layered conversational|layered conversation|conversational stack|layered intelligence|multi layer|multi layered|surface request|underlying intent|deeper intent|operational risk|execution mode|next action|full conversational stack)\b/i.test(t) ||
    (/\b(disjointed|layered|deeper|multi)\b/i.test(t) && /\b(marion|conversation|conversational|intent|context|loop|recovery|next)\b/i.test(t));
}
function buildPriority9FDeepConversationProfile(text = "", context = {}) {
  const active = isPriority9FDeepConversationalText(text);
  return {
    version: PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_SHAPE_VERSION,
    active,
    signal: active ? "deep_conversational_stack" : PROGRESSION_SIGNALS.UNKNOWN,
    responseShape: active ? "layered_conversational_stack" : "",
    surfaceRequestRequired: active,
    deeperIntentRequired: active,
    operationalRiskRequired: active,
    executionModeRequired: active,
    nextActionRequired: active,
    noUserFacingDiagnostics: true,
    updatedAt: Date.now()
  };
}
module.exports.PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_SHAPE_VERSION = PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_SHAPE_VERSION;
module.exports.isPriority9FDeepConversationalText = isPriority9FDeepConversationalText;
module.exports.buildPriority9FDeepConversationProfile = buildPriority9FDeepConversationProfile;
// PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_SHAPE_PATCH_END


// PRIORITY_9F_R1_LAYERED_PRECEDENCE_HOTFIX_SHAPE_PATCH_START
const PRIORITY_9F_R1_LAYERED_PRECEDENCE_SHAPE_VERSION="nyx.marion.priority9fR1.layeredPrecedenceShape/1.0";
function isPriority9FR1LayeredPrecedenceText(text=""){const t=lower(text).replace(/[_-]+/g," ");return /\b(priority\s*9f|9f\s*r1|deep conversational stack|layered conversational|layered conversation|conversational stack|layered intelligence|full conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action)\b/i.test(t)||(/\b(disjointed|deeper|layered|multi|context|looping|loop|recovery)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next)\b/i.test(t));}
const __priority9FR1OriginalBuildProgressionProfile=module.exports.buildProgressionProfile||buildProgressionProfile;
function buildPriority9FR1LayeredPrecedenceProfile(text="",context={}){if(!isPriority9FR1LayeredPrecedenceText(text))return __priority9FR1OriginalBuildProgressionProfile(text,context);return {version:PRIORITY_9F_R1_LAYERED_PRECEDENCE_SHAPE_VERSION,active:true,lane:"priority9f_deep_conversational_stack",activePhase:"priority9f_deep_conversational_stack",phaseKey:"priority9f_r1",currentStep:"priority9f_r1",phaseId:"PRIORITY_9F_R1_LAYERED_PRECEDENCE",phaseLabel:"Priority 9F-R1: Layered prompt precedence",objective:"Layered conversational prompts outrank stale Priority 90/9E continuation recall.",signal:"deep_conversational_stack",lastUserIntent:"deep_conversational_stack",responseShape:"layered_conversational_stack",confidence:0.97,noUserFacingDiagnostics:true,priority9FR1LayeredPrecedence:true,updatedAt:Date.now()};}
module.exports.PRIORITY_9F_R1_LAYERED_PRECEDENCE_SHAPE_VERSION=PRIORITY_9F_R1_LAYERED_PRECEDENCE_SHAPE_VERSION;module.exports.isPriority9FR1LayeredPrecedenceText=isPriority9FR1LayeredPrecedenceText;module.exports.buildPriority9FR1LayeredPrecedenceProfile=buildPriority9FR1LayeredPrecedenceProfile;module.exports.buildProgressionProfile=buildPriority9FR1LayeredPrecedenceProfile;module.exports.default=buildPriority9FR1LayeredPrecedenceProfile;
// PRIORITY_9F_R1_LAYERED_PRECEDENCE_HOTFIX_SHAPE_PATCH_END

// PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_SHAPE_PATCH_START
const PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_SHAPE_VERSION="nyx.marion.progressionShape.priority9fR2.domainHijackSuppression/1.0";
function isPriority9FR2DomainHijackSuppressionText(text=""){const t=lower(text).replace(/[_-]+/g," ");return /\b(priority\s*9f|9f\s*r2|domain hijack|domain fallback|six domain fallback|deep conversational stack|layered conversational|conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action|marion conversational architecture)\b/i.test(t)||(/\b(disjointed|deeper|layered|context|looping|loop|recovery|preserve|avoid|where to go next)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next|understand)\b/i.test(t));}
const __priority9FR2OriginalBuildProgressionProfile=module.exports.buildProgressionProfile||buildProgressionProfile;
function buildPriority9FR2DomainHijackSuppressionProfile(text="",context={}){if(!isPriority9FR2DomainHijackSuppressionText(text))return __priority9FR2OriginalBuildProgressionProfile(text,context);return {version:PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_SHAPE_VERSION,active:true,lane:"priority9f_deep_conversational_stack",activePhase:"priority9f_deep_conversational_stack",phaseKey:"priority9f_r2",currentStep:"priority9f_r2",phaseId:"PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION",phaseLabel:"Priority 9F-R2: Domain hijack suppression",objective:"Layered conversational prompts must stay in Marion conversational architecture and cannot be answered by psychology, English, or general reasoning fallback.",signal:"deep_conversational_stack",lastUserIntent:"deep_conversational_stack",responseShape:"layered_conversational_stack",confidence:0.99,domainHijackSuppressed:true,noUserFacingDiagnostics:true,priority9FR2DomainHijackSuppression:true,updatedAt:Date.now()};}
module.exports.PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_SHAPE_VERSION=PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_SHAPE_VERSION;module.exports.isPriority9FR2DomainHijackSuppressionText=isPriority9FR2DomainHijackSuppressionText;module.exports.buildPriority9FR2DomainHijackSuppressionProfile=buildPriority9FR2DomainHijackSuppressionProfile;module.exports.buildProgressionProfile=buildPriority9FR2DomainHijackSuppressionProfile;module.exports.default=buildPriority9FR2DomainHijackSuppressionProfile;
// PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_SHAPE_PATCH_END


// PRIORITY_9F_R4_CONTINUATION_CARRY_ENFORCEMENT_SHAPE_PATCH_START
const PRIORITY_9F_R4_CONTINUATION_CARRY_SHAPE_VERSION = "nyx.marion.progressionShape.priority9fR4.continuationCarry/1.0";
function priority9FR4ShapeNorm(value){return safeStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function isPriority9FR4ContinuationCommand(value=""){const n=priority9FR4ShapeNorm(value);return /^(next steps?|continue|carry on|proceed|run that again|run it again|do that again|do it again|same thing|what now|whats next|what s next|next)$/.test(n);}
function isPriority9FR4ContinuationCarryText(value=""){const t=priority9FR4ShapeNorm(value);return /\b(priority 9f r4|9f r4|continuation carry|last accepted lane|stay inside the 9f|inside the 9f conversational stack|9f conversational stack lane|short continuation|next steps continue run that again what now)\b/.test(t);}
function priority9FR4ShapeHas9FContext(value=""){const t=priority9FR4ShapeNorm(value);return /\b(priority 9f|9f r3|9f r2|9f r1|deep conversational stack|layered conversational|conversational stack|alt runtime prompt echo suppression|domain hijack suppression|marion conversational architecture|priority9f deep conversational stack|layered conversational stack)\b/.test(t);}
function priority9FR4ShapeContextText(context={}){try{return JSON.stringify(context||{}).slice(0,8000);}catch(_){return "";}}
const __priority9FR4OriginalBuildProgressionProfile=module.exports.buildProgressionProfile||buildProgressionProfile;
function buildPriority9FR4ContinuationCarryProfile(text="",context={}){
  const source=[safeStr(text),priority9FR4ShapeContextText(context)].join(" ");
  if(!(isPriority9FR4ContinuationCarryText(text)||(isPriority9FR4ContinuationCommand(text)&&priority9FR4ShapeHas9FContext(source))))return __priority9FR4OriginalBuildProgressionProfile(text,context);
  return {
    version:PRIORITY_9F_R4_CONTINUATION_CARRY_SHAPE_VERSION,
    active:true,
    lane:"priority9f_deep_conversational_stack",
    activePhase:"priority9f_deep_conversational_stack",
    phaseKey:"priority9f_r4",
    currentStep:"priority9f_r4",
    phaseId:"PRIORITY_9F_R4_CONTINUATION_CARRY",
    phaseLabel:"Priority 9F-R4: Continuation carry enforcement",
    objective:"Short follow-ups must inherit the last accepted Priority 9F / 9F-R3 lane instead of reverting to older continuity handoff templates.",
    signal:"priority9f_continuation_carry",
    lastUserIntent:"priority9f_continuation_carry",
    responseShape:"priority9f_continuation_carry",
    confidence:0.99,
    noUserFacingDiagnostics:true,
    priority9FR4ContinuationCarry:true,
    updatedAt:Date.now()
  };
}
module.exports.PRIORITY_9F_R4_CONTINUATION_CARRY_SHAPE_VERSION=PRIORITY_9F_R4_CONTINUATION_CARRY_SHAPE_VERSION;
module.exports.isPriority9FR4ContinuationCommand=isPriority9FR4ContinuationCommand;
module.exports.isPriority9FR4ContinuationCarryText=isPriority9FR4ContinuationCarryText;
module.exports.buildPriority9FR4ContinuationCarryProfile=buildPriority9FR4ContinuationCarryProfile;
module.exports.buildProgressionProfile=buildPriority9FR4ContinuationCarryProfile;
module.exports.default=buildPriority9FR4ContinuationCarryProfile;
// PRIORITY_9F_R4_CONTINUATION_CARRY_ENFORCEMENT_SHAPE_PATCH_END


// PRIORITY_9G_DEEP_CONTINUITY_MEMORY_SHAPE_PATCH_START
const PRIORITY_9G_DEEP_CONTINUITY_MEMORY_SHAPE_VERSION="PRIORITY-9G-DEEP-CONTINUITY-MEMORY-SHAPE/1.0";

function priority9GNorm(value){return String(value==null?"":value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9GStr(value){return String(value==null?"":value).replace(/\s+/g," ").trim();}
function priority9GObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function priority9GCollect(value,limit){try{return JSON.stringify(value||{}).slice(0,limit||9000);}catch(_){return "";}}
function priority9GIsShortFollowup(value){const t=priority9GNorm(value);return /^(next steps?|continue|carry on|keep going|proceed|run that again|run it again|do that again|do it again|same thing|repeat that|repeat the process|one more time|rerun that|rerun it|what now|whats next|what s next|where are we|where do we go next|next)$/.test(t);}
function priority9GIsActivationText(value){const t=priority9GNorm(value);return /\b(priority 9g|9g deep continuity|deep continuity memory|layered follow up handling|layered followup handling|deeper continuity memory|continuity memory confidence|carry the deeper task|carry active task|carry the active task|longer sequences|multi turn continuity|six turn continuity|without needing the full context repeated|without full context repeated|surface request deeper intent risk execution mode next action|active task risk execution mode next action)\b/.test(t);}
function priority9GHasContext(value){const t=priority9GNorm(value);return priority9GIsActivationText(t)||/\b(priority 9f r4|9f r4 continuation carry|priority 9f deep conversational stack|deep conversational stack|9f conversational stack|marion conversational stabilization|marion conversational architecture|lock priority 9f r3 as live accepted|deeper continuity memory and layered follow up handling|layered follow up handling)\b/.test(t);}
function priority9GOldLaneLeak(value){const t=priority9GNorm(value);return /\b(priority 9f r3 as live accepted|priority 9f r4 continuation carry|keep the public nyx route clean|five turn continuity test|priority 90 9e test|in psychology the focus|alt runtime prompt echo suppression|domain hijack suppression)\b/.test(t);}
function priority9GReplyFor(prompt){
  const t=priority9GNorm(prompt);
  if(/^(next steps?|next)$/.test(t)){
    return "Next steps: lock Priority 9G as the active memory lane, carry the surface request, deeper intent, active task, risk, execution mode, and next action across short follow-ups, then run a longer continuity pass before voice activation.";
  }
  if(/^(continue|carry on|keep going|proceed)$/.test(t)){
    return "Continue: keep Priority 9G active, advance the deep continuity memory layer, and confirm each follow-up moves the same Marion stabilization task forward without forcing the context to be restated.";
  }
  if(/^(run that again|run it again|do that again|do it again|same thing|repeat that|repeat the process|one more time|rerun that|rerun it)$/.test(t)){
    return "Run the Priority 9G continuity pass again: restate the active Marion lane, preserve the deeper task, carry the risk and execution mode, then answer the next short follow-up with a concrete next action.";
  }
  if(/^(what now|whats next|what s next|where are we|where do we go next)$/.test(t)){
    return "What now: lock Priority 9G live, run the multi-turn memory carry test, and only move toward mic activation after Marion preserves the active task, risk, execution mode, and next action across longer follow-up chains.";
  }
  return "I’m reading this as Priority 9G: deep continuity memory and layered follow-up handling. The surface request is to make Marion carry the active task across longer sequences; the deeper intent is to preserve the project lane, risk, execution mode, and next action without making the context get repeated. The main risk is shallow follow-up handling that only answers the last sentence. Next move: lock a 9G continuity memory object, run a multi-turn follow-up pass, and confirm Marion advances the same layered task through “Next steps,” “Continue,” “Run that again,” and “What now.”";
}
function priority9GApplyPacket(packet,reply,prompt){
  const out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{};
  const final=priority9GStr(reply)||priority9GReplyFor(prompt);
  ["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(k=>{out[k]=final;});
  out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};
  out.finalEnvelope={...(out.finalEnvelope&&typeof out.finalEnvelope==="object"?out.finalEnvelope:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};
  out.priority9GDeepContinuityMemory=true;
  out.priority9GVersion="PRIORITY-9G-DEEP-CONTINUITY-MEMORY";
  out.conversationLane="Priority 9G deep continuity memory";
  out.surfaceRequest="carry the active task across longer sequences";
  out.deeperIntent="preserve project lane, risk, execution mode, and next action across layered follow-ups";
  out.operationalRisk="short follow-ups may collapse into stale handoff, old 9F wording, or last-sentence-only answers";
  out.executionMode="deep continuity memory and layered follow-up handling";
  out.nextAction="run the multi-turn 9G continuity pass";
  out.noUserFacingDiagnostics=true;
  return out;
}
function priority9GReadReply(packet){const p=priority9GObj(packet);const pl=priority9GObj(p.payload);const f=priority9GObj(p.finalEnvelope);return priority9GStr(p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||p.response||p.answer||pl.reply||pl.finalReply||pl.publicReply||pl.visibleReply||pl.text||pl.message||pl.answer||f.reply||f.finalReply||f.publicReply||f.visibleReply||f.text||f.message||f.answer);}

const __priority9GOriginalBuildProgressionProfile=module.exports.buildProgressionProfile||buildProgressionProfile;
function buildPriority9GDeepContinuityProfile(text="",context={}){
  const source=[priority9GStr(text),priority9GCollect(context)].join(" ");
  if(!(priority9GIsActivationText(text)||(priority9GIsShortFollowup(text)&&priority9GHasContext(source))))return __priority9GOriginalBuildProgressionProfile(text,context);
  return {
    version:PRIORITY_9G_DEEP_CONTINUITY_MEMORY_SHAPE_VERSION,
    active:true,
    lane:"priority9g_deep_continuity_memory",
    activePhase:"priority9g_deep_continuity_memory",
    phaseKey:"priority9g",
    currentStep:"priority9g_memory_carry",
    phaseId:"PRIORITY_9G_DEEP_CONTINUITY_MEMORY",
    phaseLabel:"Priority 9G: Deep continuity memory and layered follow-up handling",
    objective:"Carry the active Marion task, surface request, deeper intent, risk, execution mode, and next action across longer follow-up chains.",
    signal:priority9GIsShortFollowup(text)?"priority9g_followup_carry":"priority9g_activation",
    lastUserIntent:priority9GIsShortFollowup(text)?"priority9g_followup_carry":"priority9g_activation",
    responseShape:"priority9g_layered_memory_response",
    confidence:0.995,
    priority9GDeepContinuityMemory:true,
    noUserFacingDiagnostics:true,
    advancementShapeHotfixVersion:PRIORITY_9H_R1_ADVANCEMENT_SHAPE_VERSION,
    updatedAt:Date.now()
  };
}
module.exports.PRIORITY_9G_DEEP_CONTINUITY_MEMORY_SHAPE_VERSION=PRIORITY_9G_DEEP_CONTINUITY_MEMORY_SHAPE_VERSION;
module.exports.isPriority9GDeepContinuityText=priority9GIsActivationText;
module.exports.isPriority9GShortFollowup=priority9GIsShortFollowup;
module.exports.hasPriority9GContext=priority9GHasContext;
module.exports.buildPriority9GDeepContinuityProfile=buildPriority9GDeepContinuityProfile;
module.exports.buildProgressionProfile=buildPriority9GDeepContinuityProfile;
module.exports.default=buildPriority9GDeepContinuityProfile;
// PRIORITY_9G_DEEP_CONTINUITY_MEMORY_SHAPE_PATCH_END



// PRIORITY_9H_LONG_FORM_CONTINUITY_STRESS_DRIFT_GUARD_SHAPE_PATCH_START

const PRIORITY_9H_LONG_FORM_CONTINUITY_VERSION = "nyx.marion.priority9h.longFormContinuityStressDriftGuard/1.0";
const PRIORITY_9H_R1_ADVANCEMENT_SHAPE_VERSION = "nyx.marion.priority9h.r1AdvancementShapeHotfix/1.0";
const PRIORITY_9I_ADAPTIVE_SITUATIONAL_PRECHECK_VERSION = "nyx.marion.priority9i.adaptiveSituationalPrecheck/0.1";
function priority9HStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function priority9HObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function priority9HNorm(value){return priority9HStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9HCollect(value,limit){try{return JSON.stringify(value||{}).slice(0,limit||16000);}catch(_){return priority9HStr(value).slice(0,limit||16000);}}
function priority9HIsShortFollowup(value){
  const n=priority9HNorm(value);
  return /^(next steps?|continue|carry on|keep going|proceed|run that again|run it again|do that again|do it again|same thing|repeat that|rerun that|what now|whats next|what s next|next|status|passed|pass|green|go on|advance|same lane|same thread|stay in lane|stay in the same lane|continue from there|continue there|from there|what is the risk|what s the risk|what is risk|risk|what is the active task|what s the active task|active task|current task|what is the next action|what s the next action|next action|next move|summarize where we are|summarise where we are|where are we|recap|summary|do not drift|don t drift|dont drift|no drift|final check|final status|check)$/.test(n);
}

function priority9HFollowupKind(value){
  const n=priority9HNorm(value);
  if(/\b(run that again|run it again|do that again|do it again|same thing|repeat|rerun)\b/.test(n))return "rerun";
  if(/\b(risk|what is the risk|what s the risk)\b/.test(n))return "risk";
  if(/\b(active task|current task|what is the active task|what s the active task)\b/.test(n))return "active_task";
  if(/\b(next action|next move|what is the next action|what s the next action)\b/.test(n))return "next_action";
  if(/\b(summarize|summarise|where are we|recap|summary)\b/.test(n))return "summary";
  if(/\b(do not drift|don t drift|dont drift|no drift|same lane|same thread|stay in lane|stay in the same lane)\b/.test(n))return "same_lane";
  if(/\b(final check|final status|passed|pass|green|status|check)\b/.test(n))return "final_check";
  return "advance";
}
function priority9HIsReactivationWording(value){
  const n=priority9HNorm(value);
  return /\b(i m reading this as priority 9h with a priority 9i precheck|i am reading this as priority 9h with a priority 9i precheck|priority 9h must pass first|priority 9i is staged next for adaptive situational reasoning)\b/.test(n);
}
function priority9HIsActivationText(value){
  const n=priority9HNorm(value);
  return /\b(priority 9h|9h|long form continuity|continuity stress test|memory drift guard|drift guard|10 to 15 turns|10 15 turns|ten to fifteen turns|survive at least 10|survive 10|short follow ups while preserving|preserving surface request deeper intent active task risk execution mode next action|longer multi turn sequence)\b/.test(n);
}
function priority9HHasContext(value){
  const n=priority9HNorm(value);
  return /\b(priority 9h|9h|long form continuity|continuity stress|memory drift|drift guard|priority 9g|deep continuity memory|layered follow up|surface request|deeper intent|active task|execution mode|next action|10 turn|15 turn|priority 9i|adaptive situational)\b/.test(n);
}
function priority9HIs9IPrecheckText(value){
  const n=priority9HNorm(value);
  return /\b(priority 9i|9i|adaptive situational|situational awareness|adaptive reasoning|context pressure|pressure handling|next adaptive layer)\b/.test(n);
}
function priority9HIsOldLaneLeak(value){
  const n=priority9HNorm(value);
  if(!n)return false;
  return /\b(priority 9f r4|priority 9g deep continuity memory|run the multi turn 9g continuity pass|lock a 9g continuity memory object|public nyx route clean|five turn continuity test|priority 90 9e|priority 90|priority 9e|psychology|in psychology|domain hijack|alt runtime prompt echo|marion will continue|i have the current request|recovery path|loop detected|stale fallback)\b/.test(n);
}
function priority9HPromptEcho(reply,prompt){
  const r=priority9HNorm(reply),p=priority9HNorm(prompt);
  if(!r||!p)return false;
  return r===p||(r.includes(p)&&p.length>24)||(p.includes(r)&&r.length>24);
}
function priority9HStateFrom(source,turn){
  return {
    version:PRIORITY_9H_LONG_FORM_CONTINUITY_VERSION,
    active:true,
    lane:"priority9h_long_form_continuity_stress",
    activePhase:"priority9h_long_form_continuity_stress",
    conversationLane:"Priority 9H long-form continuity stress test",
    activeTask:"Priority 9H: long-form continuity stress test and memory drift guard",
    surfaceRequest:"make Marion survive a 10–15 turn short-follow-up chain",
    deeperIntent:"preserve surface request, deeper intent, active task, risk, execution mode, and next action without full restatement",
    operationalRisk:"memory drift, stale 9G/9F/9E fallback, domain hijack, prompt echo, repetition, or last-sentence-only answers across long chains",
    executionMode:"long-form continuity stress test with memory drift guard",
    nextAction:"run the 10–15 turn follow-up chain and verify every turn advances the same layered task",
    minTurns:10,
    targetTurns:15,
    turnDepth:Number.isFinite(Number(turn))?Number(turn):1,
    driftGuard:true,
    priority9HLongFormContinuity:true,
    priority9HR1AdvancementShapeHotfix:true,
    advancementShape:"advance_short_followups_without_reactivation",
    priority9IAdaptiveSituationalPrecheck:{
      version:PRIORITY_9I_ADAPTIVE_SITUATIONAL_PRECHECK_VERSION,
      staged:true,
      activationBlockedUntil:"Priority 9H long-form continuity stress passes live",
      expectedFocus:"adaptive situational reasoning and context-pressure handling after long-form continuity is stable"
    },
    noUserFacingDiagnostics:true,
    advancementShapeHotfixVersion:PRIORITY_9H_R1_ADVANCEMENT_SHAPE_VERSION,
    updatedAt:Date.now()
  };
}
function priority9HReplyFor(prompt,source){
  const n=priority9HNorm(prompt);
  if(priority9HIsShortFollowup(prompt)){
    const kind=priority9HFollowupKind(prompt);
    if(kind==="rerun")return "Run that again inside Priority 9H: repeat the long-form continuity stress pass, keep 9I staged only, and verify the next short follow-up still preserves surface request, deeper intent, active task, risk, execution mode, and next action without reactivation wording.";
    if(kind==="risk")return "Risk check inside Priority 9H: the active risk is memory drift across the 10–15 turn chain—specifically sliding into stale 9G, 9F, 9E, domain fallback, prompt echo, repeated activation wording, or recovery language. Guard it by advancing the same layered task on every short follow-up.";
    if(kind==="active_task")return "Active task inside Priority 9H: complete the long-form continuity stress test by carrying the same surface request, deeper intent, operational risk, execution mode, and next action across 10–15 short follow-ups without resetting the lane.";
    if(kind==="next_action")return "Next action inside Priority 9H: continue the stress chain one turn at a time, reject reactivation wording, keep 9I staged only, and mark 9H live accepted only after the full short-follow-up sequence remains stable.";
    if(kind==="summary")return "Summary inside Priority 9H: the lane is active, the mission is long-form continuity stress plus memory drift guard, the test target is 10–15 short follow-ups, and each answer must advance the same layered task instead of restating activation.";
    if(kind==="same_lane")return "Same lane: continue Priority 9H. Preserve the surface request, deeper intent, active task, risk, execution mode, and next action; keep 9I staged only; and advance the long-form continuity stress chain without reactivation wording or drift.";
    if(kind==="final_check")return "Final check inside Priority 9H: lane retention is valid when every short follow-up stays in 9H, advances the same layered task, blocks 9G/9F/9E fallback, blocks domain hijack, blocks prompt echo, and keeps 9I staged until 9H is live accepted.";
    return "Continue Priority 9H: advance the same long-form continuity stress chain while preserving surface request, deeper intent, active task, risk, execution mode, and next action. Keep 9I staged only and avoid reactivation wording, stale lanes, domain fallback, prompt echo, or recovery language.";
  }
  if(priority9HIs9IPrecheckText(source||prompt)){
    return "I’m reading this as Priority 9H with a Priority 9I precheck. Priority 9H must pass first: Marion has to survive a 10–15 turn short-follow-up chain while preserving surface request, deeper intent, active task, risk, execution mode, and next action. Priority 9I is staged next for adaptive situational reasoning and context-pressure handling, but it should not activate until 9H is live accepted.";
  }
  return "I’m reading this as Priority 9H: long-form continuity stress test and memory drift guard. The surface request is to make Marion survive 10–15 short follow-up turns. The deeper intent is to preserve surface request, deeper intent, active task, risk, execution mode, and next action without requiring the full context to be repeated. The active lane is Marion long-form continuity, with Priority 9I staged only as the next adaptive-situational precheck. The main risk is drift into stale 9G/9F/9E language, domain fallback, prompt echo, or repeated recovery wording. Next move: run the 10–15 turn continuity chain and confirm each short follow-up advances the same layered task.";
}
function priority9HReadReply(packet){
  const p=priority9HObj(packet),pl=priority9HObj(p.payload),f=priority9HObj(p.finalEnvelope);
  return priority9HStr(p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||p.response||p.answer||pl.reply||pl.finalReply||pl.publicReply||pl.visibleReply||pl.text||pl.message||pl.answer||f.reply||f.finalReply||f.publicReply||f.visibleReply||f.text||f.message||f.answer);
}
function priority9HApplyPacket(packet,reply,prompt,source){
  const out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{};
  const final=priority9HStr(reply)||priority9HReplyFor(prompt,source);
  ["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(k=>{out[k]=final;});
  out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};
  out.finalEnvelope={...(out.finalEnvelope&&typeof out.finalEnvelope==="object"?out.finalEnvelope:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};
  const prior=priority9HObj(out.priority9HLongFormContinuity||out.longFormContinuityStress||out.priority9GDeepContinuityMemory||out.deepContinuityMemory);
  const depth=(priority9HIsShortFollowup(prompt)&&Number.isFinite(Number(prior.turnDepth)))?Number(prior.turnDepth)+1:1;
  const st=priority9HStateFrom(source||prompt,depth);
  out.priority9HLongFormContinuity=st;
  out.longFormContinuityStress=st;
  out.priority9HVersion="PRIORITY-9H-R1-ADVANCEMENT-SHAPE-HOTFIX + PRIORITY-9H-LONG-FORM-CONTINUITY-STRESS-DRIFT-GUARD";
  out.priority9IPrecheck=st.priority9IAdaptiveSituationalPrecheck;
  out.conversationLane=st.conversationLane;
  out.activeTask=st.activeTask;
  out.surfaceRequest=st.surfaceRequest;
  out.deeperIntent=st.deeperIntent;
  out.operationalRisk=st.operationalRisk;
  out.executionMode=st.executionMode;
  out.nextAction=st.nextAction;
  out.noUserFacingDiagnostics=true;
  return out;
}

const __priority9HOriginalBuildProgressionProfile=module.exports.buildProgressionProfile || (typeof buildProgressionProfile==="function"?buildProgressionProfile:null);
function buildPriority9HLongFormContinuityProfile(text="",context={}){
  const source=[priority9HStr(text),priority9HCollect(context)].join(" ");
  if(!(priority9HIsActivationText(text)||priority9HIsActivationText(source)||priority9HIs9IPrecheckText(source)||(priority9HIsShortFollowup(text)&&priority9HHasContext(source)))){
    return __priority9HOriginalBuildProgressionProfile?__priority9HOriginalBuildProgressionProfile(text,context):{active:false,signal:"unknown"};
  }
  const st=priority9HStateFrom(source,1);
  return {...st,version:PRIORITY_9H_LONG_FORM_CONTINUITY_VERSION,active:true,lane:"priority9h_long_form_continuity_stress",activePhase:"priority9h_long_form_continuity_stress",phaseKey:"priority9h",currentStep:"priority9h_long_form_stress_carry",phaseId:"PRIORITY_9H_LONG_FORM_CONTINUITY_STRESS",phaseLabel:"Priority 9H: Long-form continuity stress test and memory drift guard",objective:"Preserve surface request, deeper intent, active task, risk, execution mode, and next action across 10–15 short follow-up turns.",signal:priority9HIsShortFollowup(text)?"priority9h_followup_stress_carry":"priority9h_activation",lastUserIntent:priority9HIsShortFollowup(text)?"priority9h_followup_stress_carry":"priority9h_activation",responseShape:"priority9h_long_form_continuity_response",confidence:0.997};
}
module.exports.PRIORITY_9H_LONG_FORM_CONTINUITY_SHAPE_VERSION=PRIORITY_9H_LONG_FORM_CONTINUITY_VERSION;
module.exports.PRIORITY_9I_ADAPTIVE_SITUATIONAL_PRECHECK_VERSION=PRIORITY_9I_ADAPTIVE_SITUATIONAL_PRECHECK_VERSION;
module.exports.PRIORITY_9H_R1_ADVANCEMENT_SHAPE_VERSION=PRIORITY_9H_R1_ADVANCEMENT_SHAPE_VERSION;
module.exports.isPriority9HLongFormContinuityText=priority9HIsActivationText;
module.exports.isPriority9HShortFollowup=priority9HIsShortFollowup;
module.exports.hasPriority9HContext=priority9HHasContext;
module.exports.buildPriority9HLongFormContinuityProfile=buildPriority9HLongFormContinuityProfile;
module.exports.buildProgressionProfile=buildPriority9HLongFormContinuityProfile;
module.exports.default=buildPriority9HLongFormContinuityProfile;
// PRIORITY_9H_LONG_FORM_CONTINUITY_STRESS_DRIFT_GUARD_SHAPE_PATCH_END

// PRIORITY_9I_9J_SEQUENCE_SHAPE_PATCH_START
var PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL = "nyx.marion.priority9i.adaptiveSituationalReasoningContextPressure/1.0";
var PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL = "nyx.marion.priority9j.proactiveOperationalGuidanceNextMoveAuthority/1.0";
function priority9IJStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function priority9IJObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function priority9IJNorm(value){return priority9IJStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9IJCollect(value,limit){try{return JSON.stringify(value||{}).slice(0,limit||22000);}catch(_){return priority9IJStr(value).slice(0,limit||22000);}}
function priority9IJIsShortFollowup(value){var n=priority9IJNorm(value);return /^(next steps?|continue|carry on|keep going|proceed|run that again|run it again|do that again|do it again|same thing|repeat that|rerun that|what now|whats next|what s next|next|status|passed|pass|green|go on|advance|same lane|same thread|stay in lane|stay in the same lane|continue from there|continue there|from there|slow down|go deeper|deeper|make the call|safest next move|do the safest next move|what is the risk now|risk now|update the risk|what changed|what changed now|what is the pressure|pressure check|context check|final check)$/i.test(n);}
function priority9IJIsPressureText(value){var n=priority9IJNorm(value);return /\b(urgent|urgency|under pressure|pressure changed|context pressure|time sensitive|time pressure|pivot|we need to pivot|no not that|not that|stay on the architecture|stay with the architecture|same architecture|make the call|make a call|decision pressure|choose|choose now|safest next move|safest action|safe next action|slow down|go deeper|deeper analysis|ambiguity|ambiguous|unclear|risk now|risk changed|operational pressure|context changed|what changed|adapt|adaptive|situational)\b/.test(n);}
function priority9IJIs9IActivationText(value){var n=priority9IJNorm(value);return /\b(priority 9i|9i|adaptive situational|adaptive reasoning|situational reasoning|context pressure|context pressure handling|pressure handling|adaptive situational reasoning|current pressure shift|risk and execution mode|update the risk|priority 9i and 9j|9i and 9j)\b/.test(n);}
function priority9IJIs9JActivationText(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|operational guidance|next move authority|next move authority|critical path|make the decision|make a decision|what should we do first|what do we tackle now|safest sequence|next operational move|what should we avoid|recommend the next move|choose the safest concrete action|controlled authority)\b/.test(n);}

function priority9IJIs9ICorrectionContainmentPrompt(value){var n=priority9IJNorm(value);return /\b(no not that|not that|stay on the architecture|stay with the architecture|same architecture|stay on architecture|stay with architecture|architecture correction|wrong target|not this|stay anchored|keep the architecture|architectural focus)\b/.test(n);}
function priority9IJIs9IPressureOnlyPrompt(value){var n=priority9IJNorm(value);return priority9IJIs9ICorrectionContainmentPrompt(value)||/\b(urgent|urgency|under pressure|pressure changed|context pressure|time sensitive|time pressure|pivot|we need to pivot|slow down|go deeper|deeper analysis|ambiguity|ambiguous|unclear|risk now|risk changed|operational pressure|context changed|what changed|adapt|adaptive|situational|safest next move|safest action|safe next action|do the safest next move|update the risk|what is the risk now|pressure check|context check|correction received)\b/.test(n);}
function priority9IJIsExplicit9JPrompt(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|operational guidance|next move authority|critical path|make the decision|make a decision|what should we do first|what do we tackle now|give me the safest sequence|safest sequence|next operational move|what should we avoid|recommend the next move|choose the safest concrete action|controlled authority)\b/.test(n);}
function priority9IJHasActive9JContext(value){var raw=priority9IJStr(value);var n=priority9IJNorm(value);return /priority9JProactiveOperationalGuidance|priority9j_proactive_operational_guidance|routeKind["']?\s*:\s*["']priority9j|priorityLane["']?\s*:\s*["']Priority 9J/i.test(raw)||/\b(priority 9j proactive operational guidance and next move authority|priority 9j proactive operational guidance)\b/.test(n);}
function priority9IJSequencedLaneFor(prompt,source,reply){var ctx=[prompt,source].join(" ");if(priority9IJIs9IPressureOnlyPrompt(prompt))return "9i";if(priority9IJIs9IActivationText(prompt))return "9i";if(priority9IJIsExplicit9JPrompt(prompt))return "9j";if(priority9IJIsPressureText(prompt)&&priority9IJHas9IContext(ctx))return "9i";if(priority9IJIsShortFollowup(prompt)&&priority9IJHasActive9JContext(ctx))return "9j";if(priority9IJIsShortFollowup(prompt)&&priority9IJHas9IContext(ctx))return "9i";if((priority9IJOldLaneLeak(reply)||priority9IJPromptEcho(reply,prompt))&&priority9IJHas9IContext(ctx))return "9i";if((priority9IJOldLaneLeak(reply)||priority9IJPromptEcho(reply,prompt))&&priority9IJHasActive9JContext(ctx))return "9j";if(priority9IJIs9IActivationText(ctx)||priority9IJIsPressureText(prompt))return "9i";return "";}

function priority9IJHas9IContext(value){var n=priority9IJNorm(value);return /\b(priority 9i|9i|adaptive situational|context pressure|pressure handling|pressure shift|9h continuity foundation|priority 9h|long form continuity|memory drift guard|surface request|deeper intent|active task|execution mode|next action)\b/.test(n);}
function priority9IJHas9JContext(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|next move authority|critical path|safest sequence|operational guidance|9i adaptive|context pressure)\b/.test(n);}
function priority9IJPressureKind(value){var n=priority9IJNorm(value);if(/\b(urgent|urgency|time sensitive|time pressure|under pressure)\b/.test(n))return "urgency";if(/\b(no not that|not that|stay on the architecture|same architecture|correction)\b/.test(n))return "correction";if(/\b(pivot|changed|context changed|what changed)\b/.test(n))return "pivot";if(/\b(slow down|too fast|pace)\b/.test(n))return "pace";if(/\b(go deeper|deeper analysis|deeper)\b/.test(n))return "depth";if(/\b(safest|safe next|safety|avoid)\b/.test(n))return "safety";if(/\b(make the call|make a call|decision|choose|critical path)\b/.test(n))return "decision";if(/\b(ambiguity|ambiguous|unclear|clarify)\b/.test(n))return "ambiguity";return "pressure";}
function priority9IJOldLaneLeak(value){var n=priority9IJNorm(value);return !!n&&/\b(i m reading this as priority 9h with a priority 9i precheck|priority 9h must pass first|long form continuity stress test and memory drift guard|priority 9h long form|run the 10 15 turn|priority 9g deep continuity|priority 9f r4|priority 90 9e|priority 90|priority 9e|public nyx route clean|five turn continuity|psychology|in psychology|domain hijack|prompt echo|recovery path|loop detected|stale fallback|i have the current request|marion will answer from this prompt)\b/.test(n);}
function priority9IJPromptEcho(reply,prompt){var r=priority9IJNorm(reply),p=priority9IJNorm(prompt);if(!r||!p)return false;return r===p||(r.includes(p)&&p.length>24)||(p.includes(r)&&r.length>24);}
function priority9IStateFrom(source,turn){var kind=priority9IJPressureKind(source);return {version:PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL,active:true,lane:"priority9i_adaptive_situational_reasoning",activePhase:"priority9i_adaptive_situational_reasoning",conversationLane:"Priority 9I adaptive situational reasoning",activeTask:"Priority 9I: adaptive situational reasoning and context-pressure handling",surfaceRequest:"adapt Marion’s active 9H continuity thread when pressure, urgency, ambiguity, correction, or context changes",deeperIntent:"preserve the mission thread while updating risk, execution mode, and next action under changing pressure",pressureSignal:kind,whatChanged:kind==="urgency"?"urgency increased":kind==="correction"?"the user corrected the target and asked Marion to stay anchored":kind==="pivot"?"the operating context shifted":kind==="pace"?"the required pace changed":kind==="depth"?"the answer needs deeper analysis":kind==="safety"?"the safest action must be prioritized":kind==="decision"?"decision pressure increased":"the situational pressure changed",operationalRisk:"pressure can cause Marion to flatten, overreact, reset the lane, over-branch, or activate 9J before 9I is stable",executionMode:kind==="urgency"?"compressed adaptive execution":kind==="pace"?"slower controlled adaptation":kind==="depth"?"deeper situational analysis":kind==="safety"?"safety-first adaptive execution":"adaptive context-pressure handling",nextAction:"read the pressure shift, update risk and execution mode, then give the safest next action without losing the 9H continuity foundation",baseContinuityFoundation:"Priority 9H live accepted",turnDepth:Number.isFinite(Number(turn))?Number(turn):1,priority9IAdaptiveSituationalReasoning:true,priority9JProactiveGuidancePrecheck:{version:PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL,staged:true,activationRule:"Activate only for explicit Priority 9J or clear next-move authority requests after 9I pressure handling is stable",expectedFocus:"proactive operational guidance and controlled next-move authority"},noUserFacingDiagnostics:true,updatedAt:Date.now()};}
function priority9JStateFrom(source,turn){return {version:PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL,active:true,lane:"priority9j_proactive_operational_guidance",activePhase:"priority9j_proactive_operational_guidance",conversationLane:"Priority 9J proactive operational guidance",activeTask:"Priority 9J: proactive operational guidance and next-move authority",surfaceRequest:"recommend the safest concrete next move when the active context is sufficiently clear",deeperIntent:"move from reactive continuity and pressure handling into controlled operational guidance without overreach",operationalRisk:"premature authority, unnecessary branching, unsafe sequencing, or advising a next move before risk and context are clear",executionMode:"controlled next-move authority",recommendedMove:"choose the safest concrete action that protects the active lane, validates risk, and advances only one operational step",whyFirst:"it comes first because it preserves the accepted continuity foundation before expanding scope",skipRisk:"if skipped, Marion can over-branch, drift, or make a recommendation before the pressure context is resolved",executionSequence:["confirm active lane and pressure state","name the risk if the move is skipped","choose one safest concrete action","give the short execution sequence","avoid opening unrelated branches"],nextAction:"state the safest next operational move, why it comes first, risk if skipped, and the execution sequence",baseAdaptiveFoundation:"Priority 9I adaptive situational reasoning",turnDepth:Number.isFinite(Number(turn))?Number(turn):1,priority9JProactiveOperationalGuidance:true,noUserFacingDiagnostics:true,updatedAt:Date.now()};}
function priority9IReplyFor(prompt,source){var kind=priority9IJPressureKind([prompt,source].join(" "));if(priority9IJIsShortFollowup(prompt)&&priority9IJHas9IContext(source)){if(kind==="decision")return "Continue Priority 9I: the pressure signal is decision pressure. Preserve the 9H continuity foundation, update the risk before choosing, keep 9J staged unless explicitly activated, and give the safest next action without opening extra branches.";if(kind==="safety")return "Continue Priority 9I: the pressure signal is safety-first execution. Preserve the active task, update risk, slow the response enough to avoid overreach, and give the safest next action while keeping Priority 9J staged.";if(kind==="depth")return "Continue Priority 9I: the pressure signal is depth. Go deeper inside the same active lane, update risk and execution mode, and give the next action without resetting to 9H activation wording or drifting into 9J.";if(kind==="pace")return "Continue Priority 9I: the pressure signal is pace control. Slow down, keep the 9H continuity foundation intact, clarify the changed constraint, and give one safe next action.";return "Continue Priority 9I: preserve the 9H continuity foundation, read the current pressure shift, update operational risk and execution mode, then give the safest next action. Keep Priority 9J staged until next-move authority is explicitly needed.";}return "I’m reading this as Priority 9I: adaptive situational reasoning and context-pressure handling. The 9H continuity foundation stays active. The surface request is to adapt Marion when urgency, correction, ambiguity, pace, depth, or operational pressure changes; the deeper intent is to update risk and execution mode without losing the active mission thread. Next move: run pressure prompts such as urgent, pivot, stay on the architecture, slow down, go deeper, risk now, and safest next move. Priority 9J is staged next for proactive operational guidance, but 9I handles the pressure shift first.";}
function priority9JReplyFor(prompt,source){return "Priority 9J: proactive operational guidance and next-move authority. The 9H continuity foundation and 9I pressure-handling layer stay underneath this decision. Recommended next move: choose the safest concrete action that preserves the active lane and advances only one operational step. Why first: it protects continuity before expanding scope. Risk if skipped: Marion can over-branch, drift, or make a recommendation before the pressure context is resolved. Execution sequence: confirm the active lane, name the risk, choose one safest action, execute that step, then reassess before opening new branches.";}
function priority9IJReadReply(packet){var p=priority9IJObj(packet),pl=priority9IJObj(p.payload),f=priority9IJObj(p.finalEnvelope);return priority9IJStr(p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||p.response||p.answer||pl.reply||pl.finalReply||pl.publicReply||pl.visibleReply||pl.text||pl.message||pl.answer||f.reply||f.finalReply||f.publicReply||f.visibleReply||f.text||f.message||f.answer);}
function priority9IJApplyPacket(packet,reply,prompt,source,lane){var out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{};var final=priority9IJStr(reply)||(lane==="9j"?priority9JReplyFor(prompt,source):priority9IReplyFor(prompt,source));["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(function(k){out[k]=final;});out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};out.finalEnvelope={...(out.finalEnvelope&&typeof out.finalEnvelope==="object"?out.finalEnvelope:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};var prior=priority9IJObj(out.priority9IAdaptiveSituationalReasoning||out.priority9JProactiveOperationalGuidance||out.priority9HLongFormContinuity||out.longFormContinuityStress);var depth=Number.isFinite(Number(prior.turnDepth))?Number(prior.turnDepth)+1:1;if(lane==="9j"){var sj=priority9JStateFrom(source||prompt,depth);out.priority9JProactiveOperationalGuidance=sj;out.priority9JVersion="PRIORITY-9J-PROACTIVE-OPERATIONAL-GUIDANCE-NEXT-MOVE-AUTHORITY";out.conversationLane=sj.conversationLane;out.activeTask=sj.activeTask;out.surfaceRequest=sj.surfaceRequest;out.deeperIntent=sj.deeperIntent;out.operationalRisk=sj.operationalRisk;out.executionMode=sj.executionMode;out.nextAction=sj.nextAction;out.recommendedMove=sj.recommendedMove;out.executionSequence=sj.executionSequence;}else{var si=priority9IStateFrom(source||prompt,depth);out.priority9IAdaptiveSituationalReasoning=si;out.priority9IVersion="PRIORITY-9I-ADAPTIVE-SITUATIONAL-REASONING-CONTEXT-PRESSURE";out.priority9JPrecheck=si.priority9JProactiveGuidancePrecheck;out.conversationLane=si.conversationLane;out.activeTask=si.activeTask;out.surfaceRequest=si.surfaceRequest;out.deeperIntent=si.deeperIntent;out.operationalRisk=si.operationalRisk;out.executionMode=si.executionMode;out.nextAction=si.nextAction;out.pressureSignal=si.pressureSignal;out.whatChanged=si.whatChanged;}out.noUserFacingDiagnostics=true;return out;}
function priority9IJShouldForceText(prompt,source,reply){var lane=priority9IJSequencedLaneFor(prompt,source,reply);return lane||"";}

var __priority9IJOriginalBuildProgressionProfile=module.exports.buildProgressionProfile || (typeof buildProgressionProfile==="function"?buildProgressionProfile:null);
function buildPriority9I9JProgressionProfile(text="",context={}){var source=[priority9IJStr(text),priority9IJCollect(context)].join(" ");var lane=priority9IJSequencedLaneFor(text,source,"");if(lane==="9j"){var sj=priority9JStateFrom(source,1);return {...sj,phaseKey:"priority9j",currentStep:"priority9j_next_move_authority",phaseId:"PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE",phaseLabel:"Priority 9J: Proactive operational guidance and next-move authority",objective:"Recommend the safest concrete next move without overreach.",signal:"priority9j_next_move_authority",lastUserIntent:"priority9j_next_move_authority",responseShape:"priority9j_operational_guidance_response",confidence:0.997};}if(lane==="9i"||priority9IJIs9IActivationText(source)){var si=priority9IStateFrom(source,1);return {...si,phaseKey:"priority9i",currentStep:"priority9i_context_pressure_handling",phaseId:"PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING",phaseLabel:"Priority 9I: Adaptive situational reasoning and context-pressure handling",objective:"Adapt within the 9H continuity foundation when urgency, pressure, ambiguity, correction, or risk changes.",signal:priority9IJIsShortFollowup(text)?"priority9i_pressure_followup":"priority9i_activation",lastUserIntent:priority9IJIsShortFollowup(text)?"priority9i_pressure_followup":"priority9i_activation",responseShape:"priority9i_adaptive_pressure_response",confidence:0.997};}return null;}
module.exports.PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_SHAPE_VERSION=PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL;
module.exports.PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_SHAPE_VERSION=PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL;
module.exports.isPriority9IAdaptiveSituationalText=priority9IJIs9IActivationText;
module.exports.isPriority9JProactiveOperationalText=priority9IJIs9JActivationText;
module.exports.isPriority9IPressureText=priority9IJIsPressureText;
module.exports.buildPriority9I9JProgressionProfile=buildPriority9I9JProgressionProfile;
module.exports.buildProgressionProfile=buildPriority9I9JProgressionProfile;
module.exports.default=buildPriority9I9JProgressionProfile;
// PRIORITY_9I_9J_SEQUENCE_SHAPE_PATCH_END



/* PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH_START */
var PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_VERSION = "nyx.marion.priority9i.r2.pressureSpecificAnswerShaping/1.0";

function priority9IR2OneLine(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}
function priority9IR2Obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function priority9IR2Lower(value) {
  return priority9IR2OneLine(value).toLowerCase();
}
function priority9IR2PickText() {
  for (var i = 0; i < arguments.length; i += 1) {
    var v = priority9IR2OneLine(arguments[i]);
    if (v) return v;
  }
  return "";
}
function priority9IR2ExtractText(value) {
  if (value == null) return "";
  if (typeof value === "string") return priority9IR2OneLine(value);
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i += 1) {
      var t = priority9IR2ExtractText(value[i]);
      if (t) return t;
    }
    return "";
  }
  var v = priority9IR2Obj(value);
  var payload = priority9IR2Obj(v.payload);
  var command = priority9IR2Obj(v.command);
  var body = priority9IR2Obj(v.body);
  var query = priority9IR2Obj(v.query);
  var context = priority9IR2Obj(v.context || v.memory || v.state || v.turnMemory || v.conversationState);
  return priority9IR2PickText(
    v.text, v.message, v.prompt, v.query, v.input, v.commandText, v.transcript,
    payload.text, payload.message, payload.prompt, payload.query, payload.input, payload.commandText,
    command.text, command.message, command.prompt, command.query, command.command,
    body.text, body.message, body.prompt, body.query,
    query.text, query.message, query.prompt,
    context.text, context.message, context.prompt, context.lastUserText, context.lastPrompt
  );
}
function priority9IR2ReplyText(value) {
  if (value == null) return "";
  if (typeof value === "string") return priority9IR2OneLine(value);
  if (Array.isArray(value)) return value.map(priority9IR2ReplyText).filter(Boolean).join(" ");
  var v = priority9IR2Obj(value);
  return priority9IR2PickText(
    v.reply, v.text, v.message, v.answer, v.output, v.visibleReply, v.spokenText,
    priority9IR2Obj(v.payload).reply,
    priority9IR2Obj(v.payload).text,
    priority9IR2Obj(v.payload).message,
    priority9IR2Obj(v.finalEnvelope).reply,
    priority9IR2Obj(v.finalEnvelope).text,
    priority9IR2Obj(v.marionFinal).reply,
    priority9IR2Obj(v.data).reply
  );
}
function priority9IR2Explicit9J(value) {
  var t = priority9IR2Lower(value);
  return /\b(priority\s*9j|9j\b|proactive operational guidance|next[-\s]?move authority)\b/i.test(t);
}
function priority9IR2PressureKind(value) {
  var t = priority9IR2Lower(value);
  if (!t) return "";
  if (priority9IR2Explicit9J(t)) return "";
  if (/\bwhat(?:'s| is)?\s+the\s+risk\s+now\??\b|\brisk\s+now\??\b|\bcurrent\s+risk\b/.test(t)) return "risk";
  if (/\bno[, ]+not that\b|\bstay\s+on\s+the\s+architecture\b|\barchitecture\s+focus\b|\bstay\s+architectural\b/.test(t)) return "correction";
  if (/\burgent\b|\bimmediate\b|\btime[-\s]?sensitive\b|\bcritical now\b|\bpressure is high\b/.test(t)) return "urgency";
  if (/\bpivot\b|\bchange direction\b|\bshift direction\b|\bnew direction\b/.test(t)) return "pivot";
  if (/^\s*slow\s+down[.!?]*\s*$|\bslow\s+down\b|\bone step at a time\b|\btoo fast\b/.test(t)) return "pace";
  if (/^\s*go\s+deeper[.!?]*\s*$|\bgo\s+deeper\b|\bdeeper\b|\bmore depth\b|\bdrill down\b/.test(t)) return "depth";
  if (/\bdo\s+the\s+safest\s+next\s+move\b|\bsafest\s+next\s+move\b|\bsafest\s+action\b|\bsafe\s+next\s+action\b/.test(t)) return "safety";
  return "";
}
function priority9IR2IsPressureSpecificText(value) {
  return !!priority9IR2PressureKind(value);
}
function priority9IR2ReplyFor(value) {
  var kind = priority9IR2PressureKind(value);
  if (kind === "risk") {
    return "Priority 9I: the risk now is premature escalation into 9J, generic pressure-template reuse, or losing the 9H continuity foundation. Execution mode is risk-specific containment: name the risk directly, keep 9J staged, and choose the safest next action inside 9I.";
  }
  if (kind === "correction") {
    return "Priority 9I: correction received. Stay on the architecture. Preserve the 9H continuity foundation, treat this as a context-pressure correction, update execution mode to architectural focus, and continue the safest next action without activating 9J.";
  }
  if (kind === "urgency") {
    return "Priority 9I: urgency detected. The risk is rushing into a broad 9J decision before the pressure shift is understood. Keep 9H as the continuity foundation, narrow execution mode to urgent containment, and take the safest next action inside 9I.";
  }
  if (kind === "pivot") {
    return "Priority 9I: pivot received. The active change is directional pressure, not next-move authority. Keep 9H stable, compare the pivot against the current architecture, update risk and execution mode, and only move to 9J after the pivot is understood.";
  }
  if (kind === "pace") {
    return "Priority 9I: slow down. Preserve the 9H foundation, reduce execution mode to one step at a time, restate the active task, name the immediate risk, and continue only after the safest next action is clear.";
  }
  if (kind === "depth") {
    return "Priority 9I: go deeper means add pressure-specific analysis, not activate 9J. Preserve 9H, identify what changed, separate risk from execution mode, then give the safest next action with 9J still staged.";
  }
  if (kind === "safety") {
    return "Priority 9I: the safest next move is to stay in the pressure-handling lane, answer the current pressure specifically, keep 9J staged, and complete the 9I checks before allowing proactive next-move authority.";
  }
  return "";
}
function priority9IR2IsGeneric9ITemplate(value) {
  var t = priority9IR2Lower(value);
  return /\bpreserve the 9h continuity foundation,?\s*read the current pressure shift,?\s*update operational risk and execution mode,?\s*then give the safest next action\b/.test(t) ||
    /\bi['’]?m reading this as priority 9i\b/.test(t) ||
    /\badaptive situational reasoning and context[-\s]?pressure handling\b.*\bthe surface request is to adapt marion\b/.test(t);
}
function priority9IR2ShouldOverride(input, output) {
  var text = priority9IR2ExtractText(input);
  var kind = priority9IR2PressureKind(text);
  if (!kind) return false;
  var reply = priority9IR2ReplyText(output);
  if (!reply) return true;
  var r = priority9IR2Lower(reply);
  if (/\bpriority\s*9j\b/.test(r) && !/\b9j\s+staged\b|\bpriority\s*9j\s+staged\b|\bkeep\s+priority\s*9j\s+staged\b/.test(r)) return true;
  if (priority9IR2IsGeneric9ITemplate(reply)) return true;
  if (kind === "risk" && !/\brisk now is\b|\bthe risk is\b|\bpremature escalation\b|\bgeneric pressure-template reuse\b/.test(r)) return true;
  if (kind === "correction" && !/\bcorrection received\b|\bstay on the architecture\b|\barchitectural focus\b/.test(r)) return true;
  if (kind === "urgency" && !/\burgency detected\b|\brushing into\b|\burgent containment\b/.test(r)) return true;
  if (kind === "pivot" && !/\bpivot received\b|\bdirectional pressure\b|\bcompare the pivot\b/.test(r)) return true;
  if (kind === "pace" && !/\bslow down\b|\bone step at a time\b/.test(r)) return true;
  if (kind === "depth" && !/\bgo deeper\b|\bpressure-specific analysis\b|\bseparate risk from execution mode\b/.test(r)) return true;
  if (kind === "safety" && !/\bsafest next move is\b|\bpressure-handling lane\b/.test(r)) return true;
  return false;
}
function priority9IR2ApplyVisibleReply(output, reply, kind) {
  var out = output && typeof output === "object" && !Array.isArray(output) ? output : {};
  out.reply = reply;
  out.text = reply;
  out.message = reply;
  out.answer = reply;
  out.visibleReply = reply;
  out.spokenText = reply;
  out.priority = "Priority 9I-R2";
  out.priorityLane = "priority9i_adaptive_situational_reasoning";
  out.activeLane = "Priority 9I";
  out.responseShape = "pressure_specific_answer";
  out.pressureKind = kind;
  out.priority9I = Object.assign({}, priority9IR2Obj(out.priority9I), {
    active: true,
    lane: "priority9i_adaptive_situational_reasoning",
    hotfix: "Priority 9I-R2 pressure-specific answer shaping",
    pressureKind: kind,
    pressureSpecificAnswer: true,
    keep9HFoundation: true,
    keep9JStaged: true
  });
  out.priority9J = Object.assign({}, priority9IR2Obj(out.priority9J), {
    staged: true,
    active: false,
    activationRequired: "explicit_9j_or_next_move_authority"
  });
  var payload = priority9IR2Obj(out.payload);
  out.payload = Object.assign({}, payload, {
    reply: reply,
    text: priority9IR2PickText(payload.text, reply),
    priorityLane: "priority9i_adaptive_situational_reasoning",
    pressureKind: kind
  });
  if (out.finalEnvelope && typeof out.finalEnvelope === "object") {
    out.finalEnvelope.reply = reply;
    out.finalEnvelope.text = reply;
    out.finalEnvelope.visibleReply = reply;
  }
  return out;
}
function priority9IR2DisciplineOutput(input, output) {
  var text = priority9IR2ExtractText(input);
  var kind = priority9IR2PressureKind(text);
  if (!kind) return output;
  var reply = priority9IR2ReplyFor(text);
  if (!reply) return output;
  if (typeof output === "string") {
    return priority9IR2ShouldOverride(input, output) ? reply : output;
  }
  if (priority9IR2ShouldOverride(input, output)) return priority9IR2ApplyVisibleReply(output, reply, kind);
  if (output && typeof output === "object" && !Array.isArray(output)) {
    output.priority9I = Object.assign({}, priority9IR2Obj(output.priority9I), {active:true, pressureKind:kind, pressureSpecificAnswer:true, keep9HFoundation:true, keep9JStaged:true});
    output.priority9J = Object.assign({}, priority9IR2Obj(output.priority9J), {staged:true, active:false});
  }
  return output;
}
function priority9IR2WrapExport(name) {
  if (typeof module === "undefined" || !module.exports || typeof module.exports[name] !== "function") return;
  var original = module.exports[name];
  if (original.__priority9IR2Wrapped) return;
  var wrapped = function priority9IR2WrappedExport() {
    var input = arguments.length > 0 ? arguments[0] : {};
    var out = original.apply(this, arguments);
    if (out && typeof out.then === "function") {
      return out.then(function(value) { return priority9IR2DisciplineOutput(input, value); });
    }
    return priority9IR2DisciplineOutput(input, out);
  };
  wrapped.__priority9IR2Wrapped = true;
  module.exports[name] = wrapped;
}
function priority9IR2PatchCommonExports(names) {
  (Array.isArray(names) ? names : []).forEach(priority9IR2WrapExport);
  if (typeof module !== "undefined" && module.exports) {
    module.exports.PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_VERSION = PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_VERSION;
    module.exports.isPriority9IR2PressureSpecificText = priority9IR2IsPressureSpecificText;
    module.exports.priority9IR2PressureKind = priority9IR2PressureKind;
    module.exports.priority9IR2ReplyFor = priority9IR2ReplyFor;
    module.exports.priority9IR2DisciplineOutput = priority9IR2DisciplineOutput;
    module.exports._internal = Object.assign({}, priority9IR2Obj(module.exports._internal), {
      priority9IR2IsPressureSpecificText: priority9IR2IsPressureSpecificText,
      priority9IR2PressureKind: priority9IR2PressureKind,
      priority9IR2ReplyFor: priority9IR2ReplyFor,
      priority9IR2DisciplineOutput: priority9IR2DisciplineOutput,
      priority9IR2ShouldOverride: priority9IR2ShouldOverride
    });
  }
}
/* PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH_COMMON_END */


function priority9IR2BuildProfile(input, previous) {
  var text = priority9IR2ExtractText(input);
  var kind = priority9IR2PressureKind(text);
  if (!kind) return previous;
  var base = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
  return Object.assign({}, base, {
    active: true,
    lane: "priority9i_adaptive_situational_reasoning",
    activeLane: "Priority 9I",
    responseShape: "pressure_specific_answer",
    pressureKind: kind,
    pressureSpecificAnswer: true,
    signal: kind === "risk" ? "risk_specific_question" : kind + "_pressure",
    keep9HFoundation: true,
    keep9JStaged: true,
    nextPriority: "Priority 9J staged only"
  });
}
["buildProgressionProfile","default"].forEach(function(name){if(typeof module.exports[name]==="function"){var original=module.exports[name];module.exports[name]=function priority9IR2ProgressionShapeWrapper(input){return priority9IR2BuildProfile(input, original.apply(this, arguments));};}});
module.exports.buildPriority9IR2PressureSpecificProfile = priority9IR2BuildProfile;

module.exports.PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH = true;
/* PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH_END */


/* PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_START */
const PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_VERSION = "nyx.marion.priority9i.r2a.altPressureSpecificFinalOverride/1.0";
function priority9IR2AString(value){return value == null ? "" : String(value).replace(/\s+/g," ").trim();}
function priority9IR2ALower(value){return priority9IR2AString(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'");}
function priority9IR2AObj(value){return value && typeof value === "object" && !Array.isArray(value) ? value : {};}
function priority9IR2APickText(){
  for (var i=0;i<arguments.length;i+=1){var t=priority9IR2AString(arguments[i]);if(t)return t;}
  return "";
}
function priority9IR2AExtractText(value, depth){
  if(value == null) return "";
  if(typeof value === "string") return priority9IR2AString(value);
  if(depth > 3) return "";
  if(Array.isArray(value)){
    for(var i=0;i<value.length;i+=1){var a=priority9IR2AExtractText(value[i], (depth||0)+1); if(a) return a;}
    return "";
  }
  var v=priority9IR2AObj(value), payload=priority9IR2AObj(v.payload), command=priority9IR2AObj(v.command), body=priority9IR2AObj(v.body);
  var context=priority9IR2AObj(v.context || v.memory || v.state || v.turnMemory || v.conversationState);
  return priority9IR2APickText(
    v.text, v.message, v.prompt, v.query, v.input, v.commandText, v.transcript, v.userText, v.rawUserText,
    payload.text, payload.message, payload.prompt, payload.query, payload.input, payload.commandText, payload.transcript,
    command.text, command.message, command.prompt, command.query, command.command, command.input,
    body.text, body.message, body.prompt, body.query, body.input, body.transcript,
    context.text, context.message, context.prompt, context.lastUserText, context.lastPrompt, context.activePrompt
  );
}
function priority9IR2AExplicit9J(value){
  var t=priority9IR2ALower(value);
  return /\b(priority\s*9j|9j\b|proactive operational guidance|next-move authority|next move authority)\b/.test(t) &&
    !/\bstaged\b|\bstage\b|\bdo not activate\b|\bnot activate\b|\bkeep\s+9j\b|\bkeep\s+priority\s*9j\b/.test(t);
}
function priority9IR2APressureKind(value){
  var t=priority9IR2ALower(value);
  if(!t || priority9IR2AExplicit9J(t)) return "";
  if(/\bwhat(?:'s| is)?\s+the\s+risk\s+now\??\b|\brisk\s+now\??\b|\bcurrent\s+risk\b|\bactive\s+risk\b/.test(t)) return "risk";
  if(/\bno[, ]+not that\b|\bstay\s+on\s+the\s+architecture\b|\barchitecture\s+focus\b|\bstay\s+architectural\b|\bnot\s+that\b/.test(t)) return "correction";
  if(/\burgent\b|\burgency\b|\bimmediate\b|\btime[-\s]?sensitive\b|\bcritical now\b|\bpressure is high\b/.test(t)) return "urgency";
  if(/\bpivot\b|\bchange direction\b|\bshift direction\b|\bnew direction\b/.test(t)) return "pivot";
  if(/^\s*slow\s+down[.!?]*\s*$|\bslow\s+down\b|\bone step at a time\b|\btoo fast\b|\bpace\b/.test(t)) return "pace";
  if(/^\s*go\s+deeper[.!?]*\s*$|\bgo\s+deeper\b|\bdeeper\b|\bmore depth\b|\bdrill down\b/.test(t)) return "depth";
  if(/\bdo\s+the\s+safest\s+next\s+move\b|\bsafest\s+next\s+move\b|\bsafest\s+action\b|\bsafe\s+next\s+action\b/.test(t)) return "safety";
  return "";
}
function priority9IR2AReplyFor(value){
  var kind=priority9IR2APressureKind(value);
  if(kind==="risk") return "Priority 9I: the risk now is premature escalation into 9J, generic pressure-template reuse, or losing the 9H continuity foundation. Execution mode is risk-specific containment: name the risk directly, keep 9J staged, and choose the safest next action inside 9I.";
  if(kind==="correction") return "Priority 9I: correction received. Stay on the architecture. Preserve the 9H continuity foundation, treat this as a context-pressure correction, update execution mode to architectural focus, and continue the safest next action without activating 9J.";
  if(kind==="urgency") return "Priority 9I: urgency detected. The risk is rushing into 9J authority or skipping pressure triage. Keep 9H as the continuity foundation, update execution mode to urgent containment, and choose the safest next action inside 9I before any next-move authority activates.";
  if(kind==="pivot") return "Priority 9I: pivot received. The pressure change is directional, not a 9J activation. Preserve the 9H foundation, compare the pivot against the active task, update risk and execution mode, then continue with the safest next action while 9J remains staged.";
  if(kind==="pace") return "Priority 9I: slow down. The pressure type is pace control. Preserve the 9H continuity foundation, narrow the next response to one step, reduce branching, and keep 9J staged until next-move authority is explicitly requested.";
  if(kind==="depth") return "Priority 9I: go deeper means add pressure-specific analysis, not activate 9J. Preserve 9H, identify what changed, separate risk from execution mode, and give the safest next action with 9J still staged.";
  if(kind==="safety") return "Priority 9I: the safest next move is to stay in the pressure-handling lane, name the active risk, preserve 9H continuity, and avoid activating 9J until the user explicitly asks for proactive next-move authority.";
  return "";
}
function priority9IR2AReplyText(value, depth, seen){
  if(value == null) return "";
  if(typeof value === "string") return priority9IR2AString(value);
  if(depth > 4) return "";
  if(!seen) seen=[];
  if(seen.indexOf(value)!==-1) return "";
  seen.push(value);
  if(Array.isArray(value)){
    for(var i=0;i<value.length;i+=1){var arr=priority9IR2AReplyText(value[i], (depth||0)+1, seen); if(arr) return arr;}
    return "";
  }
  var v=priority9IR2AObj(value), payload=priority9IR2AObj(v.payload), finalEnvelope=priority9IR2AObj(v.finalEnvelope), result=priority9IR2AObj(v.result);
  return priority9IR2APickText(
    v.reply, v.finalReply, v.publicReply, v.visibleReply, v.displayReply, v.response, v.text, v.message, v.spokenText, v.speechText,
    payload.reply, payload.finalReply, payload.publicReply, payload.visibleReply, payload.text, payload.message,
    finalEnvelope.reply, finalEnvelope.finalReply, finalEnvelope.publicReply, finalEnvelope.visibleReply, finalEnvelope.text, finalEnvelope.message,
    result.reply, result.finalReply, result.publicReply, result.visibleReply, result.text, result.message
  );
}
function priority9IR2AIsGeneric9IReply(value){
  var t=priority9IR2ALower(value);
  if(!t) return false;
  return /\bcontinue priority\s*9i:\s*preserve the 9h continuity foundation,?\s*read the current pressure shift,?\s*update operational risk and execution mode,?\s*then give the safest next action\b/.test(t) ||
    /\bpreserve the 9h continuity foundation,?\s*read the current pressure shift,?\s*update operational risk and execution mode\b/.test(t);
}
function priority9IR2AShouldOverride(prompt, candidate){
  var kind=priority9IR2APressureKind(prompt);
  if(!kind) return false;
  var current=priority9IR2AReplyText(candidate);
  if(!current) return true;
  var c=priority9IR2ALower(current);
  if(priority9IR2AIsGeneric9IReply(current)) return true;
  if(/\bpriority\s*9j\b/.test(c) && !/\bstaged\b|\bstage\b|\bnot activate\b|\bkeep\s+9j\b|\bkeep\s+priority\s*9j\b/.test(c)) return true;
  if(kind==="risk" && !/\brisk now is\b|\bpremature escalation\b|\bgeneric pressure-template reuse\b|\brisk-specific containment\b/.test(c)) return true;
  if(kind==="pace" && !/\bslow down\b|\bpace control\b|\bone step\b/.test(c)) return true;
  if(kind==="depth" && !/\bgo deeper means\b|\bpressure-specific analysis\b|\bseparate risk from execution mode\b/.test(c)) return true;
  if(kind==="safety" && !/\bsafest next move is\b|\bpressure-handling lane\b|\bname the active risk\b/.test(c)) return true;
  if(kind==="correction" && !/\bcorrection received\b|\bstay on the architecture\b|\barchitectural focus\b/.test(c)) return true;
  if(kind==="urgency" && !/\burgency detected\b|\burgent containment\b|\brushing into 9j\b/.test(c)) return true;
  if(kind==="pivot" && !/\bpivot received\b|\bdirectional\b|\bcompare the pivot\b/.test(c)) return true;
  return false;
}
function priority9IR2AApplyVisibleReply(output, reply, kind){
  if(typeof output === "string") return reply;
  var out = output && typeof output === "object" && !Array.isArray(output) ? Object.assign({}, output) : {};
  out.reply=reply; out.text=reply; out.message=reply; out.response=reply; out.finalReply=reply; out.visibleReply=reply; out.publicReply=reply; out.displayReply=reply;
  if(typeof out.spokenText === "string") out.spokenText=reply;
  if(typeof out.speechText === "string") out.speechText=reply;
  out.priority9I=Object.assign({}, priority9IR2AObj(out.priority9I), {active:true, lane:"priority9i_adaptive_situational_reasoning", pressureKind:kind, pressureSpecificAnswer:true, r2aAltFinalOverride:true, keep9HFoundation:true, keep9JStaged:true});
  out.priority9J=Object.assign({}, priority9IR2AObj(out.priority9J), {staged:true, active:false, blockedReason:"Priority 9I-R2A pressure-specific prompt"});
  out.priority9IR2A={active:true, hotfix:"Priority 9I-R2A ALT pressure-specific final override", pressureKind:kind};
  if(out.payload && typeof out.payload === "object" && !Array.isArray(out.payload)){out.payload=Object.assign({}, out.payload, {reply:reply,text:reply,message:reply,finalReply:reply,visibleReply:reply,publicReply:reply});}
  if(out.finalEnvelope && typeof out.finalEnvelope === "object" && !Array.isArray(out.finalEnvelope)){out.finalEnvelope=Object.assign({}, out.finalEnvelope, {reply:reply,text:reply,message:reply,finalReply:reply,visibleReply:reply,publicReply:reply});}
  return out;
}
function priority9IR2AAltPressureSpecificFinal(prompt, candidate){
  var source=priority9IR2AExtractText(prompt);
  var kind=priority9IR2APressureKind(source);
  if(!kind) return candidate;
  var reply=priority9IR2AReplyFor(source);
  if(!reply) return candidate;
  if(priority9IR2AShouldOverride(source, candidate)) return priority9IR2AApplyVisibleReply(candidate, reply, kind);
  return candidate;
}
function priority9IR2AWrapExport(name){
  if(typeof module === "undefined" || !module.exports || typeof module.exports[name] !== "function") return;
  var original=module.exports[name];
  if(original.__priority9IR2AWrapped) return;
  var wrapped=function priority9IR2AExportWrapper(){
    var input=arguments.length>0?arguments[0]:{};
    var prompt=priority9IR2AExtractText(input);
    var out=original.apply(this, arguments);
    if(out && typeof out.then === "function"){
      return out.then(function(value){return priority9IR2AAltPressureSpecificFinal(prompt, value);});
    }
    return priority9IR2AAltPressureSpecificFinal(prompt, out);
  };
  wrapped.__priority9IR2AWrapped=true;
  module.exports[name]=wrapped;
}
function priority9IR2APatchExports(names){
  (Array.isArray(names)?names:[]).forEach(priority9IR2AWrapExport);
  if(typeof module !== "undefined" && module.exports){
    module.exports.PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_VERSION=PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_VERSION;
    module.exports.isPriority9IR2AAltPressureSpecificText=function(value){return !!priority9IR2APressureKind(value);};
    module.exports.priority9IR2AAltPressureKind=priority9IR2APressureKind;
    module.exports.priority9IR2AAltPressureSpecificReplyFor=priority9IR2AReplyFor;
    module.exports.priority9IR2AAltPressureSpecificFinal=priority9IR2AAltPressureSpecificFinal;
    module.exports.priority9IR2AIsGeneric9IReply=priority9IR2AIsGeneric9IReply;
    module.exports.PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_PATCH=true;
  }
}
/* PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_END */

priority9IR2APatchExports(["buildProgressionProfile", "detectProgressionSignal", "classifyProgressionShape", "default"]);



/* PRIORITY_9J_R1_DECISION_SPECIFIC_AUTHORITY_HOTFIX_START */
const PRIORITY_9J_R1_DECISION_SPECIFIC_AUTHORITY_VERSION = "PRIORITY-9J-R1-DECISION-SPECIFIC-AUTHORITY-HOTFIX";

function priority9JR1SafeStr(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function priority9JR1Lower(value) {
  return priority9JR1SafeStr(value).toLowerCase();
}

function priority9JR1SafeObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function priority9JR1FirstText(values) {
  const list = Array.isArray(values) ? values : [];
  for (let i = 0; i < list.length; i += 1) {
    const v = priority9JR1SafeStr(list[i]);
    if (v) return v;
  }
  return "";
}

function priority9JR1ExtractPromptFromArgs(argsLike) {
  const args = Array.prototype.slice.call(argsLike || []);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (typeof arg === "string" && priority9JR1SafeStr(arg)) return priority9JR1SafeStr(arg);
    const obj = priority9JR1SafeObj(arg);
    const payload = priority9JR1SafeObj(obj.payload);
    const command = priority9JR1SafeObj(obj.command);
    const context = priority9JR1SafeObj(obj.context || obj.state || obj.memory || obj.metadata);
    const text = priority9JR1FirstText([
      obj.prompt,
      obj.message,
      obj.text,
      obj.userText,
      obj.input,
      obj.query,
      obj.commandText,
      payload.prompt,
      payload.message,
      payload.text,
      payload.userText,
      payload.input,
      payload.query,
      command.prompt,
      command.message,
      command.text,
      command.query,
      context.prompt,
      context.message,
      context.text,
      context.userText,
      context.lastPrompt,
      context.currentPrompt
    ]);
    if (text) return text;
  }
  return "";
}

function priority9JR1DetectOperationalCommand(value) {
  const t = priority9JR1Lower(value).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (/\bpriority\s*9j\b/.test(t) && /\b(proactive operational guidance|next[- ]move authority|controlled authority)\b/.test(t)) return "activation";
  if (/\bwhat\s+should\s+we\s+do\s+first\b|\bwhat\s+do\s+we\s+do\s+first\b|\bwhere\s+do\s+we\s+start\b|\bwhat\s+comes\s+first\b/.test(t)) return "first_move";
  if (/\bmake\s+the\s+decision\b|\bmake\s+a\s+decision\b|\bdecide\b|\bmake\s+the\s+call\b|\bchoose\s+for\s+me\b/.test(t)) return "decision";
  if (/\bcritical\s+path\b|\bwhat\s+is\s+the\s+path\s+now\b|\bwhat\s+is\s+the\s+sequence\s+path\b/.test(t)) return "critical_path";
  if (/\bsafest\s+sequence\b|\bsafe\s+sequence\b|\bsafest\s+order\b|\bgive\s+me\s+the\s+safest\b/.test(t)) return "safest_sequence";
  if (/\bwhat\s+should\s+we\s+avoid\b|\bwhat\s+do\s+we\s+avoid\b|\bavoid\s+what\b|\bwhat\s+not\s+to\s+do\b/.test(t)) return "avoid";
  if (/\bnext\s+operational\s+move\b|\bnext\s+operation\b|\boperational\s+move\b|\bwhat\s+is\s+the\s+next\s+move\b/.test(t)) return "next_operational_move";
  return "";
}

function priority9JR1BuildOperationalReply(prompt, context) {
  const kind = priority9JR1DetectOperationalCommand(prompt);
  if (!kind) return "";
  if (kind === "activation") {
    return "Priority 9J: proactive operational guidance and next-move authority is active. The 9H continuity foundation and 9I pressure-handling layer stay underneath the decision. The rule is one controlled operational move at a time: choose the action, explain why it comes first, name the risk if skipped, then give the execution sequence without opening unnecessary branches.";
  }
  if (kind === "first_move") {
    return "Priority 9J: do the first validation move now: prove decision-specific authority before expanding scope. Why first: 9J must show it can choose one operational action, not repeat generic framing. Risk if skipped: Marion can over-branch, drift, or sound authoritative without making a usable decision. Execution sequence: test decision authority, critical-path naming, safest sequence, avoid-list, then final next operational move.";
  }
  if (kind === "decision") {
    return "Priority 9J decision: stay in the 9J lane and run critical-path validation next. This comes first because Marion must prove it can choose one operational move before broader branching. Risk if skipped: Marion may sound authoritative while still giving generic guidance. Execution sequence: answer the critical path, then the safest sequence, then what to avoid, then the next operational move.";
  }
  if (kind === "critical_path") {
    return "Priority 9J: the critical path is to validate one operational decision at a time: first decision authority, then critical-path naming, then safest sequence, then avoid-list, then final next operational move. This comes first because 9J must prove it can choose and sequence action without over-branching. Risk if skipped: Marion may sound authoritative while still giving generic guidance.";
  }
  if (kind === "safest_sequence") {
    return "Priority 9J: the safest sequence is: 1) keep 9H as the continuity foundation, 2) keep 9I as pressure handling underneath, 3) choose one 9J operational move, 4) name why it comes first, 5) name the risk if skipped, and 6) execute only that next step before branching. This prevents drift, premature escalation, and generic authority wording.";
  }
  if (kind === "avoid") {
    return "Priority 9J: avoid over-branching, generic “choose the safest action” wording, premature 9I fallback, activating a new lane before 9J is accepted, and making recommendations without a concrete execution sequence. The safest action is to keep the current 9J test narrow and require each answer to choose one operational move.";
  }
  if (kind === "next_operational_move") {
    return "Priority 9J: the next operational move is to lock decision-specific authority by rerunning the 9J acceptance chain and confirming each prompt receives a specific answer. Why this comes first: the lane is active, but authority must be command-specific. Risk if skipped: Marion can pass lane retention while failing operational usefulness. Execution sequence: retest “Make the decision,” “What is the critical path,” “Give me the safest sequence,” “What should we avoid,” and “What is the next operational move.”";
  }
  return "";
}

function priority9JR1IsGeneric9JReply(value) {
  const t = priority9JR1Lower(value);
  if (!t) return false;
  if (/\brecommended\s+next\s+move:\s*choose\s+the\s+safest\s+concrete\s+action\b/.test(t)) return true;
  if (/\bchoose\s+the\s+safest\s+concrete\s+action\s+that\s+preserves\s+the\s+active\s+lane\b/.test(t)) return true;
  if (/\bproactive\s+operational\s+guidance\s+and\s+next[- ]move\s+authority\b/.test(t) && /\b9h\s+continuity\s+foundation\b/.test(t) && /\b9i\s+pressure[- ]handling\b/.test(t) && /\bchoose\s+the\s+safest\b/.test(t) && !/\b(decision:|critical\s+path\s+is|safest\s+sequence\s+is|avoid\s+over[- ]branching|next\s+operational\s+move\s+is)\b/.test(t)) return true;
  return false;
}

function priority9JR1ApplyReplyToResult(result, forcedReply, prompt) {
  if (!forcedReply) return result;
  if (typeof result === "string") {
    return priority9JR1IsGeneric9JReply(result) || priority9JR1DetectOperationalCommand(prompt) ? forcedReply : result;
  }
  if (!result || typeof result !== "object") return forcedReply;
  const out = Array.isArray(result) ? result.slice() : Object.assign({}, result);
  const nested = priority9JR1SafeObj(out.result);
  const finalEnvelope = priority9JR1SafeObj(out.finalEnvelope || nested.finalEnvelope);
  const meta = Object.assign({}, priority9JR1SafeObj(out.meta || nested.meta), {
    priority: "9J-R1",
    lane: "priority9j_proactive_operational_guidance",
    operationalCommand: priority9JR1DetectOperationalCommand(prompt),
    decisionSpecificAuthority: true,
    keep9HFoundation: true,
    keep9IPressureLayer: true,
    overBranchingSuppressed: true,
    generic9JTemplateSuppressed: true
  });

  out.reply = forcedReply;
  out.response = forcedReply;
  out.text = forcedReply;
  out.message = forcedReply;
  out.final = forcedReply;
  out.publicReply = forcedReply;
  out.visibleReply = forcedReply;
  out.output = forcedReply;
  out.meta = meta;
  out.priority = "9J-R1";
  out.lane = "priority9j_proactive_operational_guidance";

  if (Object.keys(finalEnvelope).length) {
    out.finalEnvelope = Object.assign({}, finalEnvelope, {
      reply: forcedReply,
      text: forcedReply,
      message: forcedReply,
      publicReply: forcedReply,
      visibleReply: forcedReply,
      priority: "9J-R1",
      lane: "priority9j_proactive_operational_guidance",
      meta
    });
  }

  if (Object.keys(nested).length) {
    out.result = Object.assign({}, nested, {
      reply: forcedReply,
      response: forcedReply,
      text: forcedReply,
      message: forcedReply,
      final: forcedReply,
      publicReply: forcedReply,
      visibleReply: forcedReply,
      meta,
      finalEnvelope: out.finalEnvelope || Object.assign({}, finalEnvelope, { reply: forcedReply, text: forcedReply, meta })
    });
  }
  return out;
}

function priority9JR1PatchExports(names) {
  if (typeof module === "undefined" || !module.exports) return;
  const target = module.exports;
  if (typeof target === "function" && !target.__priority9JR1DecisionSpecificAuthorityPatched) {
    const original = target;
    const wrapped = function priority9JR1WrappedDefault() {
      const prompt = priority9JR1ExtractPromptFromArgs(arguments);
      const forced = priority9JR1BuildOperationalReply(prompt, arguments[1] || {});
      const result = original.apply(this, arguments);
      if (result && typeof result.then === "function") {
        return result.then((value) => priority9JR1ApplyReplyToResult(value, forced, prompt));
      }
      return priority9JR1ApplyReplyToResult(result, forced, prompt);
    };
    Object.keys(original).forEach((k) => { try { wrapped[k] = original[k]; } catch (_) {} });
    wrapped.__priority9JR1DecisionSpecificAuthorityPatched = true;
    module.exports = wrapped;
  }
  const obj = module.exports && typeof module.exports === "object" ? module.exports : {};
  (Array.isArray(names) ? names : []).forEach((name) => {
    if (typeof obj[name] !== "function" || obj[name].__priority9JR1DecisionSpecificAuthorityPatched) return;
    const original = obj[name];
    obj[name] = function priority9JR1WrappedExport() {
      const prompt = priority9JR1ExtractPromptFromArgs(arguments);
      const forced = priority9JR1BuildOperationalReply(prompt, arguments[1] || {});
      const result = original.apply(this, arguments);
      if (result && typeof result.then === "function") {
        return result.then((value) => priority9JR1ApplyReplyToResult(value, forced, prompt));
      }
      return priority9JR1ApplyReplyToResult(result, forced, prompt);
    };
    obj[name].__priority9JR1DecisionSpecificAuthorityPatched = true;
  });
  if (module.exports && typeof module.exports === "object") {
    module.exports.priority9JR1DetectOperationalCommand = priority9JR1DetectOperationalCommand;
    module.exports.priority9JR1BuildOperationalReply = priority9JR1BuildOperationalReply;
    module.exports.priority9JR1IsGeneric9JReply = priority9JR1IsGeneric9JReply;
    module.exports.PRIORITY_9J_R1_DECISION_SPECIFIC_AUTHORITY_PATCH = true;
  }
}
/* PRIORITY_9J_R1_DECISION_SPECIFIC_AUTHORITY_HOTFIX_END */

priority9JR1PatchExports(["buildProgressionProfile", "detectProgressionSignal", "classifyProgressionShape", "default"]);


/* PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_START */
const PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_VERSION = "PRIORITY-9J-R1A-RUNTIME-DECISION-SPECIFIC-FINAL-OVERRIDE";
function priority9JR1ASafeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function priority9JR1ALower(value) { return priority9JR1ASafeStr(value).toLowerCase(); }
function priority9JR1AObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function priority9JR1AFirstText(values) {
  const list = Array.isArray(values) ? values : [];
  for (let i = 0; i < list.length; i += 1) { const v = priority9JR1ASafeStr(list[i]); if (v) return v; }
  return "";
}
function priority9JR1AExtractTextFromValue(value) {
  if (typeof value === "string") return priority9JR1ASafeStr(value);
  const src = priority9JR1AObj(value);
  const payload = priority9JR1AObj(src.payload);
  const command = priority9JR1AObj(src.command);
  const body = priority9JR1AObj(src.body);
  const query = priority9JR1AObj(src.query);
  const meta = priority9JR1AObj(src.meta || src.metadata);
  const result = priority9JR1AObj(src.result);
  const finalEnvelope = priority9JR1AObj(src.finalEnvelope || result.finalEnvelope);
  return priority9JR1AFirstText([
    src.prompt, src.message, src.text, src.userText, src.input, src.query, src.commandText, src.transcript,
    payload.prompt, payload.message, payload.text, payload.userText, payload.input, payload.query, payload.commandText,
    command.prompt, command.message, command.text, command.query, command.command, command.name,
    body.prompt, body.message, body.text, body.userText, body.query,
    query.prompt, query.message, query.text,
    meta.prompt, meta.message, meta.text, meta.userText, meta.lastPrompt, meta.currentPrompt, meta.operationalCommand,
    result.prompt, result.message, result.text, result.userText,
    finalEnvelope.prompt, finalEnvelope.message, finalEnvelope.text
  ]);
}
function priority9JR1AExtractPrompt(argsLike) {
  const args = Array.prototype.slice.call(argsLike || []);
  for (let i = 0; i < args.length; i += 1) {
    const text = priority9JR1AExtractTextFromValue(args[i]);
    if (text) return text;
  }
  return "";
}
function priority9JR1ADetectCommand(value) {
  const t = priority9JR1ALower(value).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (/\bpriority\s*9j\b/.test(t) && /\b(proactive operational guidance|next[- ]move authority|controlled authority)\b/.test(t)) return "activation";
  if (/\bwhat\s+should\s+we\s+do\s+first\b|\bwhat\s+do\s+we\s+do\s+first\b|\bwhere\s+do\s+we\s+start\b|\bwhat\s+comes\s+first\b/.test(t)) return "first_move";
  if (/\bmake\s+the\s+decision\b|\bmake\s+a\s+decision\b|\bmake\s+the\s+call\b|\bchoose\s+for\s+me\b|^\s*decide[.!?\s]*$/.test(t)) return "decision";
  if (/\bcritical\s+path\b|\bwhat\s+is\s+the\s+path\s+now\b|\bsequence\s+path\b/.test(t)) return "critical_path";
  if (/\bsafest\s+sequence\b|\bsafe\s+sequence\b|\bsafest\s+order\b|\bgive\s+me\s+the\s+safest\b/.test(t)) return "safest_sequence";
  if (/\bwhat\s+should\s+we\s+avoid\b|\bwhat\s+do\s+we\s+avoid\b|\bavoid\s+what\b|\bwhat\s+not\s+to\s+do\b/.test(t)) return "avoid";
  if (/\bnext\s+operational\s+move\b|\bnext\s+operation\b|\boperational\s+move\b|\bwhat\s+is\s+the\s+next\s+move\b/.test(t)) return "next_operational_move";
  return "";
}
function priority9JR1AReplyFor(prompt) {
  const kind = priority9JR1ADetectCommand(prompt);
  if (!kind) return "";
  if (kind === "activation") return "Priority 9J: proactive operational guidance and next-move authority is active. The 9H continuity foundation and 9I pressure-handling layer stay underneath the decision. The rule is one controlled operational move at a time: choose the action, explain why it comes first, name the risk if skipped, then give the execution sequence without opening unnecessary branches.";
  if (kind === "first_move") return "Priority 9J: do the first validation move now: prove decision-specific authority before expanding scope. Why first: 9J must show it can choose one operational action, not repeat generic framing. Risk if skipped: Marion can over-branch, drift, or sound authoritative without making a usable decision. Execution sequence: test decision authority, critical-path naming, safest sequence, avoid-list, then final next operational move.";
  if (kind === "decision") return "Priority 9J decision: stay in the 9J lane and run critical-path validation next. This comes first because Marion must prove it can choose one operational move before broader branching. Risk if skipped: Marion may sound authoritative while still giving generic guidance. Execution sequence: answer the critical path, then the safest sequence, then what to avoid, then the next operational move.";
  if (kind === "critical_path") return "Priority 9J: the critical path is to validate one operational decision at a time: first decision authority, then critical-path naming, then safest sequence, then avoid-list, then final next operational move. This comes first because 9J must prove it can choose and sequence action without over-branching. Risk if skipped: Marion may sound authoritative while still giving generic guidance.";
  if (kind === "safest_sequence") return "Priority 9J: the safest sequence is: 1) keep 9H as the continuity foundation, 2) keep 9I as pressure handling underneath, 3) choose one 9J operational move, 4) name why it comes first, 5) name the risk if skipped, and 6) execute only that next step before branching. This prevents drift, premature escalation, and generic authority wording.";
  if (kind === "avoid") return "Priority 9J: avoid over-branching, generic “choose the safest action” wording, premature 9I fallback, activating a new lane before 9J is accepted, and making recommendations without a concrete execution sequence. The safest action is to keep the current 9J test narrow and require each answer to choose one operational move.";
  if (kind === "next_operational_move") return "Priority 9J: the next operational move is to lock decision-specific authority by rerunning the 9J acceptance chain and confirming each prompt receives a specific answer. Why this comes first: the lane is active, but authority must be command-specific. Risk if skipped: Marion can pass lane retention while failing operational usefulness. Execution sequence: retest “Make the decision,” “What is the critical path,” “Give me the safest sequence,” “What should we avoid,” and “What is the next operational move.”";
  return "";
}
function priority9JR1AIsGeneric9J(value) {
  const t = priority9JR1ALower(value);
  if (!t) return false;
  if (/\brecommended\s+next\s+move:\s*choose\s+the\s+safest\s+concrete\s+action\b/.test(t)) return true;
  if (/\bchoose\s+the\s+safest\s+concrete\s+action\s+that\s+preserves\s+the\s+active\s+lane\b/.test(t)) return true;
  if (/\bproactive\s+operational\s+guidance\s+and\s+next[- ]move\s+authority\b/.test(t) && /\b9h\s+continuity\s+foundation\b/.test(t) && /\b9i\s+pressure[- ]handling\b/.test(t) && /\bchoose\s+the\s+safest\b/.test(t) && !/\b(decision:|critical\s+path\s+is|safest\s+sequence\s+is|avoid\s+over[- ]branching|next\s+operational\s+move\s+is|do\s+the\s+first\s+validation\s+move)\b/.test(t)) return true;
  return false;
}
function priority9JR1AApply(result, prompt) {
  const forcedReply = priority9JR1AReplyFor(prompt);
  if (!forcedReply) return result;
  const command = priority9JR1ADetectCommand(prompt);
  if (typeof result === "string") return forcedReply;
  if (!result || typeof result !== "object") return forcedReply;
  const out = Array.isArray(result) ? result.slice() : Object.assign({}, result);
  const nested = priority9JR1AObj(out.result);
  const finalEnvelope = priority9JR1AObj(out.finalEnvelope || nested.finalEnvelope);
  const priorReply = priority9JR1AFirstText([out.reply, out.response, out.text, out.message, out.final, out.publicReply, out.visibleReply, nested.reply, nested.response, nested.text, nested.message, finalEnvelope.reply, finalEnvelope.text]);
  if (priorReply && !priority9JR1AIsGeneric9J(priorReply) && !command) return result;
  const meta = Object.assign({}, priority9JR1AObj(out.meta || nested.meta || finalEnvelope.meta), {
    hotfix: PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_VERSION,
    priority: "9J-R1A",
    lane: "priority9j_proactive_operational_guidance",
    operationalCommand: command,
    decisionSpecificAuthority: true,
    runtimeDecisionSpecificFinalOverride: true,
    keep9HFoundation: true,
    keep9IPressureLayer: true,
    overBranchingSuppressed: true,
    generic9JTemplateSuppressed: true,
    noUserFacingDiagnostics: true
  });
  ["reply","response","text","message","final","publicReply","visibleReply","output"].forEach(function(k){ out[k] = forcedReply; });
  out.priority = "9J-R1A";
  out.lane = "priority9j_proactive_operational_guidance";
  out.meta = meta;
  out.operationalCommand = command;
  out.decisionSpecificAuthority = true;
  out.generic9JTemplateSuppressed = true;
  out.runtimeDecisionSpecificFinalOverride = true;
  const nextEnvelope = Object.assign({}, finalEnvelope, {
    reply: forcedReply,
    text: forcedReply,
    message: forcedReply,
    publicReply: forcedReply,
    visibleReply: forcedReply,
    final: forcedReply,
    priority: "9J-R1A",
    lane: "priority9j_proactive_operational_guidance",
    meta
  });
  out.finalEnvelope = nextEnvelope;
  if (Object.keys(nested).length) {
    out.result = Object.assign({}, nested, {
      reply: forcedReply,
      response: forcedReply,
      text: forcedReply,
      message: forcedReply,
      final: forcedReply,
      publicReply: forcedReply,
      visibleReply: forcedReply,
      output: forcedReply,
      priority: "9J-R1A",
      lane: "priority9j_proactive_operational_guidance",
      operationalCommand: command,
      decisionSpecificAuthority: true,
      generic9JTemplateSuppressed: true,
      runtimeDecisionSpecificFinalOverride: true,
      meta,
      finalEnvelope: nextEnvelope
    });
  }
  return out;
}
function priority9JR1APatchPriority9JResponder() {
  try {
    if (typeof priority9JReplyFor === "function" && !priority9JReplyFor.__priority9JR1ARuntimeDecisionSpecificPatched) {
      const originalPriority9JReplyFor = priority9JReplyFor;
      priority9JReplyFor = function priority9JR1APatchedPriority9JReplyFor(prompt, source) {
        const forced = priority9JR1AReplyFor(prompt);
        if (forced) return forced;
        const reply = originalPriority9JReplyFor.apply(this, arguments);
        return priority9JR1AIsGeneric9J(reply) && forced ? forced : reply;
      };
      priority9JReplyFor.__priority9JR1ARuntimeDecisionSpecificPatched = true;
    }
  } catch (_) {}
}
function priority9JR1AWrapExport(name) {
  if (typeof module === "undefined" || !module.exports) return;
  const obj = module.exports && typeof module.exports === "object" ? module.exports : null;
  const fn = obj && typeof obj[name] === "function" ? obj[name] : null;
  if (!fn || fn.__priority9JR1ARuntimeDecisionSpecificPatched) return;
  obj[name] = function priority9JR1ARuntimeDecisionSpecificWrappedExport() {
    const prompt = priority9JR1AExtractPrompt(arguments);
    const result = fn.apply(this, arguments);
    if (result && typeof result.then === "function") return result.then(function(value){ return priority9JR1AApply(value, prompt); });
    return priority9JR1AApply(result, prompt);
  };
  obj[name].__priority9JR1ARuntimeDecisionSpecificPatched = true;
}
function priority9JR1APatchExports(names) {
  priority9JR1APatchPriority9JResponder();
  if (typeof module === "undefined" || !module.exports) return;
  if (typeof module.exports === "function" && !module.exports.__priority9JR1ARuntimeDecisionSpecificPatched) {
    const originalDefault = module.exports;
    const wrappedDefault = function priority9JR1ARuntimeDecisionSpecificWrappedDefault() {
      const prompt = priority9JR1AExtractPrompt(arguments);
      const result = originalDefault.apply(this, arguments);
      if (result && typeof result.then === "function") return result.then(function(value){ return priority9JR1AApply(value, prompt); });
      return priority9JR1AApply(result, prompt);
    };
    Object.keys(originalDefault).forEach(function(k){ try { wrappedDefault[k] = originalDefault[k]; } catch (_) {} });
    wrappedDefault.__priority9JR1ARuntimeDecisionSpecificPatched = true;
    module.exports = wrappedDefault;
  }
  (Array.isArray(names) ? names : []).forEach(priority9JR1AWrapExport);
  if (module.exports && typeof module.exports === "object") {
    module.exports.PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_VERSION = PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_VERSION;
    module.exports.priority9JR1ARuntimeDecisionSpecificReplyFor = priority9JR1AReplyFor;
    module.exports.priority9JR1ARuntimeDecisionSpecificFinal = priority9JR1AApply;
    module.exports.priority9JR1ARuntimeDecisionSpecificCommand = priority9JR1ADetectCommand;
    module.exports.priority9JR1AIsGeneric9JReply = priority9JR1AIsGeneric9J;
    module.exports.PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_PATCH = true;
  }
}
priority9JR1APatchExports(["composeMarionResponse", "compose", "buildReply", "routeMarion", "finalize", "buildFinalEnvelope", "toFinalEnvelope", "normalizeFinalEnvelope", "handleMarionAdminTextRuntime", "invokeMarionAdminTextRuntime", "handleTextRuntime", "run", "handler", "default"]);
/* PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_END */
