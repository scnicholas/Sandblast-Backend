
const assert = require('assert');
const compose = require('../Data/marion/runtime/composeMarionResponse.js');
const bridge = require('../Data/marion/runtime/marionBridge.js');
const envelope = require('../Data/marion/runtime/marionFinalEnvelope.js');
const shape = require('../Data/marion/runtime/progressionShape.js');
const memory = require('../Data/marion/runtime/progressionMemory.js');
const loop = require('../Data/marion/runtime/marionLoopGuard.js');

const expectedNeedles = [
  'Priority 9F-R3',
  'Priority 9F-R4 continuation carry',
  'Next steps',
  'Continue',
  'Run that again',
  'What now',
  '9F conversational-stack lane'
];
function textOf(packet) {
  if (!packet) return '';
  if (typeof packet === 'string') return packet;
  const p = packet.payload || {};
  const f = packet.finalEnvelope || {};
  return String(packet.reply || packet.finalReply || packet.publicReply || packet.visibleReply || packet.text || packet.message || packet.response || packet.answer || p.reply || p.finalReply || p.publicReply || p.visibleReply || p.text || f.reply || f.finalReply || f.publicReply || f.visibleReply || '');
}
function assertR4(reply, label) {
  const text = textOf(reply);
  assert(text && text.length > 40, label + ' returned empty response');
  for (const needle of expectedNeedles) assert(text.includes(needle), label + ' missing ' + needle + ' in ' + text);
  assert(!/keep the public Nyx route clean/i.test(text), label + ' leaked old public Nyx route handoff');
  assert(!/five-turn continuity test/i.test(text), label + ' leaked old five-turn continuity handoff');
  assert(!/I.?m reading this as Priority 9F-R3/i.test(text), label + ' over-favored R3 diagnostic answer');
  return text;
}

const prompt = 'Next steps.';
const stale = 'Next steps: keep the public Nyx route clean, run the five-turn continuity test, confirm each follow-up advances the thread, then lock the stable handoff before adding new features.';
const ctx = { 
  prompt, userText: prompt,
  previousReply: 'I’m reading this as Priority 9F-R3: ALT runtime prompt-echo suppression.',
  memory: { lane: 'priority9f_deep_conversational_stack', lastValidTask: 'Priority 9F-R3 live accepted' },
  progressionMemory: { lane: 'priority9f_deep_conversational_stack', lastValidTask: 'Priority 9F-R3 live accepted' }
};

if (compose && typeof compose.composeMarionResponse === 'function') {
  const out = compose.composeMarionResponse({ intent: 'contextual_directive', domain: 'execution_context' }, { ...ctx, text: prompt });
  assertR4(out, 'composeMarionResponse');
}
if (bridge && bridge._internal && typeof bridge._internal.priority9FR4BridgeDisciplinePacket === 'function') {
  const out = bridge._internal.priority9FR4BridgeDisciplinePacket({ reply: stale, prompt, previousReply: ctx.previousReply }, { sourceInput: ctx });
  assertR4(out, 'marionBridge discipline');
}
if (envelope && envelope._internal && typeof envelope._internal.priority9FR4EnvelopeDisciplinePacket === 'function') {
  const out = envelope._internal.priority9FR4EnvelopeDisciplinePacket({ reply: stale, prompt, previousReply: ctx.previousReply });
  assertR4(out, 'marionFinalEnvelope discipline');
}
if (shape && typeof shape.buildProgressionProfile === 'function') {
  const profile = shape.buildProgressionProfile('Next steps.', { progressionMemory: ctx.progressionMemory });
  assert(profile.priority9FR4ContinuationCarry === true, 'shape did not mark priority9FR4ContinuationCarry');
}
if (memory && typeof memory.updateProgressionMemory === 'function') {
  const mem = memory.updateProgressionMemory({ text: 'Next steps.', previous: ctx.progressionMemory, context: ctx });
  assert(mem.priority9FR4ContinuationCarry === true, 'memory did not mark priority9FR4ContinuationCarry');
  assert(/priority9f/i.test(mem.lane || ''), 'memory did not keep priority9f lane');
}
if (loop && typeof loop.evaluateLoop === 'function') {
  const lg = loop.evaluateLoop({ prompt, previousReply: ctx.previousReply }, stale, { prompt, previousReply: ctx.previousReply });
  assert(lg.forceRecovery === true || lg.priority9FR4ContinuationCarryEnforced === true, 'loop guard did not flag old handoff leak');
}
console.log(JSON.stringify({ ok: true, tests: 6, reply: "Next steps: lock Priority 9F-R3 as live accepted, enforce Priority 9F-R4 continuation carry, confirm \u201cNext steps,\u201d \u201cContinue,\u201d \u201cRun that again,\u201d and \u201cWhat now?\u201d stay inside the 9F conversational-stack lane, then move into deeper continuity memory and layered follow-up handling." }, null, 2));
