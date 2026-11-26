'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const gatewayPath = path.resolve(__dirname, '../Data/marion/runtime/MarionVoiceGateway.js');
const originalLoad = Module._load;
const stubs = {
  './MarionVoiceInputEnvelope': { createVoiceInputEnvelope: () => ({}) },
  './MarionVoiceAuthorizationGate': { applyVoiceAuthorization: () => ({}) },
  './MarionVoiceTranscriptNormalizer': { applyTranscriptNormalization: () => ({}) },
  './MarionVoiceOutputPolicy': { applyVoiceOutputPolicy: () => ({}) },
  './MarionVoiceTelemetry': { createVoiceTelemetryEvent: () => ({}) }
};
Module._load = function(request,parent,isMain) {
  if (parent && parent.filename === gatewayPath && Object.hasOwn(stubs,request)) return stubs[request];
  return originalLoad.apply(this,arguments);
};
let gateway;
try { gateway = require(gatewayPath); } finally { Module._load = originalLoad; }
function hash(value) {
  const source = String(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  let n=0; for (const char of source) { n=((n<<5)-n)+char.charCodeAt(0); n |= 0; }
  return String(n>>>0);
}
function fixture(reply) {
  const aliases={reply,text:reply,displayReply:reply,visibleReply:reply,finalReply:reply,spokenText:reply};
  return {...aliases,ok:true,final:true,marionFinal:true,canEmit:true,semanticAuthority:'marion',
    currentTurnBound:true,replySignature:hash(reply),
    finalEnvelope:{...aliases,final:true,marionFinal:true,canEmit:true,semanticAuthority:'marion',
      currentTurnBound:true,signature:'MARION_FINAL_AUTHORITY',replySignature:hash(reply)}};
}
function options(bridge) {return {
  bridge, serverVerifiedAuth:{verified:true,sessionVerified:true,verifiedBy:'server_middleware',sessionId:'server-session-123',role:'admin'},
  adminVerified:true,serverSideAdminAuth:true,sessionVerified:false,
  partitionKey:'untrusted-other-partition',sessionId:'untrusted-session'
};}
test('authenticated principal binds session and one server-created turn across payload and context',async()=>{
  let calls=0,request,ctx;
  const bridge={handleMarionAdminConversation(input,context){calls++;request=input;ctx=context;return fixture('Invoice promptly. Forecast payments. Control expenses.');}};
  const out=await gateway.handleMarionAdminConversation({text:'Finance advice',turnId:'forged-turn',sessionId:'forged-session',token:'SECRET',adminVerified:false},options(bridge));
  assert.equal(calls,1);
  assert.equal(out.ok,true);
  assert.equal(request.sessionVerified,true);
  assert.equal(ctx.sessionVerified,true);
  assert.equal(request.sessionId,'server-session-123');
  assert.equal(ctx.sessionId,'server-session-123');
  assert.equal(request.partitionKey,'private:admin:server-session-123');
  assert.equal(ctx.partitionKey,request.partitionKey);
  assert.equal(typeof request.turnId,'string');
  assert.match(request.turnId,/^[0-9a-f-]{36}$/);
  assert.notEqual(request.turnId,'forged-turn');
  assert.equal(ctx.turnId,request.turnId);
  assert.equal(request.token,undefined);
  assert.equal(request.adminVerified,true);
});
test('different invocations use distinct turn identifiers',async()=>{
 const ids=[]; const bridge={handleMarionAdminConversation(input){ids.push(input.turnId);return fixture('One legitimate answer.');}};
 await gateway.handleMarionAdminConversation({text:'First'},options(bridge));
 await gateway.handleMarionAdminConversation({text:'Second'},options(bridge));
 assert.equal(ids.length,2); assert.notEqual(ids[0],ids[1]);
});
test('unverified principal never invokes private bridge',async()=>{
 let calls=0;
 const bridge={handleMarionAdminConversation(){calls++;return fixture('Never reveal this.');}};
 const o=options(bridge); o.serverVerifiedAuth={...o.serverVerifiedAuth,sessionVerified:false};
 const out=await gateway.handleMarionAdminConversation({text:'Private'},o);
 assert.equal(calls,0); assert.equal(out.ok,false); assert.equal(out.error,'MARION_ADMIN_AUTH_REQUIRED');
});
test('tampered bridge reply fails closed',async()=>{
 const bridge={handleMarionAdminConversation(){const x=fixture('Certified text.');x.reply='Changed text.';return x;}};
 const out=await gateway.handleMarionAdminConversation({text:'Private'},options(bridge));
 assert.equal(out.ok,false);assert.equal(out.canEmit,false);assert.equal(out.reply,'');
});
test('failed bridge packet is never rewritten into successful final',async()=>{
 const bridge={handleMarionAdminConversation(){return {ok:false,final:false,marionFinal:false,canEmit:false,reply:'Holding text'};}};
 const out=await gateway.handleMarionAdminConversation({text:'Private'},options(bridge));
 assert.equal(out.ok,false);assert.equal(out.marionFinal,false);assert.equal(out.reply,'');
});
