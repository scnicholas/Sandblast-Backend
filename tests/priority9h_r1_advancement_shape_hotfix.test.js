"use strict";
const assert = require("assert");
const shape = require("../Data/marion/runtime/progressionShape.js");
const memory = require("../Data/marion/runtime/progressionMemory.js");
const envelope = require("../Data/marion/runtime/marionFinalEnvelope.js");
const loopGuard = require("../Data/marion/runtime/marionLoopGuard.js");

const activation = "Priority 9H is the long-form continuity stress test and memory drift guard. Marion must survive 10 to 15 short follow-up turns while preserving surface request, deeper intent, active task, operational risk, execution mode, and next action. Priority 9I is staged only until 9H passes live.";
let mem = memory.updateProgressionMemory({ text: activation, previous: {}, context: {} });
assert(mem.priority9HLongFormContinuity, "9H memory should activate");
assert(mem.priority9IPrecheck && mem.priority9IPrecheck.staged === true, "9I should remain staged");

const prompts = [
  ["Same lane.", /Same lane: continue Priority 9H/i],
  ["Next.", /Continue Priority 9H|advance the same long-form continuity stress chain/i],
  ["Continue from there.", /Continue Priority 9H|advance the same long-form continuity stress chain/i],
  ["What is the risk?", /Risk check inside Priority 9H/i],
  ["What is the active task?", /Active task inside Priority 9H/i],
  ["What is the next action?", /Next action inside Priority 9H/i],
  ["Summarize where we are.", /Summary inside Priority 9H/i],
  ["Do not drift.", /Same lane: continue Priority 9H/i],
  ["Final check.", /Final check inside Priority 9H/i]
];

for (const [prompt, expected] of prompts) {
  const profile = shape.buildProgressionProfile(prompt, mem);
  assert(profile.active === true, "profile should stay active for " + prompt);
  assert(profile.lane === "priority9h_long_form_continuity_stress", "lane mismatch for " + prompt);
  assert(shape.isPriority9HShortFollowup(prompt) === true, "short follow-up not recognized: " + prompt);
  mem = memory.updateProgressionMemory({ text: prompt, previous: mem, context: mem });
  const env = envelope.createMarionFinalEnvelope({
    prompt,
    reply: "I’m reading this as Priority 9H with a Priority 9I precheck. Priority 9H must pass first: Marion has to survive a 10–15 turn short-follow-up chain.",
    priority9HLongFormContinuity: mem.priority9HLongFormContinuity,
    longFormContinuityStress: mem.longFormContinuityStress,
    priority9IPrecheck: mem.priority9IPrecheck
  });
  const reply = String(env.reply || env.finalReply || env.publicReply || env.text || "");
  assert(expected.test(reply), "advancement-shaped reply missing for " + prompt + ": " + reply);
  assert(!/I’m reading this as Priority 9H with a Priority 9I precheck|Priority 9H must pass first/i.test(reply), "reactivation wording survived for " + prompt + ": " + reply);
  assert(!/Priority 9G deep continuity memory|Priority 9F-R4|Priority 90\/9E|In psychology|public Nyx route clean/i.test(reply), "old lane leak survived for " + prompt + ": " + reply);
}

const loop = loopGuard.evaluateLoop(
  { prompt: "Same lane.", priority9HLongFormContinuity: mem.priority9HLongFormContinuity },
  "I’m reading this as Priority 9H with a Priority 9I precheck. Priority 9H must pass first.",
  { prompt: "Same lane.", priority9HLongFormContinuity: mem.priority9HLongFormContinuity }
);
assert(loop.forceRecovery === true || loop.allowReply === false, "loop guard should reject 9H reactivation wording under short follow-up");

console.log(JSON.stringify({
  ok: true,
  tests: prompts.length + 5,
  lane: mem.priority9HLongFormContinuity.lane,
  advancementShapeHotfix: true,
  reactivationWordingSuppressed: true,
  priority9I: mem.priority9IPrecheck.staged
}, null, 2));
