"use strict";

const VERSION = "PRIORITY-9H-LONG-FORM-CONTINUITY-STRESS-DRIFT-GUARD + PRIORITY-9I-ADAPTIVE-SITUATIONAL-PRECHECK + PRIORITY-9F-R4-CONTINUATION-CARRY-ENFORCEMENT + PRIORITY-9F-R1-LAYERED-PRECEDENCE-HOTFIX + PRIORITY-9F-DEEP-CONVERSATIONAL-STACK + progressionMemory v1.1.3 PRIORITY-9E-LAST-VALID-TASK-CARRY + KNOWLEDGE-QUESTION-BYPASS + RESPONSE-EXPANSION-CARRY-HARDLOCK + PARALLEL-LANE-STALE-CARRY";
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


// PRIORITY_9G_DEEP_CONTINUITY_MEMORY_PATCH_START
const PRIORITY_9G_DEEP_CONTINUITY_MEMORY_VERSION="PRIORITY-9G-DEEP-CONTINUITY-MEMORY/1.0";

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

function buildPriority9GDeepContinuityMemory(previous={},text=""){
  const prev=priority9GObj(previous);
  const prior=priority9GObj(prev.priority9GDeepContinuityMemory||prev.deepContinuityMemory||{});
  const depth=Number.isFinite(Number(prior.turnDepth))?Number(prior.turnDepth)+1:1;
  return {
    version:PRIORITY_9G_DEEP_CONTINUITY_MEMORY_VERSION,
    active:true,
    lane:"priority9g_deep_continuity_memory",
    activePhase:"priority9g_deep_continuity_memory",
    currentStep:"priority9g_memory_carry",
    phaseKey:"priority9g",
    phaseId:"PRIORITY_9G_DEEP_CONTINUITY_MEMORY",
    phaseLabel:"Priority 9G: Deep continuity memory and layered follow-up handling",
    lastUserIntent:priority9GIsShortFollowup(text)?"priority9g_followup_carry":"priority9g_activation",
    signal:priority9GIsShortFollowup(text)?"priority9g_followup_carry":"priority9g_activation",
    responseShape:"priority9g_layered_memory_response",
    confidence:0.995,
    surfaceRequest:"carry the active Marion task across longer sequences",
    deeperIntent:"preserve context, project lane, risk, execution mode, and next action without requiring restatement",
    activeTask:"Priority 9G deep continuity memory and layered follow-up handling",
    operationalRisk:"short follow-ups can collapse into stale handoff, older 9F wording, or last-sentence-only answers",
    executionMode:"deep continuity memory",
    nextAction:"run a multi-turn 9G continuity pass and verify follow-ups advance the same layered task",
    followupPolicy:["Next steps","Continue","Run that again","What now"].join(" | "),
    turnDepth:depth,
    lastPromptHash:(typeof hashText==="function"?hashText(text):priority9GNorm(text).slice(0,32)),
    priority9GDeepContinuityMemory:true,
    noUserFacingDiagnostics:true,
    updatedAt:Date.now()
  };
}
const __priority9GOriginalUpdateProgressionMemory=module.exports.updateProgressionMemory||updateProgressionMemory;
function updatePriority9GDeepContinuityMemory(args={}){
  const src=priority9GObj(args);
  const text=priority9GStr(src.text||src.prompt||src.userText||src.message||"");
  const previous=priority9GObj(src.previous||src.previousMemory||src.memory||src.state||{});
  const source=[text,priority9GCollect(previous),priority9GCollect(src.context),priority9GCollect(src)].join(" ");
  if(priority9GIsActivationText(text)||(priority9GIsShortFollowup(text)&&priority9GHasContext(source))){
    const memory=buildPriority9GDeepContinuityMemory(previous,text);
    return {...priority9GObj(previous),...memory,priority9GDeepContinuityMemory:memory,deepContinuityMemory:memory};
  }
  return __priority9GOriginalUpdateProgressionMemory(args);
}
module.exports.PRIORITY_9G_DEEP_CONTINUITY_MEMORY_VERSION=PRIORITY_9G_DEEP_CONTINUITY_MEMORY_VERSION;
module.exports.buildPriority9GDeepContinuityMemory=buildPriority9GDeepContinuityMemory;
module.exports.updateProgressionMemory=updatePriority9GDeepContinuityMemory;
module.exports.default=updatePriority9GDeepContinuityMemory;
// PRIORITY_9G_DEEP_CONTINUITY_MEMORY_PATCH_END



// PRIORITY_9H_LONG_FORM_CONTINUITY_STRESS_DRIFT_GUARD_MEMORY_PATCH_START

