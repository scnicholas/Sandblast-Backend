"use strict";

const assert = require("assert");
process.env.RESEMBLE_API_TOKEN = process.env.RESEMBLE_API_TOKEN || "test-token";
process.env.RESEMBLE_VOICE_UUID = process.env.RESEMBLE_VOICE_UUID || "83e8335f";
process.env.SB_TTS_LOG_ENABLED = "false";

const mounted = [];
const app = {
  locals: {},
  get(path, handler) { mounted.push(["GET", path, handler]); return this; },
  post(path, handler) { mounted.push(["POST", path, handler]); return this; },
  options(path, handler) { mounted.push(["OPTIONS", path, handler]); return this; }
};

const mount = require("../Routes/nyxVoiceMount");
mount(app);
mount(app);

const pairs = mounted.map(([method, path]) => `${method} ${path}`);
for (const expected of [
  "GET /api/tts", "POST /api/tts", "OPTIONS /api/tts",
  "GET /tts", "POST /tts", "OPTIONS /tts",
  "GET /api/tts/health"
]) assert.ok(pairs.includes(expected), `Missing ${expected}`);

assert.strictEqual(mounted.length, 7, "Mount must be idempotent.");
for (const [, , handler] of mounted) assert.strictEqual(typeof handler, "function");
console.log(JSON.stringify({ ok: true, routes: pairs, idempotent: true }, null, 2));
