'use strict';
const assert = require('assert');
const Contract = require('../../Data/marion/runtime/LingoSentinel/MarionLingoSentinelContract');
const Bridge = require('../../Data/marion/runtime/LingoSentinel/MarionLingoSentinelBridge');

(async()=>{
  for (const [sourceLanguage,targetLanguage] of [['en','fr'],['fr','en'],['en','en']]) {
    const p = Contract.languagePair({sourceLanguage,targetLanguage});
    assert.equal(p.source,sourceLanguage); assert.equal(p.target,targetLanguage);
  }
  Bridge.registerMarionRunner(async input => ({ text:`Marion received ${input.sourceLanguage}->${input.targetLanguage}: ${input.text}` }));
  const hs = await Bridge.runMarionLingoSentinelBridge({eventType:'handshake.request',sessionId:'phase1-test'});
  assert.equal(hs.ok,true); assert.equal(hs.response.eventType,'handshake.ack');
  const r = await Bridge.runMarionLingoSentinelBridge({sessionId:'phase1-test',conversationId:'c1',sourceLanguage:'en',targetLanguage:'fr',message:'Hello'});
  assert.equal(r.ok,true); assert.equal(r.request.requestId,r.response.requestId); assert.match(r.response.message,/en->fr/);
  console.log('PASS marion_lingosentinel_phase1_test');
})().catch(e=>{console.error(e);process.exit(1)});
