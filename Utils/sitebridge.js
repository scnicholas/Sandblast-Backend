"use strict";

/**
 * sitebridge.js
 * Nyx public guide continuity + television adaptation data bridge.
 *
 * This module is intentionally non-authoritative. It may describe public UI
 * state, cross-property handoff metadata, television-safe presentation rules,
 * public routes and bounded client preferences. It never composes replies,
 * changes Marion authority, accesses private memory or dispatches TTS.
 */

const VERSION = "sitebridge.guideOrchestration.v4.0 STEPS-5-6-CROSS-PROPERTY-TV-DATA-BRIDGE";
const GUIDE_CONTRACT = "nyx.guideOrchestration/1.0";
const CONTINUITY_CONTRACT = "nyx.guideContinuity/1.0";
const TELEVISION_CONTRACT = "nyx.televisionGuide/1.0";
const GUIDE_STATES = Object.freeze([
  "available", "listening", "thinking", "speaking",
  "guiding", "quiet", "recovery", "minimized"
]);
const GUIDE_MODES = Object.freeze(["text", "voice", "avatar"]);
const DEFAULT_LANES = Object.freeze(["home", "search", "live", "watch", "roku", "news", "about", "apps"]);
const GUIDE_ACTION_TYPES = Object.freeze([
  "navigate", "play_radio", "stop_radio", "open_media", "open_tv",
  "open_roku", "open_synapse", "open_guide", "focus_input", "summarize",
  "tv_focus", "tv_back", "tv_play_pause", "tv_open_details", "dismiss_guide"
]);
const TV_DEVICE_CLASSES = Object.freeze(["roku", "smart_tv", "web_tv", "set_top_box", "console"]);
const TV_INPUT_MODES = Object.freeze(["remote", "keyboard", "pointer", "touch", "voice_request"]);
const MAX_TEXT = 240;
const MAX_KEY = 96;
const MAX_CONTINUITY_TTL_MS = 30 * 60 * 1000;

function safeText(value, max = MAX_TEXT) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
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

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeLane(value) {
  const raw = safeText(value || "home", 32).toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  const aliases = {
    radio: "live", listen: "live", tv: "watch", television: "watch",
    cartoon: "watch", cartoons: "watch", classic: "watch", classics: "watch",
    synapse: "news", guide: "search", nyx: "search", app: "apps"
  };
  const lane = aliases[raw] || raw;
  return DEFAULT_LANES.includes(lane) ? lane : "home";
}

function normalizeState(value) {
  const state = safeText(value || "available", 32).toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  return GUIDE_STATES.includes(state) ? state : "available";
}

function normalizeSurface(value) {
  return safeText(value || "sandblast.channel", 96)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "") || "sandblast.channel";
}

function normalizeRoutes(value) {
  const src = safeObj(value);
  const out = {};
  for (const lane of DEFAULT_LANES) {
    const route = safeText(src[lane], 320);
    if (!route) continue;
    try {
      const url = new URL(route, "https://sandblast.channel/");
      if (
        url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
      ) out[lane] = route;
    } catch (_) {}
  }
  return out;
}

function sanitizeGuideContext(value) {
  const src = safeObj(value);
  const prefs = safeObj(src.preferences);
  const media = safeObj(src.mediaState || src.media);
  return {
    contract: GUIDE_CONTRACT,
    surface: normalizeSurface(src.surface || src.site),
    page: safeText(src.page || src.pathname || "/", 160),
    lane: normalizeLane(src.lane || src.currentLane),
    previousLane: normalizeLane(src.previousLane || "home"),
    state: normalizeState(src.state || src.guideState),
    panelOpen: boolish(src.panelOpen, false),
    voiceEnabled: boolish(src.voiceEnabled, true),
    reducedMotion: boolish(src.reducedMotion ?? prefs.reducedMotion, false),
    suggestionsEnabled: boolish(src.suggestionsEnabled ?? prefs.suggestionsEnabled, true),
    inputMode: safeText(src.inputMode || "text", 24).toLowerCase() === "voice" ? "voice" : "text",
    mediaState: {
      kind: safeText(media.kind || media.type || "", 24).toLowerCase().replace(/[^a-z0-9_-]+/g, ""),
      playing: boolish(media.playing ?? media.radioPlaying ?? media.videoPlaying, false),
      paused: boolish(media.paused, false),
      muted: boolish(media.muted, false),
      contentId: safeText(media.contentId || media.programId || "", 96),
      channelId: safeText(media.channelId || media.channel || "", 96),
      positionSec: clampNumber(media.positionSec || media.currentTime, 0, 0, 24 * 60 * 60),
      durationSec: clampNumber(media.durationSec || media.duration, 0, 0, 24 * 60 * 60)
    }
  };
}

