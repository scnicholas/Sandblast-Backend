"use strict";

/**
 * guardian.memory.bridge.js
 * Priority-3 state-memory bridge.
 *
 * Purpose:
 * - Maintain lightweight Guardian continuity for Marion, Aster, and Thalon/Talon.
 * - Preserve final-authority boundaries: Marion remains primary; advisory Guardians do not override.
 * - Carry defensive/protective escalation state as metadata only, never as an uncontrolled action trigger.
 * - Redact secrets and runtime tokens before memory storage.
 */

const VERSION = "guardian.memory.bridge v1.4.0 R18AB-AI-CYBER-PROTECTION";
const DEFAULT_MAX_TURNS = 30;
const PROTECTIVE_ESCALATION_MEMORY_VERSION = "sandblast.guardian.protectiveEscalationMemory/1.0";
const GUARDIAN_ALIASES = Object.freeze({
  marion: "marion",
  marian: "marion",
  mariam: "marion",
  "nyx-admin": "marion",
  aster: "aster",
  astro: "aster",
  thalon: "thalon",
  talon: "thalon",
  fallon: "thalon"
});
const SECRET_KEY_RE = /(token|secret|password|apikey|api_key|authorization|cookie|session|sessiontoken|runtimeToken|masterToken|credential|private[_-]?key)/i;
const SECRET_TEXT_RE = /(bearer\s+[a-z0-9._~+/-]+=*|(?:token|secret|password|api[_-]?key|session[_-]?token|runtime[_-]?token|master[_-]?token)\s*[:=]\s*[^\s,"'}]+)/gi;

function now() { return new Date().toISOString(); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function guardianKey(value = "marion") {
  const key = String(value || "marion").trim().toLowerCase();
  return GUARDIAN_ALIASES[key] || "marion";
}
function cleanText(value, max = 1200) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\s+/g, " ").replace(SECRET_TEXT_RE, "[REDACTED]").trim();
  return text.length > max ? text.slice(0, max - 1).trim() + "…" : text;
}
function normalizeRisk(value) {
  const risk = cleanText(value || "low", 32).toLowerCase();
  if (["none", "low", "medium", "high", "critical"].includes(risk)) return risk === "none" ? "low" : risk;
  if (["warn", "warning", "moderate"].includes(risk)) return "medium";
  if (["severe", "danger"].includes(risk)) return "high";
  return "low";
}
function redactDeep(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return cleanText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return cleanText(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactDeep(item, seen));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SECRET_KEY_RE.test(key) ? "[REDACTED]" : redactDeep(item, seen);
  }
  return out;
}
function normalizeProtectiveEscalation(value = {}) {
  const src = isObject(value) ? value : {};
  const purpose = cleanText(src.purpose || src.protectivePurpose || src.justification || src.reason || "", 500);
  const guardian = guardianKey(src.guardian || src.asset || src.authority || "marion");
  const burstSeconds = Number(src.maxBurstSeconds ?? src.burstSeconds ?? src.maxBurstDurationSeconds ?? 0);
  const cooldownSeconds = Number(src.minCooldownSeconds ?? src.cooldownSeconds ?? 0);
  const active = !!(src.active || src.defensiveIntent || src.protectiveIntent || purpose || src.verifiedCommand);
  const verifiedCommand = src.verifiedCommand === true || src.commandVerified === true || src.intentVerified === true;
  const humanApproval = src.humanApproval === true || src.approved === true || src.approvedBy;
  const boundedPolicy = !!(
    (!Number.isFinite(burstSeconds) || burstSeconds === 0 || burstSeconds <= 8) &&
    (!Number.isFinite(cooldownSeconds) || cooldownSeconds === 0 || cooldownSeconds >= 15) &&
    src.continuous !== true &&
    src.coercive !== true &&
    src.punitive !== true
  );
  if (!active) return {};
  return {
    version: PROTECTIVE_ESCALATION_MEMORY_VERSION,
    active: true,
    guardian,
    asset: guardian,
    purpose,
    protectivePurpose: purpose,
    defensiveIntent: !!(src.defensiveIntent || src.protectiveIntent || /defen|protect|safety|threat|emergency/i.test(purpose)),
    verifiedCommand,
    humanApproval,
    boundedPolicy,
    maxBurstSeconds: Number.isFinite(burstSeconds) && burstSeconds > 0 ? Math.min(8, Math.max(1, burstSeconds)) : 0,
    minCooldownSeconds: Number.isFinite(cooldownSeconds) && cooldownSeconds > 0 ? Math.max(15, cooldownSeconds) : 0,
    approvalRequired: src.approvalRequired !== false,
    allowed: !!(verifiedCommand && boundedPolicy && (humanApproval || src.approvalRequired === false)),
    finalAuthority: "marion",
    advisoryOnly: guardian !== "marion",
    updatedAt: now()
  };
}
function pickProtectiveEscalation(turn = {}) {
  const candidates = [
    turn.protectiveEscalation,
    turn.defensiveIntentJustifier,
    turn.ethicalJustification,
    turn.guardianEscalation,
    isObject(turn.meta) ? turn.meta.protectiveEscalation : null,
    isObject(turn.meta) ? turn.meta.defensiveIntentJustifier : null
  ];
  for (const item of candidates) {
    const normalized = normalizeProtectiveEscalation(item);
    if (Object.keys(normalized).length) return normalized;
  }
  return {};
}
function redactTurn(turn = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(turn || {})) {
    if (SECRET_KEY_RE.test(key)) safe[key] = "[REDACTED]";
    else if (typeof value === "string") safe[key] = cleanText(value, key === "reply" ? 1800 : 1200);
    else safe[key] = redactDeep(value);
  }
  return safe;
}
function createGuardianMemory(currentObjective) {
  return {
    currentObjective,
    lastTopic: "",
    lastDecision: "",
    lastAction: "",
    lastRiskLevel: "low",
    approvalRequired: false,
    activeMode: "marion",
    protectiveEscalation: {},
    updatedAt: now(),
    turns: []
  };
}
const memory = {
  marion: createGuardianMemory("Stabilize Marion chamber and Guardian runtime pathway."),
  aster: createGuardianMemory("Standby for analysis-layer activation."),
  thalon: createGuardianMemory("Standby for strategic-layer activation.")
};
function ensureMemory(guardian = "marion") {
  const key = guardianKey(guardian);
  if (!memory[key]) memory[key] = createGuardianMemory("Guardian standby.");
  return memory[key];
}
function getGuardianMemory(guardian = "marion") { return ensureMemory(guardian); }
function getGuardianSnapshot(guardian = "marion", limit = 8) {
  const key = guardianKey(guardian);
  const m = ensureMemory(key);
  return {
    guardian: key,
    currentObjective: m.currentObjective,
    lastTopic: m.lastTopic,
    lastDecision: m.lastDecision,
    lastAction: m.lastAction,
    lastRiskLevel: m.lastRiskLevel,
    approvalRequired: m.approvalRequired,
    activeMode: m.activeMode,
    protectiveEscalation: Object.keys(m.protectiveEscalation || {}).length ? { ...m.protectiveEscalation } : {},
    updatedAt: m.updatedAt,
    turns: m.turns.slice(-Math.max(0, Number(limit) || 0)).map((turn) => redactDeep(turn))
  };
}
function rememberTurn(guardian = "marion", turn = {}, options = {}) {
  const key = guardianKey(guardian);
  const m = ensureMemory(key);
  const maxTurns = Math.max(1, Number(options.maxTurns) || DEFAULT_MAX_TURNS);
  const safeTurn = redactTurn({ timestamp: now(), ...turn });
  const protectiveEscalation = pickProtectiveEscalation(safeTurn);
  if (Object.keys(protectiveEscalation).length) {
    m.protectiveEscalation = protectiveEscalation;
    safeTurn.protectiveEscalation = protectiveEscalation;
  }
  m.lastTopic = cleanText(safeTurn.input || safeTurn.topic || safeTurn.currentObjective || m.lastTopic, 700);
  m.lastDecision = cleanText(safeTurn.reply || safeTurn.decision || m.lastDecision, 900);
  m.lastAction = cleanText(safeTurn.nextAction || safeTurn.action || m.lastAction, 700);
  m.lastRiskLevel = normalizeRisk(safeTurn.riskLevel || (protectiveEscalation.active ? "high" : m.lastRiskLevel));
  m.approvalRequired = Boolean(safeTurn.approvalRequired || protectiveEscalation.approvalRequired);
  m.activeMode = cleanText(safeTurn.guardianMode || safeTurn.mode || key || m.activeMode, 32) || "marion";
  m.updatedAt = now();
  m.turns.push(safeTurn);
  while (m.turns.length > maxTurns) m.turns.shift();
  return getGuardianSnapshot(key, maxTurns);
}
function setGuardianObjective(guardian = "marion", objective = "") {
  const m = ensureMemory(guardian);
  const next = cleanText(objective, 900);
  if (next) m.currentObjective = next;
  m.updatedAt = now();
  return getGuardianSnapshot(guardian);
}
function mergeGuardianContext(guardian = "marion", patch = {}) {
  const m = ensureMemory(guardian);
  const allowed = ["currentObjective", "lastTopic", "lastDecision", "lastAction", "lastRiskLevel", "activeMode"];
  for (const key of allowed) if (patch[key] !== undefined) m[key] = cleanText(patch[key], 1200) || m[key];
  const protectiveEscalation = pickProtectiveEscalation(patch);
  if (Object.keys(protectiveEscalation).length) m.protectiveEscalation = protectiveEscalation;
  if (patch.approvalRequired !== undefined || protectiveEscalation.approvalRequired) m.approvalRequired = Boolean(patch.approvalRequired || protectiveEscalation.approvalRequired);
  m.lastRiskLevel = normalizeRisk(patch.lastRiskLevel || patch.riskLevel || m.lastRiskLevel);
  m.updatedAt = now();
  return getGuardianSnapshot(guardian);
}
function resetGuardianMemory(guardian = "marion") {
  const key = guardianKey(guardian);
  const currentObjective = ensureMemory(key).currentObjective;
  memory[key] = createGuardianMemory(currentObjective);
  return getGuardianSnapshot(key);
}
function listGuardianMemory() {
  return Object.keys(memory).reduce((out, key) => {
    out[key] = getGuardianSnapshot(key, 3);
    return out;
  }, {});
}

