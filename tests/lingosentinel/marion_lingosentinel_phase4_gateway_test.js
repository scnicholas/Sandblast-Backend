'use strict';

const assert=require('assert');
const G=require('../../Data/marion/runtime/LingoSentinel/MarionLingoSentinelProductionGateway');

(async()=>{
  G.resetForTests();
  G.registerOrchestrator({
    async orchestrate(input){
      const pair=input.sourceLanguage+'->'+input.targetLanguage;
      return {ok:true,response:{
        requestId:input.requestId,sessionId:input.sessionId,
        canonicalResponse:'canonical:'+pair,
        localizedResponse:input.targetLanguage==='fr'?'français:'+pair:'canonical:'+pair,
        displayText:input.targetLanguage==='fr'?'français:'+pair:'canonical:'+pair,
        degraded:false,warnings:[]
      }};
    }
  });

  for(const [sourceLanguage,targetLanguage] of [['en','fr'],['fr','en'],['en','en']]){
    const requestId='g-'+sourceLanguage+'-'+targetLanguage;
    const r=await G.execute({requestId,sessionId:'s-'+requestId,sourceLanguage,targetLanguage,message:'Hello'},{skipRateLimit:true});
    assert.equal(r.ok,true);
    assert.equal(r.response.requestId,requestId);
    assert.equal(r.response.sourceLanguage,sourceLanguage);
    assert.equal(r.response.targetLanguage,targetLanguage);
  }

  const q={requestId:'dup',sessionId:'s-dup',sourceLanguage:'en',targetLanguage:'en',message:'same'};
  assert.equal((await G.execute(q,{skipRateLimit:true})).ok,true);
  const dup=await G.execute(q,{skipRateLimit:true});
  assert.equal(dup.ok,true);
  assert.equal(dup.duplicate,true);
  console.log('PASS marion_lingosentinel_phase4_gateway_test');
})().catch(e=>{console.error(e);process.exit(1);});
