"use strict";

const assert = require("assert");
const path = require("path");

process.env.RESEMBLE_API_TOKEN = "test_api_token_not_real";
process.env.RESEMBLE_VOICE_UUID = "55592656";
process.env.RESEMBLE_SYNTH_URL = "https://f.cluster.resemble.ai/synthesize";
process.env.RESEMBLE_API_URL = "https://app.resemble.ai/api/v2"; // must be ignored for synthesis
process.env.RESEMBLE_USE_SSML = "false";
process.env.SB_TTS_PROVIDER_MAX_ATTEMPTS = "1";
process.env.SB_TTS_FAILOVER_VARIANTS = "1";
process.env.SB_TTS_LOG_ENABLED = "false";

const fakeAudio = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(253, 7)]);
const calls = [];

global.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  const body = JSON.parse(options.body || "{}");
  assert.strictEqual(options.method, "POST");
  assert.strictEqual(options.headers.Authorization, "Bearer test_api_token_not_real");
  assert.strictEqual(body.voice_uuid, "55592656");
  assert.ok(typeof body.data === "string" && body.data.toLowerCase().includes("endpoint test"));
  assert.strictEqual(body.output_format, "mp3");
  assert.ok(!Object.prototype.hasOwnProperty.call(body, "model"), "model must remain optional");
  return new Response(JSON.stringify({
    success: true,
    audio_content: fakeAudio.toString("base64"),
    output_format: "mp3",
    duration: 1.2,
    synth_duration: 0.4,
    issues: []
  }), { status: 200, headers: { "content-type": "application/json" } });
};

(async () => {
  const tts = require(path.join(__dirname, "tts.js"));
  const endpoint = tts.getSynthesizeEndpointState();
  assert.strictEqual(endpoint.valid, true);
  assert.strictEqual(endpoint.configured, true);
  assert.strictEqual(endpoint.source, "RESEMBLE_SYNTH_URL");
  assert.strictEqual(endpoint.host, "f.cluster.resemble.ai");
  assert.strictEqual(endpoint.path, "/synthesize");

  process.env.RESEMBLE_SYNTH_URL = "https://f.cluster.resemble.ai";
  const normalizedBase = tts.getSynthesizeEndpointState();
  assert.strictEqual(normalizedBase.valid, true);
  assert.strictEqual(normalizedBase.url, "https://f.cluster.resemble.ai/synthesize");

  process.env.RESEMBLE_SYNTH_URL = "https://app.resemble.ai/api/v2";
  const invalidConfigured = tts.getSynthesizeEndpointState();
  assert.strictEqual(invalidConfigured.source, "built_in_default");
  assert.ok(invalidConfigured.invalidConfiguredKeys.includes("RESEMBLE_SYNTH_URL"));
  assert.strictEqual(invalidConfigured.url, "https://f.cluster.resemble.ai/synthesize");

  process.env.RESEMBLE_SYNTH_URL = "https://f.cluster.resemble.ai/synthesize";
  const health = await Promise.resolve(tts.health());
  assert.strictEqual(health.env.hasToken, true);
  assert.strictEqual(health.env.hasVoice, true);
  assert.strictEqual(health.env.hasSynthesizeEndpoint, true);
  assert.strictEqual(health.env.synthesizeEndpointExplicitlyConfigured, true);
  assert.strictEqual(health.env.synthesizeEndpointSource, "RESEMBLE_SYNTH_URL");
  assert.deepStrictEqual(health.env.authModes, ["bearer"]);

  const voiceRoute = require(path.join(__dirname, "voiceRoute.js"));
  const voiceHealth = await voiceRoute.health();
  assert.strictEqual(voiceHealth.synthesizeEndpointConfigured, true);
  assert.strictEqual(voiceHealth.synthesizeEndpointExplicitlyConfigured, true);
  assert.strictEqual(voiceHealth.synthesizeEndpointSource, "RESEMBLE_SYNTH_URL");
  assert.strictEqual(voiceHealth.providerEndpointEnv, "RESEMBLE_SYNTH_URL");

  const chatEngine = require(path.join(__dirname, "chatEngine.js"));
  const speechContract = chatEngine.buildNyxSpeechContract({}, "Nyx endpoint test");
  assert.strictEqual(speechContract.method, "POST");
  assert.strictEqual(speechContract.synthesisMethod, "POST");
  assert.strictEqual(speechContract.playbackMethod, "GET");
  assert.strictEqual(speechContract.providerEndpointEnv, "RESEMBLE_SYNTH_URL");
  assert.strictEqual(speechContract.request.method, "POST");

  const result = await tts.generate("Nyx endpoint test", { outputFormat: "mp3" });
  assert.strictEqual(result.ok, true, JSON.stringify(result));
  assert.ok(Buffer.isBuffer(result.buffer));
  assert.strictEqual(result.buffer.length, fakeAudio.length);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, "https://f.cluster.resemble.ai/synthesize");
  assert.ok(!calls[0].url.includes("app.resemble.ai/api/v2"));

  console.log(JSON.stringify({
    ok: true,
    assertions: 35,
    endpointSource: endpoint.source,
    endpoint: `${endpoint.host}${endpoint.path}`,
    authMode: "bearer",
    bytes: result.buffer.length,
    requestUrl: calls[0].url
  }, null, 2));
})().catch((err) => {
  console.error(err && (err.stack || err));
  process.exit(1);
});
