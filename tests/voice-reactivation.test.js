"use strict";

const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");

function fresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function makeRes() {
  return {
    headers: {},
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    body: null,
    mode: "",
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = String(v); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.mode = "json"; this.body = value; this.headersSent = true; this.writableEnded = true; return value; },
    send(value) { this.mode = "send"; this.body = value; this.headersSent = true; this.writableEnded = true; return value; }
  };
}

async function testVoiceRouteBinaryDefault() {
  const ttsPath = path.join(root, "tts.js");
  const routePath = path.join(root, "voiceRoute.js");
  const fakeAudio = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x15, 1, 2, 3, 4]);

  delete require.cache[require.resolve(routePath)];
  require.cache[require.resolve(ttsPath)] = {
    id: ttsPath,
    filename: ttsPath,
    loaded: true,
    exports: {
      async delegateTts(payload) {
        return {
          ok: true,
          provider: "resemble",
          providerStatus: 200,
          mimeType: "audio/mpeg",
          buffer: fakeAudio,
          audio: fakeAudio,
          textSpeak: payload.text,
          requestId: payload.requestId || "test"
        };
      },
      health() { return { ok: true }; }
    }
  };

  const voiceRoute = require(routePath);
  const req = {
    method: "POST",
    body: { text: "Nyx should speak." },
    query: {},
    headers: { "content-type": "application/json", accept: "*/*", "sec-fetch-dest": "empty" }
  };
  const res = makeRes();
  await voiceRoute(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.mode, "send", "JSON request body must not force a JSON audio response");
  assert(Buffer.isBuffer(res.body));
  assert.strictEqual(res.headers["content-type"], "audio/mpeg");
  assert.strictEqual(res.headers["x-sb-response-mode"], "audio");
}

async function testVoiceRouteExplicitJson() {
  const routePath = path.join(root, "voiceRoute.js");
  const voiceRoute = require(routePath);
  const req = {
    method: "POST",
    body: { text: "Nyx should speak.", returnJson: true },
    query: {},
    headers: { "content-type": "application/json", accept: "application/json" }
  };
  const res = makeRes();
  await voiceRoute(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.mode, "json");
  assert.strictEqual(res.body.playable, true);
  assert.strictEqual(typeof res.body.audioBase64, "string");
  assert(res.body.audioBase64.length > 0);
}

async function testProviderBufferPreservation() {
  const ttsPath = path.join(root, "tts.js");
  const adapterPath = path.join(root, "ttsProvidersResemble.js");
  const fakeAudio = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 1, 2, 3, 4]);
  require.cache[require.resolve(ttsPath)] = {
    id: ttsPath,
    filename: ttsPath,
    loaded: true,
    exports: {
      async generate() { return { ok: true, buffer: fakeAudio, mimeType: "audio/wav", provider: "resemble" }; }
    }
  };
  const adapter = fresh(adapterPath);
  const out = adapter.normalizeSynthesisResult({ ok: true, buffer: fakeAudio, mimeType: "audio/wav" }, { text: "Hello" });
  assert.strictEqual(out.playable, true);
  assert(Buffer.isBuffer(out.buffer));
  assert.strictEqual(out.byteLength, fakeAudio.length);
  assert.strictEqual(out.mimeType, "audio/wav");
  assert.strictEqual(out.audioBase64, fakeAudio.toString("base64"));
  const synthesized = await adapter.synthesize({ text: "Hello" });
  assert.strictEqual(synthesized.playable, true);
  assert(Buffer.isBuffer(synthesized.buffer));
}

function testRouterServerVoiceWins() {
  process.env.RESEMBLE_VOICE_UUID = "11111111-1111-4111-8111-111111111111";
  const router = fresh(path.join(root, "ttsrouter.js"));
  const out = router.routeProvider({ provider: "resemble", voiceUuid: "22222222-2222-4222-8222-222222222222" });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.meta.voiceIdValid, true);
  assert.strictEqual(out.meta.voiceConfigured, true);
  assert.strictEqual(out.meta.voiceOverrideBlocked, true);
  assert.strictEqual(out.meta.audioFirst, true);
}

async function testStaleVoiceOverrideDoesNotSilence() {
  process.env.SB_TTS_LOG_ENABLED = "false";
  process.env.RESEMBLE_API_TOKEN = "test-token";
  process.env.RESEMBLE_VOICE_UUID = "11111111-1111-4111-8111-111111111111";
  process.env.SB_TTS_MAX_CONCURRENT = "0";
  const tts = fresh(path.join(root, "tts.js"));
  const result = await tts.generate("Nyx voice lock test.", {
    voiceUuid: "22222222-2222-4222-8222-222222222222",
    traceId: "voice_lock_test"
  });
  assert.strictEqual(result.ok, false);
  assert.notStrictEqual(result.reason, "voice_contract_failed", "stale client voice UUID must not silence the server-locked Nyx voice");
  assert.strictEqual(result.reason, "concurrency_limit", "test must advance beyond voice-contract validation without network access");
}

(async () => {
  await testVoiceRouteBinaryDefault();
  await testVoiceRouteExplicitJson();
  await testProviderBufferPreservation();
  testRouterServerVoiceWins();
  await testStaleVoiceOverrideDoesNotSilence();
  console.log("PASS voice-reactivation.test.js");
})().catch((err) => {
  console.error(err && (err.stack || err));
  process.exitCode = 1;
});
