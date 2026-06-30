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

const VERSION = "guardian.memory.bridge v1.2.0 PRIORITY3-STATE-CARRY-HARDENED";
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