function sanitizeGuideActions(value, televisionEnabled = false) {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  const limit = televisionEnabled ? 4 : 6;
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
      label: safeText(src.label || type.replace(/_/g, " "), televisionEnabled ? 48 : 80),
      requiresUserGesture: true,
      autoExecute: false,
      advisoryOnly: true
    };
    if (televisionEnabled) {
      action.remoteSafe = true;
      action.focusable = true;
    }
    if (!out.some((entry) => entry.type === action.type && entry.target === action.target)) out.push(action);
    if (out.length >= limit) break;
  }
  return out;
}

function publicId(value, fallback = "") {
  const text = safeText(value || fallback, MAX_KEY).replace(/[^a-zA-Z0-9_.:-]+/g, "_");
  return text.slice(0, MAX_KEY);
}

function hashText(value) {
  const text = String(value == null ? "" : value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildContinuityEnvelope(input = {}, previous = {}) {
  const src = safeObj(input);
  const prior = safeObj(previous);
  const context = sanitizeGuideContext(src.guideContext || src.context || src);
  const priorContext = sanitizeGuideContext(prior.guideContext || prior.context || prior);
  const carry = safeObj(src.conversationCarry || src.carry);
  const priorCarry = safeObj(prior.conversationCarry || prior.carry);
  const now = Date.now();
  const ttlMs = Math.round(clampNumber(src.ttlMs || prior.ttlMs, MAX_CONTINUITY_TTL_MS, 60_000, MAX_CONTINUITY_TTL_MS));
  const sessionId = publicId(src.sessionId || src.sessionKey || prior.sessionId || prior.sessionKey, "public");
  const previousSurface = normalizeSurface(
    src.previousSurface ||
    prior.surface ||
    priorContext.surface ||
    context.surface
  );
  const surface = normalizeSurface(src.surface || context.surface);
  const transitionActive = previousSurface !== surface;
  const handoffId = publicId(
    src.handoffId || safeObj(src.handoff).id ||
    `handoff_${hashText(`${sessionId}|${previousSurface}|${surface}|${Math.floor(now / 30000)}`)}`,
    "handoff"
  );

  return {
    contract: CONTINUITY_CONTRACT,
    version: VERSION,
    publicSessionOnly: true,
    privateMemoryAccess: false,
    authoritative: false,
    sessionId,
    handoffId,
    surface,
    previousSurface,
    page: safeText(src.page || context.page || "/", 160),
    previousPage: safeText(src.previousPage || prior.page || priorContext.page || "/", 160),
    lane: normalizeLane(src.lane || context.lane),
    previousLane: normalizeLane(src.previousLane || prior.lane || priorContext.lane),
    guideState: normalizeState(src.guideState || context.state),
    panelOpen: boolish(src.panelOpen ?? context.panelOpen, false),
    voiceEnabled: boolish(src.voiceEnabled ?? context.voiceEnabled, true),
    reducedMotion: boolish(src.reducedMotion ?? context.reducedMotion, false),
    suggestionsEnabled: boolish(src.suggestionsEnabled ?? context.suggestionsEnabled, true),
    conversationCarry: {
      goal: safeText(carry.goal || src.goal || priorCarry.goal || "", 80),
      intent: safeText(carry.intent || src.intent || priorCarry.intent || "", 80),
      lastDestination: safeText(carry.lastDestination || src.lastDestination || priorCarry.lastDestination || "", 96),
      lastUserText: safeText(carry.lastUserText || src.lastUserText || priorCarry.lastUserText || "", 180),
      lastNyxReply: safeText(carry.lastNyxReply || src.lastNyxReply || priorCarry.lastNyxReply || "", 180)
    },
    mediaState: context.mediaState,
    handoff: {
      active: transitionActive,
      id: handoffId,
      issuedAt: now,
      expiresAt: now + ttlMs,
      ttlMs,
      userGestureRequired: true,
      autoNavigate: false
    }
  };
}

function normalizeTelevisionDevice(value, surface) {
  const raw = safeText(value, 32).toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  if (TV_DEVICE_CLASSES.includes(raw)) return raw;
  if (String(surface || "").includes("roku")) return "roku";
  if (String(surface || "").includes("tv")) return "web_tv";
  return "web_tv";
}

function buildTelevisionProfile(input = {}, contextInput = {}) {
  const src = safeObj(input.televisionGuide || input.tvGuide || input.tvContext || input);
  const context = sanitizeGuideContext(contextInput.guideContext || contextInput.context || contextInput);
  const surface = normalizeSurface(src.surface || context.surface);
  const rawDevice = safeText(src.deviceClass || src.device || "", 32).toLowerCase();
  const enabled = boolish(
    src.enabled,
    TV_DEVICE_CLASSES.includes(rawDevice) || /(?:^|[._-])(roku|tv|television)(?:$|[._-])/.test(surface)
  );
  if (!enabled) {
    return {
      contract: TELEVISION_CONTRACT,
      version: VERSION,
      enabled: false,
      authoritative: false
    };
  }

  const inputModeRaw = safeText(src.inputMode || src.navigationMode || "remote", 24)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_");
  const inputMode = TV_INPUT_MODES.includes(inputModeRaw) ? inputModeRaw : "remote";
  const reducedMotion = boolish(src.reducedMotion ?? context.reducedMotion, true);

  return {
    contract: TELEVISION_CONTRACT,
    version: VERSION,
    enabled: true,
    authoritative: false,
    deviceClass: normalizeTelevisionDevice(rawDevice, surface),
    surface,
    inputMode,
    remotePrimary: inputMode === "remote",
    captionsRequired: true,
    captionsEnabled: boolish(src.captionsEnabled, true),
    continuousListening: false,
    voiceActivation: "explicit_user_request",
    autoSpeak: false,
    interruptPlayback: false,
    userGestureRequired: true,
    responseDensity: "compact",
    maxSpeechChars: Math.round(clampNumber(src.maxSpeechChars, 260, 120, 420)),
    maxActions: Math.round(clampNumber(src.maxActions, 4, 1, 4)),
    safeAreaPercent: clampNumber(src.safeAreaPercent, 5, 3, 10),
    animation: {
      mode: reducedMotion ? "reduced" : "restrained",
      reducedMotion,
      continuousMotion: false
    },
    focus: {
      target: safeText(src.focusTarget || src.focus || "guide_dock", 80),
      preserveNativeBack: true,
      preserveNativePlayPause: true,
      trapFocus: false
    },
    playbackPolicy: {
      autoPauseMedia: false,
      autoResumeMedia: false,
      duckAudioOnlyOnExplicitSpeech: true,
      restoreFocusAfterSpeech: true
    }
  };
}

function build(input = {}) {
  const src = safeObj(input);
  const features = safeObj(src.features);
  const context = sanitizeGuideContext(src.guideContext || src.context || src);
  const routes = normalizeRoutes(src.routes);
  const televisionGuide = buildTelevisionProfile(src, context);
  const guideActions = sanitizeGuideActions(src.guideActions || src.actions, televisionGuide.enabled);
  const queryKey = safeText(src.queryKey, MAX_KEY);
  const sessionKey = safeText(src.sessionKey || src.sessionId, MAX_KEY);
  const publicGuideContinuity = buildContinuityEnvelope(
    { ...src, guideContext: context, sessionId: sessionKey },
    src.previousContinuity || src.publicGuideContinuity
  );

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
    mode: televisionGuide.enabled ? "television_guide" : "guide_shell",
    intent: safeText(features.intent || "GUIDE", 32).toUpperCase(),
    regulation: "steady",
    cognitiveLoad: televisionGuide.enabled ? "low_compact" : "low",
    stance: "data_only",
    context,
    publicGuideContinuity,
    televisionGuide,
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
      crossPropertyContinuity: true,
      televisionAdaptation: televisionGuide.enabled,
      actionExecutionAuthority: "client_user_gesture"
    },
    routes,
    guideActions,
    actionPolicy: {
      allowedTypes: GUIDE_ACTION_TYPES.slice(),
      symbolicTargetsOnly: true,
      externalUrlsAcceptedFromModel: false,
      autoExecute: false,
      requiresUserGesture: true,
      televisionMaxActions: 4
    },
    toneCues: [],
    uiCues: [
      { type: "guide_state", state: context.state },
      { type: "guide_lane", lane: context.lane },
      { type: "panel_visibility", open: context.panelOpen },
      { type: "voice_preference", enabled: context.voiceEnabled },
      { type: "surface_handoff", active: publicGuideContinuity.handoff.active },
      { type: "television_mode", enabled: televisionGuide.enabled }
    ],
    guardrails: [
      "non_authority",
      "no_reply_synthesis",
      "no_tts_dispatch",
      "no_private_memory",
      "bounded_public_ui_context",
      "no_automatic_cross_property_navigation",
      "no_continuous_tv_listening",
      "preserve_native_tv_controls"
    ],
    responseCues: [],
    domains: {},
    confidence: 1,
    diag: {
      disabled: false,
      role: "public_guide_continuity_and_tv_metadata",
      activeFlowAuthority: false,
      bounded: true,
      nativeRokuSceneGraphModified: false
    }
  };
}

async function buildAsync(input = {}) {
  return build(input);
}

module.exports = {
  VERSION,
  GUIDE_CONTRACT,
  CONTINUITY_CONTRACT,
  TELEVISION_CONTRACT,
  GUIDE_STATES,
  GUIDE_MODES,
  DEFAULT_LANES,
  GUIDE_ACTION_TYPES,
  TV_DEVICE_CLASSES,
  TV_INPUT_MODES,
  build,
  buildAsync,
  sanitizeGuideContext,
  sanitizeGuideActions,
  buildContinuityEnvelope,
  buildTelevisionProfile,
  normalizeLane,
  normalizeState,
  normalizeSurface,
  DISABLED: false,
  nonAuthority: true,
  ACTIVE_FOR_GUIDE_DATA_ONLY: true
};
