"use strict";
const assert = require("assert");
const compose = require("../Data/marion/runtime/composeMarionResponse.js");
const bridge = require("../Data/marion/runtime/marionBridge.js");
const envelope = require("../Data/marion/runtime/marionFinalEnvelope.js");
const loopGuard = require("../Data/marion/runtime/marionLoopGuard.js");
const shape = require("../Data/marion/runtime/progressionShape.js");
const memory = require("../Data/marion/runtime/progressionMemory.js");

function replyOf(x){return (x && (x.reply || x.publicReply || x.visibleReply || x.finalReply || x.text || (x.finalEnvelope && x.finalEnvelope.reply) || (x.payload && x.payload.reply))) || "";}
function rejectMeta(reply){
  assert(reply && reply.length > 40, "reply should be substantive");
  assert(!/I have the current request|Marion will answer from this prompt|will answer from this prompt|answer from this prompt|avoid reusing a stale fallback|current prompt|current request|loop detected|meta-recovery|suppression|regenerating|stale fallback/i.test(reply), "reply must not leak meta-recovery language");
  assert(!/failureSignature|runtimeTelemetry|finalEnvelope|sessionPatch|routeKind|diagnostic packet/i.test(reply), "reply must not leak runtime diagnostics");
}
const prompt = "Run that again.";
const previous = "Next steps: keep the public Nyx route clean, run the five-turn continuity test, confirm each follow-up advances the thread, then lock the stable handoff before adding new features.";
const metaLeak = "I have the current request. Marion will answer from this prompt, keep the reply concrete, and avoid reusing a stale fallback.";

assert.strictEqual(shape.detectProgressionSignal(prompt), "continue", "progression shape must classify Run that again as continue");
assert.strictEqual(shape.isPriority9EContinuationCommand(prompt), true, "shape helper must recognize continuation command");
const mem = memory.updateProgressionMemory({ text: prompt, reply: metaLeak, previous: { active:true, lastValidTask:"Priority 90/9E echo fallback repair", pendingAction:"return_expanded_next_action_plan" } });
assert(mem.lastValidTask, "memory should preserve a last valid task");
assert.strictEqual(loopGuard.isPriority9EMetaRecoveryLeakText(metaLeak), true, "loop guard must identify meta recovery leakage");

const composed = compose._internal.priority9EDisciplineComposePacket({ reply: metaLeak, finalEnvelope:{reply:metaLeak}, meta:{lastAssistantReply:previous} }, { input:{userText:prompt}, routed:{routing:{intent:"technical_debug"}}, memory:mem });
rejectMeta(replyOf(composed));
assert(/Priority 90\/9E|fresh wording|public answer stays conversational|Run the Priority/i.test(replyOf(composed)), "compose should generate a fresh continuation");
assert.notStrictEqual(replyOf(composed), previous, "compose must not replay the previous reply exactly");

const bridged = bridge._internal.priority9EBridgeDisciplinePacket({ reply: metaLeak, finalEnvelope:{reply:metaLeak}, meta:{lastAssistantReply:previous} }, { normalized:{userQuery:prompt} });
rejectMeta(replyOf(bridged));
assert.notStrictEqual(replyOf(bridged), previous, "bridge must not replay previous reply exactly");

const enveloped = envelope._internal.priority9EEnvelopeDisciplinePacket({ reply: metaLeak, prompt, finalEnvelope:{reply:metaLeak}, meta:{lastAssistantReply:previous} });
rejectMeta(replyOf(enveloped));
assert.notStrictEqual(replyOf(enveloped), previous, "envelope must not replay previous reply exactly");

const live = compose.composeMarionResponse({ routing:{ intent:"technical_debug" } }, { userText:prompt, memory:{ lastAssistantReply:previous, progressionMemory:mem } });
rejectMeta(replyOf(live));
console.log(JSON.stringify({ ok:true, priority:"9E", tests:12, compose: replyOf(composed), bridge: replyOf(bridged), envelope: replyOf(enveloped), live: replyOf(live) }, null, 2));
