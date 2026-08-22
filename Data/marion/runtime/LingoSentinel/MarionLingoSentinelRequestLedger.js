'use strict';

const crypto = require('crypto');

const VERSION = 'marion.lingosentinel.requestLedger/4.0';
const TTL_MS = Math.max(60000, Number(process.env.LS_PHASE4_LEDGER_TTL_MS || 10*60*1000) || 10*60*1000);
const MAX_RECORDS = Math.max(100, Math.min(10000, Number(process.env.LS_PHASE4_LEDGER_MAX || 2500) || 2500));
const records = new Map();

function text(v,n=4000){ return String(v==null?'':v).trim().slice(0,n); }
function clone(v){ return v==null?v:JSON.parse(JSON.stringify(v)); }
function fingerprint(input = {}) {
  const material=[
    text(input.sessionId,128), text(input.conversationId,128), text(input.roomId,128),
    text(input.sourceLanguage,16), text(input.targetLanguage,16), text(input.cultureContext,80),
    text(input.layer,40), text(input.mode,40), text(input.speakerRole,32), text(input.message,4000)
  ].join('\u001f');
  return crypto.createHash('sha256').update(material).digest('hex');
}
function prune(now=Date.now()){
  for(const [k,v] of records) if(!v || now-v.updatedAt>TTL_MS) records.delete(k);
  if(records.size>MAX_RECORDS){
    const ordered=[...records.entries()].sort((a,b)=>(a[1].updatedAt||0)-(b[1].updatedAt||0));
    for(let i=0;i<ordered.length-MAX_RECORDS;i++) records.delete(ordered[i][0]);
  }
}
function claim(input = {}) {
  prune();
  const requestId=text(input.requestId,128); if(!requestId) return {ok:false,status:'invalid',error:'requestId_required'};
  const fp=fingerprint(input), current=records.get(requestId), now=Date.now();
  if(current){
    if(current.fingerprint!==fp) return {ok:false,status:'conflict',error:'requestId_payload_conflict'};
    if(current.status==='completed') return {ok:true,status:'duplicate_completed',cached:clone(current.response),record:clone(current)};
    if(current.status==='processing') return {ok:false,status:'duplicate_inflight',error:'request_inflight',retryAfterMs:Math.max(100,1500-(now-current.updatedAt))};
    if(current.status==='failed') {
      current.status='processing'; current.updatedAt=now; current.attempts=(current.attempts||1)+1; current.error=null;
      return {ok:true,status:'reclaimed',record:clone(current)};
    }
  }
  const record={requestId,fingerprint:fp,status:'processing',createdAt:now,updatedAt:now,attempts:1,response:null,error:null};
  records.set(requestId,record); return {ok:true,status:'claimed',record:clone(record)};
}
function complete(requestId,response){
  const id=text(requestId,128), r=records.get(id); if(!r)return false;
  r.status='completed';r.response=clone(response);r.updatedAt=Date.now();r.completedAt=r.updatedAt;return true;
}
function fail(requestId,error){
  const id=text(requestId,128), r=records.get(id); if(!r)return false;
  r.status='failed';r.error=text(error,180);r.updatedAt=Date.now();return true;
}
function get(requestId){ prune(); return clone(records.get(text(requestId,128))||null); }
function getHealth(){ prune(); const counts={processing:0,completed:0,failed:0};for(const r of records.values())counts[r.status]=(counts[r.status]||0)+1;return {ok:true,service:'MarionLingoSentinelRequestLedger',version:VERSION,records:records.size,ttlMs:TTL_MS,maxRecords:MAX_RECORDS,...counts};}
function resetForTests(){records.clear();}

module.exports=Object.freeze({VERSION,TTL_MS,MAX_RECORDS,fingerprint,claim,complete,fail,get,getHealth,resetForTests});
