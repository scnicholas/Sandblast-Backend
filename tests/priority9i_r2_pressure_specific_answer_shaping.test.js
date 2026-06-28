"use strict";

const assert = require("assert");
const path = require("path");

const runtime = path.join(__dirname, "..", "Data", "marion", "runtime");
const compose = require(path.join(runtime, "composeMarionResponse.js"));
const bridge = require(path.join(runtime, "marionBridge.js"));
const envelope = require(path.join(runtime, "marionFinalEnvelope.js"));
const shape = require(path.join(runtime, "progressionShape.js"));
const memory = require(path.join(runtime, "progressionMemory.js"));
const router = require(path.join(runtime, "marionIntentRouter.js"));
const concierge = require(path.join(runtime, "DomainConcierge.js"));
const confidence = require(path.join(runtime, "domainConfidence.js"));
const admin = require(path.join(runtime, "MarionAdminConsoleGateway.js"));
const state = require(path.join(__dirname, "..", "Utils", "stateSpine.js"));

const prompts = [
  ["What is the risk now?", "risk now is", "risk"],
  ["Slow down.", "slow down", "pace"],
  ["Go deeper.", "go deeper", "depth"],
  ["Do the safest next move.", "safest next move is", "safety"],
  ["No, not that — stay on the architecture.", "correction received", "correction"],
  ["This is urgent.", "urgency detected", "urgency"],
  ["We need to pivot.", "pivot received", "pivot"]
];

function textFrom(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return [value.reply, value.text, value.message, value.answer, value.visibleReply, value.spokenText, value.payload && value.payload.reply].filter(Boolean).join(" ");
  return String(value);
}
function assert9IReply(reply, mustContain, label) {
  const s = textFrom(reply).toLowerCase();
  assert(s.includes("priority 9i"), label + " should stay in Priority 9I: " + s);
  assert(s.includes(mustContain), label + " should answer pressure specifically: " + s);
  assert(!/\bpriority\s*9j:\s*proactive operational guidance/.test(s), label + " must not activate 9J: " + s);
  assert(!/preserve the 9h continuity foundation,?\s*read the current pressure shift,?\s*update operational risk and execution mode,?\s*then give the safest next action/i.test(s), label + " must not use generic 9I template: " + s);
}
function callPossible(mod, names, input) {
  for (const name of names) {
    if (mod && typeof mod[name] === "function") {
      try { return mod[name](input); } catch (_) {}
    }
  }
  return null;
}

for (const [prompt, must, kind] of prompts) {
  const input = { text: prompt, context: { activeLane: "Priority 9I", lastAcceptedLane: "Priority 9I-R1", priority9J: { staged: true } } };

  if (typeof compose.priority9IR2ReplyFor === "function") {
    assert9IReply(compose.priority9IR2ReplyFor(prompt), must, "compose helper " + kind);
  }
  if (typeof bridge.priority9IR2ReplyFor === "function") {
    assert9IReply(bridge.priority9IR2ReplyFor(prompt), must, "bridge helper " + kind);
  }
  if (typeof envelope.priority9IR2ReplyFor === "function") {
    assert9IReply(envelope.priority9IR2ReplyFor(prompt), must, "envelope helper " + kind);
  }

  const sp = callPossible(shape, ["buildProgressionProfile", "default"], input);
  assert(sp && (sp.priorityLane === "priority9i_adaptive_situational_reasoning" || sp.lane === "priority9i_adaptive_situational_reasoning"), "shape lane " + kind);
  assert(sp.pressureKind === kind, "shape pressure kind " + kind);

  const mem = callPossible(memory, ["updateProgressionMemory", "default"], input);
  assert(mem && mem.priority9I && mem.priority9I.pressureSpecificAnswer === true, "memory pressure flag " + kind);
  assert(mem.priority9J && mem.priority9J.active === false, "memory keeps 9J staged " + kind);

  const rt = callPossible(router, ["routeMarionIntent", "default"], input);
  assert(rt && (rt.priorityLane === "priority9i_adaptive_situational_reasoning" || rt.lane === "priority9i_adaptive_situational_reasoning"), "router lane " + kind);
  assert(rt.suppress9JEscalation === true, "router suppress 9J " + kind);

  const dc = callPossible(concierge, ["runDomainConcierge", "default"], input);
  assert(dc && (dc.priorityLane === "priority9i_adaptive_situational_reasoning" || dc.lane === "priority9i_adaptive_situational_reasoning"), "concierge lane " + kind);
  assert(dc.suppress9JEscalation === true, "concierge suppress 9J " + kind);

  const cf = callPossible(confidence, ["scoreDomainConfidence", "buildDomainConfidenceProfile", "default"], input);
  assert(cf && (cf.priorityLane === "priority9i_adaptive_situational_reasoning" || cf.lane === "priority9i_adaptive_situational_reasoning" || cf.domain === "execution_context"), "confidence lane " + kind);

  const st = typeof state.priority9IR2StatePatch === "function" ? state.priority9IR2StatePatch(input, {}) : callPossible(state, ["buildStatePatch", "normalizeStatePatch", "applyStatePatch"], input);
  assert(st && st.priority9I && st.priority9I.pressureSpecificAnswer === true, "state pressure flag " + kind);

  const adm = callPossible(admin, ["handleAdminConsoleCommand", "handleTextCommand", "default"], input);
  if (adm) assert(!/\bpriority\s*9j:\s*proactive operational guidance/i.test(textFrom(adm)), "admin must not activate 9J " + kind);
}

const generic = "Continue Priority 9I: preserve the 9H continuity foundation, read the current pressure shift, update operational risk and execution mode, then give the safest next action. Keep Priority 9J staged until next-move authority is explicitly needed.";
const forced = compose.priority9IR2DisciplineOutput({text:"What is the risk now?"}, generic);
assert9IReply(forced, "risk now is", "generic template override");

console.log(JSON.stringify({
  ok: true,
  tests: prompts.length * 9 + 1,
  hotfix: "Priority 9I-R2 pressure-specific answer shaping",
  pressureKinds: prompts.map(x => x[2]),
  lane: "priority9i_adaptive_situational_reasoning",
  priority9J: "staged_only"
}, null, 2));
