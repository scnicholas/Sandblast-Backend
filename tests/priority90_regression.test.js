'use strict';
const assert = require('assert');
const compose = require('./composeMarionResponse.js');
const bridge = require('./marionBridge.js');
const envelope = require('./marionFinalEnvelope.js');

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
assert(/Priority 9C\/9D|final envelope|visible reply/i.test(replyOf(finalPacket)), 'envelope repair should be priority-aware');

const bridged = bridge._internal.priority90BridgeDisciplinePacket({reply: prompt, finalEnvelope:{reply:prompt}, meta:{lastAssistantReply:prompt}}, {normalized:{userQuery:prompt}});
assertNotEcho(bridged, prompt);
assert(/Priority 9C\/9D|bridge/i.test(replyOf(bridged)), 'bridge repair should be priority-aware');

const continuityPrompt = 'What is Marion supposed to do?';
const direct = compose.composeMarionResponse({routing:{intent:'domain_question',domain:'general'}}, {userText:continuityPrompt});
assertNotEcho(direct, continuityPrompt);
assert(/Marion is the deeper coordination layer/i.test(replyOf(direct)), 'deterministic continuity answer should survive');

console.log(JSON.stringify({ok:true, tests:4, compose: replyOf(composed), final: replyOf(finalPacket), bridge: replyOf(bridged), direct: replyOf(direct)}, null, 2));
