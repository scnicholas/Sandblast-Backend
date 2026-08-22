'use strict';

const Contract=require('./MarionLingoSentinelProductionContract');
const Policy=require('./MarionLingoSentinelProductionPolicy');
const Ledger=require('./MarionLingoSentinelRequestLedger');
const Breaker=require('./MarionLingoSentinelCircuitBreaker');
const Telemetry=require('./MarionLingoSentinelTelemetry');

const VERSION='marion.lingosentinel.productionGateway/4.0';
let injectedOrchestrator=null, cached=undefined;

function text(v,n=180){return String(v==null?'':v).trim().slice(0,n);}
function registerOrchestrator(v){injectedOrchestrator=v||null;return !!injectedOrchestrator;}
function resolveOrchestrator(){
  if(injectedOrchestrator)return injectedOrchestrator;
  if(cached!==undefined)return cached;
  try{cached=require('./MarionLingoSentinelCognitiveOrchestrator');}catch(_){cached=null;}
  return cached;
}
function runFunction(mod){
  if(!mod)return null;
  if(typeof mod==='function')return mod;
  for(const k of ['orchestrate','run','process','handle'])if(typeof mod[k]==='function')return mod[k].bind(mod);
  return null;
}
async function withTimeout(value,ms){
  let timer;
  try{return await Promise.race([Promise.resolve(value),new Promise((_,reject)=>{timer=setTimeout(()=>{const e=new Error('phase4_timeout');e.code='PHASE4_TIMEOUT';reject(e);},ms);})]);}
  finally{if(timer)clearTimeout(timer);}
}
function errorResult(req,stage,errors,extra={}){
  return {ok:false,request:req,response:Contract.createError(req,stage,errors,extra),stage,errors,version:VERSION};
}
async function execute(input = {}, options = {}) {
  const started=Date.now(), req=Contract.normalizeRequest(input), valid=Contract.validateRequest(req);
  if(!valid.ok){Telemetry.record('contract_reject',{...req,stage:'contract'});return errorResult(req,'contract',valid.errors);}

  const payload=Policy.validatePayload(req);
  if(!payload.ok){Telemetry.record('policy_reject',{...req,stage:'policy'});return errorResult(req,'policy',payload.errors);}

  if(options.skipRateLimit!==true){
    const rate=Policy.consume(req.sessionId);
    if(!rate.ok){Telemetry.record('rate_limited',{...req,stage:'rate_limit'});return errorResult(req,'rate_limit',[rate.error],{retryable:true,retryAfterMs:rate.retryAfterMs});}
  }

  const claim=Ledger.claim(req);
  if(claim.status==='duplicate_completed'){
    const cachedResponse=claim.cached||{};
    Telemetry.record('duplicate_cache_hit',{...req,status:'completed',durationMs:Date.now()-started});
    return {ok:true,request:req,response:{...cachedResponse,duplicate:true},duplicate:true,version:VERSION};
  }
  if(!claim.ok){
    const retry=claim.status==='duplicate_inflight';
    Telemetry.record('duplicate_reject',{...req,stage:claim.status});
    return errorResult(req,claim.status,[claim.error],{retryable:retry,retryAfterMs:claim.retryAfterMs});
  }

  const gate=Breaker.allow();
  if(!gate.ok){
    Ledger.fail(req.requestId,'circuit_open');
    Telemetry.record('circuit_open',{...req,stage:'circuit_open'});
    return errorResult(req,'circuit_open',['marion_circuit_open'],{retryable:true,retryAfterMs:gate.retryAfterMs});
  }

  const mod=resolveOrchestrator(), run=runFunction(mod);
  if(!run){
    Ledger.fail(req.requestId,'phase3_orchestrator_unavailable');Breaker.failure();
    Telemetry.record('orchestrator_unavailable',{...req,stage:'orchestrator_resolve'});
    return errorResult(req,'orchestrator_resolve',['phase3_orchestrator_unavailable'],{retryable:true});
  }

  const timeoutMs=Math.max(1200,Math.min(30000,Number(options.timeoutMs||process.env.LS_PHASE4_TIMEOUT_MS||12000)||12000));
  try{
    Telemetry.record('request_start',{...req,status:'processing'});
    const p3=await withTimeout(run(Contract.toCognitiveRequest(req),{timeoutMs}),timeoutMs);
    if(!p3||p3.ok!==true){
      const stage=p3&&p3.stage||'phase3';
      const errors=p3&&p3.errors||['phase3_failed'];
      Ledger.fail(req.requestId,errors[0]||stage);Breaker.failure();
      Telemetry.record('request_failure',{...req,stage,durationMs:Date.now()-started});
      return errorResult(req,stage,errors,{retryable:stage!=='contract'});
    }
    Breaker.success();
    const response=Contract.createSuccess(req,p3);
    Ledger.complete(req.requestId,response);
    Telemetry.record(response.degraded?'request_degraded':'request_success',{...req,degraded:response.degraded,durationMs:Date.now()-started});
    return {ok:true,request:req,response,version:VERSION};
  }catch(e){
    const timeout=e&&e.code==='PHASE4_TIMEOUT', stage=timeout?'timeout':'production_run', err=text(e&&e.message||e&&e.name||'production_error');
    Ledger.fail(req.requestId,err);Breaker.failure();
    Telemetry.record('request_exception',{...req,stage,durationMs:Date.now()-started});
    return errorResult(req,stage,[err],{retryable:true,retryAfterMs:timeout?1000:0});
  }
}
function getHealth(){
  const mod=resolveOrchestrator(), run=runFunction(mod), breaker=Breaker.snapshot();
  return {
    ok:!!run && breaker.state!=='open',
    service:'MarionLingoSentinelProductionGateway',version:VERSION,contract:Contract.PRODUCTION_CONTRACT,
    phase3Ready:!!run,policy:Policy.getHealth(),ledger:Ledger.getHealth(),circuit:breaker,
    telemetry:Telemetry.snapshot()
  };
}
function resetForTests(){
  injectedOrchestrator=null;cached=undefined;Ledger.resetForTests();Breaker.resetForTests();Telemetry.resetForTests();Policy.resetForTests();
}
module.exports=Object.freeze({VERSION,execute,getHealth,registerOrchestrator,resolveOrchestrator,resetForTests});
