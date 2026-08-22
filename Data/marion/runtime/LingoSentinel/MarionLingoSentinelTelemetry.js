'use strict';

const VERSION = 'marion.lingosentinel.telemetry/4.0';
const MAX_EVENTS = Math.max(20,Math.min(500,Number(process.env.LS_PHASE4_TELEMETRY_EVENTS||100)||100));
const events=[];
const counters=Object.create(null);

function text(v,n=160){return String(v==null?'':v).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);}
function safe(data = {}) {
  const x=data&&typeof data==='object'?data:{};
  return {
    type:text(x.type,64), requestId:text(x.requestId,128), traceId:text(x.traceId,128),
    sessionId:text(x.sessionId,128), stage:text(x.stage,80), status:text(x.status,48),
    sourceLanguage:text(x.sourceLanguage,16), targetLanguage:text(x.targetLanguage,16),
    mode:text(x.mode,40), layer:text(x.layer,40), degraded:x.degraded===true,
    durationMs:Math.max(0,Number(x.durationMs||0)||0), timestamp:Number(x.timestamp||Date.now())
  };
}
function record(type,data = {}) {
  const t=text(type,64)||'unknown'; counters[t]=(counters[t]||0)+1;
  events.push(safe({...data,type:t,timestamp:Date.now()}));
  if(events.length>MAX_EVENTS)events.splice(0,events.length-MAX_EVENTS);
  return true;
}
function snapshot(options = {}) {
  const includeEvents=options.includeEvents===true;
  return {
    ok:true,service:'MarionLingoSentinelTelemetry',version:VERSION,
    counters:{...counters},eventCount:events.length,
    ...(includeEvents?{events:events.map(x=>({...x}))}:{})
  };
}
function resetForTests(){events.length=0;for(const k of Object.keys(counters))delete counters[k];}
module.exports=Object.freeze({VERSION,record,snapshot,resetForTests});
