'use strict';
const assert=require('assert');
const Phase1=require('../../Data/marion/runtime/LingoSentinel/MarionLingoSentinelBridge');
const Tx=require('../../Data/marion/runtime/LingoSentinel/MarionLingoSentinelTranslationBridge');
const History=require('../../Data/marion/runtime/LingoSentinel/MarionLingoSentinelConversationStore');
const O=require('../../Data/marion/runtime/LingoSentinel/MarionLingoSentinelCognitiveOrchestrator');
History.reset();
Tx.registerTranslator(async(text,o)=>{if(o.sourceLanguage==='fr'&&o.targetLanguage==='en'&&text==='Bonjour')return{text:'Hello',meta:{translated:true,provider:'test'}};if(o.sourceLanguage==='en'&&o.targetLanguage==='fr')return{text:'FR:'+text,meta:{translated:true,provider:'test'}};return{text,meta:{translated:false,provider:'test'}};});
Phase1.registerMarionRunner(async input=>({text:'MARION:'+input.text}));
async function run(s,t,msg){return O.orchestrate({sessionId:'p3-'+s+t,conversationId:'c',sourceLanguage:s,targetLanguage:t,cultureContext:'general',layer:'language',mode:'one_to_one',speakerRole:'host',message:msg});}
(async()=>{
 let r=await run('en','fr','Hello');assert.equal(r.ok,true);assert.equal(r.response.canonicalInput,'Hello');assert.equal(r.response.canonicalResponse,'MARION:Hello');assert.equal(r.response.localizedResponse,'FR:MARION:Hello');
 r=await run('fr','en','Bonjour');assert.equal(r.ok,true);assert.equal(r.response.canonicalInput,'Hello');assert.equal(r.response.localizedResponse,'MARION:Hello');
 r=await run('en','en','Same');assert.equal(r.ok,true);assert.equal(r.response.canonicalInput,'Same');assert.equal(r.response.localizedResponse,'MARION:Same');assert.equal(r.response.outputTranslation.translated,false);
 console.log('PASS marion_lingosentinel_phase3_orchestrator_test');
})().catch(e=>{console.error(e);process.exit(1)});
