'use strict';

const BASE=(process.env.LS_BACKEND||'http://localhost:3000').replace(/\/$/,'');
const TOKEN=process.env.LS_WIDGET_TOKEN||'';
function headers(){ return Object.assign({'Content-Type':'application/json'},TOKEN?{'x-sb-widget-token':TOKEN}:{}); }
async function post(path,body){ const r=await fetch(BASE+path,{method:'POST',headers:headers(),body:JSON.stringify(body)}); let j={}; try{j=await r.json()}catch(_){}; if(!r.ok||j.ok===false) throw Error(path+' '+r.status+' '+JSON.stringify(j)); return j; }
(async()=>{
  const sessionId='phase2-live-'+Date.now();
  let j=await post('/api/lingosentinel/marion/state/sync',{sessionId,sourceLanguage:'en',targetLanguage:'fr',cultureContext:'general',layer:'language',mode:'one_to_one',speakerRole:'host',participantId:'host',translationStatus:'ready',marionStatus:'ready',uiState:'dock',connected:true});
  if(!j.state||j.state.targetLanguage!=='fr') throw Error('EN->FR state sync failed');
  j=await post('/api/lingosentinel/marion/state/sync',{sessionId,sourceLanguage:'fr',targetLanguage:'en',cultureContext:'traditions',layer:'culture',mode:'live_translate',speakerRole:'remote',participantId:'remote-fr',translationStatus:'ready',marionStatus:'ready',uiState:'expanded',connected:true,observedRevision:j.state.revision});
  if(!j.state||j.state.sourceLanguage!=='fr'||j.state.targetLanguage!=='en') throw Error('FR->EN state sync failed');
  j=await post('/api/lingosentinel/marion/state/sync',{sessionId,sourceLanguage:'en',targetLanguage:'en',cultureContext:'general',layer:'language',mode:'one_to_one',speakerRole:'host',participantId:'host',translationStatus:'ready',marionStatus:'ready',uiState:'dock',connected:true,observedRevision:j.state.revision});
  if(!j.state||j.state.sourceLanguage!=='en'||j.state.targetLanguage!=='en') throw Error('EN->EN state sync failed');
  const g=await post('/api/lingosentinel/marion/state/get',{sessionId});
  if(!g.state||g.state.revision<3) throw Error('state revision failed');
  console.log(JSON.stringify({ok:true,sessionId,revision:g.state.revision,state:g.state},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
