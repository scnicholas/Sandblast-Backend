"use strict";

const VERSION = "PRIORITY-9F-R4-CONTINUATION-CARRY-ENFORCEMENT + PRIORITY-9F-R1-LAYERED-PRECEDENCE-HOTFIX + PRIORITY-9F-DEEP-CONVERSATIONAL-STACK + progressionMemory v1.1.3 PRIORITY-9E-LAST-VALID-TASK-CARRY + KNOWLEDGE-QUESTION-BYPASS + RESPONSE-EXPANSION-CARRY-HARDLOCK + PARALLEL-LANE-STALE-CARRY";
const PROGRESSION_MEMORY_VERSION = "nyx.marion.progressionMemory/1.1";
const PARALLEL_LANE_RECENCY_VERSION = "nyx.marion.parallelLaneRecency/0.1";
const shape = require("./progressionShape.js");

function safeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function safeObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function firstText() { for (let i = 0; i < arguments.length; i += 1) { const v = safeStr(arguments[i]); if (v) return v; } return ""; }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback; }
function hashText(value) { const s = safeStr(value).toLowerCase(); let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }


function normalizeParallelLaneRecencyMemory(value = {}) {
  const v = safeObj(value);
  const stale = safeArray(v.staleTracks || v.staleLanes).map(safeStr).filter(Boolean).slice(0, 8);
  const current = safeArray(v.currentTracks || v.activeTracks).map(safeStr).filter(Boolean).slice(0, 8);
  return {
    version: firstText(v.version, PARALLEL_LANE_RECENCY_VERSION),
    active: !!(v.active || stale.length || current.length),
    currentTracks: current,
    previousTracks: safeArray(v.previousTracks).map(safeStr).filter(Boolean).slice(0, 8),
    staleTracks: stale,
    staleLanes: stale,
    staleCarrySuppressed: !!(v.staleCarrySuppressed || v.staleLaneCarrySuppressed || stale.length),
    noUserFacingDiagnostics: true,
    updatedAt: Number.isFinite(Number(v.updatedAt)) ? Number(v.updatedAt) : Date.now()
  };
}

function normalizeProgressionMemory(value = {}) {
  const v = safeObj(value);
  const active = !!v.active;
  const currentStep = firstText(v.currentStep, v.phaseKey, "phase3");
  const lastIntent = firstText(v.lastUserIntent, v.signal, v.lastSignal, "");
  return {
    version: firstText(v.version, PROGRESSION_MEMORY_VERSION),
    active,
    lane: active ? "progression_shaping_refinement" : firstText(v.lane, ""),
    activePhase: active ? "progression_shaping_refinement" : firstText(v.activePhase, ""),
    currentStep,
    phaseKey: currentStep,
    phaseId: firstText(v.phaseId, ""),
    phaseLabel: firstText(v.phaseLabel, ""),
    lastUserIntent: lastIntent,
    signal: lastIntent,
    lastSystemAction: firstText(v.lastSystemAction, ""),
    pendingAction: firstText(v.pendingAction, ""),
    responseShape: firstText(v.responseShape, "build_mode"),
    confidence: clamp01(v.confidence, active ? 0.72 : 0),
    userHash: firstText(v.userHash, ""),
    replyHash: firstText(v.replyHash, ""),
    passFailState: firstText(v.passFailState, ""),
    shallowReplyBlocked: !!v.shallowReplyBlocked,
    noUserFacingDiagnostics: v.noUserFacingDiagnostics !== false,
    lastValidTask: firstText(v.lastValidTask, v.lastTask, v.activeTask, ""),
    lastCompletedTask: firstText(v.lastCompletedTask, v.completedTask, ""),
    lastPendingTask: firstText(v.lastPendingTask, v.pendingTask, v.pendingAction, ""),
    lastContinuationIntent: firstText(v.lastContinuationIntent, ""),
    parallelLaneRecency: normalizeParallelLaneRecencyMemory(v.parallelLaneRecency || v.parallelLaneCarryMaintenance),
    updatedAt: Number.isFinite(Number(v.updatedAt)) ? Number(v.updatedAt) : Date.now()
  };
}

