'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const runtime = path.resolve(__dirname, '../Data/marion/runtime');
const gatewayPath = path.join(runtime, 'MarionVoiceGateway.js');
const stubs = {
  './MarionVoiceInputEnvelope': { createVoiceInputEnvelope: () => ({}) },
  './MarionVoiceAuthorizationGate': { applyVoiceAuthorization: () => ({}) },
  './MarionVoiceTranscriptNormalizer': { applyTranscriptNormalization: () => ({}) },
  './MarionVoiceOutputPolicy': { applyVoiceOutputPolicy: () => ({}) },
  './MarionVoiceTelemetry': { createVoiceTelemetryEvent: () => ({}) }
};
const originalLoad = Module._load;
let gateway;
try {
  Module._load = function(request, parent, isMain) {
    if (parent && parent.filename === gatewayPath && Object.hasOwn(stubs, request)) return stubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  gateway = require(gatewayPath);
} finally { Module._load = originalLoad; }
const bridge = require(path.join(runtime, 'marionBridge.js'));
function hash(text) {
  const source = String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let h = 0; for (const c of source) { h = ((h << 5) - h) + c.charCodeAt(0); h |= 0; }
  return String(h >>> 0);
}
function final(reply) {
  const aliases = { authoritativeReply:reply, reply, text:reply, finalReply:reply };
  return { ...aliases, ok:true, final:true, marionFinal:true, canEmit:true,
    currentTurnBound:true, semanticAuthority:'marion', replySignature:hash(reply),
    payload:{ ...aliases, final:true, marionFinal:true },
    finalEnvelope:{ ...aliases, final:true, marionFinal:true, canEmit:true,
      currentTurnBound:true, semanticAuthority:'marion', signature:'MARION_FINAL_AUTHORITY', replySignature:hash(reply) } };
}
function options(handler) {
  return {serverVerifiedAuth:{ verified:true, sessionVerified:true, verifiedBy:'server_middleware', sessionId:'operator-session-7', role:'admin' },
    adminVerified:true, serverSideAdminAuth:true, trustedServerAuth:true,
    sessionVerified:true, sessionId:'operator-session-7', bridge:{handleMarionAdminConversation:handler} };
}
test('valid signed Marion final is unchanged', async () => {
  const reply='The current Marion response is authorized and complete.';
  const out=await gateway.handleMarionAdminConversation({text:'status'}, options(async () => final(reply)));
  assert.equal(out.ok,true,out.error);
  assert.equal(out.reply,reply);
});
test('public Nyx intro in a signed private packet is rejected', async () => {
  const reply="I'm Nyx, the public Sandblast assistant. I can help you explore Sandblast.";
  const out=await gateway.handleMarionAdminConversation({text:'status'}, options(async () => final(reply)));
  assert.equal(out.ok,false); assert.equal(out.canEmit,false);
  assert.equal(out.error,'MARION_PRIVATE_PUBLIC_REPLY_CROSSOVER'); assert.equal(out.reply,'');
});
test('client-supplied admin assertions do not authorize request', async () => {
  const out=await gateway.handleMarionAdminConversation({text:'status', adminVerified:true}, {bridge:{handleMarionAdminConversation:async()=>final('secret')}});
  assert.equal(out.ok,false); assert.equal(out.error,'MARION_ADMIN_AUTH_REQUIRED');
});
test('bridge rejects contradictory signed reply aliases', () => {
  const pkt=final('Signed original'); pkt.reply='Tampered alternate';
  const out=bridge.safeResponse(pkt);
  assert.equal(out.ok,false); assert.equal(out.canEmit,false);
  assert.ok(['MARION_FINAL_REPLY_ALIAS_CONFLICT','marion_semantic_reply_missing'].includes(out.error)); assert.equal(out.reply,'');
});
