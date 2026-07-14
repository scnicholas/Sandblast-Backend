"use strict";
const assert = require("assert");
const path = require("path");
const TTS_PATH = path.join(__dirname, "..", "Utils", "tts.js");

function wavBuffer() {
  const dataBytes = 128;
  const b = Buffer.alloc(44 + dataBytes);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(48000, 24);
  b.writeUInt32LE(96000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36, "ascii");
  b.writeUInt32LE(dataBytes, 40);
  return b;
}
function headersObject(values) {
  const entries = Object.entries(values).map(([k,v]) => [String(k).toLowerCase(), String(v)]);
  return { entries: () => entries[Symbol.iterator]() };
}
function response(status, contentType, buffer) {
  return {
    status,
    headers: headersObject({"content-type": contentType}),
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
}
function load(fetchImpl, mode="compat-first") {
  delete require.cache[require.resolve(TTS_PATH)];
  process.env.RESEMBLE_API_TOKEN = "test-token";
  process.env.RESEMBLE_VOICE_UUID = "83e8aa35";
  process.env.RESEMBLE_SYNTH_URL = "https://f.cluster.resemble.ai/synthesize";
  process.env.RESEMBLE_STREAM_URL = "https://f.cluster.resemble.ai/stream";
  process.env.SB_TTS_TRANSPORT = mode;
  process.env.SB_TTS_AUTH_MODE = "auto";
  process.env.SB_TTS_PROVIDER_MAX_ATTEMPTS = "1";
  process.env.SB_TTS_LOG_ENABLED = "false";
  global.fetch = fetchImpl;
  return require(TTS_PATH);
}

(async () => {
  let calls = [];
  let tts = load(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({url:String(url), auth:init.headers.Authorization, body});
    const audio = wavBuffer().toString("base64");
    return response(200, "application/json", Buffer.from(JSON.stringify({success:true, audio_content:audio, output_format:"wav"})));
  });
  let out = await tts.generate("Compatibility test", {traceId:"r7_sync_raw"});
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.transport, "synthesize-compat");
  assert.ok(calls[0].url.endsWith("/synthesize"));
  assert.strictEqual(calls[0].auth, "test-token");
  assert.deepStrictEqual(Object.keys(calls[0].body).sort(), ["data","voice_uuid"]);
  assert.strictEqual(out.mimeType, "audio/wav");
  assert.ok(Buffer.isBuffer(out.buffer));

  calls = [];
  tts = load(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({url:String(url), auth:init.headers.Authorization, body});
    if (init.headers.Authorization === "test-token") {
      return response(200, "application/json", Buffer.from(JSON.stringify({success:true, issues:["no audio in raw-key probe"]})));
    }
    const audio = wavBuffer().toString("base64");
    return response(200, "application/json", Buffer.from(JSON.stringify({success:true, audio_content:audio, output_format:"wav"})));
  });
  out = await tts.generate("Two hundred without audio must continue", {traceId:"r7_200_retry"});
  assert.strictEqual(out.ok, true);
  assert.ok(calls.length >= 2);
  assert.ok(calls.some(c => c.auth === "Bearer test-token"));
  assert.strictEqual(out.transport, "synthesize-compat");

  calls = [];
  tts = load(async (url, init) => {
    calls.push({url:String(url), auth:init.headers.Authorization});
    if (String(url).endsWith("/synthesize")) {
      return response(422, "application/json", Buffer.from(JSON.stringify({success:false, message:"sync rejected for test"})));
    }
    return response(200, "audio/wav", wavBuffer());
  });
  out = await tts.generate("Stream fallback test", {traceId:"r7_stream_fallback"});
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.transport, "stream-fallback");
  assert.ok(calls.some(c => c.url.endsWith("/synthesize")));
  assert.ok(calls.some(c => c.url.endsWith("/stream")));

  tts = load(async () => response(200, "application/json", Buffer.from(JSON.stringify({success:true, audio:{content:wavBuffer().toString("base64")}}))));
  out = await tts.generate("Nested audio object test", {traceId:"r7_nested"});
  assert.strictEqual(out.ok, true);
  assert.ok(Buffer.isBuffer(out.buffer));

  console.log("PASS compatibility recovery: 18 assertions");
})().catch(err => { console.error(err && err.stack || err); process.exitCode = 1; });
