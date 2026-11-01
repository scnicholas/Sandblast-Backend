"use strict";

const VERSION = "marion.adminRuntimeSafety/2.3-server-verified-private-partition-serialization-hardlock";
const MARION_ADMIN_RUNTIME_SAFETY_EXPORTS = module.exports;

function safeRead(source, key, fallback) {
  try {
    if (source === null || source === undefined) return fallback;
    const descriptor = Object.getOwnPropertyDescriptor(Object(source), key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value") ? descriptor.value : fallback;
  } catch (_) {
    return fallback;
  }
}

function safeArray(value) {
  try { return Array.isArray(value); } catch (_) { return false; }
}

function primitiveText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const type = typeof value;
  if (type === "string") return value;
  if (type === "number" || type === "boolean" || type === "bigint") {
    try { return String(value); } catch (_) { return fallback; }
  }
  return fallback;
}

function cleanText(value, fallback = "", max = 12000) {
  const rawLimit = Number(max);
  const limit = Number.isFinite(rawLimit) ? Math.max(0, Math.min(rawLimit, 100000)) : 12000;
  const text = primitiveText(value, fallback)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, limit);
}

function firstText(values, max = 12000) {
  const list = safeArray(values) ? values : [];
  for (let index = 0; index < list.length; index += 1) {
    let value;
    try { value = list[index]; } catch (_) { value = undefined; }
    const text = cleanText(value, "", max);
    if (text) return text;
  }
  return "";
}

function errorText(error, fallback = "runtime_error", max = 800) {
  const message = cleanText(safeRead(error, "message", ""), "", max);
  if (message) return message;
  const name = cleanText(safeRead(error, "name", ""), "", 120);
  if (name) return name;
  return cleanText(fallback, "runtime_error", max);
}

function objectTag(value) {
  try { return Object.prototype.toString.call(value); } catch (_) { return ""; }
}

