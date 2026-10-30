'use strict';

const Contract=require('./MarionEcosystemContract');
const Registry=require('./MarionComponentRegistry');
const Permissions=require('./MarionEcosystemPermissions');
const StateSpine=require('./MarionEcosystemStateSpine');
const Telemetry=require('./MarionEcosystemTelemetry');
const VERSION='marion.ecosystemEventRouter/1.0';
const handlers=new Map();
function handlerKey(component,eventType){return`${Contract.normalizeComponent(component)}::${eventType}`;}
function registerHandler(component,eventType,handler){
  const id=Contract.normalizeComponent(component);
  if(!Registry.has(id))return{ok:false,error:'component_not_registered'};
  if(!Contract.EVENT_TYPES.includes(eventType))return{ok:false,error:'eventType_invalid'};
  if(typeof handler!=='function')return{ok:false,error:'handler_required'};
  handlers.set(handlerKey(id,eventType),handler);return{ok:true,component:id,eventType};
}
function removeHandler(component,eventType){return handlers.delete(handlerKey(component,eventType));}
function permissionRequirement(envelope){
  switch(envelope.eventType){
    case'component.state':return{action:'write',resource:`${envelope.source}.state`};
    case'component.command':return{action:'request',resource:`${envelope.target}.command`};
    case'conversation.message':
    case'domain.request':return{action:'request',resource:'marion.reasoning'};
    case'lead.created':
    case'lead.updated':return{action:'write',resource:'crm.telemetry'};
    case'media.event':
    case'telemetry.event':return{action:'write',resource:`${envelope.source}.telemetry`};
    default:return null;
  }
}
async function route(input={},options={}){
  const startedAt=Date.now(),envelope=Contract.normalizeEnvelope(input),validation=Contract.validateEnvelope(envelope);
  if(!validation.ok){Telemetry.record('route_reject',{...envelope,stage:'contract'});return{ok:false,stage:'contract',errors:validation.errors,envelope};}
  if(!Registry.has(envelope.source)){Telemetry.record('route_reject',{...envelope,stage:'source_registry'});return{ok:false,stage:'source_registry',errors:['source_component_not_registered'],envelope};}
  if(!Registry.has(envelope.target)){Telemetry.record('route_reject',{...envelope,stage:'target_registry'});return{ok:false,stage:'target_registry',errors:['target_component_not_registered'],envelope};}
  const requirement=permissionRequirement(envelope);
  if(requirement&&options.skipPermission!==true){
    const decision=Permissions.authorize(envelope.source,requirement.action,requirement.resource);
    if(!decision.ok){Telemetry.record('permission_deny',{...envelope,stage:'permission'});return{ok:false,stage:'permission',errors:[decision.reason],decision,envelope};}
  }
  if(envelope.eventType==='component.state'&&envelope.sessionId){StateSpine.setSession(envelope.sessionId,envelope.source,{...envelope.state,roomId:envelope.roomId,conversationId:envelope.conversationId});}
  const exact=handlers.get(handlerKey(envelope.target,envelope.eventType))||null;
  const wildcard=handlers.get(handlerKey(envelope.target,'telemetry.event'))||null;
  const handler=exact||wildcard;
  if(!handler){Telemetry.record('route_unhandled',{...envelope,status:'accepted',durationMs:Date.now()-startedAt});return{ok:true,handled:false,envelope,context:envelope.sessionId?StateSpine.createContext(envelope.sessionId):null};}
  try{
    const result=await handler(envelope,{context:envelope.sessionId?StateSpine.createContext(envelope.sessionId):null,registry:Registry,permissions:Permissions,state:StateSpine});
    Telemetry.record('route_success',{...envelope,status:'handled',durationMs:Date.now()-startedAt});return{ok:true,handled:true,envelope,result};
  }catch(error){
    Telemetry.record('route_error',{...envelope,stage:'handler',durationMs:Date.now()-startedAt});return{ok:false,stage:'handler',errors:[String(error&&(error.code||error.message||error.name)||'handler_error').slice(0,180)],envelope};
  }
}
function getHealth(){return{ok:true,service:'MarionEcosystemEventRouter',version:VERSION,handlers:handlers.size};}
function resetForTests(){handlers.clear();}
module.exports=Object.freeze({VERSION,registerHandler,removeHandler,route,getHealth,resetForTests});
