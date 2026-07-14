"use strict";

// NYX-GUIDE-STEPS-7-8-9-R1: action orchestration, consent-bound public preferences, and production hardening.

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

/* NYX_GUIDE_ORCHESTRATION_STEPS_7_8_9_R1_START */
(function nyxGuideSteps789SitebridgePatch() {
  "use strict";

  const PATCH_VERSION = "sitebridge.guideOrchestration.v5.0 STEPS-7-8-9-ACTIONS-PREFERENCES-PRODUCTION";
  const ACTION_CONTRACT = "nyx.guideAction/1.1";
  const ACTION_PLAN_CONTRACT = "nyx.guideActionPlan/1.0";
  const PREFERENCES_CONTRACT = "nyx.publicPreferences/1.0";
  const PRODUCTION_CONTRACT = "nyx.guideProductionPolicy/1.0";
  const MAX_PERSISTENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const DEFAULT_PERSISTENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

  const TARGETS = Object.freeze([
    "sandblast_home",
    "sandblast_radio",
    "sandblast_tv",
    "sandblast_roku",
    "sandblast_cartoons",
    "sandblast_classics",
    "synapse",
    "lingosentinel",
    "apps",
    "about",
    "nyx_guide",
    "guide_input",
    "current_surface"
  ]);

  const ACTION_TYPES = Object.freeze([
    "navigate",
    "play_radio",
    "stop_radio",
    "open_media",
    "open_tv",
    "open_roku",
    "open_synapse",
    "open_guide",
    "focus_input",
    "summarize",
    "tv_focus",
    "tv_back",
    "tv_play_pause",
    "tv_open_details",
    "dismiss_guide"
  ]);

  const ACTION_TARGET_COMPAT = Object.freeze({
    play_radio: Object.freeze(["sandblast_radio"]),
    stop_radio: Object.freeze(["sandblast_radio"]),
    open_media: Object.freeze(["sandblast_tv", "sandblast_cartoons", "sandblast_classics"]),
    open_tv: Object.freeze(["sandblast_tv", "sandblast_cartoons", "sandblast_classics"]),
    open_roku: Object.freeze(["sandblast_roku"]),
    open_synapse: Object.freeze(["synapse"]),
    open_guide: Object.freeze(["nyx_guide"]),
    focus_input: Object.freeze(["guide_input"]),
    summarize: Object.freeze(["current_surface", "synapse", "lingosentinel", "sandblast_tv"]),
    tv_focus: Object.freeze(["current_surface", "nyx_guide"]),
    tv_back: Object.freeze(["current_surface"]),
    tv_play_pause: Object.freeze(["current_surface"]),
    tv_open_details: Object.freeze(["current_surface", "sandblast_tv", "sandblast_cartoons", "sandblast_classics"]),
    dismiss_guide: Object.freeze(["nyx_guide"])
  });

  const TARGET_ALIASES = Object.freeze({
    home: "sandblast_home",
    sandblast: "sandblast_home",
    sandblast_channel: "sandblast_home",
    "sandblast.channel": "sandblast_home",
    radio: "sandblast_radio",
    live: "sandblast_radio",
    listen: "sandblast_radio",
    music: "sandblast_radio",
    tv: "sandblast_tv",
    watch: "sandblast_tv",
    television: "sandblast_tv",
    media: "sandblast_tv",
    roku: "sandblast_roku",
    sandblast_on_roku: "sandblast_roku",
    cartoon: "sandblast_cartoons",
    cartoons: "sandblast_cartoons",
    classic: "sandblast_classics",
    classics: "sandblast_classics",
    news: "synapse",
    synapse: "synapse",
    lingo: "lingosentinel",
    lingo_sentinel: "lingosentinel",
    translation: "lingosentinel",
    apps: "apps",
    app: "apps",
    about: "about",
    company: "about",
    guide: "nyx_guide",
    nyx: "nyx_guide",
    search: "nyx_guide",
    input: "guide_input",
    focus_input: "guide_input",
    current: "current_surface",
    current_surface: "current_surface"
  });

  const ALLOWED_TELEMETRY_EVENTS = Object.freeze([
    "nyx_action_presented",
    "nyx_action_selected",
    "nyx_action_completed",
    "nyx_action_failed",
    "nyx_preference_consent",
    "nyx_preference_updated",
    "nyx_preference_reset",
    "nyx_surface_handoff",
    "nyx_voice_playback",
    "nyx_avatar_state",
    "nyx_tv_remote_input",
    "nyx_guide_error"
  ]);

  function obj(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function text(value, max = 240) {
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }

  function bool(value, fallback = false) {
    if (typeof value === "boolean") return value;
    const normalized = text(value, 16).toLowerCase();
    if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
    if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
    return fallback;
  }

  function number(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  function stableHash(value) {
    const raw = String(value == null ? "" : value);
    let hash = 2166136261;
    for (let index = 0; index < raw.length; index += 1) {
      hash ^= raw.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function normalizeTarget(value) {
    const raw = text(value || "current_surface", 96).toLowerCase();
    if (!raw || /(?:javascript:|data:|https?:\/\/|\/{2,}|\\)/i.test(raw)) return "";
    const key = raw.replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
    const normalized = TARGET_ALIASES[key] || key;
    return TARGETS.includes(normalized) ? normalized : "";
  }

  function normalizeActionType(value) {
    const type = text(value, 40).toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    return ACTION_TYPES.includes(type) ? type : "";
  }

  function targetCompatible(type, target) {
    if (!type || !target) return false;
    if (type === "navigate") return TARGETS.includes(target) && target !== "guide_input";
    const compatible = ACTION_TARGET_COMPAT[type];
    return Array.isArray(compatible) ? compatible.includes(target) : false;
  }

  function targetLane(target) {
    if (target === "sandblast_radio") return "live";
    if (["sandblast_tv", "sandblast_cartoons", "sandblast_classics"].includes(target)) return "watch";
    if (target === "sandblast_roku") return "roku";
    if (target === "synapse") return "news";
    if (target === "apps") return "apps";
    if (target === "about") return "about";
    if (["nyx_guide", "guide_input"].includes(target)) return "search";
    return "home";
  }

  function sanitizeAction(value, options = {}) {
    const src = obj(value);
    const type = normalizeActionType(src.type || src.action);
    const target = normalizeTarget(src.target || src.targetKey || src.routeKey || src.lane || "current_surface");
    if (!targetCompatible(type, target)) return null;
    const television = options.television === true;
    const labelFallback = {
      navigate: "Open",
      play_radio: "Play Radio",
      stop_radio: "Stop Radio",
      open_media: "Open Media",
      open_tv: "Open Sandblast TV",
      open_roku: "Open Sandblast on Roku",
      open_synapse: "Open Synapse",
      open_guide: "Ask Nyx",
      focus_input: "Type a Question",
      summarize: "Summarize",
      tv_focus: "Focus Nyx",
      tv_back: "Back",
      tv_play_pause: "Play or Pause",
      tv_open_details: "Open Details",
      dismiss_guide: "Dismiss Nyx"
    }[type] || "Open";

    const label = text(src.label || labelFallback, television ? 48 : 80);
    const id = text(
      src.id || `act_${stableHash(`${type}|${target}|${label.toLowerCase()}`)}`,
      72
    ).replace(/[^a-zA-Z0-9_.:-]+/g, "_");

    return {
      contract: ACTION_CONTRACT,
      id,
      type,
      target,
      targetKey: target,
      lane: targetLane(target),
      label,
      requiresUserGesture: true,
      autoExecute: false,
      advisoryOnly: true,
      serverExecutionAllowed: false,
      externalUrlAccepted: false,
      symbolicTargetOnly: true,
      remoteSafe: television,
      focusable: television
    };
  }

  function extractActionList(input) {
    const src = obj(input);
    const plan = obj(src.guideActionPlan || src.actionPlan);
    if (Array.isArray(plan.actions)) return plan.actions;
    if (Array.isArray(src.guideActions)) return src.guideActions;
    if (Array.isArray(src.actions)) return src.actions;
    if (src.action && typeof src.action === "object") return [src.action];
    return [];
  }

  function buildGuideActionPlan(input = {}, options = {}) {
    const src = obj(input);
    const televisionProfile = obj(
      options.televisionGuide ||
      src.televisionGuide ||
      src.tvGuide ||
      src.tvContext
    );
    const television = televisionProfile.enabled === true || options.television === true;
    const limit = television
      ? Math.round(number(televisionProfile.maxActions, 4, 1, 4))
      : Math.round(number(options.maxActions || src.maxActions, 6, 1, 6));

    const actions = [];
    let rejected = 0;
    let duplicates = 0;
    for (const rawAction of extractActionList(src)) {
      const action = sanitizeAction(rawAction, { television });
      if (!action) {
        rejected += 1;
        continue;
      }
      if (actions.some((existing) => existing.type === action.type && existing.target === action.target)) {
        duplicates += 1;
        continue;
      }
      actions.push(action);
      if (actions.length >= limit) break;
    }

    return {
      contract: ACTION_PLAN_CONTRACT,
      version: PATCH_VERSION,
      authoritative: false,
      finalReplyAuthority: false,
      executionAuthority: "client_user_gesture",
      clientExecutionRequired: true,
      serverExecutionAllowed: false,
      symbolicTargetsOnly: true,
      externalModelUrlsAllowed: false,
      autoExecute: false,
      requiresUserGesture: true,
      television,
      maxActions: limit,
      actionCount: actions.length,
      rejectedCount: rejected,
      duplicateCount: duplicates,
      actions
    };
  }

  function normalizeLanguage(value) {
    const raw = text(value || "en", 24).replace(/_/g, "-");
    if (!/^[a-zA-Z]{2,3}(?:-[a-zA-Z]{2,4})?$/.test(raw)) return "en";
    const parts = raw.split("-");
    return parts.length === 1
      ? parts[0].toLowerCase()
      : `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
  }

  function buildPublicPreferenceEnvelope(input = {}, previous = {}) {
    const root = obj(input);
    const src = obj(
      root.publicPreferences ||
      root.preferences ||
      root.preferenceIntent ||
      root
    );
    const changes = obj(src.changes);
    const priorRoot = obj(previous);
    const prior = obj(
      priorRoot.publicPreferences ||
      priorRoot.preferences ||
      priorRoot
    );

    const explicitConsent = bool(
      src.consentGranted ??
      src.rememberPreferences ??
      src.remember ??
      root.consentGranted ??
      root.rememberPreferences,
      false
    );
    const forgetRequested = bool(
      src.clearRequested ??
      src.forget ??
      src.reset ??
      root.clearRequested,
      false
    );
    const now = Date.now();
    const ttlMs = explicitConsent
      ? Math.round(number(src.ttlMs || root.ttlMs, DEFAULT_PERSISTENT_TTL_MS, 60 * 60 * 1000, MAX_PERSISTENT_TTL_MS))
      : DEFAULT_SESSION_TTL_MS;

    const preferenceValue = (key, fallback) => {
      if (changes[key] !== undefined) return bool(changes[key], fallback);
      if (src[key] !== undefined) return bool(src[key], fallback);
      if (prior[key] !== undefined) return bool(prior[key], fallback);
      return fallback;
    };

    const televisionModeRaw = text(src.televisionMode || prior.televisionMode || "auto", 12).toLowerCase();
    const televisionMode = ["auto", "on", "off"].includes(televisionModeRaw) ? televisionModeRaw : "auto";
    const lastDestination = normalizeTarget(src.lastDestination || prior.lastDestination || "") || "";
    const lastSurface = text(src.lastSurface || prior.lastSurface || root.surface || "", 96)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "");

    return {
      contract: PREFERENCES_CONTRACT,
      version: PATCH_VERSION,
      publicSessionOnly: true,
      privateMemoryAccess: false,
      authoritative: false,
      consentRequired: true,
      consentGranted: explicitConsent,
      rememberPreferences: explicitConsent && !forgetRequested,
      clearRequested: forgetRequested,
      storage: explicitConsent && !forgetRequested ? "client_persistent" : "client_session",
      serverStored: false,
      serverGuideMemoryRequired: false,
      rawConversationStored: false,
      rawAudioStored: false,
      sensitiveFieldsAccepted: false,
      createdAt: Number.isFinite(Number(prior.createdAt)) ? Number(prior.createdAt) : now,
      updatedAt: now,
      expiresAt: forgetRequested ? now : now + ttlMs,
      ttlMs: forgetRequested ? 0 : ttlMs,
      clientStorageKey: "sb.nyx.publicPreferences.v1",
      clientSessionKey: "sb.nyx.publicSession.v1",
      preferences: forgetRequested ? {} : {
        voiceEnabled: preferenceValue("voiceEnabled", true),
        textOnly: preferenceValue("textOnly", false),
        reducedMotion: preferenceValue("reducedMotion", false),
        avatarVisible: preferenceValue("avatarVisible", true),
        suggestionsEnabled: preferenceValue("suggestionsEnabled", true),
        captionsEnabled: preferenceValue("captionsEnabled", true),
        preferredLanguage: normalizeLanguage(changes.preferredLanguage || src.preferredLanguage || prior.preferredLanguage || "en"),
        televisionMode,
        lastSurface,
        lastDestination
      }
    };
  }

  function sanitizeTelemetryEvent(input = {}) {
    const src = obj(input);
    const event = text(src.event || src.type, 64).toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (!ALLOWED_TELEMETRY_EVENTS.includes(event)) return null;
    const actionType = normalizeActionType(src.actionType || obj(src.action).type);
    const target = normalizeTarget(src.target || obj(src.action).target);
    const success = src.success === undefined ? null : bool(src.success, false);
    return {
      contract: "nyx.guideTelemetryEvent/1.0",
      eventId: text(src.eventId || `evt_${stableHash(`${event}|${src.traceId || ""}|${src.at || Date.now()}`)}`, 80)
        .replace(/[^a-zA-Z0-9_.:-]+/g, "_"),
      event,
      surface: text(src.surface || "sandblast.channel", 96).toLowerCase().replace(/[^a-z0-9._-]+/g, ""),
      actionType,
      target,
      success,
      durationMs: Math.round(number(src.durationMs, 0, 0, 10 * 60 * 1000)),
      traceId: text(src.traceId, 96).replace(/[^a-zA-Z0-9_.:-]+/g, "_"),
      deviceClass: text(src.deviceClass, 32).toLowerCase().replace(/[^a-z0-9_-]+/g, "_"),
      inputMode: text(src.inputMode, 24).toLowerCase().replace(/[^a-z0-9_-]+/g, "_"),
      reasonCode: text(src.reasonCode || src.reason, 80).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_"),
      at: Math.round(number(src.at, Date.now(), 0, Date.now() + 5 * 60 * 1000)),
      diagnosticsRedacted: true
    };
  }

  function buildProductionPolicy(input = {}) {
    const src = obj(input.productionPolicy || input.releasePolicy || input);
    return {
      contract: PRODUCTION_CONTRACT,
      version: PATCH_VERSION,
      enabled: src.enabled !== false,
      nonAuthority: true,
      actionValidationRequired: true,
      duplicateActionSuppression: true,
      preferenceConsentRequired: true,
      telemetryRedacted: true,
      rawConversationTelemetryAllowed: false,
      rawAudioTelemetryAllowed: false,
      credentialTelemetryAllowed: false,
      rollbackSafe: true,
      featureFlagsRequired: true,
      rateLimitRequired: true,
      payloadLimitRequired: true,
      originAllowlistRequired: true,
      releaseState: text(src.releaseState || "candidate", 24).toLowerCase().replace(/[^a-z0-9_-]+/g, "_")
    };
  }

  function enrichBuildResult(result, input) {
    if (!result || typeof result !== "object") return result;
    const src = obj(input);
    const televisionGuide = obj(result.televisionGuide);
    const actionPlan = buildGuideActionPlan(
      {
        ...src,
        guideActions: extractActionList(src).length ? extractActionList(src) : result.guideActions,
        televisionGuide
      },
      { televisionGuide }
    );
    const publicPreferences = buildPublicPreferenceEnvelope(
      src,
      src.previousPreferences || src.publicPreferences
    );
    const productionPolicy = buildProductionPolicy(src);

    const out = {
      ...result,
      version: PATCH_VERSION,
      guideActionPlan: actionPlan,
      guideActions: actionPlan.actions,
      publicPreferences,
      productionPolicy
    };

    out.guideShell = {
      ...obj(out.guideShell),
      step7ActionOrchestration: true,
      step8ConsentBoundPreferences: true,
      step9ProductionHardening: true,
      actionExecutionAuthority: "client_user_gesture",
      publicPreferenceStorage: "client_only",
      telemetryMode: "redacted_aggregate"
    };

    out.actionPolicy = {
      ...obj(out.actionPolicy),
      contract: ACTION_PLAN_CONTRACT,
      allowedTypes: ACTION_TYPES.slice(),
      allowedTargets: TARGETS.slice(),
      symbolicTargetsOnly: true,
      externalUrlsAcceptedFromModel: false,
      serverExecutionAllowed: false,
      autoExecute: false,
      requiresUserGesture: true,
      televisionMaxActions: 4,
      desktopMaxActions: 6
    };

    out.privacy = {
      ...obj(out.privacy),
      publicSessionOnly: true,
      privateMemoryAccess: false,
      serverPreferenceStorage: false,
      rawConversationTelemetry: false,
      rawAudioTelemetry: false
    };

    out.guardrails = Array.from(new Set([
      ...(Array.isArray(out.guardrails) ? out.guardrails : []),
      "symbolic_action_targets_only",
      "action_user_gesture_required",
      "no_server_action_execution",
      "preference_consent_required",
      "client_only_public_preferences",
      "redacted_aggregate_telemetry",
      "release_feature_flags",
      "rollback_safe"
    ]));

    return out;
  }

  try {
    const api = module.exports && typeof module.exports === "object" ? module.exports : null;
    if (!api) return;

    const originalBuild = typeof api.build === "function" ? api.build : null;
    const originalBuildAsync = typeof api.buildAsync === "function" ? api.buildAsync : null;

    if (originalBuild && !originalBuild.__nyxGuideSteps789Wrapped) {
      const wrappedBuild = function wrappedBuild(input) {
        return enrichBuildResult(originalBuild.call(this, input), input);
      };
      wrappedBuild.__nyxGuideSteps789Wrapped = true;
      api.build = wrappedBuild;
    }

    if (originalBuildAsync && !originalBuildAsync.__nyxGuideSteps789Wrapped) {
      const wrappedBuildAsync = async function wrappedBuildAsync(input) {
        return enrichBuildResult(await originalBuildAsync.call(this, input), input);
      };
      wrappedBuildAsync.__nyxGuideSteps789Wrapped = true;
      api.buildAsync = wrappedBuildAsync;
    }

    api.VERSION = PATCH_VERSION;
    api.NYX_GUIDE_STEPS_7_8_9_VERSION = PATCH_VERSION;
    api.ACTION_CONTRACT = ACTION_CONTRACT;
    api.ACTION_PLAN_CONTRACT = ACTION_PLAN_CONTRACT;
    api.PREFERENCES_CONTRACT = PREFERENCES_CONTRACT;
    api.PRODUCTION_CONTRACT = PRODUCTION_CONTRACT;
    api.GUIDE_TARGETS = TARGETS;
    api.GUIDE_ACTION_TYPES_V2 = ACTION_TYPES;
    api.ALLOWED_TELEMETRY_EVENTS = ALLOWED_TELEMETRY_EVENTS;
    api.normalizeNyxGuideTarget = normalizeTarget;
    api.sanitizeNyxGuideAction = sanitizeAction;
    api.buildGuideActionPlan = buildGuideActionPlan;
    api.buildPublicPreferenceEnvelope = buildPublicPreferenceEnvelope;
    api.sanitizeNyxGuideTelemetryEvent = sanitizeTelemetryEvent;
    api.buildNyxGuideProductionPolicy = buildProductionPolicy;
    api.enrichNyxGuideSteps789 = enrichBuildResult;
  } catch (_) {}
})();
 /* NYX_GUIDE_ORCHESTRATION_STEPS_7_8_9_R1_END */
