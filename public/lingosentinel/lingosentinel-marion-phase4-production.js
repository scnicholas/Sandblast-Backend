(function(W,D){
  'use strict';
  var PROD='https://sandblast-backend.onrender.com',L=location,local=L.protocol==='file:'||/^(localhost|127\.0\.0\.1)$/.test(L.hostname),
      base=(W.LS_BACKEND||D.documentElement.dataset.lsBackend||(local?'http://localhost:3000':PROD)).replace(/\/$/,''),
      token=W.LS_WIDGET_TOKEN||'',started=false,timeout=Math.max(2000,+W.LS_PHASE4_TIMEOUT||15000);
  function id(p){try{return p+'-'+crypto.randomUUID()}catch(_){return p+'-'+Date.now().toString(36)+Math.random().toString(36).slice(2)}}
  function headers(requestId){var h={'Content-Type':'application/json','x-request-id':requestId};if(token)h['x-sb-widget-token']=token;return h;}
  function state(){try{return W.LingoSentinel?.translation?.state?.()||{}}catch(_){return{}}}
  function ui(){try{return W.LingoSentinel?.ui?.getContext?.()||{}}catch(_){return{}}}
  function p2(){try{return W.LingoSentinelMarionPhase2?.getState?.()||{}}catch(_){return{}}}
  async function post(payload,requestId,attempt){
    var c=new AbortController(),timer=setTimeout(()=>c.abort(),timeout);
    try{
      var r=await fetch(base+'/api/lingosentinel/marion/production/request',{method:'POST',signal:c.signal,credentials:'omit',referrerPolicy:'no-referrer',headers:headers(requestId),body:JSON.stringify({...payload,requestId:requestId,attempt:attempt})}),
          j={};try{j=await r.json()}catch(_){}
      if(!r.ok||j.ok===false){var e=Error(j.stage||j.error||('http_'+r.status));e.status=r.status;e.payload=j;throw e}
      return j;
    }finally{clearTimeout(timer)}
  }
  async function request(payload){
    var p=payload||{},t=state(),u=ui(),s=p2(),speaker=p.speakerRole||s.speakerRole||u.speaker||'host',
        lang=u.language||t.targetLanguage||'en',src=p.sourceLanguage||s.sourceLanguage||(speaker==='remote'?lang:'en'),
        dst=p.targetLanguage||s.targetLanguage||(speaker==='remote'?'en':lang),requestId=p.requestId||id('ls4'),
        packet={traceId:id('trace'),sessionId:p.sessionId||t.sessionId,conversationId:p.conversationId||s.conversationId||'',roomId:p.roomId||s.roomId||'lingosentinel-main',
          sourceLanguage:src,targetLanguage:dst,cultureContext:p.cultureContext||u.culture||t.culture||'general',layer:p.layer||u.layer||'language',
          mode:p.mode||u.mode||'one_to_one',speakerRole:speaker,participantId:p.participantId||s.participantId||(speaker==='remote'?'remote-'+lang:'host'),
          intent:p.type||p.intent||'conversation',message:p.text||p.message||'',returnMode:'both'};
    W.dispatchEvent(new CustomEvent('lingosentinel:phase4-processing',{detail:{requestId:requestId,sourceLanguage:src,targetLanguage:dst}}));
    try{
      var j;
      try{j=await post(packet,requestId,1)}catch(e){if(e.name==='AbortError'||!e.status||e.status>=500)j=await post(packet,requestId,2);else throw e}
      var r=j.response||{},canonical=r.canonicalResponse||r.displayText||'',localized=r.localizedResponse||canonical;
      W.dispatchEvent(new CustomEvent(r.degraded?'lingosentinel:phase4-degraded':'lingosentinel:phase4-response',{detail:{requestId:r.requestId||requestId,traceId:r.traceId,canonicalResponse:canonical,localizedResponse:localized,degraded:r.degraded===true,duplicate:r.duplicate===true}}));
      return {text:canonical,canonicalText:canonical,localizedText:localized,envelope:r,phase4:true};
    }catch(e){
      W.dispatchEvent(new CustomEvent('lingosentinel:phase4-error',{detail:{requestId:requestId,error:e.message||'phase4_failed',retryable:!!e.payload?.response?.retryable}}));
      throw e;
    }
  }
  var adapter={request:request};
  async function health(){try{var r=await fetch(base+'/api/lingosentinel/marion/production/health',{credentials:'omit',referrerPolicy:'no-referrer'});return await r.json()}catch(e){return{ok:false,error:e.message||'health_failed'}}}
  async function start(){
    if(started)return true;
    if(!W.LingoSentinel?.marion||!W.LingoSentinel?.translation)return false;
    started=true;W.LingoSentinel.marion.register(adapter);
    var h=await health();
    W.dispatchEvent(new CustomEvent('lingosentinel:phase4-ready',{detail:{contract:'marion.lingosentinel.production/4.0',baseUrl:base,health:h,adapterMode:'canonical-return'}}));
    return true;
  }
  if(!start()){W.addEventListener('lingosentinel:phase3-ready',start,{once:true});W.addEventListener('lingosentinel:integration-ready',start,{once:true});}
  W.LingoSentinelMarionPhase4={start: start,adapter:adapter,request:request,health:health,baseUrl:base};
})(window,document);
