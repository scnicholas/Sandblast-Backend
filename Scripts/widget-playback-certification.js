"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "sandblast_nyx_widget.html"), "utf8");
const veMatch = html.match(/function ve\(n\)\{.*?\}\}function unlock/s);
const speakMatch = html.match(/async function speak\(t\)\{.*?\}\}let R,I;/s);
assert.ok(veMatch && speakMatch, "Embedded voice functions were not found.");
const veSource = veMatch[0].replace(/function unlock[\s\S]*$/, "");
const speakSource = speakMatch[0].replace(/let R,I;$/, "");

class MockAudio {
  constructor() { this.src = ""; this._o = ""; this.paused = true; }
  pause() { const wasPlaying = !this.paused; this.paused = true; if (wasPlaying && this.onpause) this.onpause(); }
  async play() { this.paused = false; if (this.onplay) this.onplay(); return true; }
}

function build(fetchImpl) {
  const events = [];
  const states = [];
  const revoked = [];
  const W = {
    SB_NYX_TTS_ENDPOINT: "https://sandblast-backend.onrender.com/api/tts",
    SB_NYX_STATE_CONTRACT: "nyx.unifiedState/1.0",
    SB_NYX_SURFACE_PROFILE: "public",
    SB_NYX_WIDGET_TOKEN: "",
    SB_RESEMBLE_VOICE_UUID: "83e8335f",
    dispatchEvent(event) { events.push(event.type); }
  };
  const urlApi = {
    createObjectURL() { return "blob:nyx-cert"; },
    revokeObjectURL(value) { revoked.push(value); }
  };
  const factory = new Function("W", "fetch", "Audio", "URL", "CustomEvent", "pub", "set", `let audio=null;${veSource}${speakSource};return {speak,getAudio:()=>audio};`);
  const api = factory(W, fetchImpl, MockAudio, urlApi, class CustomEvent { constructor(type) { this.type = type; } }, (v) => String(v).trim(), (v) => states.push(v));
  return { api, events, states, revoked };
}

(async () => {
  let posted = null;
  const binary = build(async (_url, options) => {
    posted = options;
    return {
      ok: true,
      headers: { get: () => "audio/wav" },
      blob: async () => new Blob([Buffer.from("RIFF-cert")], { type: "audio/wav" })
    };
  });
  await binary.api.speak("Hello from Nyx.");
  assert.ok(posted);
  assert.strictEqual(posted.headers["x-sb-response-mode"], "audio-first");
  assert.strictEqual(JSON.parse(posted.body).voiceUuid, "83e8335f");
  assert.strictEqual(binary.api.getAudio().src, "blob:nyx-cert");
  assert.deepStrictEqual(binary.events.slice(0, 2), ["nyx:voice:prestart", "nyx:voice:start"]);
  binary.api.getAudio().onended();
  assert.ok(binary.events.includes("nyx:voice:end"));
  assert.ok(binary.states.includes("Nyx speaking"));

  const json = build(async () => ({
    ok: true,
    headers: { get: () => "application/json" },
    json: async () => ({ audioBase64: "UklGRg==", mimeType: "audio/wav" })
  }));
  await json.api.speak("JSON audio.");
  assert.ok(json.api.getAudio().src.startsWith("data:audio/wav;base64,"));
  assert.ok(json.events.includes("nyx:voice:start"));

  console.log(JSON.stringify({ ok: true, binary: true, jsonBase64: true, lifecycleEvents: true }, null, 2));
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
