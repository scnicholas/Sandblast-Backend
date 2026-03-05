"use strict";

/**
 * Memory Source Adapter
 * - Pulls memory spine context (summary, open loops, long facts, bridge/loop status)
 */

function safeStr(x){ return x == null ? "" : String(x); }

let MemorySpine = null;
function _requireMemory() {
  if (MemorySpine) return MemorySpine;
  try {
    MemorySpine = require("../../memorySpine");
  } catch (e) {
    MemorySpine = null;
  }
  return MemorySpine;
}

function getMemory(sessionId) {
  const M = _requireMemory();
  const sid = safeStr(sessionId).trim() || "session";
  if (!M || typeof M.buildContext !== "function") return { ok: false, error: "MEMORY_MODULE_MISSING" };

  try {
    const ctx = M.buildContext(sid);
    return { ok: true, type: "memory", ctx };
  } catch (e) {
    return { ok: false, error: "MEMORY_CTX_FAILED", detail: String(e && (e.message || e)) };
  }
}

module.exports = { getMemory };
