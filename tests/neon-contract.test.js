'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const file=path.resolve(process.env.MARION_ADAPTER_PATH||'Utils/marionNeonIntelligence.js');
let mod;try{mod=require(file)}catch(e){throw Error('Target module not found: '+file)};
const env={NEON_AI_GATEWAY_BASE_URL:'https://gateway.example.test',NEON_AI_GATEWAY_TOKEN:'placeholder-only',MARION_NEON_MODEL:'gpt-5-mini'};
const session={source:'server-verified-session',authorized:true,scope:'private_admin',sessionId:'test-session-1234',audience:'owner'};
test('authorization denies browser-controlled session',async()=>{let called=false;let r=await mod.requestIntelligence({prompt:'hello',session:{...session,source:'browser'}},{env,fetchImpl:async()=>{called=true;throw Error('unexpected')}});assert.equal(r.ok,false);assert.equal(called,false)});
test('successful advisory has no authority actions',async()=>{let called=false;let r=await mod.requestIntelligence({prompt:'explain AI',session},{env,fetchImpl:async(url,req)=>{called=true;let data=JSON.parse(req.body);assert.equal(data.model,'gpt-5-mini');return {ok:true,json:async()=>({model:'gpt-5-mini',choices:[{message:{content:'A useful advisory answer.'}}]})}}});assert.equal(called,true);assert.equal(r.ok,true);assert.equal(typeof r.advisory,'string');assert.equal('authorization' in r,false)});
test('upstream failure is reported without exposing tokens',async()=>{let r=await mod.requestIntelligence({prompt:'hello',session},{env,fetchImpl:async()=>({ok:false,status:502})});assert.equal(r.ok,false);assert.equal(JSON.stringify(r).includes('placeholder-only'),false)});
