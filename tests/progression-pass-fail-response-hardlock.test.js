"use strict";

const assert = require("assert");
const shape = require("../Data/marion/runtime/progressionShape.js");
const policy = require("../Data/marion/runtime/progressionResponsePolicy.js");

const context = {
  progressionRefinement: {
    active: true,
    activePhase: "progression_shaping_refinement",
    currentStep: "phase3",
    phaseLabel: "Phase 3: Response shaping rules"
  }
};

const passed = shape.buildProgressionProfile("Passed", context);
assert.strictEqual(passed.signal, "pass");
const passReply = policy.shapeProgressionReply({ reply: "", text: "Passed", profile: passed, memory: context.progressionRefinement });
assert(/passed/i.test(passReply));
assert(/move to|advance|Phase 4/i.test(passReply));

const failed = shape.buildProgressionProfile("Failed", context);
assert.strictEqual(failed.signal, "fail");
const failReply = policy.shapeProgressionReply({ reply: "Continue.", text: "Failed", profile: failed, memory: context.progressionRefinement });
assert(/needs repair|critical issue|patch/i.test(failReply));
assert(!/^\s*Continue\.?\s*$/i.test(failReply));

const cont = shape.buildProgressionProfile("Continue", context);
assert.strictEqual(cont.signal, "continue");
const contReply = policy.shapeProgressionReply({ reply: "Continue.", text: "Continue", profile: cont, memory: context.progressionRefinement });
assert(/Progression shaping refinement|Phase 3|validation/i.test(contReply));
assert(!/^\s*Continue\.?\s*$/i.test(contReply));

console.log("progression pass/fail response hardlock passed");
