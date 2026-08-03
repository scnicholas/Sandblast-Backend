"use strict";

const assert = require("assert");
const path = require("path");

const BACKEND_ROOT = path.resolve(__dirname, "..");
const UTILS_ROOT = path.join(BACKEND_ROOT, "utils");

process.env.RESEMBLE_API_TOKEN = process.env.RESEMBLE_API_TOKEN || "test-token";
process.env.RESEMBLE_VOICE_UUID = process.env.RESEMBLE_VOICE_UUID || "83e8335f";
process.env.SB_TTS_LOG_ENABLED = "false";
process.env.SB_TTS_LOG_JSON = "false";
process.env.SB_TTS_PROVIDER_MAX_ATTEMPTS = "1";
process.env.SB_TTS_LEGACY_AUTH_FALLBACK = "false";
process.env.RESEMBLE_USE_SSML = "true";
process.env.RESEMBLE_ENABLE_PROSODY_SHAPING = "true";
process.env.SB_TTS_ALLOWED_ORIGINS =
  "https://sandblast.channel,https://www.sandblast.channel";

function makeWavBuffer(bytes = 640) {
  const size = Math.max(320, bytes);
  const buffer = Buffer.alloc(size);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(size - 8, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(8000, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(size - 44, 40);
  return buffer;
}

const wavBuffer = makeWavBuffer();
const wavBase64 = wavBuffer.toString("base64");
const calls = [];

global.fetch = async (url, options = {}) => {
  const body = JSON.parse(options.body || "{}");
  calls.push({ url: String(url), options, body });

  assert.strictEqual(String(url), "https://f.cluster.resemble.ai/synthesize");
  assert.strictEqual(options.method, "POST");
  assert.strictEqual(options.headers.Authorization, "Bearer test-token");
  assert.strictEqual(body.voice_uuid, "83e8335f");
  assert.ok(typeof body.data === "string" && body.data.length > 0);
  assert.ok(!body.data.includes("<prosody"));
  assert.ok(!body.data.includes("<break"));
  assert.ok(!Object.prototype.hasOwnProperty.call(body, "data_type"));
  assert.ok(!Object.prototype.hasOwnProperty.call(body, "segment_count"));

  const allowed = new Set([
    "voice_uuid",
    "data",
    "output_format",
    "model",
    "project_uuid",
    "sample_rate",
    "precision",
    "title",
    "use_hd",
    "apply_custom_pronunciations"
  ]);
  assert.deepStrictEqual(
    Object.keys(body).filter((key) => !allowed.has(key)),
    []
  );

  const payload = JSON.stringify({
    success: true,
    audio_content: wavBase64,
    output_format: "wav",
    sample_rate: 8000,
    duration: 0.04,
    synth_duration: 0.01
  });

  if (typeof Response === "function") {
    return new Response(payload, {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }

  return {
    status: 200,
    statusText: "OK",
    headers: { forEach(callback) { callback("application/json", "content-type"); } },
    async text() { return payload; }
  };
};

function createResponse() {
  const headers = {};
  return {
    headersSent: false,
    writableEnded: false,
    statusCode: 200,
    body: null,
    setHeader(key, value) {
      headers[String(key).toLowerCase()] = String(value);
      return this;
    },
    getHeader(key) {
      return headers[String(key).toLowerCase()];
    },
    set(key, value) {
      return this.setHeader(key, value);
    },
    type(value) {
      return this.setHeader("content-type", value);
    },
    status(code) {
      this.statusCode = Number(code);
      return this;
    },
    json(value) {
      this.headersSent = true;
      this.writableEnded = true;
      this.body = value;
      return this;
    },
    send(value) {
      this.headersSent = true;
      this.writableEnded = true;
      this.body = value;
      return this;
    },
    end(value) {
      this.headersSent = true;
      this.writableEnded = true;
      this.body = value;
      return this;
    },
    headers
  };
}

function canonicalPath(relative) {
  return path.join(BACKEND_ROOT, relative);
}

(async () => {
  const ttsPath = canonicalPath("utils/tts.js");
  const adapterPath = canonicalPath("utils/ttsProvidersResemble.js");
  const voiceRoutePath = canonicalPath("utils/voiceRoute.js");
  const voiceMountPath = canonicalPath("utils/nyxVoiceMount.js");

  for (const resolved of [ttsPath, adapterPath, voiceRoutePath, voiceMountPath]) {
    assert.ok(
      resolved.startsWith(UTILS_ROOT + path.sep),
      `Non-canonical voice dependency path: ${resolved}`
    );
  }

  const tts = require(ttsPath);
  const adapter = require(adapterPath);
  const voiceRoute = require(voiceRoutePath);
  const mountNyxVoice = require(voiceMountPath);

  assert.strictEqual(typeof tts.generate, "function");
  assert.strictEqual(typeof tts.handleTts, "function");
  assert.strictEqual(typeof tts.health, "function");
  assert.strictEqual(typeof adapter.synthesize, "function");
  assert.strictEqual(typeof voiceRoute, "function");
  assert.strictEqual(typeof voiceRoute.normalizeInput, "function");
  assert.strictEqual(typeof mountNyxVoice, "function");

  const ttsHealth = await Promise.resolve(tts.health());
  assert.strictEqual(ttsHealth.providerLoaded, true);
  assert.strictEqual(ttsHealth.tokenConfigured, true);
  assert.strictEqual(ttsHealth.voiceConfigured, true);
  assert.strictEqual(ttsHealth.moduleRoot, "utils");
  assert.strictEqual(ttsHealth.pathHardlock, true);

  const textPrompt = "Hello, Nyx. Live voice certification.";
  const textGenerated = await tts.generate(textPrompt, {
    requestId: "cert-generate-text",
    sessionId: "cert-session-text",
    turnId: "turn-1",
    inputSource: "text"
  });
  const voiceGenerated = await tts.generate({
    text: textPrompt,
    requestId: "cert-generate-voice",
    sessionId: "cert-session-voice",
    turnId: "turn-1",
    inputSource: "voice"
  });

  for (const generated of [textGenerated, voiceGenerated]) {
    assert.strictEqual(generated.ok, true);
    assert.strictEqual(generated.playable, true);
    assert.ok(Buffer.isBuffer(generated.buffer));
    assert.ok(generated.buffer.length >= 320);
    assert.strictEqual(generated.mimeType, "audio/wav");
    assert.strictEqual(generated.textDisplay, textPrompt);
    assert.strictEqual(generated.textSpeak, textPrompt);
    assert.strictEqual(generated.spokenText, textPrompt);
    assert.strictEqual(generated.voiceTextParity.aligned, true);
  }
  assert.strictEqual(textGenerated.textDisplay, voiceGenerated.textDisplay);
  assert.strictEqual(textGenerated.spokenText, voiceGenerated.spokenText);
  assert.strictEqual(textGenerated.voiceTextParity.inputSource, "text");
  assert.strictEqual(voiceGenerated.voiceTextParity.inputSource, "voice");

  assert.strictEqual(typeof adapter._decodeBase64Audio, "function");
  assert.strictEqual(typeof adapter._detectAudioBuffer, "function");
  const decoded = adapter._decodeBase64Audio(wavBase64);
  assert.strictEqual(decoded.ok, true);
  assert.ok(Buffer.isBuffer(decoded.buffer));
  const detected = adapter._detectAudioBuffer(decoded.buffer);
  assert.strictEqual(detected.mimeType, "audio/wav");
  assert.strictEqual(detected.format, "wav");

  const adapted = await adapter.synthesize({
    text: "Nyx adapter synthesis test."
  });
  assert.strictEqual(adapted.ok, true);
  assert.ok(Buffer.isBuffer(adapted.buffer));
  assert.strictEqual(adapted.mimeType, "audio/wav");

  const baseRequest = {
    method: "POST",
    query: {},
    params: {},
    headers: {
      origin: "https://www.sandblast.channel",
      accept: "audio/*,application/json,*/*",
      "content-type": "application/json",
      "x-sb-response-mode": "audio-first"
    },
    body: {
      text: "Nyx route test.",
      textDisplay: "Nyx route test.",
      voiceUuid: "83e8335f",
      inputSource: "text",
      sessionId: "cert-route",
      turnId: "turn-1"
    }
  };

  const res = createResponse();
  await tts.handleTts(baseRequest, res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(Buffer.isBuffer(res.body));
  assert.strictEqual(res.headers["content-type"], "audio/wav");

  const parityReq = {
    method: "POST",
    query: {},
    params: {},
    headers: {
      origin: "https://www.sandblast.channel",
      accept: "application/json",
      "content-type": "application/json",
      "x-sb-response-mode": "json",
      "x-sb-input-source": "mic"
    },
    body: {
      text: "The visible and spoken answer must remain identical.",
      textDisplay: "This conflicting display text must be normalized away.",
      inputSource: "mic",
      returnJson: true,
      sessionId: "cert-parity",
      turnId: "turn-2"
    }
  };
  const parityRes = createResponse();
  await voiceRoute(parityReq, parityRes);
  assert.strictEqual(parityRes.statusCode, 200);
  assert.strictEqual(parityRes.body.ok, true);
  assert.strictEqual(parityRes.body.playable, true);
  assert.strictEqual(parityRes.body.textDisplay, parityRes.body.spokenText);
  assert.strictEqual(parityRes.body.textSpeak, parityRes.body.spokenText);
  assert.strictEqual(parityRes.body.voiceTextParity.aligned, true);
  assert.strictEqual(parityRes.body.voiceTextParity.inputSource, "voice");
  assert.strictEqual(
    parityRes.headers["x-sb-voice-text-parity-contract"],
    "nyx.voiceTextParity/1.0"
  );
  assert.strictEqual(
    parityRes.headers["access-control-allow-origin"],
    "https://www.sandblast.channel"
  );

  const optionsRes = createResponse();
  await voiceRoute({
    method: "OPTIONS",
    query: {},
    body: {},
    headers: { origin: "https://sandblast.channel" }
  }, optionsRes);
  assert.strictEqual(optionsRes.statusCode, 204);
  assert.strictEqual(
    optionsRes.headers["access-control-allow-origin"],
    "https://sandblast.channel"
  );

  const health = await voiceRoute.health();
  assert.strictEqual(health.ok, true);
  assert.strictEqual(
    health.healthContract,
    "nyx.voice.health/1.0-strict-allowlist"
  );
  assert.strictEqual(health.moduleRoot, "utils");
  assert.strictEqual(health.pathHardlock, true);

  const routeCalls = [];
  const fakeApp = {
    locals: {},
    post(route, handler) {
      routeCalls.push({ method: "POST", route, handler });
      return this;
    },
    get(route, handler) {
      routeCalls.push({ method: "GET", route, handler });
      return this;
    },
    options(route, handler) {
      routeCalls.push({ method: "OPTIONS", route, handler });
      return this;
    }
  };
  const mountStatus = mountNyxVoice(fakeApp, {
    canonicalVoiceRoutes: true,
    compatibilityTtsRoutes: false,
    canonicalHealthRoutes: true,
    compatibilityHealthRoutes: false
  });
  assert.ok(mountStatus);
  assert.ok(routeCalls.some((item) =>
    item.method === "POST" && item.route === "/api/nyx/voice"
  ));
  assert.ok(routeCalls.some((item) =>
    item.method === "GET" && item.route === "/api/nyx/voice/health"
  ));

  assert.ok(calls.length >= 3);

  console.log(JSON.stringify({
    ok: true,
    certification: "NYX_VOICE_TEXT_PARITY_E2E",
    calls: calls.length,
    canonicalRoot: "utils",
    ttsVersion: tts.TTS_VERSION,
    adapterVersion: adapter.VERSION,
    voiceRouteVersion: voiceRoute.VOICE_ROUTE_VERSION,
    voiceMountVersion: mountNyxVoice.VERSION,
    audioBytes: textGenerated.buffer.length,
    parity: {
      displayEqualsSpoken: true,
      textInputSource: textGenerated.voiceTextParity.inputSource,
      voiceInputSource: voiceGenerated.voiceTextParity.inputSource
    },
    healthContract: health.healthContract
  }, null, 2));
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
