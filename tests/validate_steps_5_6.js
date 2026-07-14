
"use strict";

const assert = require("assert");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let assertions = 0;
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function equal(actual, expected, message) { assert.strictEqual(actual, expected, message); assertions += 1; }
function noSecret(value, message) {
  const text = JSON.stringify(value);
  assert.ok(!/secret-value|api[_-]?token|authorization/i.test(text), message);
  assertions += 1;
}

const sitebridge = require(path.join(ROOT, "sitebridge.js"));
const site = sitebridge.build({
  sessionId: "public-session-42",
  surface: "sandblast.tv",
  previousSurface: "sandblast.channel",
  page: "/watch",
  previousPage: "/",
  lane: "tv",
  previousLane: "home",
  guideState: "guiding",
  voiceEnabled: true,
  reducedMotion: false,
  conversationCarry: {
    goal: "watch classic programming",
    intent: "media_request",
    lastDestination: "sandblast.tv",
    lastUserText: "Show me something classic.",
    lastNyxReply: "Opening Sandblast TV."
  },
  mediaState: {
    kind: "video",
    playing: true,
    contentId: "classic-01",
    positionSec: 32,
    durationSec: 5400
  },
  televisionGuide: {
    enabled: true,
    deviceClass: "smart_tv",
    inputMode: "remote",
    captionsEnabled: true
  },
  actions: [
    { type: "tv_play_pause", target: "watch", label: "Play or pause" },
    { type: "tv_back", target: "home", label: "Back" },
    { type: "open_tv", target: "watch", label: "Open TV" },
    { type: "dismiss_guide", target: "watch", label: "Dismiss" },
    { type: "navigate", target: "news", label: "News" }
  ],
  apiToken: "secret-value"
});

equal(site.nonAuthority, true, "sitebridge must remain non-authoritative");
equal(site.finalReplyAuthority, false, "sitebridge must not gain reply authority");
equal(site.publicGuideContinuity.contract, "nyx.guideContinuity/1.0", "continuity contract");
equal(site.publicGuideContinuity.surface, "sandblast.tv", "current surface");
equal(site.publicGuideContinuity.previousSurface, "sandblast.channel", "previous surface");
equal(site.publicGuideContinuity.handoff.active, true, "handoff should be active");
equal(site.publicGuideContinuity.privateMemoryAccess, false, "public continuity cannot access private memory");
equal(site.publicGuideContinuity.conversationCarry.goal, "watch classic programming", "goal carry");
equal(site.publicGuideContinuity.mediaState.playing, true, "media state carry");
equal(site.televisionGuide.contract, "nyx.televisionGuide/1.0", "television contract");
equal(site.televisionGuide.enabled, true, "television mode enabled");
equal(site.televisionGuide.remotePrimary, true, "remote must be primary");
equal(site.televisionGuide.captionsRequired, true, "captions required");
equal(site.televisionGuide.continuousListening, false, "continuous listening forbidden");
equal(site.televisionGuide.autoSpeak, false, "auto speak forbidden");
equal(site.televisionGuide.interruptPlayback, false, "guide cannot auto interrupt playback");
equal(site.televisionGuide.focus.preserveNativeBack, true, "native back preserved");
equal(site.televisionGuide.focus.preserveNativePlayPause, true, "native play pause preserved");
equal(site.guideActions.length, 4, "TV action list capped at four");
ok(site.guideActions.every((x) => x.requiresUserGesture && x.remoteSafe), "TV actions require gesture and are remote safe");
noSecret(site, "sitebridge must not carry credentials");

const Controller = require(path.join(ROOT, "Data/marion/runtime/nyx_state_controller.js"));
const controller = new Controller({ persistGuideUiState: false, autoBindVoiceEvents: false });
const continuity = controller.configurePublicContinuity({
  sessionId: "public-session-42",
  surface: "sandblast.channel",
  page: "/",
  lane: "home",
  conversationCarry: { goal: "find cartoons" }
});
equal(continuity.contract, "nyx.guideContinuity/1.0", "controller continuity contract");
const handoff = controller.beginSurfaceHandoff("sandblast.tv", {
  page: "/watch",
  lane: "watch",
  conversationCarry: { lastDestination: "sandblast.tv" }
});
equal(handoff.handoff.active, true, "controller begins handoff");
equal(handoff.previousSurface, "sandblast.channel", "controller tracks previous surface");
equal(handoff.surface, "sandblast.tv", "controller tracks destination surface");
const tv = controller.configureTelevisionGuide({
  enabled: true,
  deviceClass: "roku",
  inputMode: "remote",
  explicitVoiceRequest: false
});
equal(tv.deviceClass, "roku", "controller Roku device class");
equal(tv.continuousListening, false, "controller TV continuous listening disabled");
equal(controller.setTelevisionFocus("play_button"), true, "controller focus update");
const snapshot = controller.getGuideSnapshot();
equal(snapshot.publicGuideContinuity.contract, "nyx.guideContinuity/1.0", "snapshot continuity");
equal(snapshot.televisionGuide.contract, "nyx.televisionGuide/1.0", "snapshot TV contract");
equal(snapshot.televisionGuide.focus.target, "play_button", "snapshot focus target");
controller.destroy();

