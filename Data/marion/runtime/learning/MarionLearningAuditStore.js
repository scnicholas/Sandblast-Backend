"use strict";

const crypto = require("node:crypto");

const VERSION = "marion.learningAuditStore/2.3-post-metadata-and-ack-contract";
// PostgreSQL durableAuditAppend enforces a 16 KiB event ceiling.
// Reserve room for generated audit metadata and hashes.
const MAX_EVENT_BYTES = 15 * 1024;
const MAX_DEPTH = 24;
const MAX_NODES = 10000;
const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_RE = /(?:password|passwd|secret|authorization|cookie|credential|api[_-]?key|private[_-]?key|database[_-]?url|connection[_-]?string|^(?:access|refresh|session)[_-]?token$|^token$)/i;
const SENSITIVE_STRING_PATTERNS = [
  /\bBearer\s+[^\s,;]+/gi,
  /\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi
];

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashEvent(previousHash, event) {
  if (typeof previousHash !== "string" || !previousHash) throw new TypeError("previousHash must be a non-empty string");
  return crypto.createHash("sha256").update(`${previousHash}\n${stableJson(event)}`).digest("hex");
}

function sanitizeAuditEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new TypeError("audit event must be a plain object");
  }
  const seen = new WeakSet();
  let nodes = 0;

  function visit(value, depth, key) {
    nodes += 1;
    if (nodes > MAX_NODES) throw new RangeError("audit event contains too many values");
    if (depth > MAX_DEPTH) throw new RangeError("audit event is nested too deeply");
    if (key && SENSITIVE_KEY_RE.test(key)) return REDACTED;

    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") {
      return SENSITIVE_STRING_PATTERNS.reduce((text, pattern) => text.replace(pattern, REDACTED), value);
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new TypeError("audit event numbers must be finite");
      return value;
    }
    if (typeof value !== "object") throw new TypeError("audit event must contain only JSON values");

    if (seen.has(value)) throw new TypeError("audit event must not contain circular references");
    seen.add(value);
    let result;
    if (Array.isArray(value)) {
      if (value.length > MAX_NODES) throw new RangeError("audit event array is too large");
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || !keys.includes("length"))
        throw new TypeError("audit event arrays must be dense JSON arrays");
      result = [];
      for (let i = 0; i < value.length; i++) {
        const d = Object.getOwnPropertyDescriptor(value, String(i));
        if (!d || !d.enumerable || !Object.prototype.hasOwnProperty.call(d, "value"))
          throw new TypeError("audit event arrays must contain only data values");
        result.push(visit(d.value, depth + 1, ""));
      }
    } else {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError("audit event objects must be plain JSON objects");
      }
      result = Object.create(null);
      for (const property of Reflect.ownKeys(value)) {
        if (typeof property !== "string" || ["__proto__", "constructor", "prototype"].includes(property))
          throw new TypeError("audit event contains forbidden property");
        const descriptor = Object.getOwnPropertyDescriptor(value, property);
        if (!descriptor || !descriptor.enumerable ||
            !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
          throw new TypeError("audit event must contain only enumerable data properties");
        }
        result[property] = visit(descriptor.value, depth + 1, property);
      }
    }
    seen.delete(value);
    return result;
  }

  const safe = visit(event, 0, "");
  if (Object.keys(safe).length === 0) throw new TypeError("audit event must not be empty");
  const bytes = Buffer.byteLength(stableJson(safe), "utf8");
  if (bytes > MAX_EVENT_BYTES) throw new RangeError(`audit event exceeds ${MAX_EVENT_BYTES} bytes`);
  return safe;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function normalizeTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new TypeError("audit clock must return a valid timestamp string");
  }
  return new Date(value).toISOString();
}

function createMarionLearningAuditStore({ durableAppend, clock = () => new Date().toISOString(), sessionId } = {}) {
  if (typeof durableAppend !== "function") {
    throw new TypeError("durableAppend is required; audit events must be persisted privately");
  }
  if (typeof clock !== "function") throw new TypeError("clock must be a function");

  const auditSessionId = sessionId === undefined ? crypto.randomBytes(16).toString("hex") : String(sessionId);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(auditSessionId)) throw new TypeError("sessionId must be 8-128 safe characters");

  let previousHash = "GENESIS";
  let sequence = 0;
  let appendQueue = Promise.resolve();

  function append(event) {
    let snapshot;
    try {
      snapshot = sanitizeAuditEvent(event);
    } catch (error) {
      return Promise.reject(error);
    }

    const operation = appendQueue.then(async () => {
      const nextSequence = sequence + 1;
      const safeEvent = deepFreeze({
        ...snapshot,
        auditSessionId,
        auditSequence: nextSequence,
        auditAt: normalizeTimestamp(clock())
      });
      const entry = deepFreeze({
        ...safeEvent,
        previousHash,
        eventHash: hashEvent(previousHash, safeEvent)
      });
      // The PostgreSQL adapter checks 16 KiB AFTER this metadata is added.
      // Guard the exact persisted representation before attempting the write.
      if (Buffer.byteLength(JSON.stringify(entry), "utf8") > 16384)
        throw new RangeError("audit event exceeds durable PostgreSQL limit");
      const result = await durableAppend(entry);
      // The canonical PostgreSQL adapter returns void on a committed transaction.
      // Fail closed on explicit negative acknowledgements, without rejecting void.
      if (result === false || (result && (result.ok === false || result.persisted === false))) {
        throw new Error("audit_persistence_rejected_event");
      }
      // Advance the local chain only after durable persistence succeeds.
      sequence = nextSequence;
      previousHash = entry.eventHash;
      return entry;
    });
    appendQueue = operation.catch(() => undefined);
    return operation;
  }

  return Object.freeze({ VERSION, append });
}

module.exports = { VERSION, createMarionLearningAuditStore, hashEvent, sanitizeAuditEvent };
