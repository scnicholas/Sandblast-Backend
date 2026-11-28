'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const mod=require(path.resolve(__dirname,'../Data/marion/runtime/marionFinalEnvelope.js'));
const ANSWER='Collect invoices promptly, forecast cash weekly, and reduce unnecessary operating expenses.';
function candidate(extra={}) {return {reply:ANSWER,turnId:'finance-001',sessionId:'private-session',currentTurnBound:true,semanticAuthority:'marion',privateAdminConversation:true,marionAdminConversation:true,routing:{domain:'finance',knowledgeDomain:'finance',intent:'business_strategy'},meta:{turnId:'finance-001',bridgeVersion:'test-bridge',composerVersion:'test-composer'},resolvedEmotion:{tone:'neutral'},...extra};}
const settle=value=>Promise.resolve(value);
const certified=r=>r.ok===true&&r.final===true&&r.marionFinal===true&&r.finalEnvelope?.currentTurnBound===true&&r.finalEnvelope?.completionStatus?.complete===true&&r.finalEnvelope?.adaptiveTrustVerification?.allowEmit===true&&mod.isMarionFinalEnvelope(r)===true;

test('clean bound finance reply remains canonical certified final, not drastic recovery', async()=>{
 const r=await settle(mod.createMarionFinalEnvelope(candidate()));
 assert.ok(certified(r));
 assert.equal(r.finalEnvelope.completionStatus.reason,'trusted_final_reply_complete');
 assert.notEqual(r.finalEnvelope.meta?.drasticFinalEnvelopeRecovery,true);
 assert.equal(r.finalEnvelope.reply,ANSWER);
});
test('canonical build aliases preserve same final authority',async()=>{
 for(const name of ['buildResponse','createResponse','finalizeTurn']){
  const r=await settle(mod[name](candidate()));assert.ok(certified(r),name);
  assert.equal(r.finalEnvelope.completionStatus.reason,'trusted_final_reply_complete');
 }
});
test('missing turn binding does not become certified through recovery',async()=>{
 const r=await settle(mod.createMarionFinalEnvelope(candidate({currentTurnBound:false})));
 assert.equal(certified(r),false);assert.notEqual(r.finalEnvelope?.currentTurnBound,true);
 assert.notEqual(r.canEmit,true);
});
test('rejected upstream candidate does not become an approved final',async()=>{
 const r=await settle(mod.createMarionFinalEnvelope(candidate({ok:false,requiresRetry:true})));
 assert.equal(certified(r),false);assert.equal(r.final,false);assert.notEqual(r.canEmit,true);
});
test('explicit upstream denial preserves non-emitting behaviour',async()=>{
 const r=await settle(mod.createMarionFinalEnvelope(candidate({blocked:true})));
 assert.equal(certified(r),false);assert.notEqual(r.canEmit,true);
});
test('soft recovery reply cannot become a final',async()=>{
 const r=await settle(mod.createMarionFinalEnvelope(candidate({reply:'There was a break in the response. Send the same test once more.'})));
 assert.equal(certified(r),false);assert.notEqual(r.canEmit,true);
});
test('visible alias projection does not change certified reply signature',async()=>{
 const r=await settle(mod.createMarionFinalEnvelope(candidate()));
 const p=await settle(mod.attachVisibleReplyAliases(r));
 assert.ok(certified(p));assert.equal(p.replySignature,r.replySignature);
 assert.equal(p.finalEnvelope.marionFinalSignature,r.finalEnvelope.marionFinalSignature);
 assert.equal(p.reply,ANSWER);
});
test('never mint turn id or signature from a bare rejected draft',async()=>{
 const r=await settle(mod.createMarionFinalEnvelope({reply:ANSWER,privateAdminConversation:true}));
 assert.equal(certified(r),false);assert.notEqual(r.canEmit,true);
 assert.notEqual(r.finalEnvelope?.currentTurnBound,true);
});