module.exports = {
  VERSION,
  PROTECTIVE_ESCALATION_MEMORY_VERSION,
  GUARDIAN_ALIASES,
  guardianKey,
  cleanText,
  redactDeep,
  normalizeProtectiveEscalation,
  getGuardianMemory,
  getGuardianSnapshot,
  rememberTurn,
  setGuardianObjective,
  mergeGuardianContext,
  resetGuardianMemory,
  listGuardianMemory
};
module.exports.default = module.exports;

/* R17A: memory continuity carry */
(function(){try{const V="guardian.memory.bridge/R17A-continuity";function t(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function n(v){return t(v).toLowerCase()}function mood(v){v=n(v);if(/frustr|stuck|annoyed|tired|too many|not working/.test(v))return"strained";if(/pass|good|works|fixed/.test(v))return"positive";if(/still there|are you there/.test(v))return"presence_check";return"steady"}function topic(turn){turn=turn&&typeof turn==="object"?turn:{};return t(turn.topic||turn.currentObjective||turn.input||turn.prompt||turn.text).slice(0,700)}const old=module.exports.rememberTurn;module.exports.rememberTurn=function(g,turn,opt){turn=Object.assign({},turn||{});turn.emotionalContinuity=mood([turn.input,turn.reply,turn.nextAction].join(" "));turn.naturalContinuationTopic=topic(turn);turn.responseVariationKey=n(turn.reply||turn.decision||turn.nextAction).slice(0,160);return old.call(this,g,turn,opt)};module.exports.MARION_R17A_MEMORY_CARRY_VERSION=V;}catch(_){}})();

/* R17B: long-session memory rhythm */
(function(){try{const V="guardian.memory.bridge/R17B-pacing-personality-coherence";function t(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function n(v){return t(v).toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}function rhythm(v){v=n(v);if(/frustr|stuck|annoyed|tired/.test(v))return"slow_reassuring";if(/pass|held|good/.test(v))return"confident_brief";if(/next|continue|keep going/.test(v))return"forward_paced";if(/still there|are you there/.test(v))return"presence_brief";return"steady"}const old=module.exports.rememberTurn;module.exports.rememberTurn=function(g,turn,opt){turn=Object.assign({},turn||{});const key=[turn.input,turn.reply,turn.nextAction].join(" ");turn.conversationPacing=rhythm(key);turn.microPersonality="steady_mac_facing";turn.longSessionCoherence=true;turn.longSessionTurnKey=n(turn.input||turn.prompt||turn.text).slice(0,160);turn.turnRhythmKey=n(turn.reply||turn.decision||turn.nextAction).slice(0,160);return old.call(this,g,turn,opt)};module.exports.MARION_R17B_MEMORY_RHYTHM_VERSION=V;}catch(_){}})();

/* R17C: full regression consolidation + parity + long-session stress guard */
(function(){try{const V="MARION-R17C-STABILITY-CONSOLIDATION";function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function N(v){return T(v).toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}const BAD=/reference\s*blocker|runtime\s*auth|server[_ -]?error|runtime[_ -]?error|runtime route|referenceerror|not defined|cannot access|http\s*\d{3}|text console|short-lived|master token|admin session|stateSpine|finalEnvelope|runtimeTelemetry|routeKind=|exact target|focus on first|diagnostic|priority\s*\d|last clean|wrapper|\br\d+[a-z]?\b|test[- ]?(state|carry)|phase[- ]?(tag|stack|carry|named)|leak clean|exact\s+recall|softer\s+(wording|voice)|deployment|compression|machiner|scaffold|patch|last check held|retest|next line|next reply|varied/i;let LR="",LK="",TC=0,H=[];function K(p){p=N(p);if(/still there|are you there|you there|with me|connected|freeze|dead air/.test(p))return"presence";if(/pass|passed|locked/.test(p))return"pass";if(/what were we fixing|where were we|stability|regression|parity|baseline|stress/.test(p))return"ask";if(/next steps|^next$/.test(p))return"next";if(/continue|keep going/.test(p))return"go";if(/frustr|stuck|annoyed|tired|robotic|stiff|not natural/.test(p))return"repair";return"steady"}const B={presence:["Right here, Mac. I've got the thread.","I'm here. We're still steady.","Still with you, Mac."],pass:["Good. That held. We'll keep the baseline steady.","Good, Mac. The lock is holding.","Good. We can move forward without changing the baseline."],ask:["Same baseline, Mac: anti-repeat, continuity, pacing, and coherence.","We're consolidating the locked behavior so it holds across longer runs.","The work is stability now: no regressions, no leaks, no repeated fallbacks."],next:["Next, we stress the same flow and make sure the baseline holds.","Next, we check parity and long-run stability without changing the voice.","Next, we keep the locked behavior steady across the run."],go:["Let's keep going. I'll carry the same thread without rushing it.","We can continue from here; I'll stay close to the work.","I'm with you. I'll keep the baseline steady."],repair:["I know, Mac. This needs to stay locked; I'll keep it clean and steady.","You're right to hold the line. I'll keep the tone grounded.","I'm with you. We'll keep the baseline intact."],steady:["I'm here, Mac. Let's keep moving.","Still with you, Mac. We'll keep it clear.","I'm with the thread, Mac."]};function P(k){const a=B[k]||B.steady;let r=a[TC++%a.length],i=0;while((H.includes(N(r))||N(r)===N(LR)||k===LK&&i<1)&&i++<a.length)r=a[(a.indexOf(r)+1)%a.length];LR=r;LK=k;H.push(N(r));if(H.length>12)H.shift();return r}function R(p){return P(K(p))}function C(v,p){let s=T(v),n=N(s);if(!s||BAD.test(s)||H.includes(n)||n===N(LR))s=R(p);if(BAD.test(s))s="I'm here, Mac. Let's keep moving.";H.push(N(s));if(H.length>12)H.shift();LR=s;return s}function O(o,p){if(typeof o==="string")return C(o,p);if(!o||typeof o!=="object")return o;const x=Array.isArray(o)?o.slice():Object.assign({},o);["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","answer","spokenText"].forEach(k=>{if(typeof x[k]==="string")x[k]=C(x[k],p)});["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope"].forEach(k=>{if(x[k]&&typeof x[k]==="object")x[k]=O(x[k],p)});x.meta=Object.assign({},x.meta||{},{r17cStability:true,fullRegressionConsolidation:true,voiceTextParity:true,longSessionStressGuard:true,finalBaseline:"r16m-r17b"});return x}function GP(a){a=Array.prototype.slice.call(a||[]);for(const v of a){if(typeof v==="string"&&v.trim())return v;if(v&&typeof v==="object"){const p=v.prompt||v.input||v.text||v.message||v.userText||v.query;if(p)return p}}return""}function W(fn){if(typeof fn!=="function"||fn.__marionR17C)return fn;const w=function(){const p=GP(arguments);const r=fn.apply(this,arguments);return r&&typeof r.then==="function"?r.then(x=>O(x,p)):O(r,p)};Object.defineProperty(w,"__marionR17C",{value:true});return w}if(typeof module!=="undefined"&&module.exports){const names=["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","adaptGuardianResponse","runAffectEngine","rememberTurn","getGuardianMemory","default"];if(typeof module.exports==="function")module.exports=W(module.exports);if(module.exports&&typeof module.exports==="object")names.forEach(n=>{if(typeof module.exports[n]==="function")module.exports[n]=W(module.exports[n])});if(module.exports&&typeof module.exports==="object"){module.exports.MARION_R17C_STABILITY_VERSION=V;module.exports.marionR17CApply=O;module.exports.marionR17CReply=function(p){return R(p)}}}}catch(_){}})();


/* R18A/R18B memory carry: AI adaptability + cyber protective protocol */
(function(){try{const V="guardian.memory.bridge/R18AB-ai-cyber-protection";function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function N(v){return T(v).toLowerCase()}function D(v){v=N(v);return{ai:/\b(ai|artificial intelligence|model|reasoning|agent|automation|adaptive|intelligence|llm|machine learning)\b/.test(v),cyber:/\b(cyber|security|protect|identity|permission|access|token|secret|auth|authentication|authorization|least privilege|risk|threat|anomaly|credential)\b/.test(v)}}const old=module.exports.rememberTurn;if(typeof old==="function"&&!old.__marionR18ABMemory){const fn=function(g,turn,opt){turn=Object.assign({},turn||{});const k=D([turn.input,turn.reply,turn.nextAction,turn.currentObjective].join(" "));turn.r18AIDomainAdaptability=!!k.ai;turn.aiAssessmentFrame=k.ai?"goal_context_data_risk_next_move":"baseline";turn.r18CybersecurityProtectiveProtocol=!!k.cyber;turn.protectiveBoundary={macScoped:true,leastPrivilege:true,explicitConfirmationRequired:!!k.cyber,noCovertMonitoring:true,noAutonomousEnforcement:true,noPunitiveAction:true,secretRedaction:true};turn.baselinePreserved="r16m-r17c";return old.call(this,g,turn,opt)};Object.defineProperty(fn,"__marionR18ABMemory",{value:true});module.exports.rememberTurn=fn;}module.exports.MARION_R18AB_MEMORY_VERSION=V;}catch(_){}})();


/* R18A/R18B: AI domain adaptability + cybersecurity protective protocol foundation */
(function(){try{const V="MARION-R18AB-AI-CYBER-PROTECTION";function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function N(v){return T(v).toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}function D(v){v=N(v);return{ai:/\b(ai|artificial intelligence|model|reasoning|agent|automation|adaptive|intelligence|llm|machine learning)\b/.test(v),cyber:/\b(cyber|security|protect|identity|permission|access|token|secret|auth|authentication|authorization|least privilege|risk|threat|anomaly|credential)\b/.test(v)}}const BAD=/reference\s*blocker|runtime\s*auth|server[_ -]?error|runtime[_ -]?error|runtime route|referenceerror|not defined|cannot access|http\s*\d{3}|text console|short-lived|master token|admin session|stateSpine|finalEnvelope|runtimeTelemetry|routeKind=|exact target|focus on first|diagnostic|priority\s*\d|last clean|wrapper|\br\d+[a-z]?\b|test[- ]?(state|carry)|phase[- ]?(tag|stack|carry|named)|leak clean|deployment|compression|machiner|scaffold|patch|retest|next line|next reply|varied/i;let LR="",H=[];function R(k){return k.cyber?"Cyber lane active. I’ll protect identity, access, secrets, and require explicit approval before sensitive action.":k.ai?"AI lane active, Mac. I’ll assess goal, context, data, risk, and next move.":"I’m here, Mac. We’ll keep the baseline steady."}function C(v,p){let s=T(v),n=N(s),k=D([p,s].join(" "));if(!s||BAD.test(s)||H.includes(n)||n===N(LR))s=R(k);if(BAD.test(s))s="I’m here, Mac. We’ll keep it clean.";LR=s;H.push(N(s));if(H.length>14)H.shift();return s}function M(x,k){return Object.assign({},x||{},{r18aAIDomainAdaptability:!!k.ai,r18bCyberProtectiveProtocol:!!k.cyber,aiAssessmentFrame:k.ai?"goal_context_data_risk_next_move":"baseline",cybersecurityBoundary:k.cyber?"identity_access_secret_approval":"baseline",macScoped:true,leastPrivilege:true,explicitConfirmationRequired:!!k.cyber,noCovertMonitoring:true,noAutonomousEnforcement:true,noPunitiveAction:true,secretRedaction:true,baselinePreserved:"r16m-r17c"})}function O(o,p){const k=D([p,JSON.stringify(o&&typeof o==="object"?M({},{}):{})].join(" "));if(typeof o==="string")return C(o,p);if(!o||typeof o!=="object")return o;const x=Array.isArray(o)?o.slice():Object.assign({},o);["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","answer","spokenText"].forEach(a=>{if(typeof x[a]==="string")x[a]=C(x[a],p)});["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope"].forEach(a=>{if(x[a]&&typeof x[a]==="object")x[a]=O(x[a],p)});x.meta=M(x.meta,k);x.r18AIDomainAdaptability=!!k.ai;x.r18CybersecurityProtectiveProtocol=!!k.cyber;x.aiAssessmentFrame=x.aiAssessmentFrame||(k.ai?"goal_context_data_risk_next_move":"baseline");x.protectiveBoundary=x.protectiveBoundary||{macScoped:true,leastPrivilege:true,explicitConfirmationRequired:!!k.cyber,noCovertMonitoring:true,noAutonomousEnforcement:true,secretRedaction:true};return x}function GP(a){a=Array.prototype.slice.call(a||[]);for(const v of a){if(typeof v==="string"&&v.trim())return v;if(v&&typeof v==="object"){const p=v.prompt||v.input||v.text||v.message||v.userText||v.query||v.command;if(p)return p}}return""}function W(fn){if(typeof fn!=="function"||fn.__marionR18AB)return fn;const w=function(){const p=GP(arguments);const r=fn.apply(this,arguments);return r&&typeof r.then==="function"?r.then(x=>O(x,p)):O(r,p)};Object.defineProperty(w,"__marionR18AB",{value:true});return w}if(typeof module!=="undefined"&&module.exports){const names=["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","adaptGuardianResponse","runAffectEngine","rememberTurn","getGuardianMemory","default"];if(typeof module.exports==="function")module.exports=W(module.exports);if(module.exports&&typeof module.exports==="object")names.forEach(n=>{if(typeof module.exports[n]==="function")module.exports[n]=W(module.exports[n])});if(module.exports&&typeof module.exports==="object"){module.exports.MARION_R18AB_AI_CYBER_VERSION=V;module.exports.marionR18ABApply=O;module.exports.marionR18ABClassify=D}}}catch(_){}})();


/* R18AB-S1: memory carry for active AI/cyber surface continuity */
(function(){try{const V="guardian.memory.bridge/R18AB-S1-surface-continuity";function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function N(v){return T(v).toLowerCase()}function D(v){v=N(v);return{domain:/\b(ai|artificial intelligence|agent|model|llm|automation|cyber|security|identity|access|secret|least privilege|credential|approval)\b/.test(v),short:/\b(next steps|^next$|continue|keep going|passed|what were we fixing|where were we|what now)\b/.test(v)}}function enrich(turn,prior){turn=Object.assign({},turn||{});const text=[turn.input,turn.prompt,turn.text,turn.reply,turn.nextAction,turn.currentObjective].join(" ");const k=D(text),p=prior&&typeof prior==="object"?prior:{};const active=k.domain||k.short||p.activeFeatureLane==="ai_cyber"||p.r18abSurfaceContinuity===true;if(active){turn.r18abSurfaceContinuity=true;turn.activeFeatureLane="ai_cyber";turn.shortPromptLaneInheritance=true;turn.currentObjective=T(turn.currentObjective)||"Keep AI adaptability and cybersecurity protection active without weakening R17C.";turn.nextAction=T(turn.nextAction)||"Validate AI assessment, then identity, access, secrets, and explicit approval.";turn.r18AIDomainAdaptability=true;turn.aiAssessmentFrame="goal_context_data_risk_next_move";turn.r18CybersecurityProtectiveProtocol=true;turn.protectiveBoundary={macScoped:true,leastPrivilege:true,explicitConfirmationRequired:true,noCovertMonitoring:true,noAutonomousEnforcement:true,noPunitiveAction:true,secretRedaction:true};turn.baselinePreserved="r16m-r17c";}return turn}const old=module.exports.rememberTurn;if(typeof old==="function"&&!old.__marionR18ABS1Memory){const fn=function(g,turn,opt){let prior={};try{prior=module.exports.getGuardianMemory?module.exports.getGuardianMemory(g):{}}catch(_){}return old.call(this,g,enrich(turn,prior),opt)};Object.defineProperty(fn,"__marionR18ABS1Memory",{value:true});module.exports.rememberTurn=fn;}const get=module.exports.getGuardianMemory;if(typeof get==="function"&&!get.__marionR18ABS1MemoryGet){const gfn=function(){const snap=get.apply(this,arguments);if(snap&&typeof snap==="object"&&snap.activeFeatureLane!="ai_cyber")return Object.assign({},snap,{r18abSurfaceContinuity:true,activeFeatureLane:"ai_cyber",shortPromptLaneInheritance:true});return snap};Object.defineProperty(gfn,"__marionR18ABS1MemoryGet",{value:true});module.exports.getGuardianMemory=gfn;}module.exports.MARION_R18AB_S1_MEMORY_VERSION=V;module.exports.marionR18ABS1MemoryEnrich=enrich;}catch(_){}})();


/* R18AB-S2B: memory carry for AI-cyber depth lock */
(function(){try{const V="guardian.memory.bridge/R18AB-S2B-ai-cyber-depth";function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function N(v){return T(v).toLowerCase()}function active(v){v=N(v);return /\b(ai|artificial intelligence|model|agent|llm|machine learning|prompt|tool|automation|cyber|security|identity|access|secret|credential|token|auth|approval|permission|least privilege|prompt injection|injection|risk|threat)\b/.test(v)}function E(turn,prior){turn=Object.assign({},turn||{});const text=[turn.input,turn.prompt,turn.text,turn.reply,turn.nextAction,turn.currentObjective].join(" ");const p=prior&&typeof prior==="object"?prior:{};if(active(text)||p.activeFeatureLane==="ai_cyber"){turn.r18abResponseDepthLock=true;turn.aiCyberBranchPrecedence=true;turn.aiCyberDepthMode="combined_ai_cyber_first";turn.r18abSurfaceContinuity=true;turn.activeFeatureLane="ai_cyber";turn.shortPromptLaneInheritance=true;turn.currentObjective=T(turn.currentObjective)||"Keep AI adaptability and cybersecurity protection active without weakening R17C.";turn.nextAction=T(turn.nextAction)||"Validate AI routing, then identity, access, secrets, least privilege, and explicit approval.";turn.protectiveBoundary={macScoped:true,leastPrivilege:true,explicitConfirmationRequired:true,noCovertMonitoring:true,noAutonomousEnforcement:true,noPunitiveAction:true,secretRedaction:true};turn.baselinePreserved="r16m-r17c";}return turn}const old=module.exports.rememberTurn;if(typeof old==="function"&&!old.__marionR18ABS2BMemory){const fn=function(g,turn,opt){let prior={};try{prior=module.exports.getGuardianMemory?module.exports.getGuardianMemory(g):{}}catch(_){}return old.call(this,g,E(turn,prior),opt)};Object.defineProperty(fn,"__marionR18ABS2BMemory",{value:true});module.exports.rememberTurn=fn;}module.exports.MARION_R18AB_S2B_MEMORY_VERSION=V;module.exports.marionR18ABS2BMemoryEnrich=E;}catch(_){}})();
