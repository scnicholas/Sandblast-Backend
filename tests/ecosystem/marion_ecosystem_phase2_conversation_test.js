'use strict';
const assert=require('assert');
const Gateway=require('../../Data/marion/runtime/ecosystem/MarionEcosystemGateway');
const Lingo=require('../../Data/marion/runtime/ecosystem/MarionLingoSentinelEcosystemAdapter');
const Bootstrap=require('../../Data/marion/runtime/ecosystem/MarionEcosystemComponentBootstrap');
const Router=require('../../Data/marion/runtime/ecosystem/MarionEcosystemConversationRouter');

(async()=>{
  Gateway.resetForTests();Lingo.resetForTests();Bootstrap.resetForTests();Bootstrap.bootstrap();
  Gateway.registerMarionRunner(async input=>({text:'Marion:'+input.text}));
  Lingo.registerOrchestrator(async input=>({ok:true,response:{requestId:input.requestId,sessionId:input.sessionId,canonicalResponse:'Canonical:'+input.message,localizedResponse:input.targetLanguage==='fr'?'Français:'+input.message:'Canonical:'+input.message,displayText:input.targetLanguage==='fr'?'Français:'+input.message:'Canonical:'+input.message,degraded:false,warnings:[]}}));

  const direct=await Router.route({requestId:'d1',traceId:'t1',sessionId:'s-direct',source:'nyx',sourceLanguage:'en',targetLanguage:'en',text:'Hello'});
  assert.equal(direct.ok,true);assert.deepStrictEqual(direct.path,['nyx','marion','nyx']);assert.equal(direct.response.requestId,'d1');assert.equal(direct.response.traceId,'t1');assert.match(direct.response.text,/Marion:Hello/);

  const fr=await Router.route({requestId:'f1',traceId:'tf1',sessionId:'s-fr',source:'nyx',sourceLanguage:'en',targetLanguage:'fr',cultureContext:'general',text:'Hello'});
  assert.equal(fr.ok,true);assert.deepStrictEqual(fr.path,['nyx','lingosentinel','marion','nyx']);assert.equal(fr.response.requestId,'f1');assert.equal(fr.response.traceId,'tf1');assert.equal(fr.response.payload.targetLanguage,'fr');assert.match(fr.response.text,/Français/);

  const en=await Router.route({requestId:'e1',traceId:'te1',sessionId:'s-en',source:'nyx',sourceLanguage:'en',targetLanguage:'en',cultureContext:'social_norms',layer:'culture',text:'Context please'});
  assert.equal(en.ok,true);assert.deepStrictEqual(en.path,['nyx','lingosentinel','marion','nyx']);assert.equal(en.response.payload.targetLanguage,'en');
  console.log('PASS marion_ecosystem_phase2_conversation_test');
})().catch(e=>{console.error(e);process.exit(1)});
