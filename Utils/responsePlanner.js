"use strict";

/**
 * responsePlanner.js
 * Clean lightweight planner.
 * No authority over final replies. Only planning metadata.
 */

const VERSION = "responsePlanner v2.0.0 CLEAN-REBUILD-NON-AUTHORITY";

const SHAPES = Object.freeze({
  DIRECT: "direct_answer",
  SUPPORT: "support_then_deepen",
  TECHNICAL: "technical_resolution",
  ACTION: "action_first",
  RETRIEVAL: "retrieval_lane",
  MEMORY: "memory_continuity"
});

function safeStr(v) {
  return v == null ? "" : String(v).trim();
}

function lower(v) {
  return safeStr(v).toLowerCase();
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function resolveIntent(input = {}) {
  return lower(
    input.intent ||
    input.marionIntent?.intent ||
    input.routing?.intent ||
    input.route?.intent ||
    input.analysis?.intent ||
    "simple_chat"
  ) || "simple_chat";
}

function planShape(intent) {
  switch (intent) {
    case "technical_debug": return SHAPES.TECHNICAL;
    case "emotional_support": return SHAPES.SUPPORT;
    case "music_query":
    case "news_query":
    case "roku_query": return SHAPES.RETRIEVAL;
    case "business_strategy": return SHAPES.ACTION;
    case "identity_or_memory": return SHAPES.MEMORY;
    default: return SHAPES.DIRECT;
  }
}

function nextBestAction(intent) {
  switch (intent) {
    case "technical_debug": return "inspect_trace_and_finalize";
    case "emotional_support": return "support_once_then_deepen";
    case "business_strategy": return "turn_into_execution_plan";
    case "music_query": return "ask_for_music_target";
    case "news_query": return "ask_for_news_target";
    case "roku_query": return "ask_for_roku_target";
    case "identity_or_memory": return "continue_memory_thread";
    default: return "continue_conversation";
  }
}

function planResponse(input = {}) {
  const safe = isObj(input) ? input : {};
  const intent = resolveIntent(safe);
  const replyShape = planShape(intent);

  return {
    ok: true,
    version: VERSION,
    nonAuthority: true,
    intent,
    replyShape,
    shouldClarify: false,
    minimalClarifier: "",
    replyDepth: intent === "emotional_support" ? "deep_forward" : "direct",
    nextBestAction: nextBestAction(intent),
    guidanceMode: replyShape === SHAPES.RETRIEVAL || replyShape === SHAPES.MEMORY,
    actionFirst: replyShape === SHAPES.ACTION || replyShape === SHAPES.TECHNICAL,
    supportFirst: replyShape === SHAPES.SUPPORT,
    metaControlSuppressed: true,
    questionBudget: 0,
    routeBias: nextBestAction(intent),
    affectAligned: intent === "emotional_support",
    failOpen: true,
    finalReplyAuthority: false
  };
}

module.exports = {
  VERSION,
  SHAPES,
  planResponse
<<<<<<< HEAD
};
=======
};
>>>>>>> bac0eac3 (Refactor emotion folder and update paths)
