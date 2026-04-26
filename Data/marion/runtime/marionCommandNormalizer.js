"use strict";

/**
 * marionCommandNormalizer.js
 * Marion inbound command / packet normalizer.
 *
 * Purpose:
 * - Accept raw Nyx/widget/backend input.
 * - Produce one stable Marion-ready packet.
 * - Do NOT generate replies.
 * - Do NOT route domains.
 * - Do NOT mutate memory.
 * - Do NOT perform fallback logic.
 *
 * This file exists only to clean and stabilize inbound user input
 * before it reaches MarionBridge, marionIntentRouter, or StateSpine.
 */

const VERSION = "marionCommandNormalizer v1.0.0 MARION-PACKET-STABILITY";

const DEFAULT_SOURCE = "nyx-widget";
const DEFAULT_CHANNEL = "chat";
const CONTRACT_VERSION = "nyx.marion.packet/1.0";

function safeStr(value) {
  return value == null ? "" : String(value).trim();
}

function safeLower(value) {
  return safeStr(value).toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "pkt") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function clampNumber(value, fallback = 0, min = 0, max = 999) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function extractUserText(input = {}) {
  if (typeof input === "string") return safeStr(input);

  if (!input || typeof input !== "object") return "";

  return safeStr(
    input.text ||
    input.message ||
    input.query ||
    input.userQuery ||
    input.input ||
    input.prompt ||
    input.body?.text ||
    input.body?.message ||
    input.body?.query ||
    ""
  );
}

function detectEmotionalSignal(text) {
  const t = safeLower(text);

  if (!t) {
    return {
      detected: false,
      level: "none",
      score: 0,
      terms: []
    };
  }

  const high = [
    "suicide",
    "self harm",
    "self-harm",
    "kill myself",
    "don't want to live",
    "dont want to live",
    "panic attack",
    "crisis"
  ];

  const medium = [
    "depressed",
    "sad",
    "lonely",
    "overwhelmed",
    "anxious",
    "hurt",
    "heartbroken",
    "grief",
    "crying",
    "afraid",
    "stressed"
  ];

  const matchedHigh = high.filter(term => t.includes(term));
  const matchedMedium = medium.filter(term => t.includes(term));

  if (matchedHigh.length) {
    return {
      detected: true,
      level: "high",
      score: 0.95,
      terms: matchedHigh
    };
  }

  if (matchedMedium.length) {
    return {
      detected: true,
      level: "medium",
      score: 0.72,
      terms: matchedMedium
    };
  }

  return {
    detected: false,
    level: "none",
    score: 0,
    terms: []
  };
}

function detectTechnicalSignal(text) {
  const t = safeLower(text);

  const terms = [
    "index.js",
    "marion",
    "bridge",
    "router",
    "normalizer",
    "state spine",
    "statespine",
    "loop",
    "looping",
    "fallback",
    "route",
    "endpoint",
    "script",
    "debug",
    "bug",
    "fix",
    "autopsy",
    "audit",
    "gap refinement",
    "download",
    "zip"
  ];

  const matched = terms.filter(term => t.includes(term));

  return {
    detected: matched.length > 0,
    score: matched.length ? Math.min(0.95, 0.45 + matched.length * 0.08) : 0,
    terms: matched
  };
}

function inferInputKind(text) {
  const t = safeLower(text);

  if (!t) return "empty";
  if (t.endsWith("?")) return "question";
  if (/^(fix|update|send|create|build|make|audit|analyze|check|review)\b/i.test(t)) return "command";
  if (t.length <= 32 && !t.includes(" ")) return "keyword";
  return "statement";
}

function normalizeSession(input = {}) {
  const src = input && typeof input === "object" ? input : {};

  return {
    sessionId: safeStr(
      src.sessionId ||
      src.session_id ||
      src.sid ||
      src.body?.sessionId ||
      src.headers?.["x-session-id"] ||
      ""
    ),
    userId: safeStr(
      src.userId ||
      src.user_id ||
      src.uid ||
      src.body?.userId ||
      ""
    ),
    channel: safeStr(src.channel || src.body?.channel || DEFAULT_CHANNEL),
    source: safeStr(src.source || src.body?.source || DEFAULT_SOURCE)
  };
}

function normalizeState(input = {}) {
  const src = input && typeof input === "object" ? input : {};
  const state = src.state || src.sessionState || src.body?.state || {};

  return {
    lastIntent: safeStr(state.lastIntent || src.lastIntent || ""),
    lastDomain: safeStr(state.lastDomain || src.lastDomain || ""),
    lastUserText: safeStr(state.lastUserText || src.lastUserText || ""),
    lastAssistantReply: safeStr(state.lastAssistantReply || src.lastAssistantReply || ""),
    conversationDepth: clampNumber(
      state.conversationDepth ?? src.conversationDepth,
      0,
      0,
      100
    ),
    loopCount: clampNumber(
      state.loopCount ?? src.loopCount,
      0,
      0,
      25
    ),
    stateStage: safeStr(state.stateStage || src.stateStage || "intake")
  };
}

function normalizeCommand(input = {}) {
  const userText = extractUserText(input);
  const session = normalizeSession(input);
  const previousState = normalizeState(input);

  const emotionalSignal = detectEmotionalSignal(userText);
  const technicalSignal = detectTechnicalSignal(userText);
  const inputKind = inferInputKind(userText);

  const packet = {
    ok: true,
    final: false,
    contractVersion: CONTRACT_VERSION,
    normalizerVersion: VERSION,

    packetId: makeId("marion"),
    createdAt: nowIso(),

    source: session.source,
    channel: session.channel,
    sessionId: session.sessionId,
    userId: session.userId,

    userText,
    normalizedText: userText.replace(/\s+/g, " ").trim(),

    input: {
      kind: inputKind,
      empty: !userText,
      length: userText.length,
      wordCount: userText ? userText.split(/\s+/).filter(Boolean).length : 0
    },

    signals: {
      emotional: emotionalSignal,
      technical: technicalSignal
    },

    state: {
      ...previousState,
      stateStage: "intake"
    },

    routingHints: {
      preferEmotional: emotionalSignal.detected,
      preferTechnical: technicalSignal.detected,
      requiresRecovery: previousState.loopCount > 0,
      allowFallback: true,
      allowLoopBlock: true
    },

    meta: {
      singlePacketAuthority: true,
      bridgeCompatible: true,
      intentRouterCompatible: true,
      stateSpineCompatible: true,
      composerCompatible: true
    }
  };

  return packet;
}

function isNormalizedMarionPacket(value) {
  return !!(
    value &&
    typeof value === "object" &&
    value.contractVersion === CONTRACT_VERSION &&
    value.normalizerVersion &&
    typeof value.userText === "string" &&
    value.meta?.singlePacketAuthority === true
  );
}

module.exports = {
  VERSION,
  CONTRACT_VERSION,
  normalizeCommand,
  isNormalizedMarionPacket
};
