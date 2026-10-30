'use strict';

const Registry = require('./MarionComponentRegistry');
const StateSpine = require('./MarionEcosystemStateSpine');

const VERSION = 'marion.lingosentinelEcosystemAdapter/2.0';
let injectedOrchestrator = null;
let cachedOrchestrator;

function clean(v,n=4000){return String(v==null?'':v).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);}
function obj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}
function runner(mod){if(!mod)return null;if(typeof mod==='function')return mod;for(const k of['orchestrate','run','process','handle'])if(typeof mod[k]==='function')return mod[k].bind(mod);return null;}
function registerOrchestrator(value){injectedOrchestrator=runner(value);return !!injectedOrchestrator;}
function resolveOrchestrator(){
  if(injectedOrchestrator)return injectedOrchestrator;
  if(cachedOrchestrator!==undefined)return cachedOrchestrator;
  for(const p of['../LingoSentinel/MarionLingoSentinelCognitiveOrchestrator','../LingoSentinel/MarionLingoSentinelCognitiveOrchestrator.js']){
    try{const fn=runner(require(p));if(fn){cachedOrchestrator=fn;return fn;}}catch(_){}
  }
  cachedOrchestrator=null;return null;
}

function register(){
  const result=Registry.register({
    id:'lingosentinel',name:'LingoSentinel',version:VERSION,type:'language-intelligence',publicSurface:true,status:'ready',
    capabilities:['translation','cultural-context','conversation','canonical-reasoning-bridge','ecosystem-context'],
    reads:['nyx.session','lingosentinel.state'],writes:['lingosentinel.state'],commands:[],
    metadata:{ecosystemPhase:2,phase3CognitiveDependency:true}
  });
  Registry.updateStatus('lingosentinel','ready',{ecosystemPhase:2,cognitiveReady:!!resolveOrchestrator()});
  StateSpine.setGlobal('lingosentinel',{status:resolveOrchestrator()?'ready':'degraded',data:{adapterVersion:VERSION,cognitiveReady:!!resolveOrchestrator()}});
  return result;
}

function ingestState(input={}){
  const sessionId=clean(input.sessionId,128);if(!sessionId)return{ok:false,error:'sessionId_required'};
  return StateSpine.setSession(sessionId,'lingosentinel',{
    language:clean(input.language||input.targetLanguage,16),culture:clean(input.culture||input.cultureContext,80),layer:clean(input.layer||'language',40),mode:clean(input.mode||'one_to_one',40),
    speaker:clean(input.speaker||input.speakerRole||'host',32),participantId:clean(input.participantId||'host',128),roomId:clean(input.roomId,128),conversationId:clean(input.conversationId,128),status:clean(input.status||'active',48),
    data:{...obj(input.data),sourceLanguage:clean(input.sourceLanguage||'en',16),targetLanguage:clean(input.targetLanguage||input.language||'en',16),cultureContext:clean(input.cultureContext||input.culture||'general',80)}
  });
}

async function processConversation(input={},context={}){
  const fn=resolveOrchestrator();
  if(!fn)return{ok:false,stage:'lingosentinel_resolve',errors:['phase3_cognitive_orchestrator_unavailable'],version:VERSION};
  const ctx=obj(context);
  const result=await fn({
    requestId:input.requestId,sessionId:input.sessionId,conversationId:input.conversationId||ctx.conversationId,roomId:input.roomId||ctx.roomId,
    sourceLanguage:input.sourceLanguage||ctx.sourceLanguage||'en',targetLanguage:input.targetLanguage||ctx.targetLanguage||'en',
    cultureContext:input.cultureContext||ctx.cultureContext||'general',layer:input.layer||ctx.layer||'language',mode:input.mode||ctx.mode||'one_to_one',
    speakerRole:input.speakerRole||ctx.speakerRole||'host',participantId:input.participantId||ctx.participantId||'host',intent:input.intent||'conversation',
    message:input.text||input.message,returnMode:'both',
    metadata:{...obj(input.metadata),ecosystemPhase:2,ecosystemSource:input.source||'nyx',traceId:input.traceId||''}
  },{timeoutMs:input.timeoutMs});
  if(!result||result.ok!==true)return result||{ok:false,stage:'lingosentinel_run',errors:['empty_lingosentinel_result']};
  const r=obj(result.response);
  return{ok:true,version:VERSION,raw:result,canonicalText:clean(r.canonicalResponse||r.displayText),localizedText:clean(r.localizedResponse||r.displayText||r.canonicalResponse),displayText:clean(r.displayText||r.localizedResponse||r.canonicalResponse),degraded:r.degraded===true,warnings:Array.isArray(r.warnings)?r.warnings:[],cognitive:r};
}

function getHealth(){return{ok:!!resolveOrchestrator(),service:'MarionLingoSentinelEcosystemAdapter',version:VERSION,registered:Registry.has('lingosentinel'),cognitiveReady:!!resolveOrchestrator(),component:Registry.get('lingosentinel')};}
function resetForTests(){injectedOrchestrator=null;cachedOrchestrator=undefined;}
module.exports=Object.freeze({VERSION,register,ingestState,processConversation,getHealth,registerOrchestrator,resolveOrchestrator,resetForTests});
