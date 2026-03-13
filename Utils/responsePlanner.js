/**
 * responsePlanner.js
 * OPINTEL v1.1.0
 *
 * Purpose:
 * - Decide the best response shape
 * - Minimize unnecessary clarifiers
 * - Convert routing/evidence/context into a planning envelope for ChatEngine
 *
 * Design goals:
 * - Hardened and fail-open
 * - Simple API
 * - No infrastructure-breaking assumptions
 * - Distress-first support routing
 */

"use strict";

const VERSION = "responsePlanner.opintel.v1.1.0";

function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asArray(v) {
  return Array.isArray(v) ? v.slice() : [];
}

function str(v) {
  return typeof v === "string" ? v.trim() : "";
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function lower(v) {
  return str(v).toLowerCase();
}

const SHAPES = Object.freeze({
  DIRECT: "direct_answer",
  CLARIFY: "minimal_clarifier",
  GUIDED: "guided_steps",
  ACTION: "action_first",
  COMPARE: "option_compare",
  RESUME: "resume_thread",
  SUPPORT: "support_first"
});

function isSupportDistress(input = {}) {
  const lane = lower(input.lane || input.intent?.lane || "");
  const intent = lower(input.intent?.intent || input.intent || "");
  const mode = lower(input.mode || input.intent?.mode || "");
  const regulation = lower(input.regulation || input.intent?.regulation || "");
  const message = lower(input.message || input.text || "");
  const supportFirst = !!input.supportFirst;

  if (supportFirst) return true;
  if (lane === "support" || lane === "wellbeing") return true;
  if (intent === "stabilize" || mode === "safety" || mode === "stabilize") return true;
  if (regulation === "fragile" || regulation === "crisis") return true;

  return (
    /\b(i am|i'm|im|feel|feeling)\s+(depressed|sad|lonely|hopeless|overwhelmed|anxious|scared)\b/.test(message) ||
    /\b(depressed|depression|lonely|sad|hopeless|heartbroken|overwhelmed|panic|panicking|anxious|crying)\b/.test(message) ||
    /\b(don['’]t want to live|do not want to live|kill myself|suicid(al|e)|self[- ]?harm)\b/.test(message)
  );
}

function shouldClarify(input = {}) {
  if (isSupportDistress(input)) return false;

  const ambiguity = clamp(num(input.ambiguity, 0), 0, 1);
  const intentConfidence = clamp(num(input.intentConfidence, 0), 0, 1);
  const routeConfidence = clamp(num(input.routeConfidence, 0), 0, 1);
  const unresolvedAsks = asArray(input.memoryWindow?.unresolvedAsks || input.unresolvedAsks);
  const explicitQuestion = /\?$/.test(str(input.message || input.text || ""));
  const clarifyCount = num(input.clarifyCount, 0);

  if (clarifyCount >= 2) return false;
  if (routeConfidence >= 0.72 && intentConfidence >= 0.72) return false;
  if (ambiguity >= 0.52 && (intentConfidence < 0.74 || routeConfidence < 0.7)) return true;
  if (!explicitQuestion && unresolvedAsks.length && ambiguity < 0.45) return false;
  return ambiguity >= 0.62;
}

function pickReplyShape(input = {}) {
  if (isSupportDistress(input)) return SHAPES.SUPPORT;

  const lane = lower(input.lane || input.intent?.lane || "");
  const unresolvedAsks = asArray(input.memoryWindow?.unresolvedAsks || input.unresolvedAsks);
  const actionHints = asArray(input.actionHints);
  const routeConfidence = clamp(num(input.routeConfidence, 0), 0, 1);

  if (unresolvedAsks.length && routeConfidence >= 0.58) return SHAPES.RESUME;
  if (shouldClarify(input)) return SHAPES.CLARIFY;
  if (actionHints.length) return SHAPES.ACTION;
  if (lane === "music" || lane === "roku" || lane === "radio") return SHAPES.GUIDED;
  if (routeConfidence >= 0.8) return SHAPES.DIRECT;
  return SHAPES.GUIDED;
}

function buildMinimalClarifier(input = {}) {
  if (isSupportDistress(input)) return "";

  const lane = lower(input.lane || input.intent?.lane || "");
  const message = lower(input.message || input.text || "");
  if (lane === "roku") return "Do you want the Roku page, live TV lane, or News Canada?";
  if (lane === "music") return "Do you want a year chart, a story moment, or a top 10 list?";
  if (message.includes("news")) return "Do you want the headline summary, the source link, or the full story path?";
  return "What is the one missing detail I need to proceed cleanly?";
}

function deriveReplyDepth(input = {}) {
  if (isSupportDistress(input)) return "tight";

  const routeConfidence = clamp(num(input.routeConfidence, 0), 0, 1);
  const ambiguity = clamp(num(input.ambiguity, 0), 0, 1);
  const urgency = clamp(num(input.urgency, 0), 0, 1);

  if (urgency >= 0.7) return "tight";
  if (ambiguity >= 0.6) return "narrow";
  if (routeConfidence >= 0.8) return "full";
  return "medium";
}

function pickNextBestAction(input = {}, shape = "") {
  if (shape === SHAPES.SUPPORT) return "deliver_support";

  const lane = lower(input.lane || input.intent?.lane || "");
  const actionHints = asArray(input.actionHints);
  const unresolvedAsks = asArray(input.memoryWindow?.unresolvedAsks || input.unresolvedAsks);

  if (shape === SHAPES.RESUME && unresolvedAsks.length) return "resume_unresolved_ask";
  if (shape === SHAPES.ACTION && actionHints.length) return actionHints[0];
  if (lane === "music") return "offer_year_actions";
  if (lane === "roku") return "offer_lane_links";
  return "offer_followups";
}

function planResponse(input = {}) {
  const safe = isObject(input) ? input : {};
  const replyShape = pickReplyShape(safe);
  const clarifier = replyShape === SHAPES.CLARIFY ? buildMinimalClarifier(safe) : "";
  const nextBestAction = pickNextBestAction(safe, replyShape);
  const supportFirst = replyShape === SHAPES.SUPPORT;

  return {
    ok: true,
    version: VERSION,
    replyShape,
    shouldClarify: replyShape === SHAPES.CLARIFY,
    minimalClarifier: clarifier,
    replyDepth: deriveReplyDepth(safe),
    nextBestAction,
    guidanceMode: replyShape === SHAPES.GUIDED || replyShape === SHAPES.RESUME,
    actionFirst: replyShape === SHAPES.ACTION,
    supportFirst,
    metaControlSuppressed: supportFirst,
    failOpen: true
  };
}

module.exports = {
  VERSION,
  SHAPES,
  planResponse,
  pickReplyShape,
  shouldClarify,
  isSupportDistress
};
