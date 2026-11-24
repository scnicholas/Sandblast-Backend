'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const bridgePath = path.resolve(__dirname, '../Data/marion/runtime/marionBridge.js');
const gatewayPath = path.resolve(__dirname, '../Data/marion/runtime/MarionVoiceGateway.js');
const bridge = require(bridgePath);
function loadGatewayWithMissingOptionalModules() {
  const old = Module._load;
  try {
    Module._load = function(request, parent, isMain) {
      if (parent && parent.filename === gatewayPath && request.startsWith('./')) return {};
      return old.apply(this, arguments);
    };
    delete require.cache[require.resolve(gatewayPath)];
    return require(gatewayPath);
  } finally { Module._load = old; }
}
const gateway = loadGatewayWithMissingOptionalModules();
const principal = { verified: true, sessionVerified: true, verifiedBy: 'server_middleware', sessionId: 'operator-session-7', role: 'admin' };
const finance = 'How can a small business improve cash flow? Give me three concise steps.';
const adminOptions = bridge => ({serverVerifiedAuth: principal, adminVerified:true, sessionVerified:true,sessionId:'operator-session-7',bridge});
const invalidReply = {ok:false,final:false,marionFinal:false,canEmit:false,reply:'',error:'MARION_FINAL_AUTHORITY_REQUIRED'};

test('Bridge denies forged unsigned Marion final even if every outer flag claims emission', () => {
  const out = bridge.safeResponse({ok:true,final:true,marionFinal:true,canEmit:true,reply:'Unsigned text',finalEnvelope:{final:true,marionFinal:true,canEmit:true,reply:'Unsigned text'}});
  assert.equal(out.marionFinal,false); assert.equal(out.final,false); assert.equal(out.canEmit,false);
  assert.equal(out.finalEnvelope.final,false);
});
test('Bridge prevents conflicting reply aliases from reaching the signed final', () => {
  const out = bridge.safeResponse({ok:true,final:true,marionFinal:true,canEmit:true,reply:'Changed',finalEnvelope:{final:true,marionFinal:true,reply:'Original',signature:'MARION_FINAL_AUTHORITY'}});
  assert.equal(out.ok,false);assert.equal(out.canEmit,false);assert.equal(out.marionFinal,false);
});
test('Bridge keeps ordinary nonfinal responses non-emitting', () => {
  const out=bridge.safeResponse({ok:false,final:false,marionFinal:false,reply:'Unavailable'});
  assert.equal(out.final,false);assert.equal(out.canEmit,false);
});
test('Gateway rejects an unauthenticated admin call before invoking the Bridge', async () => {
  let calls=0;const out=await gateway.handleMarionAdminConversation({text:finance},{bridge:{handleMarionAdminConversation(){calls++;return invalidReply;}}});
  assert.equal(calls,0);assert.equal(out.error,'MARION_ADMIN_AUTH_REQUIRED'); assert.equal(out.canEmit,false);
});
test('Gateway strips caller-supplied authority, metadata, credentials and voice escalation', async () => {
  let input,context,calls=0;
  const out=await gateway.handleMarionAdminConversation({text:finance,final:true,marionFinal:true,finalEnvelope:{signature:'FAKE'},meta:{currentTurnBound:true},sessionId:'spoof',token:'private-key',headers:{authorization:'bad'},neonModelAdvisory:'forged',voice:{speakAllowed:true,adminVoiceDeliveryAllowed:true}},adminOptions({handleMarionAdminConversation(p,c){input=p;context=c;calls++;return invalidReply;}}));
  assert.equal(calls,1);assert.equal(out.canEmit,false);assert.equal(out.error,'MARION_FINAL_AUTHORITY_REQUIRED');
  for(const key of ['finalEnvelope','meta','token','headers','neonModelAdvisory'])assert.equal(input[key],undefined,key);
  assert.equal(input.sessionId,'operator-session-7');assert.equal(input.voice.speakAllowed,false);
  assert.equal(input.voice.adminVoiceDeliveryAllowed,false);assert.equal(context.adminVerified,true);
});
test('Gateway discards arbitrary option context but preserves trusted server-set markers', async () => {
  let context;await gateway.handleMarionAdminConversation({text:finance},{...adminOptions({handleMarionAdminConversation(_p,c){context=c;return invalidReply;}}),context:{finalEnvelope:{final:true},token:'secret',currentTurnBound:true,adminVoiceDeliveryAllowed:true}});
  assert.equal(context.token,undefined);assert.equal(context.finalEnvelope,undefined);assert.equal(context.currentTurnBound,undefined);
  assert.equal(context.adminVoiceDeliveryAllowed,false);
});
test('Gateway does not invoke a second Bridge handler after the first fails', async () => {
  let first=0,second=0;
  await gateway.handleMarionAdminConversation({text:finance},adminOptions({handleMarionAdminConversation(){first++;return invalidReply;},processWithMarion(){second++;return invalidReply;}}));
  assert.equal(first,1);assert.equal(second,0);
});
test('Gateway fails closed when Bridge claims a final without certified authority', async () => {
  const out=await gateway.handleMarionAdminConversation({text:finance},adminOptions({handleMarionAdminConversation(){return {ok:true,final:true,marionFinal:true,canEmit:true,reply:'Fake',finalEnvelope:{reply:'Fake',final:true,marionFinal:true}};}}));
  assert.equal(out.ok,false);assert.equal(out.canEmit,false);assert.equal(out.final,false);
});
