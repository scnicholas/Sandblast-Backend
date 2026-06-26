"use strict";

const GUARDIAN_RESPONSE_ADAPTER_VERSION = "guardian.response.adapter/1.1-CJS-SAFE-FALLBACK-ETHICAL-CARRY";
const SECRET_KEY_RE = /(token|secret|password|apikey|api_key|authorization|cookie|sessiontoken|runtimeToken|masterToken|private[_-]?key|credential)/i;
const SECRET_TEXT_RE = /(bearer\s+[a-z0-9._-]+|api[_ -]?key|session[_ -]?token|runtime[_ -]?token|master[_ -]?token|authorization\s*:)/i;
const BAD_REPLY_RE = /^(true|false|null|undefined|\[object object\]|ok|success)$/i;
const RISK_ORDER = ["low", "medium", "high", "critical"];
const STATE_SET = new Set(["online", "degraded", "fallback", "locked", "unknown", "error"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function cleanText(value, max = 1600) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text || BAD_REPLY_RE.test(text) || SECRET_TEXT_RE.test(text)) return "";
  return text.length > max ? text.slice(0, max - 1).trim() + "…" : text;
}

function readPath(source, path) {
  const root = safeObject(source);
  return String(path || "").split(".").reduce((node, key) => (node && node[key] !== undefined ? node[key] : undefined), root);
}

function firstText(source, paths, max) {
  const root = safeObject(source);
  for (const path of Array.isArray(paths) ? paths : []) {
    const text = cleanText(readPath(root, path), max);
    if (text) return text;
  }
  return "";
}

function firstObject(source, paths) {
  const root = safeObject(source);
  for (const path of Array.isArray(paths) ? paths : []) {
    const candidate = readPath(root, path);
    if (isObject(candidate) && Object.keys(candidate).length) return candidate;
  }
  return {};
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
  const r = safeObject(raw);
  const f = safeObject(fallback);
  return cleanText(r.traceId || readPath(r, "result.traceId") || readPath(r, "meta.traceId") || f.traceId, 96);
}

function collectErrors(raw) {
  const r = safeObject(raw);
  const errors = [];
  const candidates = [r.error, r.message && r.ok === false ? r.message : "", readPath(r, "result.error"), readPath(r, "meta.error")];
  for (const item of candidates) {
    const text = cleanText(item, 300);
    if (text && !errors.includes(text)) errors.push(text);
  }
  return errors.slice(0, 5);
}

function adaptGuardianResponse(raw = {}, fallback = {}) {
  const fallbackSafe = safeObject(fallback);
  const packetSource = isObject(raw) ? raw : { reply: raw };
  const guardianPacket = safeObject(packetSource.guardianPacket);
  const result = safeObject(packetSource.result);
  const payload = safeObject(packetSource.payload);
  const envelope = isObject(packetSource.finalEnvelope) ? packetSource.finalEnvelope : safeObject(result.finalEnvelope);
  const meta = isObject(result.meta) ? result.meta : safeObject(packetSource.meta);
  const merged = { ...fallbackSafe, ...guardianPacket, ...packetSource, result, payload, finalEnvelope: envelope, meta };

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
    firstText(fallbackSafe, ["contextSummary", "memory.contextSummary"], 900) ||
    "Context summary not exposed yet.";

  const currentObjective =
    firstText(merged, ["currentObjective", "result.currentObjective", "payload.currentObjective", "meta.currentObjective"], 700) ||
    firstText(fallbackSafe, ["currentObjective", "memory.currentObjective"], 700) ||
    "Maintain Marion admin continuity.";

  const nextAction =
    firstText(merged, ["nextAction", "result.nextAction", "payload.nextAction", "finalEnvelope.nextAction", "meta.nextAction"], 700) ||
    "Review the context panel, then continue the Marion runtime validation path.";

  const ethicalGate = firstObject(merged, [
    "ethicalGate", "ethicalGatekeeper", "result.ethicalGate", "result.ethicalGatekeeper", "payload.ethicalGate", "payload.ethicalGatekeeper", "finalEnvelope.ethicalGate", "meta.ethicalGate"
  ]);
  const defensiveEscalation = firstObject(merged, [
    "defensiveEscalation", "result.defensiveEscalation", "payload.defensiveEscalation", "finalEnvelope.defensiveEscalation", "ethicalGate.defensiveEscalation", "ethicalGatekeeper.defensiveEscalation"
  ]);
  const defensiveJustification = firstObject(merged, [
    "defensiveJustification", "defensiveIntentJustifier", "result.defensiveJustification", "payload.defensiveJustification", "finalEnvelope.defensiveJustification", "ethicalGate.defensiveJustification", "defensiveEscalation.justification"
  ]);

  const approvalRequired = normalizeBoolean(
    merged.approvalRequired ??
      merged.requiresApproval ??
      result.approvalRequired ??
      result.requiresApproval ??
      payload.approvalRequired ??
      ethicalGate.requiresHumanReview ??
      defensiveEscalation.requiresHumanReview
  );

  const packet = {
    guardian: normalizeGuardian(merged.guardian || fallbackSafe.guardian),
    guardianMode: normalizeMode(merged.guardianMode || fallbackSafe.guardianMode),
    directReply,
    contextSummary,
    currentObjective,
    systemState: normalizeState(merged.systemState || result.systemState || payload.systemState || meta.systemState, packetSource),
    nextAction,
    riskLevel: normalizeRisk(merged.riskLevel || result.riskLevel || payload.riskLevel || meta.riskLevel || ethicalGate.riskLevel),
    approvalRequired,
    traceId: trace(packetSource, fallbackSafe),
    timestamp: cleanText(merged.timestamp, 64) || new Date().toISOString(),
    sourceRoute: cleanText(merged.sourceRoute || merged.route || fallbackSafe.sourceRoute, 120),
    rawRuntimeAvailable: Object.keys(packetSource).length > 0,
    errors: collectErrors(packetSource)
  };

  if (Object.keys(ethicalGate).length) packet.ethicalGate = redact(ethicalGate);
  if (Object.keys(defensiveEscalation).length) packet.defensiveEscalation = redact(defensiveEscalation);
  if (Object.keys(defensiveJustification).length) packet.defensiveJustification = redact(defensiveJustification);
  packet.adapterVersion = GUARDIAN_RESPONSE_ADAPTER_VERSION;

  return packet;
}

function createGuardianPacket(raw = {}, fallback = {}) {
  return adaptGuardianResponse(raw, fallback);
}

function sanitizeRuntimePacket(raw = {}) {
  return redact(raw);
}

module.exports = {
  GUARDIAN_RESPONSE_ADAPTER_VERSION,
  adaptGuardianResponse,
  createGuardianPacket,
  sanitizeRuntimePacket,
  default: adaptGuardianResponse
};
