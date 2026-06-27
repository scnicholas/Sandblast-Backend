'use strict';
const assert = require('assert');
const compose = require('../Data/marion/runtime/composeMarionResponse.js');
const bridge = require('../Data/marion/runtime/marionBridge.js');
const envelope = require('../Data/marion/runtime/marionFinalEnvelope.js');

function replyOf(x){return (x && (x.reply || x.publicReply || x.visibleReply || x.finalReply || x.text || (x.finalEnvelope && x.finalEnvelope.reply) || (x.payload && x.payload.reply))) || '';}
function norm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function assertNotEcho(packet, prompt){
  const r = replyOf(packet);
  assert(r && r.length > 20, 'reply should be substantive');
  assert.notStrictEqual(norm(r), norm(prompt), 'reply must not equal prompt');
  assert(!/failureSignature|runtimeTelemetry|finalEnvelope|sessionPatch|routeKind|diagnostic packet/i.test(r), 'reply must not leak runtime details');
  assert(!/what are we working on|what's next\??$|specific target|exact target/i.test(r), 'reply must not be generic fallback');
  assert(packet.final === true || packet.marionFinal === true || (packet.finalEnvelope && packet.finalEnvelope.final === true), 'packet should be final after repair');
}

const prompt = 'Priority 9C loop suppression and fallback repair test';
const composed = compose._internal.priority90DisciplineComposePacket({reply: prompt, finalEnvelope:{reply:prompt}, meta:{lastAssistantReply:prompt}}, {input:{userText:prompt}, routed:{routing:{intent:'technical_debug'}}});
assertNotEcho(composed, prompt);
assert(/Priority 9C\/9D|response-discipline|classify/i.test(replyOf(composed)), 'compose repair should be priority-aware');

const finalPacket = envelope.createMarionFinalEnvelope({reply: prompt, text: prompt, prompt, meta:{lastAssistantReply:prompt}});
assertNotEcho(finalPacket, prompt);
assert(/Priority 9C\/9D|Priority 90\/9E|final envelope|visible reply|fresh wording/i.test(replyOf(finalPacket)), 'envelope repair should be priority-aware');

const bridged = bridge._internal.priority90BridgeDisciplinePacket({reply: prompt, finalEnvelope:{reply:prompt}, meta:{lastAssistantReply:prompt}}, {normalized:{userQuery:prompt}});
assertNotEcho(bridged, prompt);
assert(/Priority 9C\/9D|Priority 90\/9E|bridge|fresh wording/i.test(replyOf(bridged)), 'bridge repair should be priority-aware');

const continuityPrompt = 'What is Marion supposed to do?';
const direct = compose.composeMarionResponse({routing:{intent:'domain_question',domain:'general'}}, {userText:continuityPrompt});
assertNotEcho(direct, continuityPrompt);
assert(/Marion is the deeper coordination layer/i.test(replyOf(direct)), 'deterministic continuity answer should survive');



const metaLeakReply = 'I have the current request. Marion will answer from this prompt, keep the reply concrete, and avoid reusing a stale fallback.';
const continuationPrompt = 'Run that again.';
const composed9e = compose._internal.priority9EDisciplineComposePacket({reply: metaLeakReply, finalEnvelope:{reply:metaLeakReply}, meta:{lastAssistantReply:'Next steps: keep the public Nyx route clean, run the five-turn continuity test, confirm each follow-up advances the thread, then lock the stable handoff before adding new features.'}}, {input:{userText:continuationPrompt}, routed:{routing:{intent:'technical_debug'}}});
assert(!/I have the current request|answer from this prompt|avoid reusing a stale fallback|current prompt|suppression|loop detected/i.test(replyOf(composed9e)), '9E compose must suppress meta-recovery language');
assert(/Priority 90\/9E|Run the Priority|fresh wording|public answer stays conversational/i.test(replyOf(composed9e)), '9E compose should turn continuation into a concrete test sequence');
const bridged9e = bridge._internal.priority9EBridgeDisciplinePacket({reply: metaLeakReply, finalEnvelope:{reply:metaLeakReply}, meta:{lastAssistantReply:replyOf(composed9e)}}, {normalized:{userQuery:continuationPrompt}});
assert(!/I have the current request|answer from this prompt|avoid reusing a stale fallback|current prompt|suppression|loop detected/i.test(replyOf(bridged9e)), '9E bridge must suppress meta-recovery language');
const envelope9e = envelope._internal.priority9EEnvelopeDisciplinePacket({reply: metaLeakReply, prompt: continuationPrompt, finalEnvelope:{reply:metaLeakReply}, meta:{lastAssistantReply:replyOf(bridged9e)}});
assert(!/I have the current request|answer from this prompt|avoid reusing a stale fallback|current prompt|suppression|loop detected/i.test(replyOf(envelope9e)), '9E envelope must suppress meta-recovery language');

console.log(JSON.stringify({ok:true, tests:7, compose: replyOf(composed), final: replyOf(finalPacket), bridge: replyOf(bridged), direct: replyOf(direct), priority9e: replyOf(composed9e)}, null, 2));

