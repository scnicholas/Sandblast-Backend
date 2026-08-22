'use strict';
const assert=require('assert');
const C=require('../../Data/marion/runtime/LingoSentinel/MarionLingoSentinelCognitiveContract');
const pairs=[['en','fr'],['fr','en'],['en','en']];
for(const [sourceLanguage,targetLanguage] of pairs){const r=C.normalizeRequest({sessionId:'s-'+sourceLanguage+targetLanguage,message:'hello',sourceLanguage,targetLanguage});assert.equal(r.sourceLanguage,sourceLanguage);assert.equal(r.targetLanguage,targetLanguage);assert.equal(C.validateRequest(r).ok,true);}
const r=C.normalizeRequest({sessionId:'s1',message:'Bonjour',sourceLanguage:'fr',targetLanguage:'en',cultureContext:'social_norms',layer:'culture',mode:'one_to_one'});assert.equal(r.canonicalLanguage,'en');assert.equal(r.cultureContext,'social_norms');assert.equal(r.layer,'culture');console.log('PASS marion_lingosentinel_phase3_contract_test');
