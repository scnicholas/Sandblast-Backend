"use strict";

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");

const root = path.resolve(__dirname, "..");
let assertions = 0;
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function eq(actual, expected, message) { assert.strictEqual(actual, expected, message); assertions += 1; }

// Site bridge: active for UI data only, never reply authority.
const sitebridge = require(path.join(root, "sitebridge.js"));
const bridge = sitebridge.build({
  sessionId: "session-1",
  guideContext: {
    surface: "sandblast.channel",
    currentLane: "live",
    state: "listening",
    panelOpen: true,
    voiceEnabled: true
  }
});
eq(bridge.ok, true, "sitebridge should build");
eq(bridge.enabled, true, "guide data bridge should be enabled");
eq(bridge.nonAuthority, true, "sitebridge must remain non-authoritative");
eq(bridge.finalReplyAuthority, false, "sitebridge must not shape final replies");
eq(bridge.audioAuthority, "tts_route", "TTS route remains audio authority");
eq(bridge.context.lane, "live", "guide lane should be preserved");
eq(bridge.context.state, "listening", "guide state should be preserved");

// State controller: guide state separate from facial state and persistence-safe.
const NyxStateController = require(path.join(root, "Data/marion/runtime/nyx_state_controller.js"));
const controller = new NyxStateController({
  autoBindVoiceEvents: false,
  persistGuideUiState: false,
  reducedMotion: true
});
controller.setPanelOpen(true);
controller.setGuideState("listening");
let snap = controller.getGuideSnapshot();
eq(snap.guideState, "listening", "controller guide state");
eq(snap.panelOpen, true, "controller panel state");
eq(snap.reducedMotion, true, "controller reduced motion");
controller.setVoiceEnabled(false);
snap = controller.getGuideSnapshot();
eq(snap.voiceEnabled, false, "controller voice preference");
eq(snap.guideState, "quiet", "voice-off should enter quiet state");
controller.destroy();

// Animation adapter: persistent avatar must remain ready without speech.
const animation = require(path.join(root, "Data/marion/runtime/NyxAnimationEngineAdapter.js"));
const idlePacket = animation.buildNyxAnimationEnginePacket({
  enabled: true,
  guideState: "available",
  playable: false
});
eq(idlePacket.frontendReady, true, "avatar must be ready without speech");
eq(idlePacket.speechReady, false, "speech should remain separate");
eq(idlePacket.guideState, "available", "guide state should be available");
eq(idlePacket.channels.mouth, "rest", "idle guide should not move mouth");
const speakingPacket = animation.buildNyxAnimationEnginePacket({
  enabled: true,
  guideState: "thinking",
  playable: true,
  visemes: [{ id: "A" }]
});
eq(speakingPacket.guideState, "speaking", "playable audio should promote speaking state");
eq(speakingPacket.channels.mouth, "viseme_sequence", "visemes should drive mouth");

// Timing adapter: provider duration outranks estimate.
const timing = require(path.join(root, "Data/marion/runtime/NyxSpeechTimingAdapter.js"));
const providerClock = timing.buildSpeechTiming("Hello from Nyx.", { actualDurationMs: 2400 });
eq(providerClock.clockSource, "provider_audio", "provider duration should be authoritative");
eq(providerClock.actualDurationMs, 2400, "actual duration should be preserved");
eq(providerClock.estimatedDurationMs, 2400, "timing should use actual duration");
ok(providerClock.wordTimings.every((item, index, arr) => index === 0 || item.startMs >= arr[index - 1].endMs), "word timings must be monotonic");

// Motion bridge: ambient guide motion independent of speech.
const motion = require(path.join(root, "Data/marion/runtime/NyxEmotionMotionBridge.js"));
const availableMotion = motion.buildNyxEmotionMotion({
  enabled: true,
  guideState: "available",
  timing: { estimatedDurationMs: 0 }
});
eq(availableMotion.frontendReady, true, "ambient guide motion should be ready");
eq(availableMotion.speechActive, false, "ambient state should not claim speech");
eq(availableMotion.mouth.enabled, false, "ambient state mouth should rest");
ok(availableMotion.timeline.length === 1, "ambient state should expose one bounded loop cue");
const reducedMotion = motion.buildNyxEmotionMotion({
  enabled: true,
  guideState: "available",
  reducedMotion: true
});
eq(reducedMotion.timeline.length, 0, "reduced motion should suppress ambient loop");

