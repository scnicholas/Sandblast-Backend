const SECRET_KEY_RE = /(token|secret|password|apikey|api_key|authorization|cookie|sessiontoken|runtimeToken|masterToken)/i;
const SECRET_TEXT_RE = /(bearer\s+[a-z0-9._-]+|api[_ -]?key|session[_ -]?token|runtime[_ -]?token|master[_ -]?token)/i;
const BAD_REPLY_RE = /^(true|false|null|undefined|\[object object\]|ok|success)$/i;
const RISK_ORDER = ["low", "medium", "high", "critical"];
const STATE_SET = new Set(["online", "degraded", "fallback", "locked", "unknown", "error"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value, max = 1600) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text || BAD_REPLY_RE.test(text) || SECRET_TEXT_RE.test(text)) return "";
  return text.length > max ? text.slice(0, max - 1).trim() + "…" : text;
}

function readPath(source, path) {
  return path.split(".").reduce((node, key) => (node && node[key] !== undefined ? node[key] : undefined), source);
}

function firstText(source, paths, max) {
  for (const path of paths) {
    const text = cleanText(readPath(source, path), max);
    if (text) return text;
  }
  return "";
}

function normalizeGuardian(value) {
  const g = cleanText(value, 32).toLowerCase();
  return g || "marion";
}

function normalizeMode(value) {
  const mode = cleanText(value, 32).toLowerCase();
  return ["marion", "admin", "diagnostic", "fallback"].includes(mode) ? mode : "marion";
}

function normalizeRisk(value) {
  const raw = cleanText(value, 24).toLowerCase();
  if (RISK_ORDER.includes(raw)) return raw;
  if (["warn", "warning", "moderate"].includes(raw)) return "medium";
  if (["severe", "danger"].includes(raw)) return "high";
  return "low";
}

function normalizeState(value, raw) {
  const state = cleanText(value, 32).toLowerCase();
  if (STATE_SET.has(state)) return state;
  if (raw && raw.ok === true) return "online";
  if (raw && raw.error) return "error";
  return "unknown";
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return /^(true|yes|1|required|approval_required)$/i.test(value.trim());
  return false;
}

function redact(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return typeof value === "string" && SECRET_TEXT_RE.test(value) ? "[REDACTED]" : value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SECRET_KEY_RE.test(key) ? "[REDACTED]" : redact(item, seen);
  }
  return out;
}

function trace(raw, fallback) {
  return cleanText(raw.traceId || readPath(raw, "result.traceId") || readPath(raw, "meta.traceId") || fallback.traceId, 96);
}

function collectErrors(raw) {
  const errors = [];
  const candidates = [raw.error, raw.message && raw.ok === false ? raw.message : "", readPath(raw, "result.error"), readPath(raw, "meta.error")];
  for (const item of candidates) {
    const text = cleanText(item, 300);
    if (text && !errors.includes(text)) errors.push(text);
  }
  return errors.slice(0, 5);
}

export function adaptGuardianResponse(raw = {}, fallback = {}) {
  const packetSource = isObject(raw) ? raw : { reply: raw };
  const guardianPacket = isObject(packetSource.guardianPacket) ? packetSource.guardianPacket : {};
  const result = isObject(packetSource.result) ? packetSource.result : {};
  const payload = isObject(packetSource.payload) ? packetSource.payload : {};
  const envelope = isObject(packetSource.finalEnvelope) ? packetSource.finalEnvelope : isObject(result.finalEnvelope) ? result.finalEnvelope : {};
  const meta = isObject(result.meta) ? result.meta : isObject(packetSource.meta) ? packetSource.meta : {};
  const merged = { ...fallback, ...guardianPacket, ...packetSource, result, payload, finalEnvelope: envelope, meta };

  const directReply =
    firstText(merged, [
      "directReply", "publicReply", "visibleReply", "displayReply", "reply", "response", "final", "text", "message",
      "result.directReply", "result.publicReply", "result.visibleReply", "result.reply", "result.response", "result.final", "result.text", "result.message",
      "payload.directReply", "payload.publicReply", "payload.reply", "payload.text",
      "finalEnvelope.directReply", "finalEnvelope.reply", "finalEnvelope.text",
      "meta.directReply", "meta.reply"
    ]) || "Marion received the runtime packet. No clean Mac-facing reply was exposed yet.";

  const contextSummary =
    firstText(merged, ["contextSummary", "result.contextSummary", "payload.contextSummary", "finalEnvelope.contextSummary", "meta.contextSummary"], 900) ||
    firstText(fallback, ["contextSummary", "memory.contextSummary"], 900) ||
    "Context summary not exposed yet.";

  const currentObjective =
    firstText(merged, ["currentObjective", "result.currentObjective", "payload.currentObjective", "meta.currentObjective"], 700) ||
    firstText(fallback, ["currentObjective", "memory.currentObjective"], 700) ||
    "Maintain Marion admin continuity.";

  const nextAction =
    firstText(merged, ["nextAction", "result.nextAction", "payload.nextAction", "finalEnvelope.nextAction", "meta.nextAction"], 700) ||
    "Review the context panel, then continue the Marion runtime validation path.";

  const approvalRequired = normalizeBoolean(
    merged.approvalRequired ?? merged.requiresApproval ?? result.approvalRequired ?? result.requiresApproval ?? payload.approvalRequired
  );

  const packet = {
    guardian: normalizeGuardian(merged.guardian || fallback.guardian),
    guardianMode: normalizeMode(merged.guardianMode || fallback.guardianMode),
    directReply,
    contextSummary,
    currentObjective,
    systemState: normalizeState(merged.systemState || result.systemState || payload.systemState || meta.systemState, packetSource),
    nextAction,
    riskLevel: normalizeRisk(merged.riskLevel || result.riskLevel || payload.riskLevel || meta.riskLevel),
    approvalRequired,
    traceId: trace(packetSource, fallback),
    timestamp: cleanText(merged.timestamp, 64) || new Date().toISOString(),
    sourceRoute: cleanText(merged.sourceRoute || merged.route || fallback.sourceRoute, 120),
    rawRuntimeAvailable: Object.keys(packetSource).length > 0,
    errors: collectErrors(packetSource)
  };

  return packet;
}

export function createGuardianPacket(raw = {}, fallback = {}) {
  return adaptGuardianResponse(raw, fallback);
}

export function sanitizeRuntimePacket(raw = {}) {
  return redact(raw);
}
