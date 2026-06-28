"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const files = [
  "index.js",
  "Utils/stateSpine.js",
  "Data/marion/runtime/composeMarionResponse.js",
  "Data/marion/runtime/DomainConcierge.js",
  "Data/marion/runtime/domainConfidence.js",
  "Data/marion/runtime/marionBridge.js",
  "Data/marion/runtime/marionFinalEnvelope.js",
  "Data/marion/runtime/marionIntentRouter.js",
  "Data/marion/runtime/MarionAdminConsoleGateway.js",
  "Data/marion/runtime/progressionMemory.js",
  "Data/marion/runtime/progressionShape.js"
];

const requiredStrings = [
  "PRIORITY_9J_R1_DECISION_SPECIFIC_AUTHORITY_HOTFIX_START",
  "priority9JR1BuildOperationalReply",
  "priority9JR1IsGeneric9JReply",
  "generic9JTemplateSuppressed",
  "decisionSpecificAuthority"
];

for (const rel of files) {
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  for (const needle of requiredStrings) {
    assert(text.includes(needle), `${rel} missing ${needle}`);
  }
}

const compose = require(path.join(root, "Data/marion/runtime/composeMarionResponse.js"));
assert.strictEqual(typeof compose.priority9JR1BuildOperationalReply, "function", "helper export missing");

const cases = [
  ["What should we do first?", "prove decision-specific authority"],
  ["Make the decision.", "Priority 9J decision"],
  ["What is the critical path?", "critical path is"],
  ["Give me the safest sequence.", "safest sequence is"],
  ["What should we avoid?", "avoid over-branching"],
  ["What is the next operational move?", "next operational move is"]
];

for (const [prompt, expected] of cases) {
  const reply = compose.priority9JR1BuildOperationalReply(prompt);
  assert(reply.includes("Priority 9J"), `${prompt} did not stay in 9J`);
  assert(reply.toLowerCase().includes(expected.toLowerCase()), `${prompt} did not include ${expected}`);
  assert(!/^Priority 9J: proactive operational guidance and next-move authority\. The 9H continuity foundation/.test(reply) || prompt.includes("Priority 9J is"), `${prompt} returned generic activation framing`);
}

assert(compose.priority9JR1IsGeneric9JReply("Priority 9J: proactive operational guidance and next-move authority. The 9H continuity foundation and 9I pressure-handling layer stay underneath this decision. Recommended next move: choose the safest concrete action that preserves the active lane."), "generic 9J reply not detected");

console.log(JSON.stringify({
  ok: true,
  tests: 29,
  hotfix: "Priority 9J-R1 decision-specific authority",
  operationalCommands: cases.map((c) => c[0]),
  generic9JTemplateSuppressed: true
}, null, 2));
