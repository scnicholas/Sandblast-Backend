'use strict';

const assert=require('assert');
const crypto=require('crypto');

const BASE=(process.env.LS_BACKEND||'http://localhost:3000').replace(/\/$/,'');
const TOKEN=process.env.LS_WIDGET_TOKEN||'';
function headers(requestId){return {'Content-Type':'application/json','x-request-id':requestId,...(TOKEN?{'x-sb-widget-token':TOKEN}:{})};}
async function json(url,options){const r=await fetch(url,options),j=await r.json().catch(()=>({}));return {r,j};}
async function one(sourceLanguage,targetLanguage,message){
  const requestId='live-'+crypto.randomUUID();
  const {r,j}=await json(BASE+'/api/lingosentinel/marion/production/request',{method:'POST',headers:headers(requestId),body:JSON.stringify({
    requestId,sessionId:'phase4-live-'+sourceLanguage+'-'+targetLanguage,conversationId:'cert',
    sourceLanguage,targetLanguage,cultureContext:'general',layer:'language',mode:'one_to_one',
    speakerRole:'host',message,returnMode:'both'
  })});
  assert.equal(r.ok,true,JSON.stringify(j));
  assert.equal(j.ok,true);
  assert.equal(j.response.requestId,requestId);
  assert.equal(j.response.sourceLanguage,sourceLanguage);
  assert.equal(j.response.targetLanguage,targetLanguage);
  assert.ok(j.response.canonicalResponse||j.response.displayText);
  console.log('PASS',sourceLanguage+'->'+targetLanguage,j.response.degraded?'DEGRADED':'OK');
}
(async()=>{
  const h=await json(BASE+'/api/lingosentinel/marion/production/health');
  assert.ok(h.r.status===200||h.r.status===503);
  console.log('health',h.r.status,h.j.service||'unknown');
  await one('en','fr','Good evening. How are you?');
  await one('fr','en','Bonsoir. Comment allez-vous ?');
  await one('en','en','This sentence should remain in English.');
})().catch(e=>{console.error(e);process.exit(1);});
