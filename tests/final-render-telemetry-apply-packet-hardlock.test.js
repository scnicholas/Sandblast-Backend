"use strict";

const assert = require("assert");
const finalRenderTelemetry = require("../Data/marion/runtime/finalRenderTelemetry.js");

const packet = finalRenderTelemetry.applyFinalRenderTelemetryToPacket({
  ok: true,
  final: true,
  marionFinal: true,
  userText: "Next steps",
  reply: "Continue.",
  progressionRefinement: { active: true, phaseKey: "phase3", signal: "next_steps" },
  finalEnvelope: { reply: "Continue.", marionFinal: true }
});

assert.ok(packet.reply && packet.reply !== "Continue.", "packet reply should be expanded");
assert.ok(/Progression shaping refinement/i.test(packet.reply), "expanded progression wording expected");
assert.ok(packet.runtimeTelemetry.finalRenderTelemetryActive, "final render telemetry should be active");
assert.strictEqual(packet.finalRenderTelemetry.publicSurfaceClean, true, "public surface must stay clean");
assert.strictEqual(packet.finalRenderTelemetry.userVisible, false, "telemetry remains internal");

console.log("final render telemetry packet hardlock passed");
