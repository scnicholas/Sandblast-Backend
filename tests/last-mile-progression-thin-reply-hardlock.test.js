"use strict";

const assert = require("assert");
const finalRenderTelemetry = require("../Data/marion/runtime/finalRenderTelemetry.js");

const cases = [
  { text: "Next steps", reply: "Continue." },
  { text: "what now?", reply: "I can continue from your next instruction." },
  { text: "continue", reply: "OK." },
  { text: "keep going", reply: "Proceed." }
];

for (const item of cases) {
  const enforced = finalRenderTelemetry.enforceFinalProgressionReply({
    reply: item.reply,
    text: item.text,
    packet: { userText: item.text, progressionRefinement: { active: true, phaseKey: "phase3", signal: "next_steps" } },
    source: "test"
  });
  assert.strictEqual(enforced.replaced, true, `${item.text} should reject thin reply`);
  assert.ok(/Progression shaping refinement/i.test(enforced.reply), "expanded progression reply expected");
  assert.ok(/action plan|concrete validation step|response expansion/i.test(enforced.reply), "expanded action detail expected");
  assert.ok(!finalRenderTelemetry.isThinProgressionReply(enforced.reply), "replacement must not be thin");
}

console.log("last-mile progression thin reply hardlock passed");
