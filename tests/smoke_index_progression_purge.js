/* smoke_index_progression_purge.js
   Static smoke test for the index.js last-mile progression emission purge.
*/
"use strict";

const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "index.js");
const src = fs.readFileSync(file, "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(src.includes("LAST-MILE-PROGRESSION-EMISSION-PURGE"), "version marker missing");
assert(/function\s+buildLastMileProgressionContinuationReply\s*\([^)]*\)\s*\{[\s\S]*?return\s+"";\s*\}/.test(src), "progression continuation emitter is not hard-disabled");
assert(!src.includes("Progression active: run next validation, then mark Passed or Failed."), "exact leaked phrase still exists");
assert(!src.includes("I can help with the next validation, but I need the exact target to keep it precise."), "old synthesized validation fallback still exists");
assert(!src.includes("lastMileProgressionReplyRecovered"), "force-injection metadata still exists");
assert(/function\s+buildLastMileRecoveryReply\s*\([^)]*\)\s*\{[\s\S]*?collectCurrentUserIntentText\(packet\)/.test(src), "recovery is not restricted to current user intent");

console.log("PASS: index.js progression source purge is locked.");
