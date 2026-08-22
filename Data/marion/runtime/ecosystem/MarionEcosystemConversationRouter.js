'use strict';

const Contract=require('./MarionEcosystemContract');
const StateSpine=require('./MarionEcosystemStateSpine');
const Telemetry=require('./MarionEcosystemTelemetry');
const Context=require('./MarionEcosystemContextAssembler');
const Bootstrap=require('./MarionEcosystemComponentBootstrap');
const Nyx=require('./MarionNyxEcosystemAdapter');
const Lingo=require('./MarionLingoSentinelEcosystemAdapter');

const VERSION='marion.ecosystemConversationRouter/2.0';
function clean(v,n=4000){return String(v==null?'':v).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);}
function obj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}
function ids(input){const e=Contract.normalizeEnvelope({requestId:input.requestId,traceId:input.traceId,sessionId:input.sessionId,source:input.source||'nyx',target:'marion',eventType:'conversation.message',text:input.text||input.message});return{requestId:e.requestId,traceId:e.traceId};}

async function route(input={},options={}){
  if(!Bootstrap.getHealth().booted)Bootstrap.bootstrap();
  const started=Date.now(),id=ids(input),normalized={...input,...id,source:Contract.normalizeComponent(input.source||'nyx')};
  if(!clean(normalized.sessionId,128))return{ok:false,stage:'contract',errors:['sessionId_required'],version:VERSION};
  if(!clean(normalized.text||normalized.message,4000))return{ok:false,stage:'contract',errors:['message_required'],version:VERSION};

  if(normalized.source==='nyx')Nyx.ingestState({...normalized,status:'active'});
  if(normalized.source==='lingosentinel')Lingo.ingestState({...normalized,status:'active'});
  const ctx=Context.assemble(normalized);
  Telemetry.record('phase2_conversation_start',{requestId:id.requestId,traceId:id.traceId,sessionId:normalized.sessionId,source:normalized.source,target:'marion',eventType:'conversation.message',status:ctx.routeClass});

  if(ctx.needsLingoSentinel){
    Lingo.ingestState({...ctx,sessionId:normalized.sessionId,status:'active'});
    const lingo=await Lingo.processConversation({...normalized,...ctx,source:normalized.source},ctx);
    if(!lingo||lingo.ok!==true){Telemetry.record('phase2_lingo_error',{requestId:id.requestId,traceId:id.traceId,sessionId:normalized.sessionId,source:normalized.source,target:'lingosentinel',stage:lingo&&lingo.stage||'lingosentinel'});return{ok:false,stage:lingo&&lingo.stage||'lingosentinel',errors:lingo&&lingo.errors||['lingosentinel_failed'],requestId:id.requestId,traceId:id.traceId,context:ctx,version:VERSION};}
    const request=Contract.normalizeEnvelope({requestId:id.requestId,traceId:id.traceId,sessionId:normalized.sessionId,conversationId:ctx.conversationId,roomId:ctx.roomId,source:normalized.source,target:'marion',eventType:'conversation.message',intent:normalized.intent||'conversation',text:normalized.text||normalized.message,metadata:{phase2:VERSION}});
    const response=Contract.createResponse(request,{source:'marion',target:normalized.source,eventType:'conversation.response',intent:normalized.intent||'conversation',text:lingo.localizedText||lingo.canonicalText,payload:{canonicalText:lingo.canonicalText,localizedText:lingo.localizedText,displayText:lingo.displayText,sourceLanguage:ctx.sourceLanguage,targetLanguage:ctx.targetLanguage,cultureContext:ctx.cultureContext,layer:ctx.layer,mode:ctx.mode,degraded:lingo.degraded===true,warnings:lingo.warnings,via:['nyx','lingosentinel','marion','nyx']},metadata:{phase2:VERSION,lingoSentinel:true,correlated:true}});
    StateSpine.setSession(normalized.sessionId,'nyx',{conversationId:ctx.conversationId,roomId:ctx.roomId,status:'ready',data:{lastRequestId:id.requestId,lastTraceId:id.traceId,lastRoute:'nyx-lingosentinel-marion'}});
    Telemetry.record('phase2_conversation_success',{requestId:id.requestId,traceId:id.traceId,sessionId:normalized.sessionId,source:normalized.source,target:'marion',status:'lingosentinel',durationMs:Date.now()-started});
    return{ok:true,requestId:id.requestId,traceId:id.traceId,path:['nyx','lingosentinel','marion','nyx'],context:ctx,response,lingosentinel:lingo.cognitive||{},version:VERSION};
  }

  const direct=await Nyx.requestMarion({...normalized,...ctx},ctx);
  if(!direct||direct.ok!==true){Telemetry.record('phase2_marion_error',{requestId:id.requestId,traceId:id.traceId,sessionId:normalized.sessionId,source:'nyx',target:'marion',stage:direct&&direct.stage||'marion'});return{ok:false,stage:direct&&direct.stage||'marion',errors:direct&&direct.errors||['marion_failed'],requestId:id.requestId,traceId:id.traceId,context:ctx,version:VERSION};}
  const raw=obj(direct.response),text=clean(raw.text);
  const response={...raw,payload:{...obj(raw.payload),canonicalText:text,localizedText:text,displayText:text,sourceLanguage:ctx.sourceLanguage,targetLanguage:ctx.targetLanguage,cultureContext:ctx.cultureContext,via:['nyx','marion','nyx']},metadata:{...obj(raw.metadata),phase2:VERSION,lingoSentinel:false,correlated:true}};
  StateSpine.setSession(normalized.sessionId,'nyx',{conversationId:ctx.conversationId,roomId:ctx.roomId,status:'ready',data:{lastRequestId:id.requestId,lastTraceId:id.traceId,lastRoute:'nyx-marion'}});
  Telemetry.record('phase2_conversation_success',{requestId:id.requestId,traceId:id.traceId,sessionId:normalized.sessionId,source:'nyx',target:'marion',status:'direct',durationMs:Date.now()-started});
  return{ok:true,requestId:id.requestId,traceId:id.traceId,path:['nyx','marion','nyx'],context:ctx,response,version:VERSION};
}

function getHealth(){const b=Bootstrap.getHealth();return{ok:b.booted&&b.nyx.ok,service:'MarionEcosystemConversationRouter',version:VERSION,bootstrap:b,context:Context.getHealth(),nyx:Nyx.getHealth(),lingosentinel:Lingo.getHealth()};}
module.exports=Object.freeze({VERSION,route,getHealth});
