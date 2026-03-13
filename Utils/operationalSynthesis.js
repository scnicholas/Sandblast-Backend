/**
 * operationalSynthesis.js
 * OPINTEL v1.0.0
 *
 * Purpose:
 * - Provide one small, deterministic synthesis envelope for downstream reply composition.
 * - Keep support-first turns from being rewritten into meta-control or menu language.
 * - Stay side-effect free and fail-open safe.
 */

"use strict";

const VERSION = "operationalSynthesis.opintel.v1.0.0";

function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function str(v, max = 240) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function lower(v, max = 240) {
  return str(v, max).toLowerCase();
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function asArray(v) {
  return Array.isArray(v) ? v.slice() : [];
}

function uniq(arr, max = 8) {
  const out = [];
  const seen = new Set();
  for (const item of asArray(arr)) {
    const v = str(item, 80);
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function isSupportFirst(input = {}) {
  const message = lower(input.message || input.text || "");
  const regulation = lower(input.regulation || input.cog?.regulation || "");
  const mode = lower(input.mode || input.cog?.mode || "");
  const intent = lower(input.intent || input.cog?.intent || "");
  if (input.supportFirst) return true;
  if (mode === "stabilize" || mode === "safety") return true;
  if (intent === "stabilize") return true;
  if (regulation === "fragile" || regulation === "crisis") return true;
  return /\b(depressed|lonely|sad|hopeless|overwhelmed|panic|anxious|crying|heartbroken)\b/.test(message);
}

function chooseReplyMode(input = {}) {
  if (isSupportFirst(input)) return "support_first";
  const routeConfidence = clamp01(input.routeConfidence || input.cog?.routeConfidence || 0);
  const ambiguity = clamp01(input.ambiguity || input.cog?.ambiguityScore || 0);
  if (ambiguity >= 0.58 && routeConfidence < 0.72) return "clarify_minimal";
  if (routeConfidence >= 0.74) return "direct_or_execute";
  return "narrow_and_verify";
}

function buildEnvelope(input = {}) {
  const safe = isObject(input) ? input : {};
  const replyMode = chooseReplyMode(safe);
  const supportFirst = replyMode === "support_first";

  const directives = [];
  if (supportFirst) {
    directives.push("support_first", "no_menu_bounce", "no_meta_control", "one_gentle_question");
  } else if (replyMode === "clarify_minimal") {
    directives.push("clarify_minimal", "single_missing_detail");
  } else {
    directives.push("direct_or_execute");
  }

  return {
    ok: true,
    version: VERSION,
    replyMode,
    supportFirst,
    metaControlSuppressed: supportFirst,
    directives: uniq(directives, 8),
    actionHints: uniq(safe.actionHints || safe.cog?.actionHints || [], 6),
    unresolvedThreads: uniq(safe.unresolvedThreads || safe.cog?.unresolvedThreads || [], 6),
    minimalClarifier: supportFirst ? "" : str(safe.minimalClarifier || safe.cog?.minimalClarifier || "", 180),
    failOpen: true
  };
}

function synthesize(input = {}) {
  try {
    return buildEnvelope(input);
  } catch (_e) {
    return {
      ok: true,
      version: VERSION,
      replyMode: "support_first",
      supportFirst: true,
      metaControlSuppressed: true,
      directives: ["support_first", "no_menu_bounce"],
      actionHints: [],
      unresolvedThreads: [],
      minimalClarifier: "",
      failOpen: true
    };
  }
}

module.exports = {
  VERSION,
  synthesize,
  buildEnvelope,
  chooseReplyMode,
  isSupportFirst
};
