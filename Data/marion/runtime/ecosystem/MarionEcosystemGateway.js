'use strict';

const Contract=require('./MarionEcosystemContract');
const Registry=require('./MarionComponentRegistry');
const Permissions=require('./MarionEcosystemPermissions');
const StateSpine=require('./MarionEcosystemStateSpine');
const EventRouter=require('./MarionEcosystemEventRouter');
const Telemetry=require('./MarionEcosystemTelemetry');
const VERSION='marion.ecosystemGateway/1.0';
let marionRunner=null;
function resolveRunner(moduleRef){
  if(!moduleRef)return null;
  if(typeof moduleRef==='function')return moduleRef;
  for(const key of['runMarionBridge','run','handle','handleChat','reply','processWithMarion','handleMessage','ask','default'])if(typeof moduleRef[key]==='function')return moduleRef[key].bind(moduleRef);
  return null;
}
function resolveMarionRunner(){
  if(marionRunner)return marionRunner;
  for(const candidate of['../marionBridge','../marionBridge.js']){
    try{const runner=resolveRunner(require(candidate));if(runner){marionRunner=runner;return marionRunner;}}catch(_){}
  }
  return null;
}
function registerMarionRunner(runner){marionRunner=typeof runner==='function'?runner:resolveRunner(runner);return Boolean(marionRunner);}
function extractMarionText(value){
  if(typeof value==='string')return value.trim();
  if(!value||typeof value!=='object')return'';
  const marion=value.marion&&typeof value.marion==='object'?value.marion:{};
  return String(value.final||value.text||value.message||value.reply||value.content||marion.final||marion.text||marion.message||marion.reply||'').trim();
}
async function runMarion(envelope){
  const runner=resolveMarionRunner();if(!runner)return{ok:false,error:'marion_runner_unavailable'};
  const context=envelope.sessionId?StateSpine.createContext(envelope.sessionId):null;
  const raw=await runner({
    text:envelope.text,userText:envelope.text,query:envelope.text,
    requestId:envelope.requestId,traceId:envelope.traceId,sessionId:envelope.sessionId,conversationId:envelope.conversationId,roomId:envelope.roomId,
    sourceComponent:envelope.source,targetComponent:envelope.target,eventType:envelope.eventType,intent:envelope.intent,
    ecosystemContext:context,ecosystemEnvelope:envelope
  });
  return{ok:true,text:extractMarionText(raw),raw};
}
async function process(input={},options={}){
  const startedAt=Date.now(),envelope=Contract.normalizeEnvelope(input),valid=Contract.validateEnvelope(envelope);
  if(!valid.ok)return{ok:false,stage:'contract',errors:valid.errors,envelope};
  Telemetry.record('gateway_request',{...envelope,status:'received'});
  if(envelope.target==='marion'&&['conversation.message','domain.request'].includes(envelope.eventType)){
    const permission=Permissions.authorize(envelope.source,'request','marion.reasoning');
    if(!permission.ok&&options.skipPermission!==true){Telemetry.record('gateway_deny',{...envelope,stage:'permission'});return{ok:false,stage:'permission',errors:[permission.reason],envelope};}
    try{
      const marion=await runMarion(envelope);
      if(!marion.ok)return{ok:false,stage:'marion_resolve',errors:[marion.error],envelope};
      const response=Contract.createResponse(envelope,{source:'marion',target:envelope.source,eventType:envelope.eventType==='conversation.message'?'conversation.response':'domain.response',intent:envelope.intent,text:marion.text,payload:{contextVersion:'sandblast.marion.ecosystem-state/1.0'},metadata:{gatewayVersion:VERSION}});
      Telemetry.record('gateway_marion_success',{...envelope,status:'completed',durationMs:Date.now()-startedAt});return{ok:true,handledBy:'marion',request:envelope,response};
    }catch(error){
      Telemetry.record('gateway_marion_error',{...envelope,stage:'marion',durationMs:Date.now()-startedAt});return{ok:false,stage:'marion',errors:[String(error&&(error.code||error.message||error.name)||'marion_error').slice(0,180)],envelope};
    }
  }
  const routed=await EventRouter.route(envelope,options);
  Telemetry.record(routed.ok?'gateway_route_success':'gateway_route_error',{...envelope,stage:routed.stage||'router',status:routed.ok?'completed':'failed',durationMs:Date.now()-startedAt});
  return routed;
}
function getHealth(){return{ok:Boolean(resolveMarionRunner()),service:'MarionEcosystemGateway',version:VERSION,contract:Contract.CONTRACT,marionReady:Boolean(resolveMarionRunner()),registry:Registry.getHealth(),permissions:Permissions.getHealth(),state:StateSpine.getHealth(),router:EventRouter.getHealth(),telemetry:Telemetry.snapshot()};}
function resetForTests(){marionRunner=null;}
module.exports=Object.freeze({VERSION,process,getHealth,registerMarionRunner,resolveMarionRunner,extractMarionText,resetForTests});