function pendingActionFor(profile = {}, previous = {}) {
  const p = safeObj(profile), prev = safeObj(previous);
  if (!p.active) return firstText(prev.pendingAction, "");
  if (p.signal === "pass") {
    if (p.phaseKey === "phase1") return "advance_to_phase_2_continuity_memory";
    if (p.phaseKey === "phase2") return "advance_to_phase_3_response_shaping";
    if (p.phaseKey === "phase3") return "advance_to_phase_4_regression_telemetry";
    return "lock_progression_refinement_and_prepare_domain_confidence_scoring";
  }
  if (p.signal === "fail") return "patch_response_shaping_expansion_and_rerun_next_steps_prompt";
  if (p.signal === "continue" || p.signal === "next_steps") return "return_expanded_next_action_plan";
  if (p.signal === "testing") return "run_progression_regression_validation";
  if (p.signal === "execution") return "apply_progression_patch_package";
  return firstText(prev.pendingAction, "give_one_concrete_next_action");
}

function updateProgressionMemory({ text = "", reply = "", previous = {}, context = {} } = {}) {
  const prev = normalizeProgressionMemory(previous);
  const profile = shape.buildProgressionProfile(text, { ...safeObj(context), progressionRefinement: prev });
  const knowledgeBypass = shape && typeof shape.isKnowledgeQuestionText === "function" ? shape.isKnowledgeQuestionText(text) : false;
  const active = knowledgeBypass ? false : !!(profile.active || prev.active);
  const shallow = active && /^\s*(continue|next|ok|done|run that again|do it again|same thing|repeat that)\.?\s*$/i.test(safeStr(reply));
  const next = normalizeProgressionMemory({
    active,
    lane: active ? "progression_shaping_refinement" : "",
    activePhase: active ? "progression_shaping_refinement" : "",
    currentStep: profile.phaseKey || prev.currentStep,
    phaseId: profile.phaseId || prev.phaseId,
    phaseLabel: profile.phaseLabel || prev.phaseLabel,
    lastUserIntent: active ? (profile.signal || prev.lastUserIntent) : "",
    lastSystemAction: profile.responseShape || prev.lastSystemAction,
    pendingAction: active ? pendingActionFor(profile, prev) : "",
    responseShape: profile.responseShape || prev.responseShape,
    confidence: profile.confidence || prev.confidence,
    userHash: text ? hashText(text) : prev.userHash,
    replyHash: reply ? hashText(reply) : prev.replyHash,
    passFailState: profile.signal === "pass" ? "passed" : (profile.signal === "fail" ? "failed" : prev.passFailState),
    shallowReplyBlocked: shallow || prev.shallowReplyBlocked,
    lastValidTask: active ? firstText(safeObj(context).lastValidTask, prev.lastValidTask, profile.phaseLabel, profile.phaseKey, "") : firstText(prev.lastValidTask, ""),
    lastCompletedTask: firstText(safeObj(context).lastCompletedTask, prev.lastCompletedTask, ""),
    lastPendingTask: active ? firstText(pendingActionFor(profile, prev), prev.lastPendingTask, prev.pendingAction, "") : firstText(prev.lastPendingTask, ""),
    lastContinuationIntent: shape && typeof shape.isPriority9EContinuationCommand === "function" && shape.isPriority9EContinuationCommand(text) ? safeStr(text) : firstText(prev.lastContinuationIntent, ""),
    noUserFacingDiagnostics: true,
    parallelLaneRecency: normalizeParallelLaneRecencyMemory(safeObj(context).parallelLaneRecency || safeObj(context).parallelLaneCarryMaintenance || safeObj(prev).parallelLaneRecency),
    updatedAt: Date.now()
  });
  return { ...next, profile };
}

