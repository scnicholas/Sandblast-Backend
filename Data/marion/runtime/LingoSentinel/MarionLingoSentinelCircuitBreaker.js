'use strict';

const VERSION = 'marion.lingosentinel.circuitBreaker/4.0';

function createCircuitBreaker(options = {}) {
  const failureThreshold=Math.max(1,Number(options.failureThreshold||5)||5);
  const cooldownMs=Math.max(100,Number(options.cooldownMs||30000)||30000);
  const clock=typeof options.clock==='function'?options.clock:()=>Date.now();
  let state='closed', failures=0, openedAt=0, halfOpenProbe=false;

  function allow(){
    const now=clock();
    if(state==='open' && now-openedAt>=cooldownMs){state='half_open';halfOpenProbe=false;}
    if(state==='open') return {ok:false,state,retryAfterMs:Math.max(1,cooldownMs-(now-openedAt))};
    if(state==='half_open'){
      if(halfOpenProbe) return {ok:false,state,retryAfterMs:cooldownMs};
      halfOpenProbe=true; return {ok:true,state,probe:true};
    }
    return {ok:true,state};
  }
  function success(){state='closed';failures=0;openedAt=0;halfOpenProbe=false;return snapshot();}
  function failure(){
    failures++;
    if(state==='half_open'||failures>=failureThreshold){state='open';openedAt=clock();halfOpenProbe=false;}
    return snapshot();
  }
  function snapshot(){
    const now=clock();
    return {ok:state!=='open',service:'MarionLingoSentinelCircuitBreaker',version:VERSION,state,failures,failureThreshold,cooldownMs,retryAfterMs:state==='open'?Math.max(0,cooldownMs-(now-openedAt)):0};
  }
  function reset(){state='closed';failures=0;openedAt=0;halfOpenProbe=false;}
  return Object.freeze({allow,success,failure,snapshot,reset});
}

const singleton=createCircuitBreaker({
  failureThreshold:Number(process.env.LS_PHASE4_CIRCUIT_FAILURES||5)||5,
  cooldownMs:Number(process.env.LS_PHASE4_CIRCUIT_COOLDOWN_MS||30000)||30000
});

module.exports=Object.freeze({
  VERSION, createCircuitBreaker,
  allow:singleton.allow, success:singleton.success, failure:singleton.failure,
  snapshot:singleton.snapshot, resetForTests:singleton.reset
});
