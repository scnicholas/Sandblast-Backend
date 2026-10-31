'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const adapter = require('../Utils/marionNeonIntelligence');
const env = { NEON_AI_GATEWAY_TOKEN: 'test-only-token', NEON_AI_GATEWAY_BASE_URL: 'https://gateway.example.invalid', NEON_AI_GATEWAY_MODEL: 'gpt-5-mini' };
const session = { source: 'server-verified-session', authorized: true, scope: 'private_admin', audience: 'owner', sessionId: 'test-session-01' };
test('no valid private session = no network', async () => {
  let called = false;
  const r = await adapter.requestIntelligence({prompt:'test',session:{...session,authorized:false}}, {env, fetchImpl:async()=>{called=true;}});
  assert.equal(r.reason,'private_authorization_required'); assert.equal(called,false);
});
test('safe config and model resolution', () => {
  assert.equal(adapter.config(env).model,'gpt-5-mini');
  assert.equal(adapter.config({...env,MARION_NEON_MODEL:'gpt-5-mini'}).model,'gpt-5-mini');
  assert.equal(adapter.config({...env,NEON_AI_GATEWAY_BASE_URL:'http://unsafe.example'}),null);
  assert.equal(adapter.config({...env,MARION_NEON_MODEL:'invalid model!'}),null);
});
test('successful request passes model advisory to Marion without authority escalation', async () => {
  let request;
  const r=await adapter.requestIntelligence({prompt:'What is the status?',activeDomain:'general',session},{env,fetchImpl:async(url,opts)=>{request={url,opts};return {ok:true,status:200,json:async()=>({model:'gpt-5-mini',choices:[{message:{content:'Verified test answer'}}]})};}});
  assert.equal(r.ok,true); assert.equal(r.advisory,'Verified test answer'); assert.equal(r.responseModel,'gpt-5-mini');
  assert.equal(r.finalAuthority,false); assert.equal(r.advisoryOnly,true);
  assert.equal(JSON.parse(request.opts.body).model,'gpt-5-mini');
  assert.equal(request.url,'https://gateway.example.invalid/v1/chat/completions');
});
test('HTTP error is fail-closed', async()=>{
  const r=await adapter.requestIntelligence({prompt:'test',session},{env,fetchImpl:async()=>({ok:false,status:401})});
  assert.deepEqual(r,{ok:false,reason:'upstream_http_error',status:401});
});
test('malformed JSON is fail-closed', async()=>{
  const r=await adapter.requestIntelligence({prompt:'test',session},{env,fetchImpl:async()=>({ok:true,json:async()=>{throw Error('invalid');}})});
  assert.equal(r.reason,'upstream_invalid_json');
});
test('empty model response is fail-closed', async()=>{
  const r=await adapter.requestIntelligence({prompt:'test',session},{env,fetchImpl:async()=>({ok:true,json:async()=>({choices:[]})})});
  assert.equal(r.reason,'empty_model_answer');
});
test('health is config-only, never claims live invocation',()=>{
  const result=adapter.getHealth(env); assert.equal(result.ok,true); assert.equal(result.liveInvocationVerified,false);
});
