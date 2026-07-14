
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
let assertions = 0;
function ok(value, message) {
  assertions += 1;
  if (!value) throw new Error(`ASSERTION_FAILED: ${message}`);
}
function eq(actual, expected, message) {
  assertions += 1;
  if (actual !== expected) throw new Error(`ASSERTION_FAILED: ${message}; expected=${expected}; actual=${actual}`);
}
function hasAction(list, type, target) {
  return Array.isArray(list) && list.some((a) => a && a.type === type && (!target || a.target === target));
}

const chat = require(path.join(root, "Utils", "chatEngine.js"));
const router = require(path.join(root, "Utils", "domainRouter.js"));
const state = require(path.join(root, "Utils", "stateSpine.js"));
const voice = require(path.join(root, "Routes", "voiceRoute.js"));
const composer = require(path.join(root, "Data", "marion", "runtime", "composeMarionResponse.js"));
const concierge = require(path.join(root, "Data", "marion", "runtime", "DomainConcierge.js"));
const sitebridge = require(path.join(root, "sitebridge.js"));

const ctx = {
  surface: "sandblast.channel",
  page: "/ecosystem",
  currentLane: "radio",
  previousLane: "home",
  lastAction: "conversation",
  goal: "listen",
  inputMode: "voice",
  panelOpen: true,
  voiceEnabled: true,
  reducedMotion: false,
  mediaState: { radioPlaying: false, videoPlaying: false }
};

// Versions / exports
ok(/steps1-3/.test(chat.NYX_GUIDE_ORCHESTRATION_CHATENGINE_VERSION), "chat guide version");
ok(/steps2-3/.test(router.NYX_GUIDE_CONTEXT_ROUTING_VERSION), "router guide version");
ok(/steps1-3/.test(state.NYX_GUIDE_CONTINUITY_STATE_VERSION), "state guide version");
ok(/steps2-3/.test(composer.NYX_GUIDE_COMPOSER_VERSION), "composer guide version");
ok(/steps2-3/.test(concierge.NYX_GUIDE_CONCIERGE_VERSION), "concierge guide version");
ok(typeof voice.normalizeGuideActions === "function", "voice action normalizer export");
ok(typeof sitebridge.sanitizeGuideActions === "function", "sitebridge action sanitizer export");

// Context normalization
const c1 = chat.normalizeNyxGuideContext({ ...ctx, currentLane: "radio" }, "play radio");
eq(c1.currentLane, "live", "radio alias to live");
eq(c1.previousLane, "home", "previous lane preserved");
eq(c1.inputMode, "voice", "voice input preserved");
eq(c1.goal, "listen", "goal preserved");
eq(c1.privateMemoryAccess, false, "public context blocks private memory");
ok(/^[a-f0-9]{20}$/.test(c1.contextHash), "bounded context hash");

const vc = voice.normalizeGuideContext({ ...ctx, currentLane: "watch", goal: "watch" }, "voice");
eq(vc.currentLane, "watch", "voice context lane");
eq(vc.goal, "watch", "voice context goal");
eq(vc.mediaState.radioPlaying, false, "voice media state normalized");
eq(vc.publicSessionOnly, true, "voice public-session hardlock");

// Action inference across modules
const radioActions = chat.buildNyxGuideActions("Play Sandblast Radio", ctx);
ok(hasAction(radioActions, "play_radio", "live"), "chat play radio action");
const stopActions = chat.buildNyxGuideActions("Please stop the radio", ctx);
ok(hasAction(stopActions, "stop_radio", "live"), "chat stop radio action");
const tvActions = composer.buildNyxGuideComposerActions("Open Sandblast TV", ctx);
ok(hasAction(tvActions, "open_tv", "watch"), "composer TV action");
const rokuActions = concierge.buildNyxGuideConciergeActions("Take me to Roku", ctx);
ok(hasAction(rokuActions, "open_roku", "roku"), "concierge Roku action");
const newsIntent = router.classifyNyxGuideIntent("Open Synapse news", ctx);
eq(newsIntent.kind, "open_synapse", "router Synapse intent");
eq(newsIntent.lane, "news", "router Synapse lane");
const summaryActions = composer.buildNyxGuideComposerActions("Summarize this for me", { ...ctx, currentLane: "news" });
ok(hasAction(summaryActions, "summarize", "news"), "summary action uses current lane");

