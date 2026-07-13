"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "sandblast_nyx_widget.html"), "utf8");
const veMatch = html.match(/function ve\(n\)\{.*?\}\}function unlock/s);
const speakMatch = html.match(/async function speak\(t\)\{.*?\}let R,I;/s);
assert.ok(veMatch && speakMatch, "Embedded voice functions were not found.");
const veSource = veMatch[0].replace(/function unlock[\s\S]*$/, "");
const speakSource = speakMatch[0].replace(/let R,I;$/, "");

class MockAudio {
  constructor() { this.src = ""; this.paused = true; this.attempts = []; this._n = 0; }
  pause() { this.paused = true; }
  load() {}
  play() {
    this.attempts.push(this.src);
    if (this.src.includes("/api/tts?")) return Promise.reject(new Error("primary route unavailable"));
    this.paused = false;
    if (this.onplay) this.onplay();
    return Promise.resolve(true);
  }
}

(async () => {
  const events = [];
  const states = [];
  const W = {
    SB_NYX_TTS_ENDPOINT: "https://sandblast-backend.onrender.com/api/tts",
    SB_RESEMBLE_VOICE_UUID: "83e8335f",
    dispatchEvent(event) { events.push(event.type); }
  };
  const factory = new Function(
    "W", "Audio", "CustomEvent", "pub", "set",
    `let audio=null;${veSource}${speakSource};return {speak,getAudio:()=>audio};`
  );
  const api = factory(
    W,
    MockAudio,
    class CustomEvent { constructor(type) { this.type = type; } },
    (v) => String(v).trim(),
    (v) => states.push(v)
  );

  await api.speak("Hello from Nyx route failover.");
  await new Promise((resolve) => setImmediate(resolve));
  const audio = api.getAudio();
  assert.strictEqual(audio.attempts.length, 2);
  assert.ok(audio.attempts[0].startsWith("https://sandblast-backend.onrender.com/api/tts?"));
  assert.ok(audio.attempts[1].startsWith("https://sandblast-backend.onrender.com/tts?"));
  assert.ok(audio.attempts[1].includes("voiceUuid=83e8335f"));
  assert.ok(audio.attempts[1].includes("output_format=mp3"));
  assert.ok(events.includes("nyx:voice:prestart"));
  assert.ok(events.includes("nyx:voice:start"));
  assert.ok(states.includes("Nyx speaking"));
  audio.onended();
  assert.ok(events.includes("nyx:voice:end"));
  assert.ok(states.includes("Signal Ready"));

  console.log(JSON.stringify({
    ok: true,
    directMediaGet: true,
    primaryRoute: "/api/tts",
    compatibilityRoute: "/tts",
    corsPreflightBypassed: true,
    lifecycleEvents: true
  }, null, 2));
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
