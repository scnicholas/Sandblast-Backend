
"use strict";
const fs = require("fs");
const path = require("path");
const dir = __dirname;
const files = ["composeMarionResponse.js", "MarionAdminConsoleGateway.js", "marionBridge.js", "marionFinalEnvelope.js", "index.js"];
for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), "utf8");
  if (!text.includes("MARION_PERSONALITY_SOCIAL_CHECKIN_R5_START")) throw new Error(`${file} missing R5 patch`);
  if (!text.includes("MARION_PERSONALITY_SOCIAL_CHECKIN_R5_VERSION")) throw new Error(`${file} missing R5 version`);
  if (/Send the next exact target\./.test(text)) throw new Error(`${file} still contains exact target fallback`);
}
console.log("R5 social check-in smoke test passed");