// Action security
const normalizedActions = voice.normalizeGuideActions([
  { type: "open_tv", target: "watch", label: "TV", url: "javascript:alert(1)", autoExecute: true },
  { type: "evil_exec", target: "https://evil.invalid" },
  { type: "play_radio", target: "radio" },
  { type: "play_radio", target: "radio" }
]);
eq(normalizedActions.length, 2, "unsafe and duplicate actions removed");
eq(normalizedActions[0].autoExecute, false, "auto execution disabled");
eq(normalizedActions[0].requiresUserGesture, true, "user gesture required");
ok(!("url" in normalizedActions[0]), "model URL removed");
eq(normalizedActions[1].target, "live", "radio target normalized");

// Site bridge
const bridge = sitebridge.build({
  guideContext: ctx,
  guideActions: [
    { type: "open_roku", target: "roku", label: "Open Roku", url: "https://evil.invalid" },
    { type: "shell_command", target: "home" }
  ]
});
eq(bridge.enabled, true, "sitebridge enabled for guide metadata");
eq(bridge.nonAuthority, true, "sitebridge non-authority");
eq(bridge.finalReplyAuthority, false, "sitebridge no final reply authority");
eq(bridge.guideShell.contextAware, true, "sitebridge context aware");
eq(bridge.guideShell.structuredActions, true, "sitebridge structured actions");
eq(bridge.actionPolicy.externalUrlsAcceptedFromModel, false, "sitebridge blocks model URLs");
eq(bridge.guideActions.length, 1, "sitebridge sanitizes actions");

// Projection preserves reply authority
const chatProjected = chat.attachNyxGuideOrchestration(
  { ok: true, reply: "Open Sandblast TV when you are ready.", payload: { reply: "Open Sandblast TV when you are ready." } },
  { ...ctx, currentLane: "home" }
);
eq(chatProjected.reply, "Open Sandblast TV when you are ready.", "chat reply unchanged");
ok(hasAction(chatProjected.guideActions, "open_tv", "watch"), "chat projection attaches TV action");
eq(chatProjected.guideOrchestration.replyAuthority, "marion_final_only", "chat Marion authority retained");
eq(chatProjected.guideOrchestration.actionExecutionAuthority, "client_user_gesture", "chat client execution authority");
eq(chatProjected.sessionPatch.nyxGuideContinuity.privateMemoryAccess, false, "chat continuity public-only");

const composerProjected = composer.attachNyxGuideComposerMetadata(
  { reply: "Sandblast Radio is ready.", spokenText: "Sandblast Radio is ready.", finalEnvelope: { reply: "Sandblast Radio is ready.", final: true } },
  { ...ctx, currentLane: "home" }
);
eq(composerProjected.reply, "Sandblast Radio is ready.", "composer reply unchanged");
eq(composerProjected.spokenText, "Sandblast Radio is ready.", "composer speech text unchanged");
eq(composerProjected.finalEnvelope.reply, "Sandblast Radio is ready.", "final envelope reply unchanged");
eq(composerProjected.finalEnvelope.guideMetadataAdvisoryOnly, true, "final guide metadata advisory");

const conciergeProjected = concierge.attachNyxGuideConcierge(
  { action: "clarify", route: "general", needsClarifier: true, clarifier: "Which area?" },
  { ...ctx, currentLane: "home" }
);
eq(conciergeProjected.guideDecision.finalReplyAuthority, false, "concierge cannot author final reply");
eq(conciergeProjected.guideDecision.executionAuthority, "client_user_gesture", "concierge action authority");
ok(Array.isArray(conciergeProjected.guideActions), "concierge action array");

const routed = router.attachNyxGuideRouting(
  { primary: "general", routing: { primaryDomain: "general" } },
  { ...ctx, currentLane: "roku" }
);
eq(routed.guideRouting.nonAuthority, true, "domain routing guide metadata non-authority");
eq(routed.guideContext.currentLane, "roku", "domain routing context carried");

const continuity = state.normalizeNyxGuideContinuity(
  ctx,
  {},
  [{ type: "open_roku", target: "roku" }],
  []
);
eq(continuity.currentLane, "live", "state normalizes current radio lane");
eq(continuity.pendingActions[0].type, "open_roku", "state persists symbolic action");
eq(continuity.pendingActions[0].targetLane, "roku", "state persists bounded target");
eq(continuity.noRawUserTextStored, true, "state does not store raw user text");
eq(continuity.privateMemoryAccess, false, "state blocks private memory access");
ok(continuity.expiresAt > continuity.updatedAt, "state continuity expires");

