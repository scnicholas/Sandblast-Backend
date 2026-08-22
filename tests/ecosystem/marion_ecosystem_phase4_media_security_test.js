
'use strict';
const assert=require('assert');
const P=require('../../Data/marion/runtime/ecosystem/MarionMediaIngestPolicy');
const N=require('../../Data/marion/runtime/ecosystem/MarionMediaTelemetryNormalizer');
const old={...process.env};
try{
  process.env.NODE_ENV='production';process.env.MEDIA_PHASE4_ALLOWED_ORIGINS='https://sandblast.channel,https://www.sandblast.channel';process.env.MEDIA_PHASE4_REQUIRE_ORIGIN='true';process.env.MEDIA_ECOSYSTEM_INGEST_TOKEN='server-secret';process.env.MARION_INTERNAL_TOKEN='internal-secret';
  assert.equal(P.authorizeBrowser({origin:'https://sandblast.channel'}).ok,true);
  assert.equal(P.authorizeBrowser({origin:'https://evil.example'}).ok,false);
  assert.equal(P.authorizeServer({headers:{'x-sb-media-token':'server-secret'}}).ok,true);
  assert.equal(P.authorizeServer({headers:{'x-sb-media-token':'wrong'}}).ok,false);
  assert.equal(P.authorizeInternal({headers:{'x-marion-internal-token':'internal-secret'}}).ok,true);
  const r=N.validate({eventId:'sensitive',sessionId:'s',component:'sandblast-channel',eventName:'page.cta_click',campaignId:'person@example.com',contentId:'+1 (416) 555-1212'});
  assert.equal(r.ok,true);assert.equal(r.event.campaignId,'');assert.equal(r.event.contentId,'');
  console.log('PASS marion_ecosystem_phase4_media_security_test');
} finally { for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old); }
