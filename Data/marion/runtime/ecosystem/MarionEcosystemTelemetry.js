'use strict';

const VERSION='marion.ecosystemTelemetry/1.0';
const MAX_EVENTS=Math.max(50,Math.min(1000,Number(process.env.MARION_ECOSYSTEM_TELEMETRY_MAX||250)||250));
const events=[];
const counters=Object.create(null);
function clean(value,max=160){return String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function normalize(data={}){return{type:clean(data.type,80),requestId:clean(data.requestId,128),traceId:clean(data.traceId,128),sessionId:clean(data.sessionId,128),source:clean(data.source,64),target:clean(data.target,64),eventType:clean(data.eventType,80),stage:clean(data.stage,80),status:clean(data.status,48),durationMs:Math.max(0,Number(data.durationMs||0)||0),timestamp:Number.isFinite(+data.timestamp)?+data.timestamp:Date.now()};}
function record(type,data={}){const key=clean(type||'unknown',80);counters[key]=(counters[key]||0)+1;events.push(normalize({...data,type:key,timestamp:Date.now()}));if(events.length>MAX_EVENTS)events.splice(0,events.length-MAX_EVENTS);return true;}
function snapshot(options={}){return{ok:true,service:'MarionEcosystemTelemetry',version:VERSION,eventCount:events.length,counters:{...counters},...(options.includeEvents===true?{events:events.map(event=>({...event}))}:{})};}
function resetForTests(){events.length=0;for(const key of Object.keys(counters))delete counters[key];}
module.exports=Object.freeze({VERSION,record,snapshot,resetForTests});