const voiceRoute = require(path.join(ROOT, "Routes/voiceRoute.js"));
const vc = voiceRoute.normalizePublicGuideContinuity({
  sessionId: "public-session-42",
  surface: "sandblast.roku",
  previousSurface: "sandblast.channel",
  lane: "roku"
});
equal(vc.handoff.active, true, "voice route continuity handoff");
const vtv = voiceRoute.normalizeTelevisionGuide({
  televisionGuide: { enabled: true, deviceClass: "roku", inputMode: "remote" }
}, vc);
equal(vtv.enabled, true, "voice route TV enabled");
equal(vtv.voiceActivation, "explicit_user_request", "TV voice activation explicit");
equal(vtv.interruptPlayback, false, "voice route cannot interrupt playback");

process.env.SB_TV_TTS_REQUIRE_EXPLICIT_REQUEST = "true";
function makeResponse() {
  return {
    headers: {},
    statusCode: 200,
    headersSent: false,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.value = value; this.headersSent = true; return value; },
    end(value) { this.value = value; this.headersSent = true; return value; }
  };
}
(async () => {
  const res = makeResponse();
  await voiceRoute({
    method: "POST",
    headers: {},
    query: {},
    body: {
      text: "This television response should not play until the viewer explicitly asks for it.",
      sessionId: "public-session-42",
      surface: "sandblast.roku",
      televisionGuide: {
        enabled: true,
        deviceClass: "roku",
        inputMode: "remote",
        explicitVoiceRequest: false
      }
    }
  }, res);
  equal(res.statusCode, 409, "TV implicit voice request blocked when enforcement enabled");
  equal(res.value.code, "TV_EXPLICIT_VOICE_REQUEST_REQUIRED", "specific TV voice gate code");
  equal(res.value.televisionGuide.autoSpeak, false, "TV error preserves auto-speak policy");
  equal(res.headers["x-sb-tv-guide"], "1", "TV response header");
  delete process.env.SB_TV_TTS_REQUIRE_EXPLICIT_REQUEST;

  const modules = [
    "Utils/chatEngine.js",
    "Utils/stateSpine.js",
    "Data/marion/runtime/composeMarionResponse.js",
    "Data/marion/runtime/marionBridge.js",
    "Data/marion/runtime/marionFinalEnvelope.js",
    "Data/marion/runtime/nyx_pack_runtime_adapter.js"
  ];

  for (const rel of modules) {
    const mod = require(path.join(ROOT, rel));
    ok(typeof mod.attachNyxEcosystemContinuity === "function", `${rel} helper export`);
    const output = mod.attachNyxEcosystemContinuity(
      { ok: true, reply: "Opening the television guide.", payload: {} },
      {
        sessionId: "public-session-42",
        surface: "sandblast.tv",
        previousSurface: "sandblast.channel",
        page: "/watch",
        lane: "watch",
        televisionGuide: {
          enabled: true,
          deviceClass: "smart_tv",
          inputMode: "remote"
        },
        token: "secret-value"
      }
    );
    equal(output.reply, "Opening the television guide.", `${rel} preserves reply`);
    equal(output.publicGuideContinuity.contract, "nyx.guideContinuity/1.0", `${rel} continuity contract`);
    equal(output.televisionGuide.contract, "nyx.televisionGuide/1.0", `${rel} television contract`);
    equal(output.payload.publicGuideContinuity.privateMemoryAccess, false, `${rel} payload private memory lock`);
    noSecret(output, `${rel} credential scrub`);
  }

  const packet = require(path.join(ROOT, "Data/marion/runtime/nyx_pack_runtime_adapter.js"));
  const packetProjection = packet.attachNyxEcosystemContinuity(
    { ok: true, reply: "Guide metadata only." },
    { surface: "sandblast.roku", televisionGuide: { enabled: true, deviceClass: "roku" } }
  );
  equal(packetProjection.packetGuideMetadataOnly, true, "packet guide remains metadata only");
  equal(packetProjection.packetGuideReplyAuthority, false, "packet guide cannot gain reply authority");

  console.log(JSON.stringify({
    ok: true,
    assertions,
    contracts: {
      continuity: "nyx.guideContinuity/1.0",
      television: "nyx.televisionGuide/1.0"
    },
    nativeRokuSceneGraphModified: false
  }));
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
