'use strict';
const assert = require('assert');
const compose = require('../Data/marion/runtime/composeMarionResponse.js');
const bridge = require('../Data/marion/runtime/marionBridge.js');
const envelope = require('../Data/marion/runtime/marionFinalEnvelope.js');
const loopGuard = require('../Data/marion/runtime/marionLoopGuard.js');

function replyOf(x){
  return (x && (x.reply || x.publicReply || x.visibleReply || x.finalReply || x.text || (x.finalEnvelope && x.finalEnvelope.reply) || (x.payload && x.payload.reply))) || '';
}
function norm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
const META = /(marion will continue|will continue the active task|continue the active task|one clean final reply|one clean final answer|clean final reply|clean final answer|clean public reply|active task|current task|i have the current request|will answer from this prompt|avoid reusing a stale fallback|current prompt|current request|loop detected|recovery path|suppression|regenerating|stale fallback|reply concrete)/i;
function assertConcrete(packet, label){
  const r = replyOf(packet);
  assert(r && r.length > 80, label + ': reply should be substantive');
  assert(!META.test(r), label + ': reply must not expose meta-recovery language: ' + r);
  assert(!/^marion will/i.test(r), label + ': reply must not describe what Marion will do');
  assert(/\b(run|repeat|retest|confirm|verify|reject|block|lock|move|continue|complete|check|test)\b/i.test(r), label + ': reply must contain executable continuation verbs: ' + r);
  assert(/\b(priority|lane|sequence|test|prompt|reply|wording|governor|continuation|fallback|echo|action)\b/i.test(r), label + ': reply must stay tied to the active work: ' + r);
  assert.notStrictEqual(norm(r), norm('Run that again.'), label + ': reply must not echo prompt');
  assert(packet.final === true || packet.marionFinal === true || (packet.finalEnvelope && packet.finalEnvelope.final === true), label + ': packet should be final');
}

const prompt = 'Run that again.';
const badReply = 'Marion will continue the active task with one clean final reply.';
const lastAssistantReply = 'Next steps: keep the public Nyx route clean, run the five-turn continuity test, confirm each follow-up advances the thread, then lock the stable handoff before adding new features.';
const taskMeta = { lastAssistantReply, lastValidTask: 'Priority 90 echo suppression and fallback repair', activeTask: 'Priority 9E loop governor hardening plus meta-recovery suppression' };

const composed = compose._internal.priority9ER2DisciplineComposePacket(
  { reply: badReply, finalEnvelope: { reply: badReply }, meta: taskMeta },
  { input: { userText: prompt, progressionMemory: taskMeta }, routed: { routing: { intent: 'technical_debug' } }, memory: taskMeta, progressionMemory: taskMeta }
);
assertConcrete(composed, 'compose');

const bridged = bridge._internal.priority9ER2BridgeDisciplinePacket(
  { reply: badReply, finalEnvelope: { reply: badReply }, meta: taskMeta },
  { normalized: { userQuery: prompt, lastAssistantReply, lastValidTask: taskMeta.lastValidTask }, sourceInput: { userText: prompt, progressionMemory: taskMeta } }
);
assertConcrete(bridged, 'bridge');

const finalPacket = envelope._internal.priority9ER2EnvelopeDisciplinePacket(
  { reply: badReply, finalEnvelope: { reply: badReply }, prompt, input: { userText: prompt, progressionMemory: taskMeta }, meta: taskMeta }
);
assertConcrete(finalPacket, 'envelope');

assert.strictEqual(loopGuard.isPriority9ER2ConcreteContinuationLeakText(badReply), true, 'loopGuard must identify R2 meta-continuation leak');
assert.strictEqual(loopGuard.isPriority9ER2ConcreteContinuationCommand(prompt), true, 'loopGuard must identify continuation command');
const guardReply = loopGuard.buildPriority9ER2ConcreteContinuationReply(prompt, taskMeta.lastValidTask);
assert(!META.test(guardReply), 'loopGuard generated reply must not contain meta language');
assert(/\bRun\b.*\bPriority\b/i.test(guardReply), 'loopGuard generated reply should be concrete and priority-aware');

console.log(JSON.stringify({
  ok: true,
  tests: 4,
  compose: replyOf(composed),
  bridge: replyOf(bridged),
  envelope: replyOf(finalPacket),
  loopGuard: guardReply
}, null, 2));
