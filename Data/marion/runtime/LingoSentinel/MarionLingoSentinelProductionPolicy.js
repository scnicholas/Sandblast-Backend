'use strict';

const crypto = require('crypto');
const Contract = require('./MarionLingoSentinelProductionContract');

const VERSION = 'marion.lingosentinel.productionPolicy/4.0';
const buckets = new Map();

function envBool(name, fallback = false) {
  const v = String(process.env[name] == null ? '' : process.env[name]).trim().toLowerCase();
  if (!v) return fallback;
  return ['1','true','yes','on','enabled'].includes(v);
}
function positive(name, fallback, min, max) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? Math.max(min,Math.min(max,n)) : fallback;
}
function clean(v,n=240){ return String(v==null?'':v).replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,n); }
function timingEqual(a,b) {
  const A=Buffer.from(String(a||'')), B=Buffer.from(String(b||''));
  return A.length===B.length && A.length>0 && crypto.timingSafeEqual(A,B);
}
function allowedOrigins() {
  return String(process.env.LS_ALLOWED_ORIGINS || process.env.LINGOSENTINEL_ALLOWED_ORIGINS || '')
    .split(',').map(x=>x.trim()).filter(Boolean);
}
function config() {
  const widgetToken=clean(process.env.LS_WIDGET_TOKEN || process.env.LINGOSENTINEL_WIDGET_TOKEN || '',512);
  const internalToken=clean(process.env.MARION_INTERNAL_TOKEN || '',512);
  const origins=allowedOrigins();
  return {
    widgetToken,
    internalToken,
    origins,
    requireWidgetToken:envBool('LS_PHASE4_REQUIRE_WIDGET_TOKEN',false),
    requireOrigin:envBool('LS_PHASE4_REQUIRE_ORIGIN',false),
    rateLimit:positive('LS_PHASE4_RATE_LIMIT_PER_MINUTE',60,1,600),
    maxText:positive('LS_PHASE4_MAX_TEXT',Contract.MAX_TEXT,256,Contract.MAX_TEXT)
  };
}
function header(headers,name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return clean(headers.get(name),512);
  const key=Object.keys(headers).find(k=>k.toLowerCase()===String(name).toLowerCase());
  return key ? clean(headers[key],512) : '';
}
function authorizeWidget(input = {}) {
  const c=config(), token=header(input.headers,'x-sb-widget-token'), origin=clean(input.origin,300);
  if (c.requireWidgetToken && !c.widgetToken) return {ok:false,status:503,error:'widget_token_not_configured'};
  if (c.widgetToken && !timingEqual(token,c.widgetToken)) return {ok:false,status:403,error:'widget_token_invalid'};
  if (c.requireOrigin && !origin) return {ok:false,status:403,error:'origin_required'};
  if (origin && c.origins.length && !c.origins.includes(origin)) return {ok:false,status:403,error:'origin_not_allowed'};
  return {ok:true,status:200};
}
function authorizeInternal(input = {}) {
  const c=config(), token=header(input.headers,'x-marion-internal-token');
  if (!c.internalToken) return {ok:false,status:503,error:'internal_token_not_configured'};
  return timingEqual(token,c.internalToken) ? {ok:true,status:200} : {ok:false,status:403,error:'internal_token_invalid'};
}
function validatePayload(input = {}) {
  const r=Contract.normalizeRequest(input), errors=[];
  if (r.message.length > config().maxText) errors.push('message_too_large');
  if (!r.sessionId) errors.push('sessionId_required');
  return {ok:!errors.length,errors,request:r};
}
function consume(sessionId, now = Date.now()) {
  const c=config(), id=clean(sessionId,128);
  if(!id) return {ok:false,error:'sessionId_required',retryAfterMs:60000};
  const minute=Math.floor(now/60000), prior=buckets.get(id);
  const b=!prior||prior.minute!==minute?{minute,count:0}:prior;
  b.count++; buckets.set(id,b);
  if(b.count>c.rateLimit){
    const retryAfterMs=(minute+1)*60000-now;
    return {ok:false,error:'rate_limited',retryAfterMs:Math.max(1,retryAfterMs),limit:c.rateLimit,count:b.count};
  }
  return {ok:true,limit:c.rateLimit,count:b.count};
}
function getHealth() {
  const c=config();
  return {
    ok:true, service:'MarionLingoSentinelProductionPolicy', version:VERSION,
    widgetTokenConfigured:!!c.widgetToken, widgetTokenRequired:c.requireWidgetToken,
    internalTokenConfigured:!!c.internalToken, originPolicyConfigured:c.origins.length>0,
    originRequired:c.requireOrigin, allowedOriginCount:c.origins.length, rateLimitPerMinute:c.rateLimit,
    maxText:c.maxText
  };
}
function resetForTests(){ buckets.clear(); }

module.exports=Object.freeze({
  VERSION, config, authorizeWidget, authorizeInternal, validatePayload, consume, getHealth, resetForTests
});
