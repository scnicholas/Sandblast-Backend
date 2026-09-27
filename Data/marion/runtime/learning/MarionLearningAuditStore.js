"use strict";

const crypto = require("crypto");
const VERSION = "marion.learningAuditStore/1.0";

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashEvent(previousHash, event) {
  return crypto.createHash("sha256").update(`${previousHash}\n${stableJson(event)}`).digest("hex");
}

function createMarionLearningAuditStore({ durableAppend, clock = () => new Date().toISOString() } = {}) {
  if (typeof durableAppend !== "function") throw new TypeError("durableAppend is required; audit events must be persisted privately");
  let previousHash = "GENESIS";
  let sequence = 0;
  let appendQueue = Promise.resolve();
  function append(event) {
    if (!event || typeof event !== "object" || Array.isArray(event)) return Promise.reject(new TypeError("audit event must be an object"));
    const operation = appendQueue.then(async () => {
      const safeEvent = Object.freeze({ ...event, auditSequence: ++sequence, auditAt: clock() });
      const entry = Object.freeze({ ...safeEvent, previousHash, eventHash: hashEvent(previousHash, safeEvent) });
      await durableAppend(entry);
      previousHash = entry.eventHash;
      return entry;
    });
    appendQueue = operation.catch(() => undefined);
    return operation;
  }
  return Object.freeze({ VERSION, append });
}

module.exports = { VERSION, createMarionLearningAuditStore, hashEvent };
