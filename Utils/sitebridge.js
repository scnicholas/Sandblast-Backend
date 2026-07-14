"use strict";

/**
 * sitebridge.js
 * Nyx persistent guide-shell data bridge.
 *
 * This module is intentionally non-authoritative. It may describe UI state,
 * guide capabilities, public routes and bounded client preferences, but it
 * never composes replies, changes Marion authority or dispatches TTS.
 */

const VERSION = "sitebridge.guideOrchestration.v3.0 STEPS-1-2-3-DATA-BRIDGE";
const GUIDE_CONTRACT = "nyx.guideOrchestration/1.0";
const GUIDE_STATES = Object.freeze([
  "available", "listening", "thinking", "speaking",
  "guiding", "quiet", "recovery", "minimized"
]);
const GUIDE_MODES = Object.freeze(["text", "voice", "avatar"]);
const DEFAULT_LANES = Object.freeze(["home", "search", "live", "watch", "roku", "news", "about"]);
const GUIDE_ACTION_TYPES = Object.freeze(["navigate", "play_radio", "stop_radio", "open_media", "open_tv", "open_roku", "open_synapse", "open_guide", "focus_input", "summarize"]);
const MAX_TEXT = 240;
const MAX_KEY = 80;

function safeText(value, max = MAX_TEXT) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function safeObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function boolish(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const text = safeText(value, 16).toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(text)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(text)) return false;
  return fallback;
}

function normalizeLane(value) {
  const lane = safeText(value || "home", 32).toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  return DEFAULT_LANES.includes(lane) ? lane : "home";
}

function normalizeState(value) {
  const state = safeText(value || "available", 32).toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  return GUIDE_STATES.includes(state) ? state : "available";
}

function normalizeSurface(value) {
  return safeText(value || "sandblast.channel", 96).toLowerCase().replace(/[^a-z0-9._-]+/g, "") || "sandblast.channel";
}

function normalizeRoutes(value) {
  const src = safeObj(value);
  const out = {};
  for (const lane of DEFAULT_LANES) {
    const route = safeText(src[lane], 320);
    if (!route) continue;
    try {
      const url = new URL(route, "https://sandblast.channel/");
      if (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
        out[lane] = route;
      }
    } catch (_) {}
  }
  return out;
}

function sanitizeGuideContext(value) {
  const src = safeObj(value);
  const prefs = safeObj(src.preferences);
  return {
    contract: GUIDE_CONTRACT,
    surface: normalizeSurface(src.surface || src.site),
    page: safeText(src.page || src.pathname || "/", 160),
    lane: normalizeLane(src.lane || src.currentLane),
    previousLane: normalizeLane(src.previousLane || "home"),
    state: normalizeState(src.state || src.guideState),
    panelOpen: boolish(src.panelOpen, false),
    voiceEnabled: boolish(src.voiceEnabled, true),
    reducedMotion: boolish(src.reducedMotion || prefs.reducedMotion, false),
    suggestionsEnabled: boolish(src.suggestionsEnabled || prefs.suggestionsEnabled, true),
    inputMode: safeText(src.inputMode || "text", 24).toLowerCase() === "voice" ? "voice" : "text"
  };
}

function sanitizeGuideActions(value) {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  for (const item of list) {
    const src = safeObj(item);
    const type = safeText(src.type || src.action, 32).toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (!GUIDE_ACTION_TYPES.includes(type)) continue;
    const target = normalizeLane(src.target || src.lane || "home");
    const action = {
      contract: "nyx.guideAction/1.0",
      id: safeText(src.id || `${type}_${target}`, 64),
      type,
      target,
      lane: target,
      label: safeText(src.label || type.replace(/_/g, " "), 80),
      requiresUserGesture: true,
      autoExecute: false,
      advisoryOnly: true
    };
    if (!out.some((entry) => entry.type === action.type && entry.target === action.target)) out.push(action);
    if (out.length >= 4) break;
  }
  return out;
}

function build(input = {}) {
  const src = safeObj(input);
  const features = safeObj(src.features);
  const context = sanitizeGuideContext(src.guideContext || src.context || src);
  const routes = normalizeRoutes(src.routes);
  const guideActions = sanitizeGuideActions(src.guideActions || src.actions);
  const queryKey = safeText(src.queryKey, MAX_KEY);
  const sessionKey = safeText(src.sessionKey || src.sessionId, MAX_KEY);

  return {
    ok: true,
    enabled: true,
    disabled: false,
    version: VERSION,
    contract: GUIDE_CONTRACT,
    nonAuthority: true,
    finalReplyAuthority: false,
    replySynthesisAllowed: false,
    transportAuthority: false,
    audioAuthority: "tts_route",
    queryKey,
    sessionKey,
    mode: "guide_shell",
    intent: safeText(features.intent || "GUIDE", 32).toUpperCase(),
    regulation: "steady",
    cognitiveLoad: "low",
    stance: "data_only",
    context,
    guideShell: {
      persistent: true,
      compactDock: true,
      expandablePanel: true,
      modes: GUIDE_MODES.slice(),
      states: GUIDE_STATES.slice(),
      currentState: context.state,
      currentLane: context.lane,
      voiceEnabled: context.voiceEnabled,
      reducedMotion: context.reducedMotion,
      publicSessionOnly: true,
      privateMemoryAccess: false,
      serverMemoryRequired: false,
      contextAware: true,
      structuredActions: true,
      actionExecutionAuthority: "client_user_gesture"
    },
    routes,
    guideActions,
    actionPolicy: {
      allowedTypes: GUIDE_ACTION_TYPES.slice(),
      symbolicTargetsOnly: true,
      externalUrlsAcceptedFromModel: false,
      autoExecute: false,
      requiresUserGesture: true
    },
    toneCues: [],
    uiCues: [
      { type: "guide_state", state: context.state },
      { type: "guide_lane", lane: context.lane },
      { type: "panel_visibility", open: context.panelOpen },
      { type: "voice_preference", enabled: context.voiceEnabled }
    ],
    guardrails: [
      "non_authority",
      "no_reply_synthesis",
      "no_tts_dispatch",
      "no_private_memory",
      "bounded_public_ui_context"
    ],
    responseCues: [],
    domains: {},
    confidence: 1,
    diag: {
      disabled: false,
      role: "persistent_guide_ui_metadata",
      activeFlowAuthority: false,
      bounded: true
    }
  };
}

async function buildAsync(input = {}) {
  return build(input);
}

module.exports = {
  VERSION,
  GUIDE_CONTRACT,
  GUIDE_STATES,
  GUIDE_MODES,
  DEFAULT_LANES,
  GUIDE_ACTION_TYPES,
  build,
  buildAsync,
  sanitizeGuideContext,
  sanitizeGuideActions,
  normalizeLane,
  normalizeState,
  DISABLED: false,
  nonAuthority: true,
  ACTIVE_FOR_GUIDE_DATA_ONLY: true
};
