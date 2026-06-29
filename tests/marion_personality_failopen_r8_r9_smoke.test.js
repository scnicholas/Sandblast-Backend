"use strict";
const assert = require("assert");

const files = [
  "./composeMarionResponse.js",
  "./MarionAdminConsoleGateway.js",
  "./marionBridge.js",
  "./marionFinalEnvelope.js",
  "./index.js"
];

for (const file of files) {
  const text = require("fs").readFileSync(require("path").join(__dirname, file), "utf8");
  assert(text.includes("MARION-PERSONALITY-FAILOPEN-R8"), `${file} missing R8 marker`);
  assert(text.includes("MARION-CONVERSATIONAL-PROGRESSION-R9"), `${file} missing R9 marker`);
  assert(text.includes("marionR89Reply"), `${file} missing R8/R9 reply bank`);
  assert(/runtime text console ready after admin session/i.test(text), `${file} missing diagnostic suppression phrase coverage`);
}

const composer = require("./composeMarionResponse.js");
assert(composer.MARION_PERSONALITY_FAILOPEN_R8_R9_PATCH === true, "composer R8/R9 patch flag missing");
assert(typeof composer.marionPersonalityFailopenR8R9Reply === "function", "composer R8/R9 reply function missing");
const reply = composer.marionPersonalityFailopenR8R9Reply("Hey Marion, how are you?", "social_checkin");
assert(reply && /Mac/i.test(reply), "social reply must mention Mac");
assert(!/Runtime text console|Short-lived admin session|exact target|focus on first/i.test(reply), "social reply contains blocked phrase");

const shaped = composer.marionPersonalityFailopenR8R9Shape(
  { reply: "Runtime text console ready after admin session.", transcript: [{ role: "mac", text: "How are you?" }] },
  "How are you?"
);
const visible = shaped.directReply || shaped.reply || shaped.text || shaped.message || "";
assert(/Mac/i.test(visible), "shaped reply must be Mac-facing");
assert(!/Runtime text console|Short-lived admin session|exact target|focus on first/i.test(visible), "shaped reply still has blocked phrase");
assert(shaped.responseFinalized === true || shaped.final === true, "shaped reply must be finalized");

console.log("PASS R8/R9 fail-open social finalizer smoke test");
