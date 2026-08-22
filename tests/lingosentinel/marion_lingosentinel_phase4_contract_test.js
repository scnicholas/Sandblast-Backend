'use strict';

const assert=require('assert');
const C=require('../../Data/marion/runtime/LingoSentinel/MarionLingoSentinelProductionContract');

for(const [sourceLanguage,targetLanguage] of [['en','fr'],['fr','en'],['en','en']]){
  const r=C.normalizeRequest({sessionId:'s1',requestId:'r-'+sourceLanguage+'-'+targetLanguage,sourceLanguage,targetLanguage,message:'Hello'});
  assert.equal(r.sourceLanguage,sourceLanguage);
  assert.equal(r.targetLanguage,targetLanguage);
  assert.equal(C.validateRequest(r).ok,true);
  const c=C.toCognitiveRequest(r);
  assert.equal(c.contract,C.COGNITIVE_CONTRACT);
  assert.equal(c.requestId,r.requestId);
}
const bad=C.normalizeRequest({sessionId:'s1',message:''});
assert.equal(C.validateRequest(bad).ok,false);
console.log('PASS marion_lingosentinel_phase4_contract_test');