const PRIORITY_9E_LAST_VALID_TASK_CARRY_VERSION = "nyx.marion.priority9e.lastValidTaskCarry/1.0";
function extractLastValidTaskCarry(value = {}) {
  const v = normalizeProgressionMemory(value);
  return {
    version: PRIORITY_9E_LAST_VALID_TASK_CARRY_VERSION,
    active: !!v.active,
    lane: v.lane,
    lastValidTask: firstText(v.lastValidTask, v.phaseLabel, v.phaseKey),
    lastCompletedTask: v.lastCompletedTask,
    lastPendingTask: firstText(v.lastPendingTask, v.pendingAction),
    lastContinuationIntent: v.lastContinuationIntent,
    noUserFacingDiagnostics: true
  };
}
module.exports = { VERSION, PROGRESSION_MEMORY_VERSION, PARALLEL_LANE_RECENCY_VERSION, PRIORITY_9E_LAST_VALID_TASK_CARRY_VERSION, normalizeParallelLaneRecencyMemory, normalizeProgressionMemory, pendingActionFor, updateProgressionMemory, extractLastValidTaskCarry, default: updateProgressionMemory };


// PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_MEMORY_PATCH_START
const PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_MEMORY_VERSION = "nyx.marion.priority9f.deepConversationalStackMemory/1.0";
function isPriority9FDeepConversationalText(text = "") {
  const t = safeStr(text).toLowerCase();
  return /\b(priority\s*9f|deep conversational stack|layered conversational|layered conversation|conversational stack|layered intelligence|multi[-\s]?layer|multi[-\s]?layered|surface request|underlying intent|deeper intent|operational risk|execution mode|next action|full conversational stack)\b/i.test(t);
}
function normalizePriority9FDeepConversationCarry(value = {}) {
  const v = safeObj(value);
  return {
    version: PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_MEMORY_VERSION,
    active: !!v.active,
    conversationLane: firstText(v.conversationLane, v.lane, ""),
    surfaceRequest: firstText(v.surfaceRequest, ""),
    deeperIntent: firstText(v.deeperIntent, ""),
    operationalRisk: firstText(v.operationalRisk, ""),
    executionMode: firstText(v.executionMode, ""),
    nextAction: firstText(v.nextAction, ""),
    lastDeepStackPrompt: firstText(v.lastDeepStackPrompt, ""),
    noUserFacingDiagnostics: true,
    updatedAt: Number.isFinite(Number(v.updatedAt)) ? Number(v.updatedAt) : Date.now()
  };
}
function buildPriority9FDeepConversationCarry(text = "", context = {}) {
  const src = safeStr(text);
  const active = isPriority9FDeepConversationalText(src);
  return normalizePriority9FDeepConversationCarry({
    active,
    conversationLane: active ? "Priority 9F deep conversational stack" : firstText(safeObj(context).conversationLane, ""),
    surfaceRequest: active ? "separate the literal request from the real task" : "",
    deeperIntent: active ? "preserve context, suppress loops, and answer with a useful next move" : "",
    operationalRisk: active ? "shallow reply, prompt echo, and recovery-language leakage" : "",
    executionMode: active ? "layered conversational response" : "",
    nextAction: active ? "run the layered-intent regression before adding voice" : "",
    lastDeepStackPrompt: active ? src : firstText(safeObj(context).lastDeepStackPrompt, ""),
    noUserFacingDiagnostics: true
  });
}
module.exports.PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_MEMORY_VERSION = PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_MEMORY_VERSION;
module.exports.isPriority9FDeepConversationalText = isPriority9FDeepConversationalText;
module.exports.normalizePriority9FDeepConversationCarry = normalizePriority9FDeepConversationCarry;
module.exports.buildPriority9FDeepConversationCarry = buildPriority9FDeepConversationCarry;
// PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_MEMORY_PATCH_END


