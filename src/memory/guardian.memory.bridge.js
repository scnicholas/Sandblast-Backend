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

const VERSION = "guardian.memory.bridge v1.4.1 R18C-LAW-ASSESSMENT";
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


/* R18C: memory carry for Law Domain Real-World Assessment Layer */
(function(){try{const V="guardian.memory.bridge/R18C-law-real-world-assessment";function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function N(v){return T(v).toLowerCase()}function S(v){try{return typeof v==="string"?v:JSON.stringify(v||{}).slice(0,4000)}catch(_){return""}}function lawProfile(v){const t=N(S(v));const active=/\b(law|legal|lawyer|attorney|court|sue|lawsuit|claim|liability|liable|negligence|damages|indemnity|contract|agreement|nda|terms|license|licence|licensing|copyright|trademark|patent|intellectual property|\bip\b|royalty|distribution rights|broadcast rights|ott|ctv|roku|compliance|regulatory|regulation|jurisdiction|statute|privacy policy|data protection|employment|contractor|lease|permit|incorporation|shareholder|bylaw|r18c|lawAssessmentFrame|legalCategory)\b/.test(t);let cat="general_legal_risk";if(/\b(copyright|licen[cs]e|royalty|distribution rights|broadcast rights|ott|ctv|roku|monetiz)\b/.test(t))cat="copyright_licensing";else if(/\b(contract|agreement|nda|terms|indemnity|breach|clause)\b/.test(t))cat="contract";else if(/\b(trademark|patent|intellectual property|\bip\b)\b/.test(t))cat="ip_trademark_patent";else if(/\b(compliance|regulatory|regulation|permit|filing|statute|corporate|incorporation|bylaw|shareholder)\b/.test(t))cat="compliance_regulatory";else if(/\b(liability|lawsuit|sue|claim|damages|negligence|dispute)\b/.test(t))cat="liability_dispute";else if(/\b(privacy|data protection|personal information|consent|gdpr|pipeda|breach notice)\b/.test(t))cat="privacy_data";const risk=/\b(criminal|fraud|illegal|injunction|court order|subpoena|regulator investigation)\b/.test(t)?"critical":/\b(lawsuit|sue|claim|damages|infringement|breach|terminate|indemnity|privacy breach|penalty|fine)\b/.test(t)?"high":active?"medium":"low";const sec=[];if(/\b(ai|artificial intelligence|model|agent|llm|automation|prompt|tool)\b/.test(t))sec.push("ai");if(/\b(cyber|security|identity|access|secret|credential|token|auth|permission|privacy|data protection|breach)\b/.test(t))sec.push("cyber");if(/\b(finance|revenue|tax|cost|grant|funding|royalty|ads|monetiz)\b/.test(t))sec.push("finance");if(/\b(business|client|vendor|platform|ott|ctv|roku|distribution|commercial|corporation)\b/.test(t))sec.push("business");return{active,cat,risk,sec}}function lane(p){if(p.sec.includes("ai")&&p.sec.includes("cyber"))return"law_ai_cyber";if(p.sec.includes("cyber"))return"law_cyber";if(p.sec.includes("ai"))return"law_ai";if(p.sec.includes("finance"))return"law_finance";if(p.sec.includes("business"))return"law_business";return"law"}function enrich(obj,profile){if(!obj||typeof obj!=="object")return obj;obj.r18CLawRealWorldAssessment=true;obj.lawAssessmentFrame="category_jurisdiction_facts_assumptions_risk_missing_info_safe_next_move";obj.legalCategory=profile.cat;obj.jurisdictionSensitivity=true;obj.legalAdviceBoundary="general_information_legal_risk_triage_not_legal_advice";obj.legalRiskLevel=profile.risk;obj.legalRiskBoundary={generalInformationOnly:true,notLegalAdvice:true,noAttorneyClientRelationship:true,noLegalCertainty:true,jurisdictionRequired:true,verifySourceDocuments:true,professionalReviewRecommended:profile.risk==="high"||profile.risk==="critical"};obj.factsAssumptionsSeparated=true;obj.professionalReviewRecommended=profile.risk==="high"||profile.risk==="critical";obj.lawCrossDomainSecondaryLane=profile.sec.join("_")||"none";obj.lawShortPromptLaneInheritance=true;obj.legalSourceDocumentCheckRequired=true;obj.noLegalCertaintyClaim=true;obj.noAttorneyClientRelationship=true;obj.activeFeatureLane=lane(profile);obj.currentObjective=T(obj.currentObjective)||"Run R18C law assessment without weakening R17C or R18AB.";obj.lastRiskLevel=profile.risk;obj.approvalRequired=Boolean(obj.approvalRequired||profile.risk==="high"||profile.risk==="critical");obj.updatedAt=now();return obj}function findProfile(turn,prior){const p=lawProfile([turn,prior].map(S).join(" "));if(p.active)return p;return{active:false,cat:"general_legal_risk",risk:"low",sec:[]}}const oldRemember=module.exports.rememberTurn;if(typeof oldRemember==="function"&&!oldRemember.__marionR18CLawMemory){const fn=function(g,turn,opt){let prior={};try{prior=ensureMemory?ensureMemory(g):{}}catch(_){}const profile=findProfile(turn,prior);const inputTurn=profile.active?Object.assign({},turn||{},{r18CLawRealWorldAssessment:true,lawAssessmentFrame:"category_jurisdiction_facts_assumptions_risk_missing_info_safe_next_move",legalCategory:profile.cat,legalRiskLevel:profile.risk,activeFeatureLane:lane(profile),lawCrossDomainSecondaryLane:profile.sec.join("_")||"none",approvalRequired:Boolean((turn||{}).approvalRequired||profile.risk==="high"||profile.risk==="critical")}):turn;const snap=oldRemember.call(this,g,inputTurn,opt);if(profile.active){try{const key=guardianKey?guardianKey(g):"marion";const m=ensureMemory?ensureMemory(key):null;if(m){enrich(m,profile);if(Array.isArray(m.turns)&&m.turns.length){Object.assign(m.turns[m.turns.length-1],enrich(m.turns[m.turns.length-1],profile));}}return module.exports.getGuardianSnapshot?module.exports.getGuardianSnapshot(g,(opt&&opt.maxTurns)||8):enrich(snap,profile);}catch(_){return enrich(snap,profile)}}return snap};Object.defineProperty(fn,"__marionR18CLawMemory",{value:true});module.exports.rememberTurn=fn;}const oldGet=module.exports.getGuardianMemory;if(typeof oldGet==="function"&&!oldGet.__marionR18CLawMemoryGet){const gfn=function(){const snap=oldGet.apply(this,arguments);const profile=lawProfile(snap);return profile.active?enrich(Object.assign({},snap),profile):snap};Object.defineProperty(gfn,"__marionR18CLawMemoryGet",{value:true});module.exports.getGuardianMemory=gfn;}const oldSnap=module.exports.getGuardianSnapshot;if(typeof oldSnap==="function"&&!oldSnap.__marionR18CLawMemorySnap){const sfn=function(){const snap=oldSnap.apply(this,arguments);const profile=lawProfile(snap);return profile.active?enrich(Object.assign({},snap),profile):snap};Object.defineProperty(sfn,"__marionR18CLawMemorySnap",{value:true});module.exports.getGuardianSnapshot=sfn;}module.exports.MARION_R18C_LAW_MEMORY_VERSION=V;module.exports.marionR18CLawMemoryProfile=lawProfile;}catch(_){}})();

