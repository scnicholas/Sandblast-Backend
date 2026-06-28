
const assert = require('assert');
const compose = require('../Data/marion/runtime/composeMarionResponse.js');
const bridge = require('../Data/marion/runtime/marionBridge.js');
const envelope = require('../Data/marion/runtime/marionFinalEnvelope.js');
const shape = require('../Data/marion/runtime/progressionShape.js');
const memory = require('../Data/marion/runtime/progressionMemory.js');
const router = require('../Data/marion/runtime/marionIntentRouter.js');
const concierge = require('../Data/marion/runtime/DomainConcierge.js');
const confidence = require('../Data/marion/runtime/domainConfidence.js');
const admin = require('../Data/marion/runtime/MarionAdminConsoleGateway.js');
const spine = require('../Utils/stateSpine.js');

const badPrior = {
  reply: 'Priority 9J: proactive operational guidance and next-move authority. Recommended next move: choose the safest concrete action.',
  priority9JProactiveOperationalGuidance: { lane: 'priority9j_proactive_operational_guidance', active: true },
  priority9IAdaptiveSituationalReasoning: { lane: 'priority9i_adaptive_situational_reasoning', active: true }
};

const prompt = 'No, not that — stay on the architecture.';
assert.equal(compose._internal.priority9IJShouldForceText(prompt, JSON.stringify(badPrior), badPrior.reply), '9i');
let packet = compose._internal.priority9IJComposerDisciplinePacket({...badPrior}, {text:prompt}, {});
assert(packet.reply.includes('Priority 9I'), packet.reply);
assert(!packet.reply.startsWith('Priority 9J'), packet.reply);

packet = bridge._internal.priority9IJBridgeDisciplinePacket({...badPrior}, {text:prompt});
assert(packet.reply.includes('Priority 9I'), packet.reply);
packet = envelope._internal.priority9IJEnvelopeDisciplinePacket({...badPrior, text: prompt});
assert(packet.reply.includes('Priority 9I'), packet.reply);

const profile = shape.buildPriority9I9JProgressionProfile(prompt, badPrior);
assert(profile.lane === 'priority9i_adaptive_situational_reasoning', profile.lane);
const mem = memory.updateProgressionMemory({text:prompt, previous:badPrior});
assert(mem.lane === 'priority9i_adaptive_situational_reasoning' || (mem.priority9IAdaptiveSituationalReasoning && mem.priority9IAdaptiveSituationalReasoning.lane === 'priority9i_adaptive_situational_reasoning'), JSON.stringify(mem).slice(0,300));
const route = router.routeMarionIntent({text:prompt, ...badPrior});
assert(route.priorityLane === 'Priority 9I' || route.routeKind === 'priority9i_adaptive_situational_reasoning', JSON.stringify(route).slice(0,400));
const conf = (confidence.default||confidence.buildDomainConfidenceProfile)({text:prompt, ...badPrior});
assert(conf.priorityLane === 'Priority 9I' || conf.domain === 'execution_context', JSON.stringify(conf).slice(0,400));
const con = (concierge.routeOrClarify||concierge.runDomainConcierge)({text:prompt, ...badPrior});
assert(con.priorityLane === 'Priority 9I' || con.routeKind === 'priority9i_adaptive_situational_reasoning', JSON.stringify(con).slice(0,400));
const state = spine.priority9IJStatePatchFromInput({text:prompt}, badPrior);
assert(state.priorityLane === 'Priority 9I', JSON.stringify(state).slice(0,400));

// 9J still activates on explicit 9J prompt
const jPrompt = 'Priority 9J is proactive operational guidance and next-move authority.';
assert.equal(compose._internal.priority9IJShouldForceText(jPrompt, '', ''), '9j');
const jPacket = compose._internal.priority9IJComposerDisciplinePacket({reply:''}, {text:jPrompt}, {});
assert(jPacket.reply.includes('Priority 9J'), jPacket.reply);

// 9I pressure prompts stay 9I even if context contains 9J precheck
for (const p of ['This is urgent.','We need to pivot.','What is the risk now?','Slow down.','Go deeper.','Do the safest next move.']) {
  const lane = compose._internal.priority9IJShouldForceText(p, JSON.stringify({priority9JPrecheck:{staged:true},priority9IAdaptiveSituationalReasoning:{active:true}}), 'Priority 9J staged next');
  assert.equal(lane, '9i', p + ' -> ' + lane);
}

console.log(JSON.stringify({ok:true, tests:22, hotfix:'Priority 9I-R1 9J premature escalation containment', prompt, lane:'Priority 9I', explicit9J:'Priority 9J still available'}));
