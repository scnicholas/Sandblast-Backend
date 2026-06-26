const DEFAULT_AUDIT_CAP = 500;
const auditLog = [];
let auditCap = DEFAULT_AUDIT_CAP;

const SECRET_KEY_PATTERN = /(token|secret|password|apikey|api_key|authorization|cookie|session|credential)/i;
const SECRET_TEXT_PATTERN = /(bearer\s+)[a-z0-9._~+/-]+=*|((?:token|secret|password|api[_-]?key)\s*[:=]\s*)[^\s,"'}]+/gi;

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, max = 4000) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(SECRET_TEXT_PATTERN, (match, bearerPrefix, keyPrefix) => `${bearerPrefix || keyPrefix || ""}[REDACTED]`)
    .trim()
    .slice(0, max);
}

function normalizeGuardian(value) {
  const v = cleanText(value || "marion", 64).toLowerCase();
  if (v === "mariam") return "marion";
  if (v === "astro") return "aster";
  if (v === "fallon") return "thalon";
  return ["marion", "aster", "thalon"].includes(v) ? v : "marion";
}

function normalizeRisk(value) {
  const v = cleanText(value || "low", 32).toLowerCase();
  return ["low", "medium", "high", "critical"].includes(v) ? v : "low";
}

function normalizeType(value) {
  return cleanText(value || "runtime", 80).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_");
}

function redactDeep(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return cleanText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return cleanText(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactDeep(item, seen));
  }

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactDeep(item, seen);
  }
  return output;
}

function normalizeLimit(limit, fallback = 50) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(Math.floor(n), auditCap));
}

function enforceCap() {
  while (auditLog.length > auditCap) auditLog.shift();
}

function matchesFilter(entry, filter = {}) {
  if (filter.guardian && entry.guardian !== normalizeGuardian(filter.guardian)) return false;
  if (filter.type && entry.type !== normalizeType(filter.type)) return false;
  if (filter.traceId && entry.traceId !== cleanText(filter.traceId, 160)) return false;
  if (filter.riskLevel && entry.riskLevel !== normalizeRisk(filter.riskLevel)) return false;
  return true;
}

export function logGuardianEvent(event = {}) {
  const entry = {
    timestamp: cleanText(event.timestamp || nowIso(), 80),
    guardian: normalizeGuardian(event.guardian),
    type: normalizeType(event.type),
    input: cleanText(event.input, 4000),
    reply: cleanText(event.reply, 4000),
    decision: cleanText(event.decision, 2000),
    approvalRequired: Boolean(event.approvalRequired),
    approvedBy: event.approvedBy ? cleanText(event.approvedBy, 120) : null,
    route: cleanText(event.route, 160),
    riskLevel: normalizeRisk(event.riskLevel),
    systemState: cleanText(event.systemState || "unknown", 80).toLowerCase(),
    traceId: cleanText(event.traceId, 160),
    tags: Array.isArray(event.tags) ? event.tags.slice(0, 12).map((tag) => cleanText(tag, 60)).filter(Boolean) : [],
    meta: event.meta ? redactDeep(event.meta) : {},
    error: event.error ? redactDeep(event.error) : null
  };

  auditLog.push(Object.freeze(entry));
  enforceCap();
  return entry;
}

export function getGuardianAuditLog(limit = 50, filter = {}) {
  const safeLimit = normalizeLimit(limit);
  return auditLog.filter((entry) => matchesFilter(entry, filter)).slice(-safeLimit).map((entry) => ({ ...entry }));
}

export function exportGuardianAuditLog({ limit = auditCap, filter = {} } = {}) {
  return {
    exportedAt: nowIso(),
    count: getGuardianAuditLog(limit, filter).length,
    entries: getGuardianAuditLog(limit, filter)
  };
}

export function clearGuardianAuditLog(filter = null) {
  if (!filter) {
    const count = auditLog.length;
    auditLog.length = 0;
    return { cleared: count, remaining: 0 };
  }

  let cleared = 0;
  for (let i = auditLog.length - 1; i >= 0; i -= 1) {
    if (matchesFilter(auditLog[i], filter)) {
      auditLog.splice(i, 1);
      cleared += 1;
    }
  }
  return { cleared, remaining: auditLog.length };
}

export function configureGuardianAuditLogger({ maxEntries } = {}) {
  const n = Number(maxEntries);
  if (Number.isFinite(n) && n >= 50) {
    auditCap = Math.min(Math.floor(n), 5000);
    enforceCap();
  }
  return getGuardianAuditLoggerInfo();
}

export function getGuardianAuditLoggerInfo() {
  return {
    name: "guardian.audit.logger",
    version: "1.1.0",
    maxEntries: auditCap,
    currentEntries: auditLog.length,
    redactionEnabled: true
  };
}
