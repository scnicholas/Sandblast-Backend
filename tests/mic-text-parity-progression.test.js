"use strict";
const assert = require("assert");
const shape = require("../Data/marion/runtime/progressionShape.js");

const textPrompt = shape.buildProgressionProfile("Next steps", { progressionRefinement: { active: true, currentStep: "phase4" }, inputSource: "text" });
const micPrompt = shape.buildProgressionProfile("next steps", { progressionRefinement: { active: true, currentStep: "phase4" }, inputSource: "voice" });
assert.strictEqual(textPrompt.signal, micPrompt.signal);
assert.strictEqual(textPrompt.phaseKey, micPrompt.phaseKey);
assert.strictEqual(textPrompt.responseShape, micPrompt.responseShape);
assert.strictEqual(textPrompt.noUserFacingDiagnostics, true);

console.log("mic-text-parity-progression.test.js passed");
