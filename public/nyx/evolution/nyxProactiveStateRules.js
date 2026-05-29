"use strict";

/**
 * Nyx Proactive State Rules
 *
 * Purpose:
 * Defines lightweight front-end state rules for Nyx without touching Marion,
 * backend authority, TTS authority, or the final response contract.
 */

const NYX_PROACTIVE_STATE_RULES_VERSION = "nyx.evolution.proactiveStateRules/1.0";

const NYX_STATES = Object.freeze({
  IDLE: "idle",
  READY: "ready",
  THINKING: "thinking",
  LISTENING: "listening",
  SPEAKING: "speaking",
  MEDIA: "media",
  HANDOFF: "handoff",
  FALLBACK: "fallback",
  GUIDING: "guiding",
});

const STATE_LABELS = Object.freeze({
  idle: "Ready",
  ready: "Ready",
  thinking: "Working",
  listening: "Listening",
  speaking: "Speaking",
  media: "Media",
  handoff: "Switch ready",
  fallback: "Still with you",
  guiding: "Next step ready",
});

const STATE_AVATAR_LABELS = Object.freeze({
  idle: "Ready",
  ready: "Ready",
  thinking: "Thinking",
  listening: "Listening",
  speaking: "Speaking",
  media: "Media",
  handoff: "Guided",
  fallback: "Steady",
  guiding: "Guiding",
});

function safeStr(value, fallback = "") {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return text || fallback;
}

function normalizeState(value, fallback = NYX_STATES.READY) {
  const state = safeStr(value, fallback).toLowerCase();
  return Object.values(NYX_STATES).includes(state) ? state : fallback;
}

function getStateLabel(state) {
  return STATE_LABELS[normalizeState(state)] || "Ready";
}

function getAvatarStateLabel(state) {
  return STATE_AVATAR_LABELS[normalizeState(state)] || "Ready";
}

function isActiveState(state) {
  return [
    NYX_STATES.THINKING,
    NYX_STATES.LISTENING,
    NYX_STATES.SPEAKING,
    NYX_STATES.MEDIA,
    NYX_STATES.HANDOFF,
    NYX_STATES.FALLBACK,
    NYX_STATES.GUIDING,
  ].includes(normalizeState(state));
}

module.exports = {
  NYX_PROACTIVE_STATE_RULES_VERSION,
  NYX_STATES,
  STATE_LABELS,
  STATE_AVATAR_LABELS,
  safeStr,
  normalizeState,
  getStateLabel,
  getAvatarStateLabel,
  isActiveState,
};