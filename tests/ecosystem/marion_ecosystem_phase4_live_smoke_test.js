
'use strict';
const assert=require('assert');const crypto=require('crypto');
const BASE=String(process.env.MARION_ECOSYSTEM_BACKEND||'http://localhost:3000').replace(/\/$/,'');
const TOKEN=process.env.MEDIA_ECOSYSTEM_INGEST_TOKEN||'';
function headers(){return{'Content-Type':'application/json',...(TOKEN?{'x-sb-media-token':TOKEN}:{})}}
async function call(url,opt){const r=await fetch(url,opt),j=await r.json().catch(()=>({}));return{r,j}}
(async()=>{
  const h=await call(BASE+'/api/marion/ecosystem/media/health');assert.ok(h.r.status===200||h.r.status===503,JSON.stringify(h.j));
  const campaign='live-'+crypto.randomUUID(), session='s-'+crypto.randomUUID();
  const events=[
    {component:'sandblast-channel',eventName:'page.cta_click',eventId:crypto.randomUUID(),sessionId:session,campaignId:campaign},
    {component:'sandblast-radio',eventName:'radio.play',eventId:crypto.randomUUID(),sessionId:session,campaignId:campaign},
    {component:'sandblast-tv',eventName:'tv.content_open',eventId:crypto.randomUUID(),sessionId:session,campaignId:campaign,contentId:'feature-1'},
    {component:'synapse',eventName:'synapse.story_open',eventId:crypto.randomUUID(),sessionId:session,campaignId:campaign,contentId:'story-1'}
  ];
  const b=await call(BASE+'/api/marion/ecosystem/media/batch',{method:'POST',headers:headers(),body:JSON.stringify({events})});assert.ok(b.r.status===200||b.r.status===207,JSON.stringify(b.j));assert.equal(b.j.accepted,4);
  console.log('PASS MARION ECOSYSTEM PHASE 4 MEDIA LIVE SMOKE TEST');
})().catch(e=>{console.error(e);process.exit(1)});
