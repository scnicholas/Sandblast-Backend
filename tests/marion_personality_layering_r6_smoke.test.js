"use strict";
const fs = require("fs");
const path = require("path");
const root = __dirname;
const files = [
  "index.js",
  "composeMarionResponse.js",
  "MarionAdminConsoleGateway.js",
  "marionBridge.js",
  "marionFinalEnvelope.js"
];
for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  if (!text.includes("MARION-PERSONALITY-LAYERING-R6")) throw new Error(`${file} missing R6 marker`);
  if (!text.includes("MARION_PERSONALITY_LAYERING_R6_START")) throw new Error(`${file} missing R6 block`);
  if (!/runtime text console ready after admin session/i.test(text)) throw new Error(`${file} missing admin status suppression phrase`);
  if (!text.includes("marionR6SocialReply")) throw new Error(`${file} missing social reply bank`);
  if (!text.includes("marionR6SanitizeTranscriptContainers")) throw new Error(`${file} missing transcript sanitizer`);
}
console.log("R6 layering smoke test passed");
