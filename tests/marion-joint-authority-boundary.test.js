'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const bridge=require('../Data/marion/runtime/marionBridge.js');
const final=require('../Data/marion/runtime/marionFinalEnvelope.js');
const reply='Here is a concise current-turn response that preserves the requested answer.';
const seed=()=>({reply,turnId:'joint-test-turn',sessionId:'joint-test-session',currentTurnBound:true,semanticAuthority:'marion',domain:'general',intent:'simple_chat'});
const wrapSeed=()=>({normalized:{ok:true,userQuery:'Give me one concise next step.',turnId:'joint-test-turn',sessionId:'joint-test-session',domain:'general',original:{}},routed:{ok:true,intent:'simple_chat',domain:'general',marionIntent:{intent:'simple_chat'},routing:{intent:'simple_chat',domain:'general'}},contract:{ok:true,reply,text:reply,spokenText:reply,intent:'simple_chat',domain:'general'},loopGuardResult:{ok:true,allowReply:true,forceRecovery:false,reasons:[]},resolvedEmotionPacket:{ok:false,state:{}}});
test('valid current-turn signed final survives bridge transport unchanged',async()=>{
 const issued=await final.createMarionFinalEnvelope(seed());
 assert.equal(issued.marionFinal,true,issued.diagnostics?.finalAuthorityTerminalReason);
 assert.equal(issued.finalEnvelope.signature,'MARION_FINAL_AUTHORITY');
 const transported=bridge._internal.transportSafePacket(issued);
 assert.equal(transported.marionFinal,true);
 assert.equal(transported.canEmit,true);
 assert.equal(transported.reply,reply);
 assert.equal(transported.finalEnvelope.replySignature,issued.finalEnvelope.replySignature);
});
test('unsigned transport final can never emit',()=>{
 const out=bridge._internal.transportSafePacket({ok:true,final:true,marionFinal:false,canEmit:true,reply});
 assert.equal(out.marionFinal,false);assert.equal(out.canEmit,false);
});
test('an explicitly denied builder input never receives final authority',async()=>{
 const result=await final.createMarionFinalEnvelope({...seed(),ok:false,canEmit:false,blocked:true});
 assert.equal(result.ok,false);assert.equal(result.marionFinal,false);
 assert.equal(result.canEmit,false);assert.equal(result.finalEnvelope.signature,'');
});
test('terminal envelope validator rejects an altered visible alias',async()=>{
 const checked=await final.createMarionFinalEnvelope(seed());assert.equal(checked.marionFinal,true);
 const altered=await final.attachVisibleReplyAliases({...checked,displayReply:'Different forged final reply.'});
 assert.equal(altered.ok,false);assert.equal(altered.marionFinal,false);
 assert.equal(altered.canEmit,false);
});
test('bridge wrapFinal creates a current-turn certified envelope in isolation',async()=>{
 bridge.resolveRuntimeDependencies(true);
 const result=await bridge._internal.wrapFinal(wrapSeed());
 assert.equal(result.marionFinal,true,JSON.stringify({reason:result.diagnostics?.reason,codes:result.diagnostics?.loopGuard?.finalBoundaryReasons}));
 assert.equal(result.finalEnvelope.signature,'MARION_FINAL_AUTHORITY');
 assert.equal(result.finalEnvelope.reply,reply);
});
test('bridge transport never silently repairs contradictory signed aliases',async()=>{
 const checked=await final.createMarionFinalEnvelope(seed());
 const result=bridge._internal.transportSafePacket({...checked,reply:'Changed after signature.'});
 assert.equal(result.ok,false);assert.equal(result.canEmit,false);
 assert.equal(result.marionFinal,false);
});
