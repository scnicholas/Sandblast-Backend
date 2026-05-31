"use strict";

const assert = require("assert");
const policy = require("../Data/marion/runtime/progressionResponsePolicy.js");

assert.strictEqual(policy.isThinProgressionReply("Continue."), true);
assert.strictEqual(policy.isThinProgressionReply("I can continue from your next instruction."), true);

const shaped = policy.shapeProgressionReply({
  reply: "Continue.",
  text: "Next steps",
  profile: { active: true, phaseKey: "phase3", phaseLabel: "Progression shaping refinement", signal: "next_steps" }
});

assert.ok(!policy.isThinProgressionReply(shaped), "policy reply must not stay thin");
assert.ok(/next steps.*action plan/i.test(shaped) || /response expansion/i.test(shaped), "policy must return actionable expansion");

console.log("progression response policy hardlock passed");