const SENSITIVE_FIELD = /(?:token|secret|password|passwd|api[_-]?key|authorization|cookie|session|credential|private[_-]?key|voiceprint|biometric|raw.?audio|database.?url|connection.?string)/i;
const SENSITIVE_CONTENT = /(?:\bBearer\s+[^\s,;]+|\bpostgres(?:ql)?:\/\/[^\s"'<>]+|\b(?:api[_-]?key|password|secret|authorization|token)\s*[:=]\s*[^\s,;]+)/gi;
function redactText(value) { return value.replace(SENSITIVE_CONTENT, "[redacted]"); }

function safeSerializable(value, options = {}, depth = 0, seen) {
  const maxDepthValue = Number(safeRead(options, "maxDepth", NaN));
  const maxKeysValue = Number(safeRead(options, "maxKeys", NaN));
  const maxArrayValue = Number(safeRead(options, "maxArray", NaN));
  const maxStringValue = Number(safeRead(options, "maxString", NaN));
  const maxDepth = Number.isFinite(maxDepthValue) ? Math.max(1, Math.min(maxDepthValue, 12)) : 7;
  const maxKeys = Number.isFinite(maxKeysValue) ? Math.max(1, Math.min(maxKeysValue, 500)) : 100;
  const maxArray = Number.isFinite(maxArrayValue) ? Math.max(1, Math.min(maxArrayValue, 500)) : 50;
  const maxString = Number.isFinite(maxStringValue) ? Math.max(16, Math.min(maxStringValue, 20000)) : 2400;

  if (value === null || value === undefined) return value;
  const type = typeof value;
  if (type === "string") return redactText(cleanText(value, "", maxString));
  if (type === "number") return Number.isFinite(value) ? value : null;
  if (type === "boolean") return value;
  if (type === "bigint") return primitiveText(value, "");
  if (type === "function" || type === "symbol") return "[unsupported]";
  if (type !== "object") return primitiveText(value, "");
  if (depth >= maxDepth) return "[truncated]";

  const tag = objectTag(value);
  if (tag === "[object Error]" || tag === "[object DOMException]") {
    return {
      name: cleanText(safeRead(value, "name", "Error"), "Error", 120),
      message: redactText(errorText(value, "runtime_error", maxString))
    };
  }
  if (tag === "[object Date]") {
    try { return value.toISOString(); } catch (_) { return "[invalid-date]"; }
  }
  if (typeof Buffer !== "undefined") {
    try {
      if (Buffer.isBuffer(value)) {
        return `[buffer:${Math.min(value.length, Number.MAX_SAFE_INTEGER)}]`;
      }
    } catch (_) {}
  }

  const visited = seen instanceof WeakSet ? seen : new WeakSet();
  try {
    if (visited.has(value)) return "[circular]";
    visited.add(value);
  } catch (_) {
    return "[unreadable]";
  }

  if (safeArray(value)) {
    const out = [];
    let sourceLength = 0;
    try { sourceLength = Number(value.length) || 0; } catch (_) { sourceLength = 0; }
    const length = Math.min(Math.max(0, sourceLength), maxArray);
    for (let index = 0; index < length; index += 1) {
      let item;
      try { const descriptor = Object.getOwnPropertyDescriptor(value, String(index)); item = descriptor && Object.prototype.hasOwnProperty.call(descriptor,"value") ? descriptor.value : "[unreadable]"; } catch (_) { item = "[unreadable]"; }
      out.push(safeSerializable(item, options, depth + 1, visited));
    }
    return out;
  }

  let keys = [];
  try { keys = Object.keys(value).slice(0, maxKeys); } catch (_) { return "[unreadable]"; }
  const out = Object.create(null);
  for (const key of keys) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (SENSITIVE_FIELD.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    let item;
    try { const descriptor = Object.getOwnPropertyDescriptor(value, key); item = descriptor && Object.prototype.hasOwnProperty.call(descriptor,"value") ? descriptor.value : "[unreadable]"; } catch (_) { item = "[unreadable]"; }
    out[key] = safeSerializable(item, options, depth + 1, visited);
  }
  return out;
}

function safeId(value, fallback = "anonymous", max = 160) {
  const text = cleanText(value, fallback, max)
    .replace(/[^a-zA-Z0-9._:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || fallback;
}

function isServerVerifiedOwner(auth) {
  return safeRead(auth, "verified", false) === true &&
    safeRead(auth, "sessionVerified", false) === true &&
    safeRead(auth, "verifiedBy", "") === "server_middleware" &&
    typeof safeRead(auth, "sessionId", null) === "string" &&
    safeRead(auth, "sessionId", "").trim().length > 0;
}

function privatePartitionKey(_body = {}, auth = {}) {
  // Request-controlled conversation/session IDs are never private memory authority.
  if (!isServerVerifiedOwner(auth)) return "private:admin:unverified";
  return `private:admin:${safeId(safeRead(auth, "sessionId", ""), "unverified", 160)}`;
}

function privateRuntimeIdentity(body = {}, auth = {}, traceId = "") {
  const verified = isServerVerifiedOwner(auth);
  const partitionKey = privatePartitionKey(body, auth);
  return {
    scope: "private_admin",
    audience: "owner",
    answerClass: "marion_admin_conversation",
    surfaceAgent: "Marion",
    authority: "Marion",
    publicAgent: "Nyx",
    publicSurfaceOnly: false,
    publicFallbackBlocked: true,
    privateAdminConversation: true,
    privateControlPlane: verified,
    adminOnly: true,
    directMarionAdminInterface: verified,
    marionAdminConversation: true,
    marionAdminConversationAllowed: verified,
    authenticatedOperator: verified,
    operatorPersonalization: verified,
    allowPersonalName: verified,
    allowOperatorMemory: verified,
    memoryPartition: partitionKey,
    partitionKey,
    privateRuntimeContext: {
      version: VERSION,
      scope: "private_admin",
      audience: "owner",
      traceId: cleanText(traceId, "", 240),
      partitionKey
    }
  };
}

function isPrivateRuntimeIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const partition = safeRead(value, "memoryPartition", null);
  return safeRead(value, "scope", "") === "private_admin" &&
    safeRead(value, "audience", "") === "owner" &&
    safeRead(value, "surfaceAgent", "") === "Marion" &&
    safeRead(value, "publicSurfaceOnly", true) === false &&
    safeRead(value, "publicFallbackBlocked", false) === true &&
    safeRead(value, "authenticatedOperator", false) === true &&
    safeRead(value, "allowOperatorMemory", false) === true &&
    safeRead(value, "marionAdminConversationAllowed", false) === true &&
    typeof partition === "string" && partition.startsWith("private:admin:") &&
    partition !== "private:admin:unverified" &&
    safeRead(value, "partitionKey", "") === partition;
}

Object.assign(MARION_ADMIN_RUNTIME_SAFETY_EXPORTS, {
  VERSION,
  safeRead,
  primitiveText,
  cleanText,
  firstText,
  errorText,
  safeSerializable,
  isServerVerifiedOwner,
  privatePartitionKey,
  privateRuntimeIdentity,
  isPrivateRuntimeIdentity,
  projectPrivateRuntimeIdentity: privateRuntimeIdentity
});
