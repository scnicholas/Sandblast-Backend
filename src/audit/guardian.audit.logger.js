"use strict";

/**
 * guardian.audit.logger.js
 * Priority-3 audit logger.
 *
 * Purpose:
 * - Keep bounded in-memory Guardian audit events.
 * - Redact secrets deeply before audit persistence/export.
 * - Preserve protective escalation evidence without exposing raw credentials or private runtime material.
 */

const VERSION = "guardian.audit.logger v1.2.0 PRIORITY3-AUDIT-HARDENED";
const DEFAULT_AUDIT_CAP = 500;
const PROTECTIVE_ESCALATION_AUDIT_VERSION = "sandblast.guardian.protectiveEscalationAudit/1.0";
const auditLog = [];
let auditCap = DEFAULT_AUDIT_CAP;

const SECRET_KEY_PATTERN = /(token|secret|password|apikey|api_key|authorization|cookie|session|sessiontoken|runtimeToken|masterToken|credential|private[_-]?key)/i;
const SECRET_TEXT_PATTERN = /(bearer\s+)[a-z0-9._~+/-]+=*|((?:token|secret|password|api[_-]?key|session[_-]?token|runtime[_-]?token|master[_-]?token)\s*[:=]\s*)[^\s,"'}]+/gi;
const GUARDIAN_ALIASES = Object.freeze({ marion: "marion", marian: "marion", mariam: "marion", "nyx-admin": "marion", aster: "aster", astro: "aster", thalon: "thalon", talon: "thalon", fallon: "thalon" });

function nowIso() { return new Date().toISOString(); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function cleanText(value, max = 4000) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(SECRET_TEXT_PATTERN, (match, bearerPrefix, keyPrefix) => `${bearerPrefix || keyPrefix || ""}[REDACTED]`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
function normalizeGuardian(value) {
  const v = cleanText(value || "marion", 64).toLowerCase();
  return GUARDIAN_ALIASES[v] || "marion";
}
function normalizeRisk(value) {
  const v = cleanText(value || "low", 32).toLowerCase();
  if (["low", "medium", "high", "critical"].includes(v)) return v;
  if (["warn", "warning", "moderate"].includes(v)) return "medium";
  if (["severe", "danger", "defensive", "protective"].includes(v)) return "high";
  return "low";
}
function normalizeType(value) { return cleanText(value || "runtime", 80).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_"); }
function redactDeep(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return cleanText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return cleanText(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactDeep(item, seen));
  const output = {};
  for (const [key, item] of Object.entries(value)) output[key] = SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactDeep(item, seen);
  return output;
}
function normalizeProtectiveEscalation(event = {}) {
  const src = isObject(event.protectiveEscalation) ? event.protectiveEscalation : (isObject(event.defensiveIntentJustifier) ? event.defensiveIntentJustifier : (isObject(event.ethicalJustification) ? event.ethicalJustification : {}));
  const meta = isObject(event.meta) ? event.meta : {};
  const metaProtective = isObject(meta.protectiveEscalation) ? meta.protectiveEscalation : {};
  const merged = { ...metaProtective, ...src };
  const purpose = cleanText(merged.purpose || merged.protectivePurpose || merged.justification || merged.reason || "", 600);
  const active = !!(merged.active || merged.defensiveIntent || merged.protectiveIntent || purpose || event.type === "protective_escalation");
  if (!active) return {};
  const burst = Number(merged.maxBurstSeconds ?? merged.burstSeconds ?? 0);
  const cooldown = Number(merged.minCooldownSeconds ?? merged.cooldownSeconds ?? 0);
  const boundedPolicy = !!(
    (!Number.isFinite(burst) || burst === 0 || burst <= 8) &&
    (!Number.isFinite(cooldown) || cooldown === 0 || cooldown >= 15) &&
    merged.continuous !== true &&
    merged.punitive !== true &&
    merged.coercive !== true
  );
  return {
    version: PROTECTIVE_ESCALATION_AUDIT_VERSION,
    active: true,
    guardian: normalizeGuardian(merged.guardian || event.guardian),
    defensiveIntent: !!(merged.defensiveIntent || merged.protectiveIntent || /defen|protect|safety|threat|emergency/i.test(purpose)),
    protectivePurpose: purpose,
    verifiedCommand: merged.verifiedCommand === true || merged.commandVerified === true || merged.intentVerified === true,
    humanApproval: merged.humanApproval === true || merged.approved === true || !!merged.approvedBy,
    approvalRequired: merged.approvalRequired !== false,
    boundedPolicy,
    allowed: !!((merged.verifiedCommand === true || merged.commandVerified === true || merged.intentVerified === true) && boundedPolicy && (merged.humanApproval === true || merged.approved === true || merged.approvalRequired === false)),
    maxBurstSeconds: Number.isFinite(burst) && burst > 0 ? Math.min(8, Math.max(1, burst)) : 0,
    minCooldownSeconds: Number.isFinite(cooldown) && cooldown > 0 ? Math.max(15, cooldown) : 0,
    finalAuthority: "marion",
    loggedAt: nowIso()
  };
}
function normalizeLimit(limit, fallback = 50) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(Math.floor(n), auditCap));
}
function enforceCap() { while (auditLog.length > auditCap) auditLog.shift(); }
function matchesFilter(entry, filter = {}) {
  if (filter.guardian && entry.guardian !== normalizeGuardian(filter.guardian)) return false;
  if (filter.type && entry.type !== normalizeType(filter.type)) return false;
  if (filter.traceId && entry.traceId !== cleanText(filter.traceId, 160)) return false;
  if (filter.riskLevel && entry.riskLevel !== normalizeRisk(filter.riskLevel)) return false;
  if (filter.protectiveEscalation !== undefined && Boolean(entry.protectiveEscalationActive) !== Boolean(filter.protectiveEscalation)) return false;
  return true;
}
function logGuardianEvent(event = {}) {
  const protectiveEscalation = normalizeProtectiveEscalation(event);
  const entry = {
    timestamp: cleanText(event.timestamp || nowIso(), 80),
    guardian: normalizeGuardian(event.guardian),
    type: normalizeType(event.type || (protectiveEscalation.active ? "protective_escalation" : "runtime")),
    input: cleanText(event.input, 4000),
    reply: cleanText(event.reply, 4000),
    decision: cleanText(event.decision, 2000),
    approvalRequired: Boolean(event.approvalRequired || protectiveEscalation.approvalRequired),
    approvedBy: event.approvedBy ? cleanText(event.approvedBy, 120) : null,
    route: cleanText(event.route, 160),
    riskLevel: normalizeRisk(event.riskLevel || (protectiveEscalation.active ? "high" : "low")),
    systemState: cleanText(event.systemState || "unknown", 80).toLowerCase(),
    traceId: cleanText(event.traceId, 160),
    tags: Array.isArray(event.tags) ? event.tags.slice(0, 12).map((tag) => cleanText(tag, 60)).filter(Boolean) : [],
    protectiveEscalationActive: !!protectiveEscalation.active,
    protectiveEscalation: protectiveEscalation.active ? protectiveEscalation : {},
    meta: event.meta ? redactDeep(event.meta) : {},
    error: event.error ? redactDeep(event.error) : null
  };
  auditLog.push(Object.freeze(entry));
  enforceCap();
  return entry;
}
function getGuardianAuditLog(limit = 50, filter = {}) {
  const safeLimit = normalizeLimit(limit);
  return auditLog.filter((entry) => matchesFilter(entry, filter)).slice(-safeLimit).map((entry) => ({ ...entry }));
}
function exportGuardianAuditLog({ limit = auditCap, filter = {} } = {}) {
  const entries = getGuardianAuditLog(limit, filter);
  return { exportedAt: nowIso(), count: entries.length, entries };
}
function clearGuardianAuditLog(filter = null) {
  if (!filter) { const count = auditLog.length; auditLog.length = 0; return { cleared: count, remaining: 0 }; }
  let cleared = 0;
  for (let i = auditLog.length - 1; i >= 0; i -= 1) if (matchesFilter(auditLog[i], filter)) { auditLog.splice(i, 1); cleared += 1; }
  return { cleared, remaining: auditLog.length };
}
function configureGuardianAuditLogger({ maxEntries } = {}) {
  const n = Number(maxEntries);
  if (Number.isFinite(n) && n >= 50) { auditCap = Math.min(Math.floor(n), 5000); enforceCap(); }
  return getGuardianAuditLoggerInfo();
}
function getGuardianAuditLoggerInfo() {
  return { name: "guardian.audit.logger", version: VERSION, maxEntries: auditCap, currentEntries: auditLog.length, redactionEnabled: true, protectiveEscalationAuditVersion: PROTECTIVE_ESCALATION_AUDIT_VERSION };
}

module.exports = {
  VERSION,
  PROTECTIVE_ESCALATION_AUDIT_VERSION,
  logGuardianEvent,
  getGuardianAuditLog,
  exportGuardianAuditLog,
  clearGuardianAuditLog,
  configureGuardianAuditLogger,
  getGuardianAuditLoggerInfo,
  normalizeGuardian,
  normalizeRisk,
  normalizeType,
  cleanText,
  redactDeep,
  normalizeProtectiveEscalation
};
module.exports.default = module.exports;

// PRIORITY_9I_9J_SEQUENCE_GUARDIAN_AUDIT_PATCH_START
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
function priority9IJShouldForceText(prompt,source,reply){var ctx=[prompt,source].join(" ");if(priority9IJIs9JActivationText(prompt)||priority9IJIs9JActivationText(ctx))return "9j";if(priority9IJIs9IActivationText(prompt)||priority9IJIs9IActivationText(ctx))return "9i";if(priority9IJIsPressureText(prompt)&&priority9IJHas9IContext(ctx))return "9i";if(priority9IJIsShortFollowup(prompt)&&priority9IJHas9IContext(ctx))return "9i";if((priority9IJHas9IContext(ctx)||priority9IJHas9JContext(ctx))&&(priority9IJOldLaneLeak(reply)||priority9IJPromptEcho(reply,prompt)))return priority9IJHas9JContext(ctx)?"9j":"9i";return "";}

function priority9IJGuardianAuditMeta(event){var e=priority9IJObj(event);var text=priority9IJStr(e.input||e.message||e.text||e.reply||e.decision||"");var src=[text,priority9IJCollect(e)].join(" ");if(priority9IJIs9JActivationText(src))return {...e,priorityLane:"Priority 9J",priority9JProactiveOperationalGuidance:true,noUserFacingDiagnostics:true};if(priority9IJIs9IActivationText(src)||priority9IJIsPressureText(text))return {...e,priorityLane:"Priority 9I",priority9IAdaptiveSituationalReasoning:true,noUserFacingDiagnostics:true};return e;}
["logGuardianEvent","pushAuditEvent","recordAuditEvent"].forEach(function(name){if(typeof module.exports[name]==="function"){var original=module.exports[name];module.exports[name]=function priority9IJGuardianAuditWrapper(event){return original.call(this,priority9IJGuardianAuditMeta(event));};}});
module.exports.PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_AUDIT_VERSION=PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL;
module.exports.PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_AUDIT_VERSION=PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL;
module.exports.priority9IJGuardianAuditMeta=priority9IJGuardianAuditMeta;
// PRIORITY_9I_9J_SEQUENCE_GUARDIAN_AUDIT_PATCH_END
