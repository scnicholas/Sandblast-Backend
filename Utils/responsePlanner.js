"use strict";

/**
 * responsePlanner.js
 *
 * Clean lightweight planner.
 * No authority over final replies. Only planning metadata.
 */

const VERSION =
  "responsePlanner v2.1.0 CONFLICT-RESOLVED-NON-AUTHORITY";

const SHAPES = Object.freeze({
  DIRECT: "direct_answer",
  SUPPORT: "support_then_deepen",
  TECHNICAL: "technical_resolution",
  ACTION: "action_first",
  RETRIEVAL: "retrieval_lane",
  MEMORY: "memory_continuity"
});

function safeStr(value) {
  if (value === null || value === undefined) {
    return "";
  }

  try {
    return String(value).trim();
  } catch (_) {
    return "";
  }
}

function lower(value) {
  return safeStr(value).toLowerCase();
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function resolveIntent(input = {}) {
  const source = isObject(input) ? input : {};

  return lower(
    source.intent ||
    (isObject(source.marionIntent)
      ? source.marionIntent.intent
      : "") ||
    (isObject(source.routing)
      ? source.routing.intent
      : "") ||
    (isObject(source.route)
      ? source.route.intent
      : "") ||
    (isObject(source.analysis)
      ? source.analysis.intent
      : "") ||
    "simple_chat"
  ) || "simple_chat";
}

function planShape(intent) {
  switch (intent) {
    case "technical_debug":
      return SHAPES.TECHNICAL;
    case "emotional_support":
      return SHAPES.SUPPORT;
    case "music_query":
    case "news_query":
    case "roku_query":
      return SHAPES.RETRIEVAL;
    case "business_strategy":
      return SHAPES.ACTION;
    case "identity_or_memory":
      return SHAPES.MEMORY;
    default:
      return SHAPES.DIRECT;
  }
}

function nextBestAction(intent) {
  switch (intent) {
    case "technical_debug":
      return "inspect_trace_and_finalize";
    case "emotional_support":
      return "support_once_then_deepen";
    case "business_strategy":
      return "turn_into_execution_plan";
    case "music_query":
      return "ask_for_music_target";
    case "news_query":
      return "ask_for_news_target";
    case "roku_query":
      return "ask_for_roku_target";
    case "identity_or_memory":
      return "continue_memory_thread";
    default:
      return "continue_conversation";
  }
}

function planResponse(input = {}) {
  const source = isObject(input) ? input : {};
  const intent = resolveIntent(source);
  const replyShape = planShape(intent);
  const nextAction = nextBestAction(intent);

  return {
    ok: true,
    version: VERSION,
    nonAuthority: true,
    intent,
    replyShape,
    shouldClarify: false,
    minimalClarifier: "",
    replyDepth:
      intent === "emotional_support"
        ? "deep_forward"
        : "direct",
    nextBestAction: nextAction,
    guidanceMode:
      replyShape === SHAPES.RETRIEVAL ||
      replyShape === SHAPES.MEMORY,
    actionFirst:
      replyShape === SHAPES.ACTION ||
      replyShape === SHAPES.TECHNICAL,
    supportFirst:
      replyShape === SHAPES.SUPPORT,
    metaControlSuppressed: true,
    questionBudget: 0,
    routeBias: nextAction,
    affectAligned:
      intent === "emotional_support",
    failOpen: true,
    finalReplyAuthority: false
  };
}

module.exports = {
  VERSION,
  SHAPES,
  resolveIntent,
  planResponse
};
