'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const timing = require('./NyxSpeechTimingAdapter');
const providerPath = require.resolve('./ttsProvidersResemble');
let passed = 0;
function check(name, fn) { fn(); passed++; process.stdout.write(`PASS ${name}\n`); }
async function asyncCheck(name, fn) { await fn(); passed++; process.stdout.write(`PASS ${name}\n`); }
check('empty text has no authoritative duration', () => assert.equal(timing.buildSpeechTiming('', {actualDurationMs:5000}).estimatedDurationMs,0));
check('provider 1234ms duration accepted', () => assert.equal(timing.providerDurationMs({actualDurationMs:1234}),1234));
check('null duration is not evidence', () => assert.equal(timing.providerDurationMs({actualDurationMs:null}),0));
check('timings cover duration exactly',()=>{const x=timing.buildSpeechTiming('one two three',{actualDurationMs:1234}); assert.equal(x.wordTimings.at(-1).endMs,1234);assert.equal(x.wordTimings[0].startMs,0);assert.ok(x.wordTimings.every(i=>i.durationMs>=0));});
check('empty speech produces no timing segments',()=> assert.equal(timing.buildWordTimings('',{actualDurationMs:6000}).length,0));
check('long speech is bounded',()=>assert.ok(timing.buildWordTimings('word '.repeat(2000)).length<=420));
const oldFetch=global.fetch;
const prior={RESEMBLE_API_TOKEN:process.env.RESEMBLE_API_TOKEN,RESEMBLE_VOICE_UUID:process.env.RESEMBLE_VOICE_UUID,SB_TTS_RAW_RESPONSE_LOG:process.env.SB_TTS_RAW_RESPONSE_LOG};
process.env.RESEMBLE_API_TOKEN='test-token-placeholder';
process.env.RESEMBLE_VOICE_UUID='5dc633cb';
process.env.SB_TTS_RAW_RESPONSE_LOG='false';
let calls=0;
const wav=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WAVEfmt '),Buffer.alloc(280)]);
global.fetch=async ()=>{calls++;return {status:200, statusText:'OK',headers:{get:()=>null},body:null,text:async()=>JSON.stringify({success:true,audio_content:wav.toString('base64'),output_format:'wav',duration:1.2})};};
delete require.cache[providerPath]; const p=require('./ttsProvidersResemble');
(async()=>{
await asyncCheck('reject unallowlisted endpoint',async()=>{const r=await p.synthesize({text:'hello', endpoint:'https://bad.example/synthesize'});assert.equal(r.reason,'tts_endpoint_not_allowlisted');});
await asyncCheck('reject query-param endpoint',async()=>{const r=await p.synthesize({text:'hello',endpoint:'https://f.cluster.resemble.ai/synthesize?bad=1'});assert.equal(r.reason,'tts_endpoint_not_allowlisted');});
await asyncCheck('reject unapproved format',async()=>{const r=await p.synthesize({text:'hello',outputFormat:'aac'});assert.equal(r.reason,'tts_output_format_invalid');});
await asyncCheck('WAV binary metadata preserved',async()=>{const r=await p.synthesize({text:'hello',outputFormat:'wav'});assert.equal(r.ok,true);assert.equal(r.format,'wav');assert.equal(r.mimeType,'audio/wav');assert.ok(Buffer.isBuffer(r.buffer));});
await asyncCheck('no unnecessary retry on successful audio',async()=>assert.equal(calls,1));
check('reject malformed base64',()=>assert.equal(p._decodeBase64Audio('++++&&bad').ok,false));
check('detect WAV signature',()=>assert.equal(p._detectAudioBuffer(wav).format,'wav'));
await asyncCheck('vendor HTTP body never exposed',async()=>{
  const reloadPath=require.resolve('./ttsProvidersResemble');
  global.fetch=async()=>({status:400,statusText:'Bad Request',headers:{get:()=>null},body:null,text:async()=>JSON.stringify({detail:{code:'bad_request',message:'PRIVATE_RESPONSE_TEXT_DO_NOT_EXPOSE'}})});
  delete require.cache[reloadPath];
  const isolated=require('./ttsProvidersResemble');
  const out=await isolated.synthesize({text:'hello',outputFormat:'mp3'});
  assert.equal(out.ok,false);
  assert.ok(!JSON.stringify(out).includes('PRIVATE_RESPONSE_TEXT_DO_NOT_EXPOSE'));
});
console.log(`TOTAL ${passed} PASSED`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.fetch=oldFetch;for(const [k,v] of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
