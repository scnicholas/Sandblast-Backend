
"use strict";
const assert = require("assert");
const compose = require("../Data/marion/runtime/composeMarionResponse.js");
const bridge = require("../Data/marion/runtime/marionBridge.js");
const envelope = require("../Data/marion/runtime/marionFinalEnvelope.js");
const shape = require("../Data/marion/runtime/progressionShape.js");
const memory = require("../Data/marion/runtime/progressionMemory.js");
const router = require("../Data/marion/runtime/marionIntentRouter.js");
const concierge = require("../Data/marion/runtime/DomainConcierge.js");
const loopGuard = require("../Data/marion/runtime/marionLoopGuard.js");
const state = require("../Utils/stateSpine.js");

const prompt = "This is disjointed, but we need Marion to understand the deeper task, preserve the context, avoid looping, and tell me where to go next.";
const stale = "Run the Priority 90/9E test again: confirm Marion is still on Priority 90/9E, retest Next steps, retest Run that again, verify fresh wording, block internal recovery wording, and pass the live test only when the answer gives a useful action sequence.";
function replyOf(x){return (x && (x.reply || x.publicReply || x.visibleReply || x.finalReply || x.text || (x.finalEnvelope && x.finalEnvelope.reply) || (x.payload && x.payload.reply))) || "";}
function assert9F(reply,label){assert(/Priority 9F-R1|Priority 9F/i.test(reply), label+" should name Priority 9F/R1");assert(/surface request/i.test(reply), label+" should include surface request");assert(/deeper intent/i.test(reply), label+" should include deeper intent");assert(/main risk/i.test(reply), label+" should include main risk");assert(/Next move/i.test(reply), label+" should include next move");assert(!/Run the Priority 90\/9E test again/i.test(reply), label+" must not emit stale 9E recall");}

const composed = compose._internal.priority9FR1ComposerDisciplinePacket({reply:stale, finalEnvelope:{reply:stale}, meta:{lastAssistantReply:stale}}, {input:{userText:prompt}, routed:{routing:{intent:"contextual_directive"}}});
assert9F(replyOf(composed), "compose");

const bridged = bridge._internal.priority9FR1BridgeDisciplinePacket({reply:stale, finalEnvelope:{reply:stale}, meta:{lastAssistantReply:stale}}, {sourceInput:{userText:prompt}, normalized:{userQuery:prompt}});
assert9F(replyOf(bridged), "bridge");

const enveloped = envelope._internal.priority9FR1EnvelopeDisciplinePacket({prompt, userText:prompt, reply:stale, finalEnvelope:{reply:stale}, meta:{lastAssistantReply:stale}});
assert9F(replyOf(enveloped), "envelope");

const prof = shape.buildProgressionProfile(prompt, {});
assert.strictEqual(prof.responseShape, "layered_conversational_stack", "shape should force layered stack");
assert(/9F/.test(prof.phaseLabel), "shape should label 9F");

const mem = memory.updateProgressionMemory({text:prompt, reply:stale, previous:{}});
assert.strictEqual(mem.responseShape, "layered_conversational_stack", "memory should carry layered stack");
assert(/9F/.test(mem.lastValidTask), "memory should preserve 9F task");

const routed = router.routeMarionIntent({userText:prompt});
assert.strictEqual(routed.routing.intent, "contextual_directive", "router should route contextual directive");
assert.strictEqual(routed.routing.questionShape.questionShape, "layered_conversational_stack", "router should mark layered stack");

const dc = concierge.runDomainConcierge({userText:prompt});
assert.strictEqual(dc.intent, "contextual_directive", "concierge should preserve 9F contextual intent");
assert.strictEqual(dc.needsClarifier, false, "concierge must not clarify 9F prompt");

const guard = loopGuard.evaluateLoop({userText:prompt}, stale, {prompt});
assert.strictEqual(guard.allowReply, false, "loop guard should reject stale 9E under 9F prompt");

const st = state.buildPriority9FR1LayeredPrecedenceState(prompt, {});
assert.strictEqual(st.active, true, "state should activate 9F-R1");

console.log(JSON.stringify({ok:true, tests:9, compose:replyOf(composed), bridge:replyOf(bridged), envelope:replyOf(enveloped), shape:prof.responseShape, memory:mem.lastValidTask, router:routed.routing.intent, concierge:dc.intent}, null, 2));
