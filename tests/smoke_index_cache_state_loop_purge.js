const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "index.js");
const src = fs.readFileSync(file, "utf8");

function mustContain(label, pattern) {
  if (!pattern.test(src)) {
    console.error(`FAIL missing: ${label}`);
    process.exit(1);
  }
}

function mustNotContain(label, pattern) {
  if (pattern.test(src)) {
    console.error(`FAIL forbidden: ${label}`);
    process.exit(1);
  }
}

mustContain("no-store conversation hardening", /function\s+hardenConversationNoStore\s*\(/);
mustContain("conversation POST applies no-store", /app\.post\(CONVERSATION_ROUTE_ALIASES[\s\S]*?hardenConversationNoStore\(res\)/);
mustContain("blank final suppression helper", /function\s+buildSuppressedPublicChatResponse\s*\(/);
mustContain("buildPublicChatResponse suppresses blank replies", /return\s+buildSuppressedPublicChatResponse\(src,\s*"blank_or_unsafe_public_reply"\)/);
mustContain("forcePublicReply uses only cleanReplyForUser", /function\s+forcePublicReply[\s\S]*?const\s+safeReply\s*=\s*cleanReplyForUser\(reply\);/);
mustContain("transport replay cache purges workflow leaks", /replayCachePurged:\s*true/);
mustContain("old validation fallback phrase detected", /i can help validate the next step/);
mustContain("last-mile progression function is inert", /function\s+buildLastMileProgressionContinuationReply[\s\S]*?return\s+"";\s*}/);

mustNotContain("old validation fallback emitter", /return\s+"I can help validate the next step/);
mustNotContain("old failure fallback emitter", /return\s+"I can help isolate the failure/);
mustNotContain("old next validation fallback emitter", /return\s+"I can help with the next validation/);
mustNotContain("public chat progression injection variable", /lastMileProgressionReply\s*=/);
mustNotContain("raw fallback in forcePublicReply", /const\s+safeReply\s*=\s*cleanReplyForUser\(reply\)\s*\|\|\s*cleanText\(reply\)/);

console.log("index.js cache/state loop purge smoke: PASS");