// Voice route integration with mocked TTS module.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nyx-guide-voice-"));
fs.mkdirSync(path.join(tempRoot, "Routes"), { recursive: true });
fs.mkdirSync(path.join(tempRoot, "Utils"), { recursive: true });
fs.copyFileSync(path.join(root, "Routes/voiceRoute.js"), path.join(tempRoot, "Routes/voiceRoute.js"));
fs.writeFileSync(path.join(tempRoot, "Utils/tts.js"), `
"use strict";
module.exports.handleTts = async function(req, res) {
  global.__nyxMockTtsBody = req.body;
  const audio = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(2048)]);
  res.status(200);
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("X-SB-TTS-Upstream-Status", "200");
  return res.end(audio);
};
module.exports.health = async function(){ return { ok:true, configured:true }; };
`, "utf8");

process.env.RESEMBLE_VOICE_UUID = "server-voice";
process.env.SB_TTS_ALLOW_CLIENT_VOICE_OVERRIDE = "false";
delete require.cache[require.resolve(path.join(tempRoot, "Routes/voiceRoute.js"))];
const voiceRoute = require(path.join(tempRoot, "Routes/voiceRoute.js"));

function mockResponse() {
  const headers = {};
  return {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    body: null,
    setHeader(key, value) { headers[String(key).toLowerCase()] = String(value); },
    getHeader(key) { return headers[String(key).toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; this.headersSent = true; this.writableEnded = true; return this; },
    end(value) { this.body = value; this.headersSent = true; this.writableEnded = true; return this; },
    send(value) { return this.end(value); },
    _headers: headers
  };
}

(async () => {
  const req = {
    method: "POST",
    headers: { accept: "audio/mpeg", origin: "https://sandblast.channel" },
    query: {},
    body: {
      text: "Nyx guide test",
      voiceUuid: "client-override",
      inputSource: "voice",
      guideContext: {
        currentLane: "watch",
        guideState: "thinking",
        panelOpen: true,
        voiceEnabled: true
      }
    }
  };
  const res = mockResponse();
  await voiceRoute(req, res);
  eq(res.statusCode, 200, "voice route status");
  ok(Buffer.isBuffer(res.body), "voice route should deliver binary audio");
  eq(res._headers["content-type"], "audio/mpeg", "voice route MIME");
  eq(res._headers["x-sb-tts-audio-signature"], "ID3", "voice route signature");
  eq(global.__nyxMockTtsBody.voiceUuid, "server-voice", "client voice override must be blocked");
  eq(global.__nyxMockTtsBody.guideContext.currentLane, "watch", "guide lane must reach TTS boundary");
  eq(global.__nyxMockTtsBody.guideContext.panelOpen, true, "panel state must reach TTS boundary");

  fs.rmSync(tempRoot, { recursive: true, force: true });

  // Index and widget static boundaries.
  const indexSource = fs.readFileSync(path.join(root, "index.js"), "utf8");
  ok(indexSource.includes("NYX_PERSISTENT_GUIDE_SHELL_R1_START"), "index guide boundary marker");
  ok(indexSource.includes("/api/nyx/guide/config"), "index config route");
  ok(indexSource.includes("/api/nyx/guide/health"), "index health route");
  ok(indexSource.includes("finalReplyAuthority: false"), "index guide boundary must stay non-authoritative");

  const widgetPath = path.resolve(root, "Sandblast_Nyx_Persistent_Guide_Widget_v16.html");
  const widgetSource = fs.readFileSync(widgetPath, "utf8");
  ok(Buffer.byteLength(widgetSource, "utf8") <= 49999, "widget byte ceiling");
  ok(widgetSource.includes("id=nyxDock"), "widget compact guide dock");
  ok(widgetSource.includes("id=vt"), "widget voice preference control");
  ok(widgetSource.includes("sb_nyx_shell"), "widget guide preference persistence");
  ok(widgetSource.includes("nyx:guide:"), "widget guide lifecycle events");

  console.log(JSON.stringify({ ok: true, assertions }));
})().catch((err) => {
  console.error(err && (err.stack || err));
  process.exit(1);
});
