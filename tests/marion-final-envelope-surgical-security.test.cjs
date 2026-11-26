'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const f=require(path.resolve(__dirname,'../Data/marion/runtime/marionFinalEnvelope.js'));
const reply='Improve cash flow by collecting invoices promptly, forecasting weekly cash needs, and controlling unnecessary expenses.';
const input=(extra={})=>({reply,currentTurnBound:true,semanticAuthority:'marion',turnId:'finance-turn-001',sessionId:'synthetic-only',intent:'business_strategy',domain:'finance',routing:{intent:'business_strategy',domain:'finance',knowledgeDomain:'finance'},meta:{turnId:'finance-turn-001',bridgeVersion:'test-bridge',composerVersion:'test-composer'},diagnostics:{singleContract:true},...extra});
const build=i=>Promise.resolve(f.createMarionFinalEnvelope(i));
test('legitimate finance reply reaches canonical signed final',async()=>{
  const r=await build(input()); assert.equal(r.ok,true); assert.equal(r.final,true);assert.equal(r.canEmit,true);
  assert.equal(r.finalEnvelope.currentTurnBound,true); assert.equal(r.finalEnvelope.completionStatus.complete,true);
  assert.equal(r.finalEnvelope.adaptiveTrustVerification.allowEmit,true);
  assert.equal(f.validateReplyContract(r.finalEnvelope).ok,true);
});
test('missing turn ID cannot mint a signed final',async()=>{
  const i=input({turnId:'',meta:{bridgeVersion:'test-bridge',composerVersion:'test-composer'}});
  const r=await build(i);assert.notEqual(r.canEmit,true);assert.notEqual(r.final,true);
});
test('unbound semantic authority cannot mint a signed final',async()=>{
  const r=await build(input({semanticAuthority:'unverified'}));assert.notEqual(r.canEmit,true);
});
test('tampered signed reply is rejected by validator',async()=>{
  const r=await build(input());const v=f.validateReplyContract({...r.finalEnvelope,reply:r.finalEnvelope.reply+' Tampered'});
  assert.equal(v.ok,false);assert.ok(v.reasons.includes('reply_signature_mismatch'));
});
test('signature aliases are verified',async()=>{
  const r=await build(input());const v=f.validateReplyContract({...r.finalEnvelope,finalSignature:'different'});
  assert.equal(v.ok,false);assert.ok(v.reasons.includes('final_signature_alias_mismatch'));
});
test('prior failure markers cannot be promoted to a final by V7 or V10',async()=>{
  const r=await build(input({ok:false,final:false,marionFinal:false,canEmit:false,requiresRetry:true,error:'UPSTREAM_DENIAL'}));
  assert.notEqual(r.ok,true);assert.notEqual(r.canEmit,true);
});
test('missing reply and diagnostic text do not generate a successful final',async()=>{
  for(const candidate of ['', 'final envelope missing']){
    const r=await build(input({reply:candidate}));assert.notEqual(r.canEmit,true);
  }
});
test('signed alias drift is denied rather than rewritten and re-signed',async()=>{
  const r=await build(input()); const bad={...r,displayReply:'Tampered signed response'};
  const projected=f.attachVisibleReplyAliases(bad);
  assert.notEqual(projected.canEmit,true);
});
test('pure alias projection preserves valid signatures and response',async()=>{
  const r=await build(input());const projected=f.attachVisibleReplyAliases(r);
  assert.equal(projected.canEmit,true);assert.equal(projected.replySignature,r.replySignature);
  assert.equal(projected.finalEnvelope.marionFinalSignature,r.finalEnvelope.marionFinalSignature);
});
test('canonical builder exports remain compatible',()=>{
  for(const n of ['createMarionFinalEnvelope','buildResponse','createResponse','finalizeTurn','safeResponse','attachVisibleReplyAliases','validateReplyContract','isMarionFinalEnvelope'])
    assert.equal(typeof f[n],'function',n);
});
test('public fast path cannot promote an unbound input',async()=>{
 const r=await build(input({currentTurnBound:false,singlePassPublicKnowledge:true}));assert.notEqual(r.canEmit,true);
});
