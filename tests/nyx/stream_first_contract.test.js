"use strict";

const assert = require("assert");
const path = require("path");

const TTS_PATH = path.join(__dirname, "..", "Utils", "tts.js");

function wavBuffer() {
  const dataBytes = 64;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(48000, 24);
  buffer.writeUInt32LE(96000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 44; i < buffer.length; i += 2) buffer.writeInt16LE((i * 31) % 32767, i);
  return buffer;
}

function mp3Buffer() {
  return Buffer.concat([Buffer.from("ID3", "ascii"), Buffer.alloc(256, 1)]);
}

function headersObject(values) {
  const normalized = Object.entries(values).map(([k, v]) => [String(k).toLowerCase(), String(v)]);
  return { entries: () => normalized[Symbol.iterator]() };
}

function response(status, contentType, buffer) {
  return {
    status,
    headers: headersObject({ "content-type": contentType }),
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
}

function loadTts(mode, fetchImpl) {
  delete require.cache[require.resolve(TTS_PATH)];
  process.env.RESEMBLE_API_TOKEN = "test-token";
  process.env.RESEMBLE_VOICE_UUID = "83e8aa35";
  process.env.RESEMBLE_STREAM_URL = "https://f.cluster.resemble.ai/stream";
  process.env.RESEMBLE_SYNTH_URL = "https://f.cluster.resemble.ai/synthesize";
  process.env.SB_TTS_TRANSPORT = mode;
  process.env.SB_TTS_PROVIDER_MAX_ATTEMPTS = "1";
  process.env.SB_TTS_MAX_ATTEMPTS = "1";
  process.env.SB_TTS_LOG_ENABLED = "false";
  global.fetch = fetchImpl;
  return require(TTS_PATH);
}

function mockRes() {
  return {
    headers: {},
    headersSent: false,
    writableEnded: false,
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = String(v); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; this.headersSent = true; this.writableEnded = true; return value; },
    send(value) { this.body = value; this.headersSent = true; this.writableEnded = true; return value; },
    end(value) { this.body = value; this.headersSent = true; this.writableEnded = true; return value; }
  };
}

(async () => {
  let calls = [];
  let tts = loadTts("stream-first", async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return response(200, "audio/wav", wavBuffer());
  });
  let out = await tts.generate("Nyx stream test", { traceId: "stream_success" });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.transport, "stream");
  assert.strictEqual(out.mimeType, "audio/wav");
  assert.ok(Buffer.isBuffer(out.buffer));
  assert.ok(calls[0].url.endsWith("/stream"));
  assert.strictEqual(calls[0].body.voice_uuid, "83e8aa35");
  assert.strictEqual(calls[0].body.precision, "PCM_16");
  assert.strictEqual(calls[0].body.sample_rate, 48000);
  assert.ok(!Object.prototype.hasOwnProperty.call(calls[0].body, "output_format"));

  calls = [];
  tts = loadTts("stream-first", async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/stream")) {
      return response(400, "application/json", Buffer.from(JSON.stringify({ success: false, message: "stream rejected for test" })));
    }
    return response(200, "application/json", Buffer.from(JSON.stringify({ success: true, audio_content: mp3Buffer().toString("base64"), output_format: "mp3" })));
  });
  out = await tts.generate("Nyx fallback test", { traceId: "fallback_success" });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.transport, "synthesize-fallback");
  assert.strictEqual(out.mimeType, "audio/mpeg");
  assert.ok(calls.some((url) => url.endsWith("/stream")));
  assert.ok(calls.some((url) => url.endsWith("/synthesize")));

  tts = loadTts("stream-only", async () => response(200, "application/json", Buffer.from(JSON.stringify({ success: true }))));
  out = await tts.generate("Nyx invalid stream test", { traceId: "stream_invalid" });
  assert.strictEqual(out.ok, false);
  assert.ok(["stream_invalid_wav", "provider_failed"].includes(out.reason));

  calls = [];
  tts = loadTts("stream-first", async (url) => {
    calls.push(String(url));
    return response(200, "audio/wav", wavBuffer());
  });
  const req = {
    method: "GET",
    originalUrl: "/api/tts?text=Nyx%20route%20test",
    url: "/api/tts?text=Nyx%20route%20test",
    query: { text: "Nyx route test" },
    params: {},
    body: {},
    headers: { accept: "audio/wav", origin: "https://sandblast.channel", "x-sb-trace-id": "route_success" }
  };
  const res = mockRes();
  await tts.handleTts(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(Buffer.isBuffer(res.body));
  assert.strictEqual(res.headers["content-type"], "audio/wav");
  assert.strictEqual(res.headers["x-sb-tts-transport"], "stream");
  assert.ok(String(res.headers["x-sb-tts-version"]).includes("v2.14.0"));

  const health = tts.health();
  assert.strictEqual(health.env.transportMode, "stream-first");
  assert.strictEqual(health.env.hasStreamEndpoint, true);
  assert.strictEqual(health.env.hasSynthesizeEndpoint, true);

  console.log("PASS stream-first contract: 24 assertions");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
