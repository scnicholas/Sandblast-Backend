
"use strict";
const assert = require("assert");
const shape = require("../Data/marion/runtime/progressionShape.js");
const memory = require("../Data/marion/runtime/progressionMemory.js");
const envelope = require("../Data/marion/runtime/marionFinalEnvelope.js");
const loopGuard = require("../Data/marion/runtime/marionLoopGuard.js");

const activation = "Priority 9H is the long-form continuity stress test and memory drift guard. Marion must survive 10 to 15 turns of short follow-ups while preserving surface request, deeper intent, active task, risk, execution mode, and next action. Priority 9I is staged next, but it must not activate until 9H passes.";
const shortTurns = ["Next steps.", "Continue.", "What now?", "Run that again.", "Status.", "Proceed.", "Next.", "Carry on.", "Run it again.", "What’s next?", "Continue.", "Next steps.", "Go on.", "Pass.", "Advance."];

const profile = shape.buildProgressionProfile(activation, {});
assert(profile.active === true, "9H profile should be active");
assert(profile.lane === "priority9h_long_form_continuity_stress", "9H lane mismatch");
assert(profile.priority9IAdaptiveSituationalPrecheck && profile.priority9IAdaptiveSituationalPrecheck.staged === true, "9I precheck should be staged");

let mem = memory.updateProgressionMemory({ text: activation, previous: {}, context: {} });
assert(mem.priority9HLongFormContinuity, "9H memory missing after activation");
assert(mem.priority9IPrecheck && mem.priority9IPrecheck.staged === true, "9I precheck missing from memory");

for (const turn of shortTurns) {
  mem = memory.updateProgressionMemory({ text: turn, previous: mem, context: mem });
  assert(mem.priority9HLongFormContinuity, "9H memory missing for " + turn);
  assert(mem.priority9HLongFormContinuity.turnDepth >= 1, "turn depth not tracked");
  const env = envelope.createMarionFinalEnvelope({
    prompt: turn,
    reply: "Priority 9G deep continuity memory: run the multi-turn 9G continuity pass.",
    priority9HLongFormContinuity: mem.priority9HLongFormContinuity
  });
  const reply = String(env.reply || env.finalReply || env.publicReply || env.text || "");
  assert(/Priority 9H|Continue Priority 9H/.test(reply), "final envelope did not force 9H reply for " + turn + ": " + reply);
  assert(!/Priority 9G deep continuity memory|public Nyx route clean|Priority 90\/9E|In psychology/i.test(reply), "old lane leak survived for " + turn);
}

const loop = loopGuard.evaluateLoop(
  { prompt: "Continue.", priority9HLongFormContinuity: mem.priority9HLongFormContinuity },
  "Priority 9G deep continuity memory: run the multi-turn 9G continuity pass.",
  { prompt: "Continue.", priority9HLongFormContinuity: mem.priority9HLongFormContinuity }
);
assert(loop.forceRecovery === true || loop.allowReply === false, "loop guard should reject stale 9G leak under 9H");

console.log(JSON.stringify({
  ok: true,
  tests: shortTurns.length + 4,
  lane: mem.priority9HLongFormContinuity.lane,
  targetTurns: mem.priority9HLongFormContinuity.targetTurns,
  priority9I: mem.priority9IPrecheck.staged
}, null, 2));
