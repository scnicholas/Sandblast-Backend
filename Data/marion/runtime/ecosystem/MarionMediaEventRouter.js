
'use strict';

const EventRouter = require('./MarionEcosystemEventRouter');
const StateSpine = require('./MarionEcosystemStateSpine');
const Telemetry = require('./MarionEcosystemTelemetry');
const Normalizer = require('./MarionMediaTelemetryNormalizer');
const Ledger = require('./MarionMediaEventLedger');
const Rate = require('./MarionMediaRateLimiter');
const Store = require('./MarionMediaAggregationStore');

const VERSION='marion.mediaEventRouter/4.0';
let installed=false;

async function handle(envelope = {}) {
  const started=Date.now();
  const source=envelope.payload&&envelope.payload.event ? envelope.payload.event : envelope.payload || {};
  const check=Normalizer.validate(source);
  if(!check.ok) return {ok:false,stage:'media_contract',errors:check.errors,requestId:envelope.requestId,traceId:envelope.traceId};
  const event=check.event;
  const claim=Ledger.claim(event);
  if(!claim.ok) return {ok:false,stage:'ledger',errors:[claim.error],requestId:event.requestId,traceId:event.traceId};
  if(claim.duplicate) {
    Telemetry.record('media_duplicate',{requestId:event.requestId,traceId:event.traceId,sessionId:event.sessionId,source:event.component,target:'marion',eventType:'media.event',status:'ignored'});
    return {ok:true,duplicate:true,accepted:false,eventId:event.eventId,requestId:event.requestId,traceId:event.traceId,version:VERSION};
  }
  const rate=Rate.consume(event);
  if(!rate.ok) return {ok:false,stage:'rate_limit',errors:[rate.error],retryAfterMs:rate.retryAfterMs,requestId:event.requestId,traceId:event.traceId};
  const aggregate=Store.record(event);
  StateSpine.setSession(event.sessionId,event.component,{status:'observed',data:{lastEventName:event.eventName,lastCampaignId:event.campaignId,lastContentId:event.contentId,lastEventAt:event.timestamp}});
  Telemetry.record('media_event_accepted',{requestId:event.requestId,traceId:event.traceId,sessionId:event.sessionId,source:event.component,target:'marion',eventType:'media.event',status:event.eventName,durationMs:Date.now()-started});
  return {ok:true,accepted:true,duplicate:false,eventId:event.eventId,requestId:event.requestId,traceId:event.traceId,sessionId:event.sessionId,component:event.component,eventName:event.eventName,aggregate,controls:{aggregatedOnly:true,marionInvoked:false,mediaOperationIndependent:true},version:VERSION};
}

function install(){
  if(installed)return{ok:true,installed:true,duplicate:true,version:VERSION};
  const result=EventRouter.registerHandler('marion','media.event',handle);
  installed=result.ok===true;
  return{ok:installed,installed,result,version:VERSION};
}

async function route(input = {}) {
  install();
  const check=Normalizer.validate(input);
  if(!check.ok)return{ok:false,stage:'media_contract',errors:check.errors};
  return EventRouter.route(Normalizer.toEcosystemEnvelope(check.event));
}

function getHealth(){return{ok:installed,service:'MarionMediaEventRouter',version:VERSION,installed,ledger:Ledger.getHealth(),rateLimiter:Rate.getHealth(),aggregation:Store.getHealth()};}
function resetForTests(){EventRouter.removeHandler('marion','media.event');installed=false;Ledger.resetForTests();Rate.resetForTests();Store.resetForTests();}

module.exports=Object.freeze({VERSION,install,route,handle,getHealth,resetForTests});
