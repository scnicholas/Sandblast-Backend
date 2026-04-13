"use strict";

/**
 * utils/chatMemoryAdapter.js
 *
 * chatMemoryAdapter v1.1.0
 * ------------------------------------------------------------
 * PURPOSE
 * - Keep memory plumbing outside chatEngine.js
 * - Preserve fail-open behavior when MemorySpine is absent
 * - Normalize session and turn packets for Marion-safe continuity only
 */

let MemorySpine = null;
try { MemorySpine = require("./memorySpine"); } catch (_e) { MemorySpine = null; }

const CMA_VERSION = "chatMemoryAdapter v1.1.0";

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
    replyAuthority: oneLine(t.replyAuthority || "").slice(0, 40),
    decisionAuthority: "marion",
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
  if (!MemorySpine || typeof MemorySpine.buildContext !== "function") {
    return {
      ok: true,
      version: CMA_VERSION,
      sessionId: sid,
      available: false,
      failedOpen: true,
      memoryThread: "",
      references: []
    };
  }

  try {
    const out = MemorySpine.buildContext(sid);
    if (isPlainObject(out)) {
      return {
        ...out,
        version: CMA_VERSION,
        sessionId: sid,
        available: true
      };
    }
    return {
      ok: true,
      version: CMA_VERSION,
      sessionId: sid,
      available: true,
      raw: out
    };
  } catch (_e) {
    return {
      ok: true,
      version: CMA_VERSION,
      sessionId: sid,
      available: false,
      failedOpen: true,
      memoryThread: "",
      references: []
    };
  }
}

function storeMemoryTurn(sessionId, turn) {
  const sid = normalizeSessionId(sessionId);
  const normalizedTurn = normalizeTurn(turn);

  if (!sid) {
    return {
      ok: false,
      version: CMA_VERSION,
      stored: false,
      reason: "missing_session_id",
      turn: normalizedTurn
    };
  }

  if (!MemorySpine || typeof MemorySpine.storeTurn !== "function") {
    return {
      ok: true,
      version: CMA_VERSION,
      stored: false,
      failedOpen: true,
      sessionId: sid,
      turn: normalizedTurn
    };
  }

  try {
    const out = MemorySpine.storeTurn(sid, normalizedTurn);
    return isPlainObject(out)
      ? { ...out, version: CMA_VERSION, sessionId: sid, turn: normalizedTurn }
      : { ok: true, version: CMA_VERSION, stored: true, sessionId: sid, turn: normalizedTurn, raw: out };
  } catch (_e) {
    return {
      ok: true,
      version: CMA_VERSION,
      stored: false,
      failedOpen: true,
      sessionId: sid,
      turn: normalizedTurn
    };
  }
}

function getMemoryStatus() {
  return {
    ok: true,
    version: CMA_VERSION,
    memoryLoaded: !!MemorySpine,
    canBuildContext: !!(MemorySpine && typeof MemorySpine.buildContext === "function"),
    canStoreTurn: !!(MemorySpine && typeof MemorySpine.storeTurn === "function")
  };
}

module.exports = {
  CMA_VERSION,
  buildMemoryContext,
  storeMemoryTurn,
  normalizeSessionId,
  normalizeEmotion,
  normalizeTurn,
  isMemoryAvailable,
  getMemoryStatus
};
