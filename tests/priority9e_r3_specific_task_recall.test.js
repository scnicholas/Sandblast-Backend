'use strict';
const assert = require('assert');
const compose = require('../Data/marion/runtime/composeMarionResponse.js');
const bridge = require('../Data/marion/runtime/marionBridge.js');
const envelope = require('../Data/marion/runtime/marionFinalEnvelope.js');
const loopGuard = require('../Data/marion/runtime/marionLoopGuard.js');

function replyOf(x){
  return (x && (
    x.reply || x.publicReply || x.visibleReply || x.finalReply || x.text ||
    (x.finalEnvelope && (x.finalEnvelope.reply || x.finalEnvelope.publicReply || x.finalEnvelope.visibleReply)) ||
    (x.payload && (x.payload.reply || x.payload.publicReply || x.payload.visibleReply))
  )) || '';
}
function norm(v){ return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function assertR3Clean(label, packet){
  const r = replyOf(packet);
  assert(r && r.length > 80, label + ': reply should be substantive');
  assert(/Priority\s*90\/9E|Priority\s*9E/i.test(r), label + ': reply must name the specific task');
  assert(/Next steps/i.test(r), label + ': reply must include the prior Next steps test');
  assert(/Run that again/i.test(r), label + ': reply must include the short continuation test');
  assert(/fresh wording/i.test(r), label + ': reply must verify fresh wording');
  assert(/action sequence|useful action/i.test(r), label + ': reply must demand action sequence');
  assert(!/last valid Marion sequence|active lane|next concrete step|meta-language is visible|continue from the active lane|restate the target|perform the next concrete step|one clean final reply|Marion will continue/i.test(r), label + ': reply must not leak abstract governor wording');
  assert.notStrictEqual(norm(r), norm('Run that again.'), label + ': reply must not echo prompt');
  return r;
}

const abstractLeak = 'Repeat the last valid Marion sequence: restate the target in fresh wording, perform the next concrete step, verify no echo or meta-language is visible, then continue from the active lane.';
const ctx = {
  input: {
    userText: 'Run that again.',
    activeTask: 'Priority 90/9E continuation regression',
    progressionMemory: { lastValidTask: 'Priority 90/9E continuation regression', pendingAction: 'retest next steps and run that again' }
  },
  routed: { routing: { intent: 'technical_debug' } },
  progressionMemory: { lastValidTask: 'Priority 90/9E continuation regression' }
};

const composed = compose._internal.priority9ER3DisciplineComposePacket({
  reply: abstractLeak,
  publicReply: abstractLeak,
  finalEnvelope: { reply: abstractLeak },
  meta: { lastAssistantReply: 'Next steps: keep the public Nyx route clean.', lastValidTask: 'Priority 90/9E continuation regression' }
}, ctx);
const cr = assertR3Clean('compose', composed);

const bridged = bridge._internal.priority9ER3BridgeDisciplinePacket({
  reply: abstractLeak,
  publicReply: abstractLeak,
  finalEnvelope: { reply: abstractLeak },
  meta: { lastAssistantReply: 'Next steps: keep the public Nyx route clean.', lastValidTask: 'Priority 90/9E continuation regression' }
}, {
  sourceInput: { userText: 'Run that again.', activeTask: 'Priority 90/9E continuation regression' },
  normalized: { userQuery: 'Run that again.', activeTask: 'Priority 90/9E continuation regression' }
});
const br = assertR3Clean('bridge', bridged);

const enveloped = envelope._internal.priority9ER3EnvelopeDisciplinePacket({
  reply: abstractLeak,
  publicReply: abstractLeak,
  finalEnvelope: { reply: abstractLeak },
  input: { userText: 'Run that again.', activeTask: 'Priority 90/9E continuation regression' },
  prompt: 'Run that again.',
  meta: { lastAssistantReply: 'Next steps: keep the public Nyx route clean.', lastValidTask: 'Priority 90/9E continuation regression' }
});
const er = assertR3Clean('envelope', enveloped);

assert.strictEqual(loopGuard.isPriority9ER3SpecificTaskRecallCommand('Run that again.'), true, 'loop guard should detect continuation');
assert.strictEqual(loopGuard.isPriority9ER3SpecificTaskRecallLeakText(abstractLeak), true, 'loop guard should detect abstract recall leak');
const guard = loopGuard.applyLoopGuard({}, abstractLeak, {});
assert.strictEqual(guard.forceRecovery, true, 'loop guard should force recovery for abstract recall leak');

console.log(JSON.stringify({ ok: true, tests: 5, compose: cr, bridge: br, envelope: er, loopGuard: guard.failureSignature }, null, 2));
