'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mod = require(path.join(__dirname, 'marionFinalEnvelope.js'));
const reply = 'Three ways to improve cash flow are to send invoices promptly, negotiate payment terms, and monitor spending weekly.';
const input = () => ({ reply,turnId:'finance-test-turn-1',currentTurnBound:true,semanticAuthority:'marion',routing:{domain:'finance',knowledgeDomain:'finance'} });
const certified = async () => { const v = await mod.createMarionFinalEnvelope(input()); assert.equal(v.ok,true,JSON.stringify(v.diagnostics?.finalAuthorityTerminalReason)); return v; };
test('valid finance final remains certified and its signed reply is unchanged',async()=>{
  const v=await certified();
  assert.equal(v.final,true);assert.equal(v.marionFinal,true);assert.notEqual(v.canEmit,false);
  assert.equal(v.reply,v.finalEnvelope.reply);assert.equal(v.speechText,v.reply);
  assert.equal(v.replySignature,v.finalEnvelope.replySignature);
  assert.equal(mod.validateReplyContract(v.finalEnvelope).ok,true);
});
test('missing current-turn authority cannot be emitted',async()=>{
  const v=await mod.createMarionFinalEnvelope({reply,routing:{domain:'finance'}});
  assert.equal(v.ok,false);assert.equal(v.canEmit,false);
  assert.equal(v.currentTurnBound,false);assert.equal(v.finalEnvelope.currentTurnBound,false);
  assert.equal(v.finalEnvelope.completionStatus.complete,false);
});
test('alias helper does not confer authority to draft response',()=>{
  const raw={reply,final:false,canEmit:false,payload:{reply},finalEnvelope:{reply}};
  const v=mod.attachVisibleReplyAliases(raw);
  assert.notEqual(v.final,true);assert.notEqual(v.canEmit,true);
  assert.notEqual(v.finalEnvelope.final,true);
});
test('alias helper leaves pre-certified signed reply unchanged',async()=>{
  const v=await certified();const sig=v.finalEnvelope.marionFinalSignature;
  const out=await mod.attachVisibleReplyAliases(v);
  assert.equal(out.finalEnvelope.marionFinalSignature,sig);
  assert.equal(out.finalEnvelope.reply,reply);
  assert.equal(out.reply,reply);
});
test('modified reply aliases fail closed',async()=>{
  const v=await certified();const tampered={...v,displayReply:'Different answer with different financial advice.'};
  const out=await mod.attachVisibleReplyAliases(tampered);
  assert.equal(out.ok,false);assert.equal(out.canEmit,false);
  assert.equal(out.finalEnvelope.signature,'');
  assert.equal(out.displayReply,'');
});
test('corrupted reply hash fails closed',async()=>{
  const v=await certified();const tampered={...v,finalEnvelope:{...v.finalEnvelope,replySignature:'99999999'}};
  const out=await mod.attachVisibleReplyAliases(tampered);
  assert.equal(out.ok,false);assert.equal(out.finalEnvelope.final,false);
});
test('missing trust approval fails closed',async()=>{
  const v=await certified();const tampered={...v,finalEnvelope:{...v.finalEnvelope,adaptiveTrustVerification:{allowEmit:false}}};
  const out=await mod.attachVisibleReplyAliases(tampered);
  assert.equal(out.ok,false);assert.equal(out.canEmit,false);
});
test('explicit denial cannot be promoted by constructor decorators',async()=>{
  const v=await mod.createMarionFinalEnvelope({ ...input(), ok:false,canEmit:false,requiresRetry:true});
  assert.equal(v.ok,false);assert.equal(v.canEmit,false);
  assert.equal(v.finalEnvelope.currentTurnBound,false);
});
test('display synchronization does not enable private voice',async()=>{
  const v=await certified();const raw={...v,voice:{speakAllowed:false,adminVoiceDeliveryAllowed:false}};
  const out=await mod.attachVisibleReplyAliases(raw);
  assert.equal(out.voice.speakAllowed,false);
  assert.notEqual(out.privateVoiceReceive?.speakAllowed,true);
});

test('certification predicate accepts a certified packet and rejects draft',async()=>{
  const v=await certified();
  assert.equal(mod.isMarionFinalEnvelope(v),true);
  assert.equal(mod.isMarionFinalEnvelope(v.finalEnvelope),true);
  assert.equal(mod.isMarionFinalEnvelope({reply}),false);
});
test('safeResponse preserves valid signed final instead of legacy rewrite',async()=>{
  const v=await certified();const out=await mod.safeResponse(v);
  assert.equal(out.ok,true);
  assert.equal(out.finalEnvelope.reply,v.finalEnvelope.reply);
  assert.equal(out.finalEnvelope.marionFinalSignature,v.finalEnvelope.marionFinalSignature);
});
