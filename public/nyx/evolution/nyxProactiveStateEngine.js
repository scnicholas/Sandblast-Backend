"use strict";

/**
 * Nyx Proactive State Engine
 *
 * Purpose:
 * Keeps Nyx interface state intelligent but lightweight.
 *
 * Contract:
 * - Front-end only.
 * - Does not mutate assistant replies.
 * - Does not expose Marion.
 * - Does not touch backend authority.
 */

const {
  NYX_STATES,
  normalizeState,
  getStateLabel,
  getAvatarStateLabel,
  isActiveState,
} = require("./nyxProactiveStateRules");

const NYX_PROACTIVE_STATE_ENGINE_VERSION = "nyx.evolution.proactiveStateEngine/1.0";

function now() {
  return Date.now();
}

function safeStr(value, fallback = "") {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return text || fallback;
}

function isObj(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function makeInitialNyxProactiveState() {
  return {
    version: NYX_PROACTIVE_STATE_ENGINE_VERSION,
    state: NYX_STATES.READY,
    label: "Ready",
    avatarLabel: "Ready",
    active: false,
    reason: "initial",
    updatedAt: now(),
  };
}

function deriveNyxState(input = {}) {
  const src = isObj(input) ? input : {};
  const text = safeStr(src.text || src.message || src.userText);
  const explicit = safeStr(src.state || src.intentState);

  if (explicit) return normalizeState(explicit);

  if (src.mediaOn === true) return NYX_STATES.MEDIA;
  if (src.listening === true || src.inputSource === "voice_listening") return NYX_STATES.LISTENING;
  if (src.speaking === true || src.ttsBusy === true) return NYX_STATES.SPEAKING;
  if (src.busy === true || src.pending === true || src.awaitingResponse === true) return NYX_STATES.THINKING;
  if (src.fallbackUsed === true || src.errorRecovering === true) return NYX_STATES.FALLBACK;
  if (src.handoffAvailable === true || src.handoffStatus === "available") return NYX_STATES.HANDOFF;

  if (text && text.length < 12 && /^(help|start|what|how|next|guide)$/i.test(text)) {
    return NYX_STATES.GUIDING;
  }

  return NYX_STATES.READY;
}

function buildNyxStatePacket(input = {}) {
  const state = deriveNyxState(input);

  return {
    version: NYX_PROACTIVE_STATE_ENGINE_VERSION,
    state,
    label: getStateLabel(state),
    avatarLabel: getAvatarStateLabel(state),
    active: isActiveState(state),
    reason: safeStr(input.reason || "derived"),
    updatedAt: now(),
  };
}

function createNyxProactiveStateEngine(options = {}) {
  let current = makeInitialNyxProactiveState();
  const maxHistory = Math.max(1, Math.min(20, Number(options.maxHistory || 8)));
  let history = [];

  function getState() {
    return JSON.parse(JSON.stringify(current));
  }

  function setState(input = {}) {
    const next = buildNyxStatePacket(input);
    current = next;
    history = [next].concat(history).slice(0, maxHistory);
    return getState();
  }

  function reset(reason = "reset") {
    current = {
      ...makeInitialNyxProactiveState(),
      reason: safeStr(reason, "reset"),
      updatedAt: now(),
    };
    history = [];
    return getState();
  }

  function getHistory() {
    return JSON.parse(JSON.stringify(history));
  }

  return {
    getState,
    setState,
    reset,
    getHistory,
  };
}

module.exports = {
  NYX_PROACTIVE_STATE_ENGINE_VERSION,
  makeInitialNyxProactiveState,
  deriveNyxState,
  buildNyxStatePacket,
  createNyxProactiveStateEngine,
};