/* R18C-S1: law memory secondary-lane correction */
(function(){try{const V="guardian.memory.bridge/R18C-S1-law-secondary-lane-correction";function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function N(v){return T(v).toLowerCase()}function core(turn){turn=turn&&typeof turn==="object"?turn:{};return N([turn.input,turn.prompt,turn.text,turn.message,turn.topic,turn.currentObjective,turn.activeFeatureLane].join(" "))}function profile(turn){const t=core(turn);const active=/\b(law|legal|lawyer|attorney|court|sue|lawsuit|claim|liability|contract|agreement|nda|terms|license|licence|licensing|copyright|trademark|patent|intellectual property|\bip\b|royalty|distribution rights|broadcast rights|ott|ctv|roku|compliance|regulatory|regulation|jurisdiction|privacy policy|data protection|employment|contractor|lease|r18c|lawAssessmentFrame|legalCategory)\b/.test(t);const sec=[];if(/\b(ai|artificial intelligence|model|agent|llm|automation|prompt|tool)\b/.test(t))sec.push("ai");if(/\b(cyber|security|identity|access|secret|credential|token|auth|permission|privacy|data protection|breach)\b/.test(t))sec.push("cyber");if(/\b(finance|revenue|tax|cost|grant|funding|royalty|ads|monetiz)\b/.test(t))sec.push("finance");if(/\b(business|client|vendor|platform|ott|ctv|roku|distribution|commercial|corporation)\b/.test(t))sec.push("business");return{active,sec}}function lane(p){if(p.sec.includes("ai")&&p.sec.includes("cyber"))return"law_ai_cyber";if(p.sec.includes("cyber"))return"law_cyber";if(p.sec.includes("ai"))return"law_ai";if(p.sec.includes("finance"))return"law_finance";if(p.sec.includes("business"))return"law_business";return"law"}function correct(obj,p){if(!obj||typeof obj!=="object"||!p.active)return obj;obj.activeFeatureLane=lane(p);obj.lawCrossDomainSecondaryLane=p.sec.join("_")||"none";return obj}const oldRemember=module.exports.rememberTurn;if(typeof oldRemember==="function"&&!oldRemember.__marionR18CLawS1Memory){const fn=function(g,turn,opt){const p=profile(turn);const snap=oldRemember.call(this,g,turn,opt);if(p.active){try{const m=ensureMemory?ensureMemory(g):null;if(m){correct(m,p);if(Array.isArray(m.turns)&&m.turns.length)correct(m.turns[m.turns.length-1],p)}}catch(_){}return correct(snap,p)}return snap};Object.defineProperty(fn,"__marionR18CLawS1Memory",{value:true});module.exports.rememberTurn=fn;}module.exports.MARION_R18C_S1_LAW_MEMORY_VERSION=V;}catch(_){}})();


