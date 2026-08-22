
'use strict';

const crypto = require('crypto');
const Contract = require('./MarionMediaEventContract');

const VERSION = 'marion.mediaIngestPolicy/4.0';

function clean(value, max = 400) { return String(value == null ? '' : value).trim().slice(0,max); }
function bool(name, fallback=false) {
  const v = clean(process.env[name],32).toLowerCase();
  if (!v) return fallback;
  return ['1','true','yes','on'].includes(v);
}
function origins() {
  return String(process.env.MEDIA_PHASE4_ALLOWED_ORIGINS || '')
    .split(',').map(x=>x.trim()).filter(Boolean);
}
function timingEqual(a,b) {
  const A=Buffer.from(String(a||'')), B=Buffer.from(String(b||''));
  return A.length>0 && A.length===B.length && crypto.timingSafeEqual(A,B);
}
function header(headers,name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return clean(headers.get(name),512);
  const key = Object.keys(headers).find(k=>k.toLowerCase()===String(name).toLowerCase());
  return key ? clean(headers[key],512) : '';
}
function config() {
  return {
    allowedOrigins:origins(),
    requireOrigin:bool('MEDIA_PHASE4_REQUIRE_ORIGIN', process.env.NODE_ENV==='production'),
    serverToken:clean(process.env.MEDIA_ECOSYSTEM_INGEST_TOKEN || process.env.MARION_ECOSYSTEM_TOKEN,512),
    internalToken:clean(process.env.MARION_INTERNAL_TOKEN || process.env.MEDIA_ECOSYSTEM_INGEST_TOKEN,512),
    maxBatch:Math.max(1,Math.min(Contract.MAX_BATCH,Number(process.env.MEDIA_PHASE4_MAX_BATCH||Contract.MAX_BATCH)||Contract.MAX_BATCH))
  };
}
function authorizeBrowser(input = {}) {
  const c=config(), origin=clean(input.origin,300);
  if (c.requireOrigin && !origin) return {ok:false,status:403,error:'origin_required'};
  if (origin && c.allowedOrigins.length && !c.allowedOrigins.includes(origin)) return {ok:false,status:403,error:'origin_not_allowed'};
  if (c.requireOrigin && c.allowedOrigins.length===0) return {ok:false,status:503,error:'allowed_origins_not_configured'};
  return {ok:true,status:200};
}
function authorizeServer(input = {}) {
  const c=config(), got=header(input.headers,'x-sb-media-token') || header(input.headers,'x-sb-ecosystem-token');
  if (!c.serverToken) return {ok:false,status:503,error:'media_ingest_token_not_configured'};
  return timingEqual(got,c.serverToken)?{ok:true,status:200}:{ok:false,status:403,error:'media_ingest_token_invalid'};
}
function authorizeInternal(input = {}) {
  const c=config(), got=header(input.headers,'x-marion-internal-token');
  if (!c.internalToken) return {ok:false,status:503,error:'internal_token_not_configured'};
  return timingEqual(got,c.internalToken)?{ok:true,status:200}:{ok:false,status:403,error:'internal_token_invalid'};
}
function getHealth(){ const c=config(); return {ok:true,service:'MarionMediaIngestPolicy',version:VERSION,allowedOriginCount:c.allowedOrigins.length,requireOrigin:c.requireOrigin,serverTokenConfigured:!!c.serverToken,internalTokenConfigured:!!c.internalToken,maxBatch:c.maxBatch}; }

module.exports = Object.freeze({ VERSION, config, authorizeBrowser, authorizeServer, authorizeInternal, getHealth });
