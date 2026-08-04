"use strict";

const VERSION = "marion.adminRuntimeSafety/2.2-private-route-primitive-serialization-hardlock-stable-export-private-identity-contract";
const MARION_ADMIN_RUNTIME_SAFETY_EXPORTS = module.exports;

function safeRead(source, key, fallback) {
  try {
    if (source === null || source === undefined) return fallback;
    return source[key];
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
  return limit > 0 ? text.slice(0, limit) : text;
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
  if (type === "string") return cleanText(value, "", maxString);
  if (type === "number" || type === "boolean") return value;
  if (type === "bigint") return primitiveText(value, "");
  if (type === "function" || type === "symbol") return "[unsupported]";
  if (type !== "object") return primitiveText(value, "");
  if (depth >= maxDepth) return "[truncated]";

  const tag = objectTag(value);
  if (tag === "[object Error]" || tag === "[object DOMException]") {
    return {
      name: cleanText(safeRead(value, "name", "Error"), "Error", 120),
      message: errorText(value, "runtime_error", maxString)
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
      try { item = value[index]; } catch (_) { item = "[unreadable]"; }
      out.push(safeSerializable(item, options, depth + 1, visited));
    }
    return out;
  }

  let keys = [];
  try { keys = Object.keys(value).slice(0, maxKeys); } catch (_) { return "[unreadable]"; }
  const out = {};
  for (const key of keys) {
    if (/(?:token|secret|password|passwd|api[_-]?key|authorization|cookie|session|credential|private[_-]?key)/i.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    let item;
    try { item = value[key]; } catch (_) { item = "[unreadable]"; }
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

function privatePartitionKey(body = {}, auth = {}) {
  const sessionId = firstText([
    safeRead(auth, "sessionId", ""),
    safeRead(body, "sessionId", ""),
    safeRead(body, "conversationId", ""),
    safeRead(body, "traceId", "")
  ], 160);
  return `private:admin:${safeId(sessionId, "anonymous", 160)}`;
}

function privateRuntimeIdentity(body = {}, auth = {}, traceId = "") {
  const partitionKey = privatePartitionKey(body, auth);
  const verified = safeRead(auth, "verified", false) === true;
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
    privateControlPlane: true,
    adminOnly: true,
    directMarionAdminInterface: true,
    marionAdminConversation: true,
    marionAdminConversationAllowed: true,
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
  const identity = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  return identity.scope === "private_admin" &&
    identity.audience === "owner" &&
    identity.surfaceAgent === "Marion" &&
    identity.publicSurfaceOnly === false &&
    identity.publicFallbackBlocked === true &&
    typeof identity.memoryPartition === "string" &&
    identity.memoryPartition.startsWith("private:admin:");
}

Object.assign(MARION_ADMIN_RUNTIME_SAFETY_EXPORTS, {
  VERSION,
  safeRead,
  primitiveText,
  cleanText,
  firstText,
  errorText,
  safeSerializable,
  privatePartitionKey,
  privateRuntimeIdentity,
  isPrivateRuntimeIdentity,
  projectPrivateRuntimeIdentity: privateRuntimeIdentity
});
