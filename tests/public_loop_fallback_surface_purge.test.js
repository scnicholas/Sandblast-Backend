"use strict";
const assert = require("assert");
const lock = require("../../Data/marion/runtime/publicSurfaceIdentityLock.js");

const publicContext = (message) => ({
  body: {
    message,
    text: message,
    source: "sandblast_channel_widget",
    audience: "public",
    surfaceAgent: "nyx",
    publicSurfaceOnly: true,
    publicIdentityLock: true,
    ui: { publicSurfaceOnly: true, surfaceAgent: "nyx" },
    client: { site: "sandblast.channel" }
  },
  headers: { "x-nyx-client-version": "v14.9" }
});

function checkPrompt(prompt, payload, expected) {
  const out = lock.projectPublicPayload(payload, publicContext(prompt));
  const reply = String(out.reply || "");
  assert(reply, "reply should exist");
  assert(!/\bMac\b/i.test(reply), `Mac leaked: ${reply}`);
  assert(!/\bMarion\b/i.test(reply), `Marion leaked: ${reply}`);
  assert(!/\bthread\b/i.test(reply), `thread leaked: ${reply}`);
  assert(!/\bgreeting\s+lane\b/i.test(reply), `greeting lane leaked: ${reply}`);
  assert(!/\btesting\b/i.test(reply), `testing leaked: ${reply}`);
  assert(!/\bprotective\b/i.test(reply), `protective leaked: ${reply}`);
  assert(!/\bruntime|fallback|loop|state spine|session patch|reply authority|diagnostic/i.test(reply), `runtime language leaked: ${reply}`);
  if (expected) assert.strictEqual(reply, expected);
}

const dirtyPayload = {
  ok: true,
  reply: "I’m here. I’m steady and with the thread. I’ll keep the answer human, protective, and clean. Do you want to keep testing the greeting lane?",
  finalEnvelope: { reply: "Marion is connected behind the response path, Mac." },
  meta: { replyAuthority: "Marion", runtimeTelemetry: true }
};

checkPrompt("Are you with me?", dirtyPayload, "I’m here. You can ask about Sandblast, radio, TV, media, AI, or business tools.");
checkPrompt("Are you there?", dirtyPayload, "I’m here. You can ask about Sandblast, radio, TV, media, AI, or business tools.");
checkPrompt("Can you hear me?", dirtyPayload, "I’m here. You can ask about Sandblast, radio, TV, media, AI, or business tools.");
checkPrompt("Who am I talking to?", dirtyPayload, "You’re speaking with Nyx, the Sandblast guide for media, radio, TV, discovery, and business tools.");
checkPrompt("Is Marion connected?", dirtyPayload, "You’re speaking with Nyx, the Sandblast guide for media, radio, TV, discovery, and business tools.");

const clean = lock.projectPublicPayload({ reply: "Yes, I’m here. What would you like to explore?" }, publicContext("Are you with me?"));
assert.strictEqual(clean.reply, "I’m here. You can ask about Sandblast, radio, TV, media, AI, or business tools.");

console.log("public_loop_fallback_surface_purge: PASS");
