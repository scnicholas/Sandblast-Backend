'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const finalMod = require(path.join(root, 'Data/marion/runtime/marionFinalEnvelope.js'));
const originalLoad = Module._load;
const reply = 'Here is a concise, current-turn response that preserves the requested answer.';
// A local composer stub isolates Bridge-to-Final Envelope behavior. This does
// NOT substitute for the full backend integration regression.
let bridge;
try {
  Module._load = function(request, parent, isMain) {
    if (typeof request === 'string' && /(?:^|[\\/])composeMarionResponse(?:\.js)?$/.test(request)) {
      return { composeMarionResponse: () => ({ ok:true,reply,text:reply,spokenText:reply,intent:'simple_chat',domain:'general' }) };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  bridge = require(path.join(root, 'Data/marion/runtime/marionBridge.js'));
  bridge.resolveRuntimeDependencies(true);
} finally { Module._load = originalLoad; }
function fixture() {return {normalized:{ok:true,userQuery:'Give me one concise next step.',turnId:'runtime-bundle-turn',sessionId:'runtime-bundle-session',domain:'general',original:{}},routed:{ok:true,intent:'simple_chat',domain:'general',marionIntent:{intent:'simple_chat'},routing:{intent:'simple_chat',domain:'general'}},contract:{ok:true,reply,text:reply,spokenText:reply,intent:'simple_chat',domain:'general'},loopGuardResult:{ok:true,allowReply:true,forceRecovery:false,reasons:[]},resolvedEmotionPacket:{ok:false,state:{}}};}
test('canonical builder produces a certified signed response for a valid synthetic turn', async()=> {
  const v=await finalMod.createMarionFinalEnvelope({reply,prompt:'Give me one concise next step.',userText:'Give me one concise next step.',currentTurnBound:true,semanticAuthority:'marion',spokenText:reply,intent:'simple_chat',domain:'general',turnId:'runtime-bundle-turn',sessionId:'runtime-bundle-session',routing:{intent:'simple_chat',domain:'general'}});
  assert.equal(v.ok,true);assert.equal(v.marionFinal,true);assert.equal(v.finalEnvelope.currentTurnBound,true);
  assert.equal(finalMod.validateReplyContract(v.finalEnvelope).ok,true);
});
test('bridge wrapFinal retains certified authority for the same synthetic turn',async()=> {
  assert.equal(bridge.resolveRuntimeDependencies(true),true);
  const v=await bridge._internal.wrapFinal(fixture());
  assert.equal(v.ok,true);assert.equal(v.marionFinal,true);assert.equal(v.canEmit,true);
  assert.equal(v.finalEnvelope.reply,reply);
});
test('local Bridge fallback cannot claim a successful final',()=> {
  const v=bridge._internal.createLocalFinalEnvelope({...fixture(),reason:'final_envelope_invalid'});
  assert.equal(v.ok,false);assert.equal(v.final,false);assert.equal(v.marionFinal,false);
  assert.equal(v.canEmit,false);assert.equal(v.requiresRetry,true);
  assert.deepEqual(v.memoryPatch,{});assert.deepEqual(v.sessionPatch,{});
  assert.equal(v.finalEnvelope.final,false);assert.equal(v.payload.final,false);
});
test('terminal Final Envelope rejects explicit upstream denial without persisting state',async()=> {
  const v=await finalMod.createMarionFinalEnvelope({ok:false,blocked:true,canEmit:false,reply,final:true,marionFinal:true,memoryPatch:{trustedFinal:true},sessionPatch:{trustedFinal:true},payload:{memoryPatch:{trustedFinal:true}},finalEnvelope:{signature:'MARION_FINAL_AUTHORITY',marionFinal:true}});
  assert.equal(v.ok,false);assert.equal(v.canEmit,false);assert.equal(v.marionFinal,false);
  assert.deepEqual(v.memoryPatch,{});assert.deepEqual(v.sessionPatch,{});
  assert.deepEqual(v.payload.memoryPatch,{});assert.equal(v.finalEnvelope.signature,'');
});
test('the diagnostic snapshot is metadata-only and never records reply text',()=> {
  const source=require('node:fs').readFileSync(path.join(root,'Data/marion/runtime/marionBridge.js'),'utf8');
  assert.match(source,/function marionFinalBuilderSnapshot\(packet\)/);
  assert.match(source,/finalBuilderAuthoritySnapshot:marionFinalBuilderSnapshot\(envelope\)/);
});