// PRIORITY_9F_R1_LAYERED_PRECEDENCE_HOTFIX_MEMORY_PATCH_START
const PRIORITY_9F_R1_LAYERED_PRECEDENCE_MEMORY_VERSION="nyx.marion.priority9fR1.layeredPrecedenceMemory/1.0";
function isPriority9FR1LayeredPrecedenceText(text=""){const t=safeStr(text).toLowerCase().replace(/[_-]+/g," ");return /\b(priority\s*9f|9f\s*r1|deep conversational stack|layered conversational|layered conversation|conversational stack|layered intelligence|full conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action)\b/i.test(t)||(/\b(disjointed|deeper|layered|multi|context|looping|loop|recovery)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next)\b/i.test(t));}
const __priority9FR1OriginalUpdateProgressionMemory=module.exports.updateProgressionMemory||updateProgressionMemory;
function updatePriority9FR1LayeredPrecedenceMemory(args={}){const text=safeStr(args.text);if(!isPriority9FR1LayeredPrecedenceText(text))return __priority9FR1OriginalUpdateProgressionMemory(args);const prev=normalizeProgressionMemory(args.previous||{});return normalizeProgressionMemory({...prev,active:true,lane:"priority9f_deep_conversational_stack",activePhase:"priority9f_deep_conversational_stack",currentStep:"priority9f_r1",phaseKey:"priority9f_r1",phaseId:"PRIORITY_9F_R1_LAYERED_PRECEDENCE",phaseLabel:"Priority 9F-R1: Layered prompt precedence",lastUserIntent:"deep_conversational_stack",signal:"deep_conversational_stack",lastSystemAction:"layered_conversational_stack",pendingAction:"force_9f_layered_stack_before_9e_recall",responseShape:"layered_conversational_stack",confidence:0.97,lastValidTask:"Priority 9F deep conversational stack",lastPendingTask:"force 9F-R1 precedence over stale Priority 90/9E recall",lastContinuationIntent:"",noUserFacingDiagnostics:true,priority9FR1LayeredPrecedence:true,updatedAt:Date.now()});}
module.exports.PRIORITY_9F_R1_LAYERED_PRECEDENCE_MEMORY_VERSION=PRIORITY_9F_R1_LAYERED_PRECEDENCE_MEMORY_VERSION;module.exports.isPriority9FR1LayeredPrecedenceText=isPriority9FR1LayeredPrecedenceText;module.exports.updateProgressionMemory=updatePriority9FR1LayeredPrecedenceMemory;module.exports.default=updatePriority9FR1LayeredPrecedenceMemory;
// PRIORITY_9F_R1_LAYERED_PRECEDENCE_HOTFIX_MEMORY_PATCH_END


