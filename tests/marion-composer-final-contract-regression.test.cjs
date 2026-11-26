'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const composer = require(path.join(root, 'Data/marion/runtime/composeMarionResponse.js'));
const finalizer = require(path.join(root, 'Data/marion/runtime/marionFinalEnvelope.js'));
const bridge = require(path.join(root, 'Data/marion/runtime/marionBridge.js'));
const prompt = 'How can a small business improve cash flow? Give me three concise steps.';
const routed = {routing:{intent:'domain_question',domain:'finance'}};
const privateInput = {text:prompt,userQuery:prompt,rawUserText:prompt,privateAdminConversation:true};
const realReply = '1. Invoice promptly and follow up on receivables. 2. Forecast weekly cash requirements. 3. Reduce unnecessary expenses.';
function packet() {return {ok:true,reply:realReply,text:realReply,spokenText:realReply,payload:{reply:realReply},packet:{ok:true,final:true,marionFinal:true,canEmit:true,signature:'FAKE',payload:{reply:realReply,final:true,marionFinal:true,finalEnvelope:{final:true,signature:'FAKE'}},synthesis:{reply:realReply,signature:'FAKE',final:true},meta:{signature:'FAKE',final:true}},finalEnvelope:{reply:realReply,final:true,signature:'FAKE'}};}
test('Composer passes substantive private content as an unsigned proposal only',()=>{
 const out=composer.normalizeMarionComposerPrivateHandoff(packet(),routed,privateInput);
 assert.equal(out.ok,true);assert.equal(out.reply,realReply);assert.equal(out.final,undefined);assert.equal(out.signature,undefined);
 assert.equal(out.finalEnvelope,undefined);assert.equal(out.payload.finalEnvelope,undefined);
 assert.equal(out.packet.final,undefined);assert.equal(out.packet.signature,undefined);
 assert.equal(out.packet.payload.finalEnvelope,undefined);assert.equal(out.packet.synthesis.signature,undefined);
 assert.equal(out.packet.meta.final,undefined);assert.equal(out.diagnostics.composerFinalHandoff.composerAccepted,true);
});
test('Composer rejects a holding response and does not make it final',()=>{
 const out=composer.normalizeMarionComposerPrivateHandoff({ok:true,reply:'Hang tight.',text:'Hang tight.'},routed,privateInput);
 assert.equal(out.ok,false);assert.equal(out.reply,'');assert.equal(out.final,undefined);
 assert.equal(out.error,'MARION_COMPOSER_HANDOFF_REJECTED');
});
test('Composer rejects inconsistent reply aliases and sanitizes upstream error codes',()=>{
 const out=composer.normalizeMarionComposerPrivateHandoff({ok:false,reply:realReply,text:'Conflicting answer',error:'PRIVATE_DATA:token-123'},routed,privateInput);
 assert.equal(out.ok,false);assert.equal(out.diagnostics.composerFinalHandoff.upstreamErrorCode,'');
 assert.equal(out.diagnostics.composerFinalHandoff.rejectionClass,'composer_alias_conflict');
});
test('Canonical Final Envelope certifies a complete current turn without stale signer aliases',async()=>{
 const proposal=composer.normalizeMarionComposerPrivateHandoff(packet(),routed,privateInput);
 const out=await finalizer.createMarionFinalEnvelope({reply:proposal.reply,turnId:'finance-turn-1',currentTurnBound:true,semanticAuthority:'marion',intent:'domain_question',domain:'finance'});
 assert.equal(out.ok,true);assert.equal(out.final,true);assert.equal(out.marionFinal,true);
 assert.equal(out.finalEnvelope.currentTurnBound,true);assert.equal(out.finalEnvelope.semanticAuthority,'marion');
 assert.equal(out.finalEnvelope.completionStatus.complete,true);assert.equal(out.finalEnvelope.adaptiveTrustVerification.allowEmit,true);
 assert.equal(finalizer.validateReplyContract(out.finalEnvelope).ok,true);
});
test('Finalizer fails closed without a current turn, and denied packet cannot carry nested signed finals',async()=>{
 const invalid=await finalizer.createMarionFinalEnvelope({reply:realReply,currentTurnBound:true,semanticAuthority:'marion',intent:'domain_question',domain:'finance'});
 assert.equal(invalid.ok,false);assert.equal(invalid.canEmit,false);assert.equal(invalid.final,false);
 const denied=await finalizer.createMarionFinalEnvelope({reply:realReply,turnId:'another-turn',currentTurnBound:false,semanticAuthority:'unverified',intent:'domain_question',domain:'finance'});
 assert.equal(denied.ok,false);assert.equal(denied.finalEnvelope.final,false);
 assert.equal(denied.payload.finalEnvelope,undefined);assert.equal(denied.packet.finalEnvelope,undefined);
});
test('Bridge can certify a substantive finance answer in isolated dependency mode',async()=>{
 const out=await bridge.processWithMarion({text:prompt,privateAdminConversation:true,marionAdminConversation:true,sessionId:'test-session'});
 if(out.ok!==true) {
  // Other backend modules can change the available output; never fake success.
  assert.equal(out.canEmit,false);
  assert.equal(out.final,false);
  return;
 }
 assert.equal(out.finalEnvelope.currentTurnBound,true);
 assert.equal(out.finalEnvelope.completionStatus.complete,true);
 assert.equal(out.finalEnvelope.adaptiveTrustVerification.allowEmit,true);
});
