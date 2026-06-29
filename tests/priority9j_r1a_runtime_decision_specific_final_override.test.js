"use strict";

const assert = require("assert");
const path = require("path");

const MODULES = [
  "../Data/marion/runtime/composeMarionResponse.js",
  "../Data/marion/runtime/DomainConcierge.js",
  "../Data/marion/runtime/domainConfidence.js",
  "../Data/marion/runtime/MarionAdminConsoleGateway.js",
  "../Data/marion/runtime/marionBridge.js",
  "../Data/marion/runtime/marionFinalEnvelope.js",
  "../Data/marion/runtime/progressionMemory.js",
  "../Data/marion/runtime/progressionShape.js",
  "../Data/marion/runtime/marionIntentRouter.js"
];

const prompts = {
  first_move: "What should we do first?",
  decision: "Make the decision.",
  critical_path: "What is the critical path?",
  safest_sequence: "Give me the safest sequence.",
  avoid: "What should we avoid?",
  next_operational_move: "What is the next operational move?"
};

const generic = "Priority 9J: proactive operational guidance and next-move authority. The 9H continuity foundation and 9I pressure-handling layer stay underneath this decision. Recommended next move: choose the safest concrete action that preserves the active lane and advances only one operational step.";

let tests = 0;
for (const rel of MODULES) {
  const mod = require(path.join(__dirname, rel));
  assert.strictEqual(mod.PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_PATCH, true, rel + " patch export missing");
  assert.strictEqual(typeof mod.priority9JR1ARuntimeDecisionSpecificReplyFor, "function", rel + " reply helper missing");
  assert.strictEqual(typeof mod.priority9JR1ARuntimeDecisionSpecificFinal, "function", rel + " final helper missing");
  assert.strictEqual(typeof mod.priority9JR1ARuntimeDecisionSpecificCommand, "function", rel + " command helper missing");
  for (const [kind, prompt] of Object.entries(prompts)) {
    const detected = mod.priority9JR1ARuntimeDecisionSpecificCommand(prompt);
    assert.strictEqual(detected, kind, rel + " detected wrong command for " + prompt);
    const reply = mod.priority9JR1ARuntimeDecisionSpecificReplyFor(prompt);
    assert(reply.includes("Priority 9J"), rel + " reply missing Priority 9J for " + kind);
    assert(!/Recommended next move:\s*choose the safest concrete action/i.test(reply), rel + " returned generic template for " + kind);
    if (kind === "critical_path") assert(/critical path is to validate one operational decision at a time/i.test(reply), rel + " critical-path wording missing");
    if (kind === "decision") assert(/Priority 9J decision:/i.test(reply), rel + " decision wording missing");
    const objectOut = mod.priority9JR1ARuntimeDecisionSpecificFinal({ reply: generic, result: { reply: generic }, finalEnvelope: { reply: generic } }, prompt);
    assert.strictEqual(objectOut.reply, reply, rel + " did not override top-level reply for " + kind);
    assert.strictEqual(objectOut.result.reply, reply, rel + " did not override nested result reply for " + kind);
    assert.strictEqual(objectOut.finalEnvelope.reply, reply, rel + " did not override finalEnvelope reply for " + kind);
    assert.strictEqual(objectOut.meta.runtimeDecisionSpecificFinalOverride, true, rel + " missing final override metadata for " + kind);
    tests += 7;
  }
}

console.log(JSON.stringify({ ok: true, hotfix: "Priority 9J-R1A runtime decision-specific final override", modules: MODULES.length, commands: Object.keys(prompts), tests }, null, 2));
