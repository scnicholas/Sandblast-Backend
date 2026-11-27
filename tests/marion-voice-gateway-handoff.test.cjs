'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const runtime = path.resolve(__dirname, '..', 'Data', 'marion', 'runtime', 'MarionVoiceGateway.js');
const source = fs.readFileSync(runtime, 'utf8');
function load() {
  const module = { exports: {} };
  const nativeRequire = createRequire(runtime);
  const requireStub = (id) => id.startsWith('.') ? {} : nativeRequire(id);
  const context=vm.createContext({
    require: requireStub, module, exports: module.exports, console,
    process: { env: {} }, setTimeout, clearTimeout
  });
  vm.runInContext(source, context, {filename:runtime,timeout:5000});
  return {api:module.exports, toRealm:(value)=>vm.runInContext("("+JSON.stringify(value)+")",context)};
}
const principal = Object.freeze({verified:true,sessionVerified:true,verifiedBy:'server_middleware',role:'owner',sessionId:'verified-session-25'});
const input = {text:'How can a small business improve cash flow?',sessionId:'spoofed-session',turnId:'spoofed-turn',partitionKey:'public:spoof',sessionVerified:false,adminVerified:false};
function call(options={}) {
  const {api,toRealm}=load();
  const calls=[];
  const bridge={handleMarionAdminConversation(payload,context){calls.push({payload,context});return {ok:false, final:false, marionFinal:false,canEmit:false,error:'MARION_FINAL_AUTHORITY_REQUIRED'};}};
  return api.handleMarionAdminConversation(toRealm(input),Object.assign(toRealm({serverVerifiedAuth:principal,adminVerified:true,...options}),{bridge})).then(result=>({result,calls}));
}
test('verified middleware session and fresh turn reach both Bridge arguments',async()=>{
  const {calls,result}=await call();
  assert.equal(calls.length,1);
  const {payload,context}=calls[0];
  assert.equal(payload.sessionId,principal.sessionId);
  assert.equal(context.sessionId,principal.sessionId);
  assert.equal(payload.sessionVerified,true);
  assert.equal(context.sessionVerified,true);
  assert.equal(typeof payload.turnId,'string');
  assert.ok(payload.turnId.length>=20);
  assert.equal(payload.turnId,context.turnId);
  assert.notEqual(payload.turnId,input.turnId);
  assert.equal(payload.partitionKey,'private:admin:'+principal.sessionId);
  assert.equal(context.partitionKey,payload.partitionKey);
  assert.equal(context.memoryPartition,payload.memoryPartition);
  assert.equal(result.ok,false); // no unauthorized promotion of failed Bridge result
});
test('server-owned principal turn takes priority over caller turn',async()=>{
  const {calls}=await call({serverVerifiedAuth:{...principal,turnId:'middleware-turn-A'}});
  assert.equal(calls[0].payload.turnId,'middleware-turn-A');
  assert.equal(calls[0].context.turnId,'middleware-turn-A');
});
test('unverified request is rejected before Bridge executes',async()=>{
  const {calls,result}=await call({serverVerifiedAuth:{...principal,sessionVerified:false}});
  assert.equal(calls.length,0);
  assert.equal(result.ok,false);
  assert.equal(result.error,'MARION_ADMIN_AUTH_REQUIRED');
});
test('untrusted options session and authorization flags do not override middleware principal',async()=>{
  const {calls}=await call({sessionId:'spoofed-option-session',sessionVerified:false,authorization:{sessionVerified:false},context:{sessionId:'spoofed-context-session',partitionKey:'public:other'}});
  assert.equal(calls[0].payload.sessionId,principal.sessionId);
  assert.equal(calls[0].context.sessionId,principal.sessionId);
  assert.equal(calls[0].context.sessionVerified,true);
  assert.equal(calls[0].context.partitionKey,'private:admin:'+principal.sessionId);
});
test('Bridge cannot authorize text-to-voice with an output flag alone',async()=>{
  const {calls}=await call({adminVoiceDeliveryAllowed:false,adminVoiceRuntimeApproval:false});
  assert.equal(calls[0].payload.adminVoiceDeliveryAllowed,false);
  assert.equal(calls[0].context.adminVoiceDeliveryAllowed,false);
  const {api,toRealm}=load();
  // A deliberately forged Bridge result cannot pass certification or open voice output.
  const result=await api.handleMarionAdminConversation(toRealm({text:'test'}), Object.assign(toRealm({serverVerifiedAuth:principal,adminVerified:true}),{bridge:{handleMarionAdminConversation(){return {ok:true,final:true,marionFinal:true,reply:'unsafe',adminVoiceDeliveryAllowed:true};}}}));
  assert.equal(result.ok,false);
  assert.equal(result.canEmit,false);
});
