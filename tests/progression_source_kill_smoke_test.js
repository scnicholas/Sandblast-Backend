#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = __dirname;
const files = ["index.js", "composeMarionResponse.js", "marionBridge.js"];

const forbiddenPublicEmission = [
  "Progression shaping is active",
  "Progression shaping passed",
  "Progression shaping needs repair",
  "Progression active: run next validation",
  "mark the result as Passed or Failed"
];

let failed = false;

for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  for (const phrase of forbiddenPublicEmission) {
    if (text.includes(phrase)) {
      console.error(`[FAIL] ${file} still contains public-emission phrase: ${phrase}`);
      failed = true;
    }
  }
}

const indexText = fs.readFileSync(path.join(root, "index.js"), "utf8");
if (!indexText.includes("collectCurrentUserIntentText")) {
  console.error("[FAIL] index.js is missing collectCurrentUserIntentText hardlock.");
  failed = true;
}
if (!indexText.includes("PROGRESSION-SOURCE-KILL-HARDLOCK")) {
  console.error("[FAIL] index.js version does not include PROGRESSION-SOURCE-KILL-HARDLOCK.");
  failed = true;
}

if (failed) process.exit(1);
console.log("[PASS] Progression source-kill static smoke test passed.");