const completed = state.normalizeNyxGuideContinuity(
  ctx,
  continuity,
  [],
  [{ type: "play_radio", target: "live", status: "completed" }]
);
eq(completed.lastCompletedAction, "play_radio", "completed action recorded");
eq(completed.lastCompletedLane, "live", "completed action lane recorded");

// Static integration checks
const indexText = fs.readFileSync(path.join(root, "index.js"), "utf8");
ok(indexText.includes("nyx.guideOrchestration.indexBoundary/2.0-steps1-3"), "index orchestration boundary");
ok(indexText.includes("step1PersistentGuideShell: true"), "index Step 1 enabled");
ok(indexText.includes("step2PageAndEcosystemContext: true"), "index Step 2 enabled");
ok(indexText.includes("step3NavigationAndMediaActions: true"), "index Step 3 enabled");
ok(indexText.includes("externalModelUrlsAllowed: false"), "index blocks external model URLs");
ok(indexText.includes('"Utils/chatEngine.js"'), "index health tracks chat engine");
ok(indexText.includes('"Data/marion/runtime/DomainConcierge.js"'), "index health tracks concierge");

const voiceText = fs.readFileSync(path.join(root, "Routes", "voiceRoute.js"), "utf8");
ok(!voiceText.includes("clientVoiceOverrideAllowed: true"), "voice does not expose override as enabled constant");
ok(voiceText.includes("requiresUserGesture: true"), "voice actions require gesture");
ok(voiceText.includes("guideActions: input.guideActions"), "voice carries guide actions");
ok(voiceText.includes("res.end(buffer)"), "voice binary integrity retained");

// Widget validation
const widgetPath = process.env.SB_WIDGET_PATH || path.resolve(root, "..", "Sandblast_Nyx_Guide_Steps_1_2_3_v17.html");
const widget = fs.readFileSync(widgetPath, "utf8");
const bytes = Buffer.byteLength(widget, "utf8");
ok(bytes <= 49999, `widget byte ceiling: ${bytes}`);
ok(widget.includes("ecosystem-v17"), "widget v17 client marker");
ok(widget.includes("nyx.guideContext/1.0"), "widget sends guide context contract");
ok(widget.includes("guideActions"), "widget reads structured actions");
ok(widget.includes("requiresUserGesture") || widget.includes("b.onclick=()=>xa"), "widget actions execute by click");
ok(widget.includes("mediaState:{radioPlaying:"), "widget sends media state");
ok(widget.includes("nyx_lane"), "widget carries symbolic lane across pages");
ok(widget.includes("C.goal"), "widget persists goal");
ok(!widget.includes("SB_RESEMBLE_VOICE_UUID"), "widget contains no public voice UUID");
ok(!/javascript:/i.test(widget), "widget contains no javascript URL");
const ids = [...widget.matchAll(/\sid=([A-Za-z][\w:-]*)/g)].map((m) => m[1]);
eq(new Set(ids).size, ids.length, "widget has no duplicate IDs");
const scripts = [...widget.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
ok(scripts.length >= 2, "widget inline scripts found");
for (const script of scripts) {
  assertions += 1;
  new Function(script);
}

// Exact deployment paths
for (const rel of [
  "index.js",
  "sitebridge.js",
  "Utils/chatEngine.js",
  "Utils/domainRouter.js",
  "Utils/stateSpine.js",
  "Routes/voiceRoute.js",
  "Data/marion/runtime/composeMarionResponse.js",
  "Data/marion/runtime/DomainConcierge.js",
  "Data/marion/runtime/nyx_state_controller.js",
  "Data/marion/runtime/NyxAnimationEngineAdapter.js",
  "Data/marion/runtime/NyxSpeechTimingAdapter.js",
  "Data/marion/runtime/NyxEmotionMotionBridge.js"
]) {
  ok(fs.existsSync(path.join(root, rel)), `package contains ${rel}`);
}

console.log(JSON.stringify({
  ok: true,
  assertions,
  widgetBytes: bytes,
  widgetHeadroom: 49999 - bytes,
  steps: {
    persistentGuideShell: true,
    pageContextAwareness: true,
    structuredNavigationAndMediaActions: true
  }
}));
