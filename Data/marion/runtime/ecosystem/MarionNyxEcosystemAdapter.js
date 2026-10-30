'use strict';

const Contract = require('./MarionEcosystemContract');
const Registry = require('./MarionComponentRegistry');
const StateSpine = require('./MarionEcosystemStateSpine');
const Gateway = require('./MarionEcosystemGateway');

const VERSION = 'marion.nyxEcosystemAdapter/2.0';

function clean(v,n=160){return String(v==null?'':v).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);}
function obj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}

function register() {
  const result = Registry.register({
    id:'nyx', name:'Nyx', version:VERSION, type:'public-interface', publicSurface:true,
    capabilities:['conversation','ecosystem-conversation','context-handoff','media-control','navigation'],
    reads:['lingosentinel.state','sandblast-channel.public'],
    writes:['nyx.state'],
    commands:[] , status:'ready',
    metadata:{ecosystemPhase:2, marionAuthority:true}
  });
  Registry.updateStatus('nyx','ready',{ecosystemPhase:2});
  StateSpine.setGlobal('nyx',{status:'ready',data:{adapterVersion:VERSION}});
  return result;
}

function ingestState(input = {}) {
  const sessionId=clean(input.sessionId,128);
  if(!sessionId)return {ok:false,error:'sessionId_required'};
  return StateSpine.setSession(sessionId,'nyx',{
    language:clean(input.language||input.targetLanguage,16),
    culture:clean(input.culture||input.cultureContext,80),
    layer:clean(input.layer,40), mode:clean(input.mode,40), speaker:clean(input.speaker||input.speakerRole,32),
    participantId:clean(input.participantId,128), roomId:clean(input.roomId,128), conversationId:clean(input.conversationId,128),
    status:clean(input.status||'active',48),
    data:{...obj(input.data),sourceLanguage:clean(input.sourceLanguage,16),targetLanguage:clean(input.targetLanguage||input.language,16),cultureContext:clean(input.cultureContext||input.culture,80)}
  });
}

async function requestMarion(input = {}, context = {}) {
  const ctx=obj(context);
  const request=Contract.normalizeEnvelope({
    requestId:input.requestId, traceId:input.traceId, sessionId:input.sessionId,
    conversationId:input.conversationId||ctx.conversationId, roomId:input.roomId||ctx.roomId,
    source:'nyx', target:'marion', eventType:'conversation.message', intent:input.intent||'conversation',
    text:input.text||input.message,
    state:{language:ctx.targetLanguage,culture:ctx.cultureContext,layer:ctx.layer,mode:ctx.mode,speaker:ctx.speakerRole},
    payload:{sourceLanguage:ctx.sourceLanguage,targetLanguage:ctx.targetLanguage,cultureContext:ctx.cultureContext,layer:ctx.layer,mode:ctx.mode,speakerRole:ctx.speakerRole,participantId:ctx.participantId},
    metadata:{...obj(input.metadata),adapterVersion:VERSION,ecosystemPhase:2}
  });
  const result=await Gateway.process(request);
  return result;
}

function getHealth(){return{ok:Registry.has('nyx'),service:'MarionNyxEcosystemAdapter',version:VERSION,registered:Registry.has('nyx'),component:Registry.get('nyx')};}

module.exports=Object.freeze({VERSION,register,ingestState,requestMarion,getHealth});
