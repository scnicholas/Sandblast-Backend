'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const Module = require('node:module');
const gatewayFile = path.resolve(__dirname, '../Data/marion/runtime/MarionVoiceGateway.js');
const originalLoad = Module._load;
let parityCalls = 0;
const stubs = {
  './MarionVoiceInputEnvelope': { createVoiceInputEnvelope: () => ({}) },
  './MarionVoiceAuthorizationGate': { applyVoiceAuthorization: () => ({}) },
  './MarionVoiceTranscriptNormalizer': { applyTranscriptNormalization: () => ({}) },
  './MarionVoiceOutputPolicy': { applyVoiceOutputPolicy: () => ({}) },
  './MarionVoiceTelemetry': { createVoiceTelemetryEvent: () => ({}) },
  './voiceTextParityIdentityDriftHardlock.js': {
    projectResult: (packet) => {
      parityCalls += 1;
      return { ...packet, reply: "I'm Nyx, the public Sandblast assistant. I can help you explore Sandblast." };
    },
    projectAuthorizationResult: (packet) => packet,
    compareVoiceTextParity: () => ({}),
  },
};
let gateway;
try {
  Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === gatewayFile && Object.hasOwn(stubs, request)) return stubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  gateway = require(gatewayFile);
} finally {
  Module._load = originalLoad;
}
function hash(value) {
  const text = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let h = 0;
  for (const ch of text) h = ((h << 5) - h + ch.charCodeAt(0)) | 0;
  return String(h >>> 0);
}
function signedFinal(reply) {
  const aliases = { authoritativeReply: reply, reply, text: reply, message: reply, displayReply: reply, visibleReply: reply, finalReply: reply };
  return { ...aliases, ok: true, final: true, marionFinal: true, canEmit: true, currentTurnBound: true, semanticAuthority: 'marion', replySignature: hash(reply), payload: { ...aliases, final: true, marionFinal: true, canEmit: true }, finalEnvelope: { ...aliases, final: true, marionFinal: true, canEmit: true, currentTurnBound: true, semanticAuthority: 'marion', signature: 'MARION_FINAL_AUTHORITY', replySignature: hash(reply) } };
}
function options(bridge, extra={}) {
  return {serverVerifiedAuth:{verified:true,sessionVerified:true,verifiedBy:'server_middleware',sessionId:'test-session',role:'admin'},adminVerified:true,serverSideAdminAuth:true,trustedServerAuth:true,sessionVerified:true,sessionId:'test-session',partitionKey:'private:admin:test-session',bridge,...extra};
}
test('private Marion reply survives voice-only parity wrapper', async () => {
  let calls = 0;
  const reply = 'The current Marion response is authorized and complete.';
  const packet = await gateway.handleMarionAdminConversation({text:'show status'}, options({handleMarionAdminConversation:async()=>{calls++;return signedFinal(reply);}}));
  assert.equal(calls, 1);
  assert.equal(packet.ok, true, packet.error);
  assert.equal(packet.reply, reply);
  assert.equal(packet.finalEnvelope.replySignature, hash(reply));
  assert.equal(parityCalls, 0, 'voice-only parity projector must not transform private text');
});
test('forged client principal is denied', async () => {
  let calls = 0;
  const result = await gateway.handleMarionAdminConversation({text:'secret', serverVerifiedAuth:{verified:true,role:'admin'}},{bridge:{handleMarionAdminConversation(){calls++;return signedFinal('secret');}}});
  assert.equal(calls, 0);
  assert.equal(result.ok, false);
  assert.equal(result.canEmit, false);
});
test('altered signed reply is rejected', async () => {
  const result = await gateway.handleMarionAdminConversation({text:'status'}, options({handleMarionAdminConversation(){const packet=signedFinal('Valid initial final reply.');packet.reply='Altered final reply text.';return packet;}}));
  assert.equal(result.ok, false);
  assert.equal(result.canEmit, false);
});
test('public Nyx introduction is not certified as private Marion final', async () => {
  const reply="I'm Nyx, the public Sandblast assistant. I can help you explore Sandblast.";
  const result=await gateway.handleMarionAdminConversation({text:'finance status'},options({handleMarionAdminConversation(){return signedFinal(reply);}}));
  assert.equal(result.ok,false);
  assert.equal(result.canEmit,false);
});
