'use strict';
const BASE=(process.env.LS_BACKEND||'http://localhost:3000').replace(/\/$/,'');
const TOKEN=process.env.LS_WIDGET_TOKEN||'';
function pick(j){const m=j&&j.message||{};return String(m.translatedText||m.translation||m.targetText||j.translatedText||j.translation||j.targetText||j.payload&&j.payload.translatedText||'').trim()}
async function one(sourceLanguage,targetLanguage,text){
  const r=await fetch(BASE+'/api/lingosentinel/translate',{method:'POST',headers:Object.assign({'Content-Type':'application/json'},TOKEN?{'x-sb-widget-token':TOKEN}:{}),body:JSON.stringify({text,sourceLanguage,targetLanguage,roomId:'phase1-language-matrix',sessionId:'phase1-matrix',cultureContext:'general'})});
  let j={};try{j=await r.json()}catch(_){}
  const out=pick(j),same=sourceLanguage===targetLanguage,ok=r.ok&&j.ok!==false&&!!out&&(!same||out.trim().toLowerCase()===text.trim().toLowerCase());
  console.log(JSON.stringify({pair:sourceLanguage+'->'+targetLanguage,http:r.status,output:out,ok}));
  if(!ok)process.exitCode=1;
}
(async()=>{
  await one('en','fr','Good evening. How are you?');
  await one('fr','en','Bonsoir. Comment allez-vous ?');
  await one('en','en','This sentence should remain unchanged.');
})().catch(e=>{console.error(e);process.exit(1)});