const PRIORITY_9H_LONG_FORM_CONTINUITY_VERSION = "nyx.marion.priority9h.longFormContinuityStressDriftGuard/1.0";
const PRIORITY_9I_ADAPTIVE_SITUATIONAL_PRECHECK_VERSION = "nyx.marion.priority9i.adaptiveSituationalPrecheck/0.1";
function priority9HStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function priority9HObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function priority9HNorm(value){return priority9HStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9HCollect(value,limit){try{return JSON.stringify(value||{}).slice(0,limit||16000);}catch(_){return priority9HStr(value).slice(0,limit||16000);}}
function priority9HIsShortFollowup(value){
  const n=priority9HNorm(value);
  return /^(next steps?|continue|carry on|keep going|proceed|run that again|run it again|do that again|do it again|same thing|repeat that|rerun that|what now|whats next|what s next|next|status|passed|pass|green|go on|advance)$/.test(n);
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
    priority9IAdaptiveSituationalPrecheck:{
      version:PRIORITY_9I_ADAPTIVE_SITUATIONAL_PRECHECK_VERSION,
      staged:true,
      activationBlockedUntil:"Priority 9H long-form continuity stress passes live",
      expectedFocus:"adaptive situational reasoning and context-pressure handling after long-form continuity is stable"
    },
    noUserFacingDiagnostics:true,
    updatedAt:Date.now()
  };
}
function priority9HReplyFor(prompt,source){
  const n=priority9HNorm(prompt);
  if(priority9HIsShortFollowup(prompt)){
    return "Continue Priority 9H: keep the same surface request, deeper intent, active task, risk, execution mode, and next action alive across this turn. Advance the 10–15 turn continuity stress pass without drifting into 9G, 9F, 9E, domain fallback, prompt echo, or recovery wording. Current next action: keep the chain moving and only mark 9H passed after the full long-form follow-up sequence stays stable.";
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
  out.priority9HVersion="PRIORITY-9H-LONG-FORM-CONTINUITY-STRESS-DRIFT-GUARD";
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

function priority9HMemoryPrevious(value){const v=priority9HObj(value);return priority9HObj(v.priority9HLongFormContinuity||v.longFormContinuityStress||v.priority9GDeepContinuityMemory||v.deepContinuityMemory||v);}
function buildPriority9HLongFormContinuityMemory(previous={},text=""){
  const prev=priority9HMemoryPrevious(previous);
  const depth=Number.isFinite(Number(prev.turnDepth))?Number(prev.turnDepth)+1:1;
  const st=priority9HStateFrom(text,depth);
  return {...st,lane:"priority9h_long_form_continuity_stress",activePhase:"priority9h_long_form_continuity_stress",phaseKey:"priority9h",phaseId:"PRIORITY_9H_LONG_FORM_CONTINUITY_STRESS",phaseLabel:"Priority 9H: Long-form continuity stress test and memory drift guard",signal:priority9HIsShortFollowup(text)?"priority9h_followup_stress_carry":"priority9h_activation",lastUserIntent:priority9HIsShortFollowup(text)?"priority9h_followup_stress_carry":"priority9h_activation",responseShape:"priority9h_long_form_continuity_response",confidence:0.997,followupPolicy:["Next steps","Continue","Run that again","What now","Status","Proceed"].join(" | ")};
}
const __priority9HOriginalUpdateProgressionMemory=module.exports.updateProgressionMemory|| (typeof updateProgressionMemory==="function"?updateProgressionMemory:null);
function updatePriority9HLongFormContinuityMemory(args={}){
  const src=priority9HObj(args);const text=priority9HStr(src.text||src.prompt||src.userText||src.message||"");const previous=priority9HObj(src.previous||src.previousMemory||src.memory||src.state||{});const source=[text,priority9HCollect(previous),priority9HCollect(src.context),priority9HCollect(src)].join(" ");
  if(priority9HIsActivationText(text)||priority9HIsActivationText(source)||priority9HIs9IPrecheckText(source)||(priority9HIsShortFollowup(text)&&priority9HHasContext(source))){
    const memory=buildPriority9HLongFormContinuityMemory(previous,text);
    return {...priority9HObj(previous),...memory,priority9HLongFormContinuity:memory,longFormContinuityStress:memory,priority9IPrecheck:memory.priority9IAdaptiveSituationalPrecheck};
  }
  return __priority9HOriginalUpdateProgressionMemory?__priority9HOriginalUpdateProgressionMemory(args):previous;
}
module.exports.PRIORITY_9H_LONG_FORM_CONTINUITY_MEMORY_VERSION=PRIORITY_9H_LONG_FORM_CONTINUITY_VERSION;
module.exports.PRIORITY_9I_ADAPTIVE_SITUATIONAL_PRECHECK_VERSION=PRIORITY_9I_ADAPTIVE_SITUATIONAL_PRECHECK_VERSION;
module.exports.buildPriority9HLongFormContinuityMemory=buildPriority9HLongFormContinuityMemory;
module.exports.updateProgressionMemory=updatePriority9HLongFormContinuityMemory;
module.exports.default=updatePriority9HLongFormContinuityMemory;
// PRIORITY_9H_LONG_FORM_CONTINUITY_STRESS_DRIFT_GUARD_MEMORY_PATCH_END