/* R18C_FINAL_RESPONSE_ENVELOPE_INTEGRATION_START */
(function(){try{
  const V="nyx.marion.r18c.finalResponseEnvelopeIntegration/1.0";
  function T(v,m){let s=v==null?"":String(v).replace(/\s+/g," ").trim();m=Number(m)||4000;return s.length>m?s.slice(0,m-1).trim()+"…":s}
  function N(v){return T(v,6000).toLowerCase().replace(/[’]/g,"'")}
  function O(v){return !!v&&typeof v==="object"&&!Array.isArray(v)}
  function A(v){return Array.isArray(v)?v:[]}
  function J(v){try{return typeof v==="string"?v:JSON.stringify(v||{}).slice(0,6000)}catch(_){return""}}
  function promptOf(args){args=Array.prototype.slice.call(args||[]);for(const v of args){if(typeof v==="string"&&T(v))return T(v);if(O(v)){const b=O(v.body)?v.body:{};const p=v.prompt||v.input||v.text||v.message||v.userText||v.query||v.command||v.normalizedUserIntent||b.prompt||b.input||b.text||b.message||b.userText;if(p)return T(p)}}return""}
  function packetText(o){if(!O(o))return T(o,6000);const m=O(o.meta)?o.meta:{};const r=O(o.result)?o.result:{};const fe=O(o.finalEnvelope)?o.finalEnvelope:(O(r.finalEnvelope)?r.finalEnvelope:{});return [o.prompt,o.input,o.text,o.message,o.userText,o.query,o.command,o.normalizedUserIntent,o.directReply,o.visibleReply,o.publicReply,o.reply,o.response,o.currentObjective,o.nextAction,o.activeFeatureLane,o.legalCategory,o.lawAssessmentFrame,m.activeFeatureLane,m.legalCategory,m.lawAssessmentFrame,fe.activeFeatureLane,fe.legalCategory,fe.lawAssessmentFrame,r.activeFeatureLane,r.legalCategory,r.lawAssessmentFrame].map(x=>T(x,800)).filter(Boolean).join(" ")}
  function isTechnicalLawFileWork(text){const t=N(text);return /\b(surgical autopsy|autopsy|critical autopsy|line[-\s]?by[-\s]?line|patch|update|resend|downloadable|zip package|package|files?|manifest|payloads?|registry|routing|domain router|domain registry|domain_runtime_priority_manifest|final response|final envelope|envelope integration|node --check|smoke test|json validation|structural integrity|architecture)\b/.test(t)&&/\b(law|legal|r18c|domain)\b/.test(t)}
  function isShortFollowup(text){return /^(?:next|next steps|what now|what's next|continue|keep going|carry on|proceed|pass|passed|locked|green|success)$/i.test(T(text).replace(/[.!?]+$/,""))}
  function hasLawCarry(text){return /\b(activeFeatureLane["']?\s*[:=]\s*["']?law|r18CLawRealWorldAssessment|lawAssessmentFrame|legalCategory|legalRiskLevel|lawCrossDomainSecondaryLane)\b/i.test(text)}
  function secLanes(t){const sec=[];if(/\b(ai|artificial intelligence|model|agent|llm|automation|prompt|tool)\b/i.test(t))sec.push("ai");if(/\b(cyber|security|identity|access|secret|credential|token|auth|permission|privacy|data protection|breach|incident)\b/i.test(t))sec.push("cyber");if(/\b(finance|revenue|tax|cost|grant|funding|valuation|royalty|ads|ad[-\s]?supported|moneti[sz])\b/i.test(t))sec.push("finance");if(/\b(business|client|vendor|platform|ott|ctv|roku|distribution|commercial|corporation|company)\b/i.test(t))sec.push("business");return Array.from(new Set(sec)).slice(0,4)}
  function lane(p){if(p.secondary.includes("ai")&&p.secondary.includes("cyber"))return"law_ai_cyber";if(p.secondary.includes("cyber"))return"law_cyber";if(p.secondary.includes("ai"))return"law_ai";if(p.secondary.includes("finance"))return"law_finance";if(p.secondary.includes("business"))return"law_business";return"law"}
  function category(t){t=N(t);if(/\b(police|criminal|arrest|charged|charge|warrant|search|seizure|charter section 8|right to counsel|detained)\b/.test(t))return"criminal_procedure";if(/\b(charter|constitutional|constitution|section 1|section 7|section 8|section 10|freedom of expression|equality rights)\b/.test(t))return"constitutional_charter";if(/\b(employment|employee|employer|fired|terminated|termination|severance|release|workplace|contractor|independent contractor|non[- ]?compete|non[- ]?solicit)\b/.test(t))return"employment_contractor";if(/\b(privacy|data protection|personal information|customer data|consent|pipeda|gdpr|security breach|breach notice|data processing)\b/.test(t))return"privacy_data";if(/\b(copyright|licen[cs]e|licensing|royalty|distribution rights|broadcast rights|content rights|sync rights|ott|ctv|roku|ad[-\s]?supported|moneti[sz])\b/.test(t))return"copyright_licensing";if(/\b(trademark|patent|intellectual property|\bip\b|brand mark|passing off)\b/.test(t))return"ip_trademark_patent";if(/\b(compliance|regulatory|regulation|permit|filing|statute|corporate|incorporation|bylaw|shareholder|director|officer)\b/.test(t))return"compliance_regulatory";if(/\b(liability|liable|lawsuit|sue|claim|damages|negligence|defamation|libel|slander|dispute|settlement|cease and desist|tort)\b/.test(t))return"liability_dispute";if(/\b(contract|agreement|nda|terms|indemnity|warranty|breach|clause|deliverable|scope of work|sow|consideration)\b/.test(t))return"contract";if(/\b(jurisdiction|court|tribunal|filing|procedure|venue|province|territory|federal|which source|canlii|case law|statute|research|source ladder|verify)\b/.test(t))return"jurisdiction_procedure";return"general_legal_risk"}
  function risk(t,cat){t=N(t);if(/\b(imminent|right now|today|deadline|limitation|court date|hearing|served|arrest|charged|police|criminal|warrant|subpoena|injunction|regulator investigation|fraud|illegal)\b/.test(t))return"critical";if(/\b(lawsuit|sue|claim|damages|infringement|breach|terminate|termination|release|indemnity|privacy breach|personal data|cease and desist|penalty|fine|defamation|employment)\b/.test(t))return"high";if(cat&&cat!=="general_legal_risk")return"medium";return"low"}
  function profile(prompt,obj){const visiblePrompt=T(prompt)||T(packetText(obj));const carrySource=J(obj);const technical=isTechnicalLawFileWork(visiblePrompt);const carry=hasLawCarry(carrySource);const short=isShortFollowup(visiblePrompt);const lawTerm=/\b(law|legal|lawyer|attorney|counsel|court|sue|lawsuit|claim|liability|liable|negligence|damages|indemnity|contract|agreement|nda|terms|licen[cs]e|licensing|copyright|trademark|patent|intellectual property|\bip\b|royalty|distribution rights|broadcast rights|ott|ctv|roku|compliance|regulatory|regulation|jurisdiction|statute|privacy policy|data protection|consent|employment|employee|employer|fired|terminated|termination|severance|release|workplace|contractor|independent contractor|non[- ]?compete|non[- ]?solicit|lease|permit|filing|incorporation|shareholder|bylaw|charter|constitutional|criminal|police|defamation)\b/i.test(visiblePrompt);const active=!technical&&(lawTerm||(short&&carry));const cat=category(visiblePrompt);const secondary=secLanes(visiblePrompt);const r=risk(visiblePrompt,cat);return{active,technical,short,carry,category:cat,risk:r,secondary,lane:"",sourcePrompt:visiblePrompt};}
  function label(cat){return ({contract:"contract risk",copyright_licensing:"copyright/licensing risk",ip_trademark_patent:"IP/trademark/patent risk",compliance_regulatory:"compliance/regulatory risk",liability_dispute:"liability/dispute risk",employment_contractor:"employment/contractor risk",privacy_data:"privacy/data risk",corporate_business:"corporate/business risk",jurisdiction_procedure:"jurisdiction/procedure risk",criminal_procedure:"criminal/procedure risk",constitutional_charter:"constitutional/Charter issue",general_legal_risk:"general legal risk"})[cat]||"general legal risk"}
  function lawReply(p){const cat=label(p.category);let lead="I can frame this as general legal-risk triage, not legal advice.";if(p.short&&p.carry)lead="Next: keep the active law lane in the R18C frame — category, jurisdiction, facts vs assumptions, risk, missing information, source check, then safe next move.";let body="Category: "+cat+". Jurisdiction matters because procedure, deadlines, and remedies can shift by province, territory, court, tribunal, contract wording, or platform terms. Facts vs assumptions: separate what the documents actually say from what we think they allow. Risk exposure: "+(p.risk==="critical"?"critical/time-sensitive — do not rely on a generic answer for strategy.":p.risk==="high"?"high — source documents and professional review are strongly recommended before action.":"medium — verify the governing source before relying on it.")+" Missing information: jurisdiction, dates, complete agreement/policy/notice text, parties, platform/territory/scope, and any deadlines. Safe next move: preserve the documents, verify the governing source, and avoid signing, threatening, filing, publishing, or admitting anything until the risk is checked.";
    if(p.category==="copyright_licensing")body="Category: copyright/licensing risk. Jurisdiction and platform scope matter. Facts vs assumptions: separate the rights you actually hold from assumptions about OTT/CTV/Roku distribution, territory, format, term, sublicensing, and ad-supported monetization. Risk exposure: high if the paperwork does not clearly cover the exact use. Missing information: license grant, rights holder, territory, duration, monetization language, platform language, and termination clauses. Safe next move: verify the source agreement before publishing or monetizing.";
    else if(p.category==="employment_contractor")body="Category: employment/contractor risk. Jurisdiction matters because employment standards, common-law notice, contractor status, releases, and deadlines vary. Facts vs assumptions: separate the offer letter, contract, termination letter, release, pay records, and role history from assumptions about fairness. Risk exposure: high if a release or deadline is involved. Safe next move: do not sign under pressure; preserve the documents and get jurisdiction-specific review.";
    else if(p.category==="privacy_data")body="Category: privacy/data risk. Jurisdiction matters because privacy statutes, consent rules, breach duties, and vendor obligations vary. Facts vs assumptions: identify what data is involved, who controls/processes it, what the contract says, and whether a breach or transfer occurred. Risk exposure can become high if personal/customer data is exposed. Safe next move: verify the data-processing terms, security obligations, breach-notice language, and retention/deletion duties.";
    else if(p.category==="criminal_procedure")body="Category: criminal/procedure risk. This is high-stakes and jurisdiction-sensitive. Facts vs assumptions: separate what police did, what was said, whether there was detention/search/seizure, timing, and any paperwork. Risk exposure: critical if charges, arrest, a warrant, or a deadline is involved. Safe next move: document the timeline and speak to a lawyer or legal clinic before making statements or strategic choices.";
    return (lead+" "+body).replace(/\s+/g," ").trim();}
  function technicalReply(){return "Technical routing preserved: this is law-domain file work, not a user-facing legal-advice answer. Keep the surgery on the manifest, payloads, router/envelope behavior, structural integrity, validation, and downloadable package output.";}
  function meta(p){return{r18CFinalResponseEnvelopeIntegration:true,r18CLawRealWorldAssessment:p.active,lawAssessmentFrame:"category_jurisdiction_facts_assumptions_risk_missing_info_source_check_safe_next_move",legalCategory:p.category,jurisdictionSensitivity:p.active,legalAdviceBoundary:p.active?"general_information_legal_risk_triage_not_legal_advice":"not_active",legalRiskLevel:p.risk,legalRiskBoundary:{generalInformationOnly:true,notLegalAdvice:true,noAttorneyClientRelationship:true,noLegalCertainty:true,jurisdictionRequired:true,verifySourceDocuments:true,professionalReviewRecommended:p.risk==="high"||p.risk==="critical"},factsAssumptionsSeparated:p.active,professionalReviewRecommended:p.risk==="high"||p.risk==="critical",lawCrossDomainSecondaryLane:p.secondary.join("_")||"none",lawShortPromptLaneInheritance:!!(p.short&&p.carry),legalSourceDocumentCheckRequired:p.active,noLegalCertaintyClaim:true,noAttorneyClientRelationship:true,activeFeatureLane:p.active?lane(p):"",lawTechnicalSurgeryGuard:p.technical,visibleLawReplyPolicy:p.active?"r18c_structured_natural_non_advice":"preserve_existing"}}
  function badLawReply(s){return /\bLaw assessment:|legal-risk triage, not legal advice|category_jurisdiction_facts_assumptions|law assessment lane held\b/i.test(T(s,2000))}
  function shouldShape(existing,p){if(!p.active)return false;if(!T(existing))return true;if(/\b(AI lane active|Cyber lane|AI-cyber|verify identity, access, secrets|assess goal, context, data, risk)\b/i.test(existing))return true;if(!/\b(not legal advice|general legal information|legal-risk triage)\b/i.test(existing))return true;if(!/\b(jurisdiction|province|territory|court|tribunal|governing law)\b/i.test(existing))return true;return false}
  function apply(obj,prompt,depth){depth=depth||0;const p=profile(prompt,obj);p.lane=lane(p);if(typeof obj==="string"){if(p.technical&&badLawReply(obj))return technicalReply();return p.active?lawReply(p):obj}if(!O(obj)||depth>3)return obj;const x=Array.isArray(obj)?obj.slice():Object.assign({},obj);const fields=["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","answer","displayReply","spokenText","speechText"];
    let existing="";for(const f of fields){if(typeof x[f]==="string"&&T(x[f])){existing=x[f];break}}
    if(p.technical&&badLawReply(existing)){["directReply","visibleReply","publicReply","reply","response","text","message"].forEach(f=>{if(Object.prototype.hasOwnProperty.call(x,f)||f==="directReply"||f==="visibleReply"||f==="publicReply"||f==="reply")x[f]=technicalReply()});x.activeFeatureLane="technical";}
    else if(shouldShape(existing,p)){const r=lawReply(p);["directReply","visibleReply","publicReply","reply","response","text","message"].forEach(f=>{if(Object.prototype.hasOwnProperty.call(x,f)||f==="directReply"||f==="visibleReply"||f==="publicReply"||f==="reply")x[f]=r});}
    ["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope"].forEach(f=>{if(O(x[f]))x[f]=apply(x[f],prompt,depth+1)});
    const m=meta(p);x.meta=Object.assign({},O(x.meta)?x.meta:{},m);if(p.active){Object.assign(x,m);x.activeFeatureLane=m.activeFeatureLane;x.currentObjective=T(x.currentObjective)||"Render R18C law final response with non-advice, jurisdiction-aware risk framing.";x.nextAction=T(x.nextAction)||"Confirm category, jurisdiction, facts, assumptions, risk, missing information, source check, and safe next move.";x.riskLevel=p.risk==="critical"?"critical":p.risk==="high"?"high":(x.riskLevel||"medium");if(p.risk==="high"||p.risk==="critical")x.approvalRequired=true;}else if(p.technical){x.lawTechnicalSurgeryGuard=true;x.r18CFinalResponseEnvelopeIntegration=true;}
    return x;}
  function wrap(fn){if(typeof fn!=="function"||fn.__r18cFinalEnvelopeIntegration)return fn;const w=function(){const p=promptOf(arguments);const out=fn.apply(this,arguments);return out&&typeof out.then==="function"?out.then(v=>apply(v,p,0)):apply(out,p,0)};Object.defineProperty(w,"__r18cFinalEnvelopeIntegration",{value:true});return w}
  if(typeof module!=="undefined"&&module.exports){if(typeof module.exports==="function")module.exports=wrap(module.exports);if(module.exports&&typeof module.exports==="object"){["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","adaptGuardianResponse","logGuardianEvent","rememberTurn","getGuardianMemory","getGuardianSnapshot","default"].forEach(n=>{if(typeof module.exports[n]==="function")module.exports[n]=wrap(module.exports[n])});module.exports.MARION_R18C_FINAL_RESPONSE_ENVELOPE_VERSION=V;module.exports.marionR18CFinalEnvelopeApply=apply;module.exports.marionR18CFinalEnvelopeProfile=profile;module.exports.marionR18CFinalEnvelopeReply=function(p){return lawReply(profile(p,{}))};module.exports.marionR18CTechnicalLawFileWork=isTechnicalLawFileWork;}}
}catch(_){}})();
/* R18C_FINAL_RESPONSE_ENVELOPE_INTEGRATION_END */


/* R18C_MEMORY_TECHNICAL_LAW_SURGERY_GUARD_START */
(function(){try{
  const V="guardian.memory.bridge/R18C-technical-law-surgery-guard/1.0";
  function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}
  function N(v){return T(v).toLowerCase()}
  function J(v){try{return typeof v==="string"?v:JSON.stringify(v||{}).slice(0,5000)}catch(_){return""}}
  function tech(v){const t=N(J(v));return /\b(surgical autopsy|autopsy|patch|update|files?|manifest|payload|registry|routing|zip|package|node --check|structural integrity|final response|final envelope|envelope integration)\b/.test(t)&&/\b(law|legal|r18c|domain)\b/.test(t)}
  function correct(o){if(!o||typeof o!=="object")return o;if(tech(o)){o.lawTechnicalSurgeryGuard=true;o.r18CLawRealWorldAssessment=false;o.activeFeatureLane="technical";o.legalAdviceBoundary="technical_law_file_work_not_legal_answer";}return o}
  const oldRemember=module.exports&&module.exports.rememberTurn;if(typeof oldRemember==="function"&&!oldRemember.__r18cMemoryTechLawGuard){const fn=function(g,turn,opt){const snap=oldRemember.call(this,g,tech(turn)?Object.assign({},turn,{lawTechnicalSurgeryGuard:true,r18CLawRealWorldAssessment:false,activeFeatureLane:"technical"}):turn,opt);try{const m=typeof ensureMemory==="function"?ensureMemory(g):null;if(m)correct(m)}catch(_){}return correct(snap)};Object.defineProperty(fn,"__r18cMemoryTechLawGuard",{value:true});module.exports.rememberTurn=fn;}
  ["getGuardianMemory","getGuardianSnapshot"].forEach(function(n){const old=module.exports&&module.exports[n];if(typeof old==="function"&&!old.__r18cMemoryTechLawGuard){const fn=function(){return correct(old.apply(this,arguments))};Object.defineProperty(fn,"__r18cMemoryTechLawGuard",{value:true});module.exports[n]=fn;}});
  if(module.exports&&typeof module.exports==="object")module.exports.MARION_R18C_MEMORY_TECHNICAL_LAW_SURGERY_GUARD_VERSION=V;
}catch(_){}})();
/* R18C_MEMORY_TECHNICAL_LAW_SURGERY_GUARD_END */



/* R18C_FULL_STACK_REGRESSION_HARMONIZER_START */
(function(){
  try {
    const V = "nyx.marion.r18c.fullStackRegression/1.0";
    function T(v, max){ let s = v == null ? "" : String(v).replace(/\s+/g," ").trim(); if(max && s.length > max) s = s.slice(0, max - 1).trim() + "…"; return s; }
    function O(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
    function A(v){ return Array.isArray(v) ? v : []; }
    function lower(v){ return T(v, 4000).toLowerCase(); }
    function firstText(){
      for (let i = 0; i < arguments.length; i += 1) {
        const v = T(arguments[i], 4000);
        if (v) return v;
      }
      return "";
    }
    function extractText(packet){
      const p = O(packet), payload = O(p.payload), meta = O(p.meta), session = O(p.session), body = O(p.body);
      return firstText(p.text, p.userText, p.rawUserText, p.message, p.prompt, p.normalizedUserIntent,
        payload.text, payload.userText, payload.rawUserText, payload.message, payload.prompt,
        meta.text, meta.userText, meta.rawUserText, session.lastUserText, body.text, body.userText);
    }
    function r18cTechnicalLawFileWork(text){
      const t = lower(text);
      return /\b(surgical\s+autopsy|autopsy|patch|fix|update|harden|audit|line[-\s]?by[-\s]?line|node\s+--check|zip|downloadable|resend|script|file|files|js|json|manifest|payload|pack|runtime|router|routing|registry|domain\s+router|domain\s+registry|domain\s+concierge|composemarionresponse|marionbridge|final\s+envelope|state\s+spine|chatengine|index\.js)\b/.test(t) &&
        /\b(law|legal|contract|contracts|manifest|payload|domain)\b/.test(t);
    }
    function r18cShortLawFollowup(text, ctx){
      const t = lower(text).replace(/[.!?]+$/g,"").trim();
      if (!/^(next|next steps|continue|keep going|carry on|what next|what now|then what|passed|pass|locked)$/.test(t)) return false;
      const c = JSON.stringify(ctx || {}).toLowerCase();
      return /\b(activefeaturelane|knowledgeDomain|primaryDomain|selectedDomain|domain|route|lastTopic|currentObjective)\b/.test(c) &&
        /\b(law|legal|contract|copyright|licensing|liability|compliance|jurisdiction)\b/.test(c);
    }
    function r18cDetectLawCategories(text){
      const t = lower(text);
      const out = [];
      if (/\b(copyright|license|licence|licensing|distribution rights?|broadcast rights?|streaming rights?|public performance|sync rights?|roku|ott|movie|movies|moneti[sz]e|platform rights?)\b/.test(t)) out.push("copyright_licensing");
      if (/\b(fired|terminated|termination|severance|release to sign|sign the release|two weeks|employment|employee|employer|contractor|independent contractor|wrongful dismissal|constructive dismissal|without cause)\b/.test(t)) out.push("employment_contractor");
      if (/\b(defamation|libel|slander|false claims?|false statements?|posted false|business online|reputation|negligence|liable|liability|lawsuit|sue|damages|injury|harm|tort)\b/.test(t)) out.push("liability_dispute");
      if (/\b(customer data|personal information|personal data|privacy|data processing|vendor data|pipeda|data breach|consent|processor|controller|dpa|confidential information)\b/.test(t)) out.push("privacy_data");
      if (/\b(trademark|trade mark|patent|intellectual property|\bip\b|brand rights?|logo|mark infringement)\b/.test(t)) out.push("ip_trademark_patent");
      if (/\b(compliance|regulatory|regulation|policy|terms of service|platform terms|statute|act|legal requirement)\b/.test(t)) out.push("compliance_regulatory");
      if (/\b(corporation|incorporated|shareholder|director|officer|bylaws|articles|corporate|business structure)\b/.test(t)) out.push("corporate_business");
      if (/\b(jurisdiction|province|territory|court|tribunal|deadline|limitation|file|filing|procedure|serve|served|hearing)\b/.test(t)) out.push("jurisdiction_procedure");
      if (/\b(contract|agreement|clause|terms|breach|enforceable|consideration|promise|release|waiver|indemnity|distribution rights?)\b/.test(t)) out.push("contract");
      if (/\b(source|sources|verify|verification|case law|canlii|statute|regulation|official source|research)\b/.test(t)) out.push("source_verification");
      if (!out.length && /\b(law|legal|rights?|obligation|permitted|allowed|can i|should i sign|safe to)\b/.test(t)) out.push("general_legal_risk");
      const priority = ["employment_contractor","copyright_licensing","privacy_data","liability_dispute","ip_trademark_patent","compliance_regulatory","jurisdiction_procedure","corporate_business","contract","source_verification","general_legal_risk"];
      return Array.from(new Set(out)).sort((a,b)=>priority.indexOf(a)-priority.indexOf(b));
    }
    function r18cSecondaryDomains(text, cats){
      const t = lower(text), out = [];
      if (/\b(roku|ott|streaming|movie|movies|channel|platform|distribution)\b/.test(t)) out.push("business","roku");
      if (/\b(moneti[sz]e|revenue|cost|price|pay|severance|settlement|damages|commercial|business|sandblast)\b/.test(t)) out.push("finance","business");
      if (cats.indexOf("privacy_data") >= 0 || /\b(data|privacy|security|breach|access|vendor)\b/.test(t)) out.push("cyber");
      if (/\b(ai|model|automation|agent|llm)\b/.test(t)) out.push("ai");
      return Array.from(new Set(out.filter(x => x && x !== "law"))).slice(0,4);
    }
    function r18cIsLaw(text, ctx){
      if (r18cTechnicalLawFileWork(text)) return false;
      const cats = r18cDetectLawCategories(text);
      if (cats.length && !(cats.length === 1 && cats[0] === "general_legal_risk" && !/\b(law|legal|rights|liability|contract|copyright|license|employment|fired|defamation|privacy|compliance|jurisdiction|safe to|permitted|allowed)\b/i.test(T(text)))) return true;
      return r18cShortLawFollowup(text, ctx);
    }
    function r18cProfile(text, ctx){
      const cats = r18cDetectLawCategories(text);
      const shortCarry = r18cShortLawFollowup(text, ctx);
      const category = cats[0] || (shortCarry ? "general_legal_risk" : "");
      const secondary = r18cSecondaryDomains(text, cats);
      return {
        version: V,
        active: !!(category || shortCarry),
        domain: "law",
        primaryDomain: "law",
        selectedDomain: "law",
        knowledgeDomain: "law",
        legalCategory: category || "general_legal_risk",
        legalCategories: cats.length ? cats : ["general_legal_risk"],
        secondaryDomains: secondary,
        confidence: shortCarry ? 0.82 : 0.94,
        confidenceScore: shortCarry ? 0.82 : 0.94,
        band: "high",
        confidenceBand: "high",
        margin: shortCarry ? 0.18 : 0.32,
        answerMode: "grounded",
        highStakes: true,
        routeLocked: true,
        failClosed: false,
        needsClarifier: false,
        reason: shortCarry ? "r18c_law_short_prompt_lane_inheritance" : "r18c_full_stack_law_precedence",
        assessmentFrame: ["legal_category","jurisdiction_sensitivity","facts_vs_assumptions","risk_exposure","missing_information","source_document_check","safe_next_move"],
        legalBoundary: {
          generalInformationOnly: true,
          noLegalAdvice: true,
          noAttorneyClientRelationship: true,
          noLegalCertaintyClaim: true,
          jurisdictionRequired: true,
          sourceDocumentReviewRequired: true,
          professionalReviewRecommendedForHighRisk: true
        },
        noCrossDomainBleed: true,
        noUserFacingDiagnostics: true,
        r18cFullStackRegression: true,
        fullStackAgreementRequired: true
      };
    }
    function r18cMergeLawProfile(target, profile){
      const out = O(target);
      if (!profile || !profile.active) return out;
      out.domain = "law";
      out.primaryDomain = "law";
      out.selectedDomain = "law";
      out.knowledgeDomain = "law";
      out.legalCategory = profile.legalCategory;
      out.legalCategories = profile.legalCategories;
      out.secondaryDomains = profile.secondaryDomains;
      out.answerMode = "grounded";
      out.highStakes = true;
      out.routeLocked = true;
      out.needsClarifier = false;
      out.failClosed = false;
      out.r18cLawAssessment = Object.assign({}, O(out.r18cLawAssessment), profile);
      out.r18cFullStackRegression = true;
      out.noCrossDomainBleed = true;
      out.noUserFacingDiagnostics = true;
      return out;
    }
    const api = { V, T, O, A, extractText, r18cTechnicalLawFileWork, r18cShortLawFollowup, r18cDetectLawCategories, r18cSecondaryDomains, r18cIsLaw, r18cProfile, r18cMergeLawProfile };
    module.exports.MARION_R18C_FULL_STACK_REGRESSION_VERSION = V;
    module.exports.marionR18CFullStackHelpers = api;
    module.exports.marionR18CFullStackProfile = function(packet){
      const text = extractText(packet);
      return r18cProfile(text, packet);
    };
    module.exports.marionR18CFullStackIsLawTurn = function(packet){
      const text = extractText(packet);
      return r18cIsLaw(text, packet);
    };
    module.exports.marionR18CFullStackTechnicalLawFileWork = function(packet){
      return r18cTechnicalLawFileWork(extractText(packet));
    };
  } catch(_err) {}
})();
/* R18C_FULL_STACK_REGRESSION_HARMONIZER_END */

/* R18C_FULL_STACK_FINAL_METADATA_WRAP_START */
(function(){
  try {
    const H = module.exports.marionR18CFullStackHelpers;
    if (!H || module.exports.__r18cFullStackFinalMetadataWrapped) return;
    const oldApply = module.exports.marionR18CFinalEnvelopeApply;
    const oldProfile = module.exports.marionR18CFinalEnvelopeProfile;
    module.exports.marionR18CFullStackEnvelopeProfile = function(packet){
      const text = H.extractText(packet);
      const p = H.r18cProfile(text, packet);
      return Object.assign({}, p, {
        visibleReplyPolicy: "jurisdiction_aware_legal_risk_triage",
        fullStackAgreementRequired: true,
        technicalLawFileWorkGuard: H.r18cTechnicalLawFileWork(text)
      });
    };
    if (typeof oldProfile === "function") {
      module.exports.marionR18CFinalEnvelopeProfile = function(packet){
        const base = oldProfile.apply(this, arguments);
        const text = H.extractText(packet);
        if (!H.r18cIsLaw(text, packet)) return base;
        return Object.assign({}, H.O(base), module.exports.marionR18CFullStackEnvelopeProfile(packet));
      };
    }
    if (typeof oldApply === "function") {
      module.exports.marionR18CFinalEnvelopeApply = function(packet){
        const base = oldApply.apply(this, arguments);
        const text = H.extractText(packet);
        if (!H.r18cIsLaw(text, packet)) return base;
        const p = module.exports.marionR18CFullStackEnvelopeProfile(packet);
        return H.r18cMergeLawProfile(Object.assign({}, H.O(base), {
          r18CLawRealWorldAssessment: true,
          lawAssessmentFrame: p.assessmentFrame.join(" > "),
          legalAdviceBoundary: "general_information_not_legal_advice",
          factsAssumptionsSeparated: true,
          professionalReviewRecommended: true,
          legalSourceDocumentCheckRequired: true,
          noLegalCertaintyClaim: true,
          noAttorneyClientRelationship: true
        }), p);
      };
    }
    module.exports.__r18cFullStackFinalMetadataWrapped = true;
  } catch(_err) {}
})();
/* R18C_FULL_STACK_FINAL_METADATA_WRAP_END */

/* R18C_FULL_STACK_MEMORY_LANE_GUARD_START */
(function(){
  try {
    const H = module.exports.marionR18CFullStackHelpers;
    if (!H || module.exports.__r18cFullStackMemoryWrapped) return;
    const oldRemember = module.exports.rememberTurn;
    if (typeof oldRemember === "function") {
      module.exports.rememberTurn = function(guardian, turn){
        const text = H.extractText(turn);
        const t = H.r18cTechnicalLawFileWork(text);
        const law = H.r18cIsLaw(text, turn);
        if (turn && typeof turn === "object") {
          if (t) {
            turn.activeFeatureLane = turn.activeFeatureLane || "technical";
            turn.r18cTechnicalLawFileWorkGuard = true;
          } else if (law) {
            const p = H.r18cProfile(text, turn);
            turn.activeFeatureLane = "law";
            turn.knowledgeDomain = "law";
            turn.r18cLawAssessment = p;
            turn.legalCategory = p.legalCategory;
          }
        }
        return oldRemember.apply(this, arguments);
      };
    }
    module.exports.__r18cFullStackMemoryWrapped = true;
  } catch(_err) {}
})();
/* R18C_FULL_STACK_MEMORY_LANE_GUARD_END */

/* MARION_CURRENT_TURN_AUTHORITY_R1_START */
(function(){"use strict";let guard=null;try{guard=require("./marionCurrentTurnAuthority.js");}catch(_){guard=null;}if(!guard||typeof module==="undefined"||!module.exports)return;const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(!api)return;function wrap(fn){if(typeof fn!=="function"||fn.__marionCurrentTurnAuthorityR1)return fn;const w=function(){const p=guard.prepareArgumentList(arguments),current=guard.classifyCurrentTurn(p.input);if(guard.isPrivateMarionContext(p.input)&&guard.isIsolatedTurn(p.input)&&typeof api.resetGuardianMemory==="function"){try{api.resetGuardianMemory("marion");}catch(_){}}const r=fn.apply(this,p.args),x=v=>guard.scrubStateForCurrentTurn(v,p.input);return r&&typeof r.then==="function"?r.then(x):x(r);};w.__marionCurrentTurnAuthorityR1=true;return w;}if(typeof api.rememberTurn==="function")api.rememberTurn=wrap(api.rememberTurn);if(typeof api.mergeGuardianContext==="function")api.mergeGuardianContext=wrap(api.mergeGuardianContext);api.MARION_CURRENT_TURN_AUTHORITY_VERSION=guard.VERSION;api.currentTurnAuthority=guard;})();
/* MARION_CURRENT_TURN_AUTHORITY_R1_END */