// PRIORITY_9F_R4_CONTINUATION_CARRY_ENFORCEMENT_MEMORY_PATCH_START
const PRIORITY_9F_R4_CONTINUATION_CARRY_MEMORY_VERSION = "nyx.marion.priority9fR4.continuationCarry.memory/1.0";
function priority9FR4MemoryStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function priority9FR4MemoryNorm(value){return priority9FR4MemoryStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9FR4MemoryIsShortContinuation(value){const n=priority9FR4MemoryNorm(value);return /^(next steps?|continue|carry on|proceed|run that again|run it again|do that again|do it again|same thing|what now|whats next|what s next|next)$/.test(n);}
function priority9FR4MemoryIsCarryInstruction(value){const t=priority9FR4MemoryNorm(value);return /\b(priority 9f r4|priority9f r4|9f r4|continuation carry|last accepted lane|stay inside the 9f|inside the 9f conversational stack|9f conversational stack lane|short continuation|next steps continue run that again what now)\b/.test(t);}
function priority9FR4MemoryHas9F(value){const t=priority9FR4MemoryNorm(value);return /\b(priority 9f|priority9f|9f r3|9f r2|9f r1|deep conversational stack|layered conversational|conversational stack|alt runtime prompt echo suppression|domain hijack suppression|marion conversational architecture|priority9f_deep_conversational_stack|layered_conversational_stack)\b/.test(t);}
function priority9FR4MemoryCollect(value, depth=0, seen=[]){if(value==null||depth>5)return"";if(typeof value==="string"||typeof value==="number"||typeof value==="boolean")return priority9FR4MemoryStr(value);if(typeof value!=="object")return"";if(seen.indexOf(value)!==-1)return"";const next=seen.concat([value]);if(Array.isArray(value))return value.slice(0,30).map(v=>priority9FR4MemoryCollect(v,depth+1,next)).filter(Boolean).join(" ");return Object.keys(value).slice(0,80).map(k=>{if(/token|secret|password|cookie|authorization|credential|private/i.test(k))return"";return priority9FR4MemoryCollect(value[k],depth+1,next);}).filter(Boolean).join(" ");}
function buildPriority9FR4ContinuationCarry(previous={}, text=""){const prev=normalizeProgressionMemory(previous||{});return normalizeProgressionMemory({...prev,active:true,lane:"priority9f_deep_conversational_stack",activePhase:"priority9f_deep_conversational_stack",currentStep:"priority9f_r4",phaseKey:"priority9f_r4",phaseId:"PRIORITY_9F_R4_CONTINUATION_CARRY",phaseLabel:"Priority 9F-R4: Continuation carry enforcement",lastUserIntent:priority9FR4MemoryIsShortContinuation(text)?"9f_continuation_carry":"deep_conversational_stack",signal:priority9FR4MemoryIsShortContinuation(text)?"9f_continuation_carry":"deep_conversational_stack",lastSystemAction:"enforce_9f_short_followup_carry",pendingAction:"keep short follow-ups inside Priority 9F conversational-stack lane",responseShape:"priority9f_continuation_carry",confidence:0.99,lastValidTask:"Priority 9F-R3 live accepted / Priority 9F-R4 continuation carry",lastCompletedTask:"Priority 9F-R3 ALT prompt echo suppression live accepted",lastPendingTask:"confirm Next steps, Continue, Run that again, and What now stay inside 9F",lastContinuationIntent:"priority9f_continuation_carry",priority9FR4ContinuationCarry:true,noUserFacingDiagnostics:true,updatedAt:Date.now()});}
const __priority9FR4OriginalUpdateProgressionMemory=module.exports.updateProgressionMemory||updateProgressionMemory;
function updatePriority9FR4ContinuationCarryMemory(args={}){const text=priority9FR4MemoryStr(args.text);const previous=args.previous||{};const source=[text,priority9FR4MemoryCollect(previous),priority9FR4MemoryCollect(args.context)].join(" ");if(priority9FR4MemoryIsCarryInstruction(text)||(priority9FR4MemoryIsShortContinuation(text)&&priority9FR4MemoryHas9F(source)))return buildPriority9FR4ContinuationCarry(previous,text);return __priority9FR4OriginalUpdateProgressionMemory(args);}
module.exports.PRIORITY_9F_R4_CONTINUATION_CARRY_MEMORY_VERSION=PRIORITY_9F_R4_CONTINUATION_CARRY_MEMORY_VERSION;
module.exports.buildPriority9FR4ContinuationCarry=buildPriority9FR4ContinuationCarry;
module.exports.updateProgressionMemory=updatePriority9FR4ContinuationCarryMemory;
module.exports.default=updatePriority9FR4ContinuationCarryMemory;
// PRIORITY_9F_R4_CONTINUATION_CARRY_ENFORCEMENT_MEMORY_PATCH_END


// PRIORITY_9F_R4_CONTINUATION_CARRY_MEMORY_NORMALIZATION_FIX_START
const __priority9FR4BaseBuildPriority9FR4ContinuationCarry = buildPriority9FR4ContinuationCarry;
buildPriority9FR4ContinuationCarry = function priority9FR4ContinuationCarryNormalized(previous={}, text="") {
  const out = __priority9FR4BaseBuildPriority9FR4ContinuationCarry(previous, text);
  return {
    ...out,
    active: true,
    lane: "priority9f_deep_conversational_stack",
    activePhase: "priority9f_deep_conversational_stack",
    currentStep: "priority9f_r4",
    phaseKey: "priority9f_r4",
    responseShape: "priority9f_continuation_carry",
    priority9FR4ContinuationCarry: true,
    noUserFacingDiagnostics: true
  };
};
module.exports.buildPriority9FR4ContinuationCarry = buildPriority9FR4ContinuationCarry;
// PRIORITY_9F_R4_CONTINUATION_CARRY_MEMORY_NORMALIZATION_FIX_END
