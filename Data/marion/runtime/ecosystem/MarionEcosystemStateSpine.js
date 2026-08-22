'use strict';

const Contract = require('./MarionEcosystemContract');
const Registry = require('./MarionComponentRegistry');

const VERSION = 'marion.ecosystemStateSpine/1.0';
const MAX_SESSIONS = 2500;
const SESSION_TTL_MS = 30 * 60 * 1000;
const globalState = new Map();
const sessionState = new Map();

function clean(value,max=160){return String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function prune(now=Date.now()){
  for(const [key,record] of sessionState) if(!record||now-record.updatedAt>SESSION_TTL_MS) sessionState.delete(key);
  if(sessionState.size>MAX_SESSIONS){
    const ordered=[...sessionState.entries()].sort((a,b)=>a[1].updatedAt-b[1].updatedAt);
    for(let i=0;i<ordered.length-MAX_SESSIONS;i++) sessionState.delete(ordered[i][0]);
  }
}
function normalizePatch(component,patch={}){
  const source=object(patch);
  return {
    component:Contract.normalizeComponent(component),
    language:clean(source.language||source.targetLanguage,16),
    culture:clean(source.culture||source.cultureContext,80),
    layer:clean(source.layer,40),
    mode:clean(source.mode,40),
    speaker:clean(source.speaker||source.speakerRole,32),
    participantId:clean(source.participantId,128),
    roomId:clean(source.roomId,128),
    conversationId:clean(source.conversationId,128),
    status:clean(source.status,48),
    data:object(source.data),
    updatedAt:Date.now()
  };
}
function setGlobal(component,patch={}){
  const id=Contract.normalizeComponent(component);
  if(!id||!Registry.has(id)) return {ok:false,error:'component_not_registered'};
  const current=globalState.get(id)||{};
  const next={...current,...normalizePatch(id,patch),data:{...object(current.data),...object(patch.data)},updatedAt:Date.now()};
  globalState.set(id,next);return {ok:true,state:clone(next)};
}
function getGlobal(component){return clone(globalState.get(Contract.normalizeComponent(component))||null);}
function setSession(sessionId,component,patch={}){
  prune();
  const sid=clean(sessionId,128),id=Contract.normalizeComponent(component);
  if(!sid)return{ok:false,error:'sessionId_required'};
  if(!Registry.has(id))return{ok:false,error:'component_not_registered'};
  const current=sessionState.get(sid)||{sessionId:sid,components:{},createdAt:Date.now(),updatedAt:Date.now()};
  const prior=object(current.components[id]);
  current.components[id]={...prior,...normalizePatch(id,patch),data:{...object(prior.data),...object(patch.data)}};
  current.updatedAt=Date.now();sessionState.set(sid,current);return{ok:true,session:clone(current)};
}
function getSession(sessionId){prune();return clone(sessionState.get(clean(sessionId,128))||null);}
function getComponentSession(sessionId,component){const session=getSession(sessionId);return session?clone(session.components[Contract.normalizeComponent(component)]||null):null;}
function createContext(sessionId){
  const session=getSession(sessionId),global={};
  for(const [key,value] of globalState)global[key]=clone(value);
  return{contract:'sandblast.marion.ecosystem-state/1.0',sessionId:clean(sessionId,128),session:session||{sessionId:clean(sessionId,128),components:{}},global,generatedAt:Date.now()};
}
function removeSession(sessionId){return sessionState.delete(clean(sessionId,128));}
function getHealth(){prune();return{ok:true,service:'MarionEcosystemStateSpine',version:VERSION,globalComponents:globalState.size,activeSessions:sessionState.size,sessionTtlMs:SESSION_TTL_MS,maxSessions:MAX_SESSIONS};}
function resetForTests(){globalState.clear();sessionState.clear();}

module.exports=Object.freeze({VERSION,setGlobal,getGlobal,setSession,getSession,getComponentSession,createContext,removeSession,getHealth,resetForTests});
