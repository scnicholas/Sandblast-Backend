"use strict";

const assert = require("assert");
const path = require("path");

process.env.RESEMBLE_API_TOKEN = process.env.RESEMBLE_API_TOKEN || "test-token";
process.env.RESEMBLE_VOICE_UUID = process.env.RESEMBLE_VOICE_UUID || "83e8335f";
process.env.SB_TTS_LOG_ENABLED = "false";
process.env.SB_TTS_PROVIDER_MAX_ATTEMPTS = "1";
process.env.SB_TTS_LEGACY_AUTH_FALLBACK = "false";
process.env.RESEMBLE_USE_SSML = "true";
process.env.RESEMBLE_ENABLE_PROSODY_SHAPING = "true";
process.env.SB_TTS_ALLOWED_ORIGINS = "https://sandblast.channel,https://www.sandblast.channel";

const wavBase64 = "UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAA=";
const calls = [];

global.fetch = async (url, options = {}) => {
  const body = JSON.parse(options.body || "{}");
  calls.push({ url: String(url), options, body });
  assert.strictEqual(String(url), "https://f.cluster.resemble.ai/synthesize");
  assert.strictEqual(options.method, "POST");
  assert.strictEqual(options.headers.Authorization, "Bearer test-token");
  assert.strictEqual(body.voice_uuid, "83e8335f");
  assert.ok(body.data.startsWith('<speak version="1.1">'));
  assert.ok(!body.data.includes("<prosody"));
  assert.ok(!body.data.includes("<break"));
  assert.ok(!Object.prototype.hasOwnProperty.call(body, "data_type"));
  assert.ok(!Object.prototype.hasOwnProperty.call(body, "segment_count"));
  const allowed = new Set(["voice_uuid", "data", "output_format", "model", "project_uuid", "sample_rate", "precision", "title", "use_hd", "apply_custom_pronunciations"]);
  assert.deepStrictEqual(Object.keys(body).filter((key) => !allowed.has(key)), []);
  return new Response(JSON.stringify({
    success: true,
    audio_content: wavBase64,
    output_format: "wav",
    sample_rate: 8000,
    duration: 0.01,
    synth_duration: 0.01
  }), { status: 200, headers: { "content-type": "application/json" } });
};

function createResponse() {
  const headers = {};
  return {
    headersSent: false,
    statusCode: 200,
    body: null,
    setHeader(key, value) { headers[String(key).toLowerCase()] = String(value); },
    getHeader(key) { return headers[String(key).toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.headersSent = true; this.body = value; return this; },
    send(value) { this.headersSent = true; this.body = value; return this; },
    end(value) { this.headersSent = true; this.body = value; return this; },
    headers
  };
}

(async () => {
  const ttsPath = path.join(__dirname, "..", "Routes", "tts.js");
  const adapterPath = path.join(__dirname, "..", "Routes", "ttsProvidersResemble.js");
  const voiceRoutePath = path.join(__dirname, "..", "Routes", "voiceRoute.js");
  const tts = require(ttsPath);

  assert.strictEqual(typeof tts.generate, "function");
  assert.strictEqual(typeof tts.handleTts, "function");
  assert.strictEqual(typeof tts.health, "function");

  const generated = await tts.generate("Hello, Nyx. Live voice certification.", { requestId: "cert-generate" });
  assert.strictEqual(generated.ok, true);
  assert.ok(Buffer.isBuffer(generated.buffer));
  assert.ok(generated.buffer.length >= 16);
  assert.strictEqual(generated.mimeType, "audio/wav");

  const adapter = require(adapterPath);
  const rawNormalized = adapter.normalizeSynthesisResult({
    success: true,
    audio_content: wavBase64,
    output_format: "wav",
    provider: "resemble"
  }, { text: "Adapter audio_content test" });
  assert.strictEqual(rawNormalized.playable, true);
  assert.ok(Buffer.isBuffer(rawNormalized.buffer));
  assert.strictEqual(rawNormalized.mimeType, "audio/wav");

  const adapted = await adapter.synthesize({ text: "Nyx adapter synthesis test." });
  assert.strictEqual(adapted.playable, true);
  assert.ok(Buffer.isBuffer(adapted.buffer));

  const req = {
    method: "POST",
    body: { text: "Nyx route test.", voiceUuid: "83e8335f" },
    query: {},
    params: {},
    headers: {
      origin: "https://www.sandblast.channel",
      accept: "audio/*,application/json,*/*",
      "content-type": "application/json",
      "x-sb-response-mode": "audio-first"
    }
  };
  const res = createResponse();
  await tts.handleTts(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(Buffer.isBuffer(res.body));
  assert.strictEqual(res.headers["content-type"], "audio/wav");
  assert.strictEqual(res.headers["access-control-allow-origin"], "https://www.sandblast.channel");
  assert.strictEqual(res.headers["x-sb-response-mode"], "audio");

  const optionsRes = createResponse();
  await tts.handleTts({ method: "OPTIONS", headers: { origin: "https://sandblast.channel" } }, optionsRes);
  assert.strictEqual(optionsRes.statusCode, 204);
  assert.strictEqual(optionsRes.headers["access-control-allow-origin"], "https://sandblast.channel");

  const voiceRoute = require(voiceRoutePath);
  const routeRes = createResponse();
  await voiceRoute(req, routeRes);
  assert.strictEqual(routeRes.statusCode, 200);
  assert.ok(Buffer.isBuffer(routeRes.body));
  assert.strictEqual(routeRes.headers["access-control-allow-origin"], "https://www.sandblast.channel");

  assert.ok(calls.length >= 4);
  console.log(JSON.stringify({
    ok: true,
    calls: calls.length,
    ttsVersion: tts.TTS_VERSION,
    adapterVersion: adapter.VERSION,
    voiceRouteVersion: voiceRoute.VOICE_ROUTE_VERSION,
    audioBytes: generated.buffer.length
  }, null, 2));
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
