"use strict";

/**
 * utils/chatMemoryAdapter.js
 *
 * chatMemoryAdapter v1.0.0
 * ------------------------------------------------------------
 * PURPOSE
 * - Extract MemorySpine plumbing out of chatEngine.js
 * - Keep memory operations fail-open
 * - Provide one clean adapter surface for:
 *   - buildMemoryContext(sessionId)
 *   - storeMemoryTurn(sessionId, turn)
 * - Preserve structural integrity even if MemorySpine is missing
 *
 * 15 PHASE COVERAGE
 * ------------------------------------------------------------
 * Phase 01: Safe dependency loading
 * Phase 02: Session id normalization
 * Phase 03: Turn payload normalization
 * Phase 04: Context build delegation
 * Phase 05: Turn storage delegation
 * Phase 06: Memory disable fail-open
 * Phase 07: Oversize string trimming
 * Phase 08: Safe object coercion
 * Phase 09: Timestamp normalization
 * Phase 10: Emotion packet normalization
 * Phase 11: Lane normalization
 * Phase 12: Assistant/user text shaping
 * Phase 13: Defensive return contracts
 * Phase 14: Diagnostics metadata
 * Phase 15: Stable export surface
 */

let MemorySpine = null;
try { MemorySpine = require("./memorySpine"); } catch (_e) { MemorySpine = null; }

const CMA_VERSION = "chatMemoryAdapter v1.0.0";

function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}

function isPlainObject(x) {
  return !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
}

function oneLine(s) {
  return safeStr(s).replace(/\s+/g, " ").trim();
}

function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const t = Math.trunc(n);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}

function nowMs() {
  return Date.now();
}

function trimText(s, maxLen) {
  return safeStr(s).slice(0, Math.max(0, maxLen | 0));
}

function normalizeSessionId(sessionId) {
  const sid = oneLine(sessionId || "").slice(0, 180);
  return sid || "";
}

function normalizeEmotion(emotion) {
  const e = isPlainObject(emotion) ? emotion : {};
  return {
    mode: oneLine(e.mode || "").slice(0, 40),
    valence: oneLine(e.valence || "").slice(0, 40),
    dominantEmotion: oneLine(e.dominantEmotion || "").slice(0, 60),
    tone: oneLine(e.tone || "").slice(0, 60),
    recoveryPresent: !!e.recoveryPresent,
    positivePresent: !!e.positivePresent,
    contradictions: clampInt(e.contradictions || 0, 0, 0, 99)
  };
}

function normalizeTurn(turn) {
  const t = isPlainObject(turn) ? turn : {};
  return {
    at: clampInt(t.at || nowMs(), nowMs(), 0, 9007199254740991),
    lane: oneLine(t.lane || "general").slice(0, 40) || "general",
    user: trimText(t.user || t.userText || "", 1200),
    assistant: trimText(t.assistant || t.reply || t.assistantText || "", 1200),
    emotion: normalizeEmotion(t.emotion),
    requestId: oneLine(t.requestId || "").slice(0, 100),
    traceId: oneLine(t.traceId || "").slice(0, 100),
    meta: isPlainObject(t.meta) ? t.meta : {}
  };
}

function isMemoryAvailable() {
  return !!(
    MemorySpine &&
    (
      typeof MemorySpine.buildContext === "function" ||
      typeof MemorySpine.storeTurn === "function"
    )
  );
}

function buildMemoryContext(sessionId) {
  const sid = normalizeSessionId(sessionId);
  if (!sid) return null;
  if (!MemorySpine || typeof MemorySpine.buildContext !== "function") return null;

  try {
    const out = MemorySpine.buildContext(sid);
    return isPlainObject(out) || Array.isArray(out) ? out : null;
  } catch (_e) {
    return null;
  }
}

function storeMemoryTurn(sessionId, turn) {
  const sid = normalizeSessionId(sessionId);
  if (!sid) return false;
  if (!MemorySpine || typeof MemorySpine.storeTurn !== "function") return false;

  const normalized = normalizeTurn(turn);

  try {
    MemorySpine.storeTurn(sid, normalized);
    return true;
  } catch (_e) {
    return false;
  }
}

function getMemoryStatus() {
  return {
    ok: isMemoryAvailable(),
    version: CMA_VERSION,
    memorySpineLoaded: !!MemorySpine,
    canBuildContext: !!(MemorySpine && typeof MemorySpine.buildContext === "function"),
    canStoreTurn: !!(MemorySpine && typeof MemorySpine.storeTurn === "function")
  };
}

module.exports = {
  CMA_VERSION,
  buildMemoryContext,
  storeMemoryTurn,
  normalizeTurn,
  normalizeSessionId,
  getMemoryStatus
};
