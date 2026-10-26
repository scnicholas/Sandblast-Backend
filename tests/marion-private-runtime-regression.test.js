'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const runtimeDir = path.resolve(__dirname, '../Data/marion/runtime');
const fakeBridgePath = path.join(runtimeDir, 'marionBridge.js');
let nextReply = '';
const fakeBridge = new Module(fakeBridgePath);
fakeBridge.filename = fakeBridgePath;
fakeBridge.loaded = true;
fakeBridge.exports = { VERSION: 'test-bridge', async processWithMarion() {return { reply: nextReply, domain: 'general', spokenText: nextReply };} };
require.cache[fakeBridgePath] = fakeBridge;
const adapter = require(path.join(runtimeDir,'marionPrivateRuntimeAdapter.js'));
const question = 'Marion, evaluate the strategic advantages and risks of migrating Sandblast Radio from BR Logic to our own streaming infrastructure. Identify three priorities and recommend an implementation sequence.';
test('private runtime refuses unauthorized request',async()=>{
 const result = await adapter.invokePrivateRuntime({prompt:question,sessionId:'unauthorized'});
 assert.equal(result.statusCode,401);
});
test('business strategy overrides stale technical continuity',()=>{
 const input = adapter._internal.normalizeInput({prompt:question,sessionId:'strategy-fresh',firstTurn:true},{verified:true});
 assert.equal(input.privateRuntimeContext.expectedDomain,'business');
 assert.match(input.privateRuntimeContext.activeSubject,/Sandblast Radio/i);
});
test('wrong task response is rejected instead of published as success',async()=>{
 nextReply='I have the thread. Give me the exact file or prompt target and I will keep the next update surgical.';
 const result = await adapter.invokePrivateRuntime({prompt:question,sessionId:'strategy-fallback',firstTurn:true},{verified:true,sessionVerified:true});
 assert.equal(result.degraded,true);
 assert.match(result.reply,/did not produce a verified, relevant answer/i);
 assert.doesNotMatch(result.reply,/give me the exact file/i);
 assert.equal(result.result.finalEnvelope.reply,result.reply);
 assert.equal(result.result.spokenText,result.reply);
});
test('relevant substantive bridge response is not replaced',async()=>{
 nextReply='For Sandblast Radio, first validate stream reliability and failover; second compare licensing and royalty obligations; third run phased listener migration. The advantage is distribution control; the risks are downtime and new operating costs.';
 const result=await adapter.invokePrivateRuntime({prompt:question,sessionId:'strategy-good',firstTurn:true},{verified:true,sessionVerified:true});
 assert.equal(result.degraded,false);
 assert.match(result.reply,/licensing and royalty/);
});
test('no leakage of public Nyx identity into private response',async()=>{
 nextReply='I have the thread. Give me the exact file or prompt target and I will keep the next update surgical.';
 const result=await adapter.invokePrivateRuntime({prompt:question,sessionId:'strategy-private',firstTurn:true},{verified:true,sessionVerified:true});
 assert.equal(result.privateRuntimeContext.version,adapter.CONTRACT);
 assert.equal(result.result.finalEnvelope.marionFinal,true);
 assert.doesNotMatch(result.reply,/I.m Nyx/i);
});
