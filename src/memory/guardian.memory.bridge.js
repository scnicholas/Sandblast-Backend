const DEFAULT_MAX_TURNS = 30;
const GUARDIAN_ALIASES = { marion: "marion", mariam: "marion", aster: "aster", astro: "aster", thalon: "thalon", fallon: "thalon" };
const SECRET_KEY_RE = /(token|secret|password|apikey|api_key|authorization|cookie|session)/i;

function now() {
  return new Date().toISOString();
}

function guardianKey(value = "marion") {
  const key = String(value || "marion").trim().toLowerCase();
  return GUARDIAN_ALIASES[key] || "marion";
}

function cleanText(value, max = 1200) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max - 1).trim() + "…" : text;
}

function redactTurn(turn = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(turn || {})) {
    if (SECRET_KEY_RE.test(key)) safe[key] = "[REDACTED]";
    else if (typeof value === "string") safe[key] = cleanText(value, key === "reply" ? 1800 : 1200);
    else safe[key] = value;
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

export function getGuardianMemory(guardian = "marion") {
  return ensureMemory(guardian);
}

export function getGuardianSnapshot(guardian = "marion", limit = 8) {
  const m = ensureMemory(guardian);
  return {
    guardian: guardianKey(guardian),
    currentObjective: m.currentObjective,
    lastTopic: m.lastTopic,
    lastDecision: m.lastDecision,
    lastAction: m.lastAction,
    lastRiskLevel: m.lastRiskLevel,
    approvalRequired: m.approvalRequired,
    activeMode: m.activeMode,
    updatedAt: m.updatedAt,
    turns: m.turns.slice(-Math.max(0, Number(limit) || 0))
  };
}

export function rememberTurn(guardian = "marion", turn = {}, options = {}) {
  const m = ensureMemory(guardian);
  const maxTurns = Math.max(1, Number(options.maxTurns) || DEFAULT_MAX_TURNS);
  const safeTurn = redactTurn({ timestamp: now(), ...turn });

  m.lastTopic = cleanText(safeTurn.input || safeTurn.topic || m.lastTopic, 700);
  m.lastDecision = cleanText(safeTurn.reply || safeTurn.decision || m.lastDecision, 900);
  m.lastAction = cleanText(safeTurn.nextAction || safeTurn.action || m.lastAction, 700);
  m.lastRiskLevel = cleanText(safeTurn.riskLevel || m.lastRiskLevel, 32) || "low";
  m.approvalRequired = Boolean(safeTurn.approvalRequired);
  m.activeMode = cleanText(safeTurn.guardianMode || safeTurn.mode || m.activeMode, 32) || "marion";
  m.updatedAt = now();
  m.turns.push(safeTurn);

  while (m.turns.length > maxTurns) m.turns.shift();
  return getGuardianSnapshot(guardian, maxTurns);
}

export function setGuardianObjective(guardian = "marion", objective = "") {
  const m = ensureMemory(guardian);
  const next = cleanText(objective, 900);
  if (next) m.currentObjective = next;
  m.updatedAt = now();
  return getGuardianSnapshot(guardian);
}

export function mergeGuardianContext(guardian = "marion", patch = {}) {
  const m = ensureMemory(guardian);
  const allowed = ["currentObjective", "lastTopic", "lastDecision", "lastAction", "lastRiskLevel", "activeMode"];
  for (const key of allowed) {
    if (patch[key] !== undefined) m[key] = cleanText(patch[key], 1200) || m[key];
  }
  if (patch.approvalRequired !== undefined) m.approvalRequired = Boolean(patch.approvalRequired);
  m.updatedAt = now();
  return getGuardianSnapshot(guardian);
}

export function resetGuardianMemory(guardian = "marion") {
  const key = guardianKey(guardian);
  const currentObjective = ensureMemory(key).currentObjective;
  memory[key] = createGuardianMemory(currentObjective);
  return getGuardianSnapshot(key);
}

export function listGuardianMemory() {
  return Object.keys(memory).reduce((out, key) => {
    out[key] = getGuardianSnapshot(key, 3);
    return out;
  }, {});
}
