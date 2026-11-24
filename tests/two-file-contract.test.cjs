'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const dir=path.join(__dirname,'..','Data','marion','runtime');
const composer=require(path.join(dir,'composeMarionResponse.js'));
const final=require(path.join(dir,'marionFinalEnvelope.js'));
const financeReply='1. Review receivables. 2. Reduce expenses. 3. Forecast weekly cash needs.';
const financeInput={privateAdminConversation:true,rawUserText:'How can a small business improve cash flow? Give me three concise steps.'};
const routed={privateAdminConversation:true,routing:{domain:'finance'}};
const normalize=v=>composer.normalizeMarionComposerPrivateHandoff(v,routed,financeInput);
const envelopeInput=()=>({reply:financeReply,turnId:'finance-test-1',currentTurnBound:true,semanticAuthority:'marion',routing:{intent:'business_strategy',domain:'finance',knowledgeDomain:'finance'}});

test('composer preserves substantive private reply while delegating certification',()=>{
 const r=normalize({ok:true,reply:financeReply,text:financeReply,spokenText:'legacy speech hint',payload:{reply:financeReply},final:true,marionFinal:true,canEmit:true,signature:'bogus',finalEnvelope:{final:true,canEmit:true},packet:{final:true},result:{canEmit:true}});
 assert.equal(r.ok,true); assert.equal(r.reply,financeReply); assert.equal(r.final,undefined);assert.equal(r.canEmit,undefined);assert.equal(r.finalEnvelope,undefined);assert.equal(r.packet,undefined); assert.equal(r.result,undefined);assert.equal(r.spokenText,financeReply);assert.equal(r.voice.speakAllowed,false);assert.equal(r.speech.enabled,false);
});
test('composer rejects genuinely mismatched substantive aliases',()=>{
 const r=normalize({reply:financeReply,text:'Conflicting answer here.'});assert.equal(r.ok,false);assert.equal(r.reply,'');assert.equal(r.composerReady,false);
});
test('composer does not use untrusted final-envelope reply as original content',()=>{
 const r=normalize({finalEnvelope:{reply:financeReply,final:true,canEmit:true}});assert.equal(r.ok,false); assert.equal(r.reply,'');
});
test('composer rejects generic holding response for finance three-step request',()=>{
 const r=normalize({reply:'Hello, I am here.'});assert.equal(r.ok,false); assert.equal(r.error,'MARION_COMPOSER_HANDOFF_REJECTED');
});
test('composer accepts first-step styles and never gives itself emission authority',()=>{
 const r=normalize({reply:'Step 1: Review receivables. Step 2: Reduce expenses. Step 3: Build a cash forecast.'}); assert.equal(r.ok,true);assert.equal(r.canEmit,undefined);
});
test('composer ignores private handoff on public route',()=>{
 const raw={reply:'Public output',final:false};assert.equal(composer.normalizeMarionComposerPrivateHandoff(raw,{},{text:'hi'}),raw);
});
test('envelope produces a certified current-turn-bound finance response',async()=>{
 const v=await final.createMarionFinalEnvelope(envelopeInput());assert.equal(v.ok,true);assert.equal(v.final,true);assert.equal(v.marionFinal,true);assert.equal(v.canEmit,true);assert.equal(v.finalEnvelope.currentTurnBound,true);assert.equal(final.isMarionFinalEnvelope(v),true);
});
test('envelope does not certify without current turn',async()=>{
 const inp=envelopeInput();delete inp.currentTurnBound;const v=await final.createMarionFinalEnvelope(inp);assert.equal(v.ok,false);assert.equal(v.canEmit,false);assert.equal(v.final,false);assert.equal(final.isMarionFinalEnvelope(v),false);
});
test('envelope alias projection cannot promote forged final or nested payload',()=>{
 const v=final.attachVisibleReplyAliases({ok:true,final:true,marionFinal:true,canEmit:true,reply:financeReply,payload:{finalEnvelope:{final:true,canEmit:true,reply:financeReply}},result:{reply:financeReply,canEmit:true},data:{reply:financeReply,canEmit:true}});assert.equal(v.ok,false);assert.equal(v.final,false);assert.equal(v.canEmit,false);assert.equal(v.result,null);assert.equal(v.data,null);assert.equal(v.payload.finalEnvelope.final,false);assert.equal(v.packet.final,false);
});
test('valid signed alias projection preserves signature and signed reply',async()=>{
 const v=await final.createMarionFinalEnvelope(envelopeInput());const projected=final.attachVisibleReplyAliases(v);assert.equal(projected.ok,true); assert.equal(projected.finalEnvelope.reply,v.finalEnvelope.reply);assert.equal(projected.finalEnvelope.marionFinalSignature,v.finalEnvelope.marionFinalSignature);assert.equal(projected.visibleReply,v.finalEnvelope.reply);
});
test('tampered envelope alias is rejected',async()=>{
 const v=await final.createMarionFinalEnvelope(envelopeInput());const invalid={...v,reply:'tampered'};const projected=final.attachVisibleReplyAliases(invalid); assert.equal(projected.ok,false);assert.equal(projected.canEmit,false);
});
test('altered nested certificate is not accepted as valid final',async()=>{
 const v=await final.createMarionFinalEnvelope(envelopeInput());const invalid={...v,finalEnvelope:{...v.finalEnvelope,reply:'tampered'}};assert.equal(final.isMarionFinalEnvelope(invalid),false);
});
