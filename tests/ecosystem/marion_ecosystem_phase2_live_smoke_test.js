'use strict';
const assert=require('assert');
const crypto=require('crypto');
const BASE=(process.env.MARION_ECOSYSTEM_BACKEND||process.env.LS_BACKEND||'http://localhost:3000').replace(/\/$/,'');
const TOKEN=process.env.MARION_ECOSYSTEM_TOKEN||'';
function headers(){return{'Content-Type':'application/json',...(TOKEN?{'x-sb-ecosystem-token':TOKEN}:{})}}
async function call(sourceLanguage,targetLanguage,cultureContext='general',layer='language'){
  const requestId='eco-live-'+crypto.randomUUID(),traceId='trace-'+crypto.randomUUID();
  const r=await fetch(BASE+'/api/marion/ecosystem/conversation',{method:'POST',headers:headers(),body:JSON.stringify({requestId,traceId,sessionId:'eco-live-'+sourceLanguage+'-'+targetLanguage,source:'nyx',sourceLanguage,targetLanguage,cultureContext,layer,mode:'one_to_one',speakerRole:'host',text:sourceLanguage==='fr'?'Bonsoir. Comment allez-vous ?':'Good evening. How are you?'})});
  const j=await r.json().catch(()=>({}));assert.equal(r.ok,true,JSON.stringify(j));assert.equal(j.ok,true);assert.equal(j.response.requestId,requestId);assert.equal(j.response.traceId,traceId);console.log('PASS',sourceLanguage+'->'+targetLanguage,j.path.join(' -> '));
}
(async()=>{const h=await fetch(BASE+'/api/marion/ecosystem/health');console.log('health',h.status);await call('en','en');await call('en','fr');await call('fr','en');await call('en','en','social_norms','culture')})().catch(e=>{console.error(e);process.exit(1)});
