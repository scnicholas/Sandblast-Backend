'use strict';
const assert = require('assert');

const compose = require('../Data/marion/runtime/composeMarionResponse.js');
const bridge = require('../Data/marion/runtime/marionBridge.js');
const envelope = require('../Data/marion/runtime/marionFinalEnvelope.js');
const loop = require('../Data/marion/runtime/marionLoopGuard.js');
const shape = require('../Data/marion/runtime/progressionShape.js');
const memory = require('../Data/marion/runtime/progressionMemory.js');
const concierge = require('../Data/marion/runtime/DomainConcierge.js');
const router = require('../Data/marion/runtime/marionIntentRouter.js');
const spine = require('../Utils/stateSpine.js');

function replyOf(x){
  return (x && (x.reply || x.publicReply || x.visibleReply || x.finalReply || x.text ||
    (x.finalEnvelope && (x.finalEnvelope.reply || x.finalEnvelope.visibleReply)) ||
    (x.payload && (x.payload.reply || x.payload.visibleReply)))) || '';
}
function assertCleanLayeredReply(reply){
  assert(reply && reply.length > 80, 'reply must be substantive');
  assert(/Priority 9F deep conversational stack|Marion conversational stabilization/i.test(reply), 'reply must name the conversation lane');
  assert(/surface request/i.test(reply), 'reply must include surface request layer');
  assert(/deeper intent/i.test(reply), 'reply must include deeper intent layer');
  assert(/main risk/i.test(reply), 'reply must include risk layer');
  assert(/response mode/i.test(reply), 'reply must include execution mode');
  assert(/Next move/i.test(reply), 'reply must include next move');
  assert(!/I have the current request|will answer from this prompt|will continue|one clean final reply|last valid Marion sequence|diagnostic packet|final envelope|runtimeTelemetry|routeKind|sessionPatch/i.test(reply), 'reply must not leak recovery/runtime scaffolding');
}

const prompt = 'This is disjointed, but we need Priority 9F Deep Conversational Stack for Marion: separate the surface request, deeper intent, operational risk, execution mode, and next action without looping or leaking recovery machinery.';

const composed = compose.composeMarionResponse({routing:{intent:'contextual_directive', domain:'execution_context'}}, {userText: prompt});
assertCleanLayeredReply(replyOf(composed));

const disciplined = compose._internal.priority9FDisciplineComposePacket({reply:'What would you like to work on?', finalEnvelope:{reply:'What would you like to work on?'}}, {input:{userText:prompt}, routed:{routing:{intent:'contextual_directive'}}});
assertCleanLayeredReply(replyOf(disciplined));

const bridged = bridge._internal.priority9FBridgeDisciplinePacket({reply:'Marion will continue with one clean final reply.', finalEnvelope:{reply:'Marion will continue with one clean final reply.'}}, {normalized:{userQuery:prompt}});
assertCleanLayeredReply(replyOf(bridged));

const finaled = envelope._internal.priority9FEnvelopeDisciplinePacket({prompt, reply:'I have the current request and will answer from this prompt.', finalEnvelope:{reply:'I have the current request and will answer from this prompt.'}});
assertCleanLayeredReply(replyOf(finaled));

assert.strictEqual(shape.isPriority9FDeepConversationalText(prompt), true, 'shape should detect 9F prompt');
assert.strictEqual(memory.isPriority9FDeepConversationalText(prompt), true, 'memory should detect 9F prompt');
assert.strictEqual(concierge.isPriority9FDeepConversationalText(prompt), true, 'concierge should detect 9F prompt');
assert.strictEqual(router.isPriority9FDeepConversationalText(prompt), true, 'router should detect 9F prompt');
assert.strictEqual(spine.isPriority9FDeepConversationalText(prompt), true, 'state spine should detect 9F prompt');

const loopResult = loop.evaluateLoop({prompt}, 'I have the current request and will answer from this prompt.', {prompt});
assert.strictEqual(loopResult.allowReply, false, 'loop guard must reject 9F scaffold leak');

console.log(JSON.stringify({
  ok:true,
  tests:10,
  compose: replyOf(composed),
  bridge: replyOf(bridged),
  envelope: replyOf(finaled),
  shape: shape.buildPriority9FDeepConversationProfile(prompt).responseShape,
  memory: memory.buildPriority9FDeepConversationCarry(prompt).conversationLane,
  router: router.buildPriority9FRouteSeed(prompt).domain,
  concierge: concierge.buildPriority9FConciergeSeed(prompt).domain
}, null, 2));
