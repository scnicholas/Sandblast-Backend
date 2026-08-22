'use strict';

const assert=require('assert');
const P=require('../../Data/marion/runtime/LingoSentinel/MarionLingoSentinelProductionPolicy');

const old={...process.env};
try{
  process.env.LS_WIDGET_TOKEN='secret';
  process.env.LS_ALLOWED_ORIGINS='https://sandblast.channel,https://www.sandblast.channel';
  process.env.LS_PHASE4_REQUIRE_WIDGET_TOKEN='true';
  process.env.LS_PHASE4_REQUIRE_ORIGIN='true';
  process.env.LS_PHASE4_RATE_LIMIT_PER_MINUTE='2';
  P.resetForTests();

  assert.equal(P.authorizeWidget({headers:{'x-sb-widget-token':'secret'},origin:'https://sandblast.channel'}).ok,true);
  assert.equal(P.authorizeWidget({headers:{'x-sb-widget-token':'wrong'},origin:'https://sandblast.channel'}).ok,false);
  assert.equal(P.authorizeWidget({headers:{'x-sb-widget-token':'secret'},origin:'https://evil.example'}).ok,false);
  assert.equal(P.authorizeWidget({headers:{'x-sb-widget-token':'secret'},origin:''}).ok,false);

  assert.equal(P.consume('s1',1000).ok,true);
  assert.equal(P.consume('s1',1001).ok,true);
  assert.equal(P.consume('s1',1002).ok,false);
  console.log('PASS marion_lingosentinel_phase4_security_test');
}finally{
  for(const k of Object.keys(process.env)) if(!(k in old)) delete process.env[k];
  Object.assign(process.env,old);P.resetForTests();
}
