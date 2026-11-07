'use strict';
// Isolated unit harness for the unchanged voice route and its one-line repair.
// No backend secrets, Render connection, external providers, or microphone required.
const fs=require('fs'), vm=require('vm'), assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname,'../index.js'),'utf8');
const start=source.indexOf('app.post(NYX_VOICE_TRANSCRIPT_ROUTES, async (req, res) => {');
const end=source.indexOf('/* MARION_ADMIN_EXACT_RESPONSE_IDENTITY_HARDLOCK_V2_START */',start);
assert(start>0 && end>start, 'Transcript route markers remain present');
const route=source.slice(start,end);
assert(!route.includes('exactResponseLiteral'), 'Voice route must not depend on unrelated exactResponseLiteral');
assert(/ok:\s*!\(packet && packet\.ok === false\)/.test(route),'Packet ok is projected without unrelated authority');
let handler, packetValue, sessionAuth, filesReady=true, gatewayReady=true;
const calls=[];
const funcs={
  app:{post(_p,fn){handler=fn;}},NYX_VOICE_TRANSCRIPT_ROUTES:['/api/nyx/voice/transcript'],
  hardenCors(){},hardenConversationNoStore(){},now:()=>Date.now(),
  isObj:v=>v!==null&&typeof v==='object'&&!Array.isArray(v),
  cleanText:v=>String(v==null?'':v).trim(),
  nyxVoiceAuthorityRuntimeDiagnostics:()=>[{exists:filesReady}],
  nyxVoiceRequiredRuntimeDiagnostics:()=>[],nyxVoiceRuntimeFilesReady:()=>filesReady,
  marionAdminVoiceRequestAuth:()=>sessionAuth,
  nyxVoiceRouteReplyText:p=>p&&p.reply||'',
  nyxVoiceRouteIsProtectedStatusReply:()=>false,
  nyxVoiceRouteIsInputEchoReply:()=>false,
  nyxVoiceRouteEnsureNonEmptyReply:p=>p||'Safe fallback',
  nyxVoiceRouteSafePublicReply:p=>p||'',
  nyxVoiceRouteProjectedVoiceMode:(_m,allowed)=>allowed?'full':'silent',
  MARION_ADMIN_ONLY_VOICE_DELIVERY_VERSION:'test',
  NYX_VOICE_TRANSCRIPT_ROUTE_VERSION:'test',NYX_VOICE_DEPLOYMENT_PARITY_VERSION:'test',
  require:p=>{
    assert.strictEqual(p,'./Data/marion/runtime/MarionVoiceGateway.js');
    if(!gatewayReady) throw new Error('gateway unavailable');
    return {async handleVoiceTranscript(input,context){calls.push({input,context});return packetValue;}};
  }
};
vm.runInNewContext(route,funcs,{timeout:3000,filename:'voice-route.js'});
assert(typeof handler==='function','POST handler registered');
function res(){return {code:null,body:null,status(n){this.code=n;return this;},json(v){this.body=v;return this;}};}
async function request(body={transcript:'Hello Marion',final:true}) {
 const response=res();await handler({body,headers:{'user-agent':'test'}},response);return response;
}
async function main(){
 let count=0;
 const check=(test,label)=>{test();console.log('PASS',++count,label);};
 sessionAuth={verified:true,sessionVerified:true,role:'owner',sessionId:'session-A',source:'session'};
 packetValue={ok:true,reply:'Private response',voice:{speakAllowed:true,spokenText:'Private response',voiceMode:'full',adminVoiceDeliveryAllowed:true,speechSync:{enabled:true}}};
 let r=await request();
 check(()=>assert.strictEqual(r.code,200),'successful transcript returns HTTP 200');
 check(()=>assert.strictEqual(r.body.ok,true),'success response ok matches gateway');
 check(()=>assert.strictEqual(r.body.voice.speakAllowed,true),'verified voice remains speakable');
 check(()=>assert.strictEqual(r.body.voice.adminVoiceDeliveryAllowed,true),'approved gateway delivery reported');
 check(()=>assert.strictEqual(r.body.voice.audioStored,false),'raw audio not stored');
 check(()=>assert.strictEqual(calls[0].context.serverVerifiedAuth.sessionId,'session-A'),'server session handed to gateway');
 packetValue={ok:false,reply:'Silent private response',voice:{speakAllowed:false,voiceMode:'silent',adminVoiceDeliveryAllowed:false}};
 r=await request();
 check(()=>assert.strictEqual(r.code,202),'gateway ok false returns HTTP 202');
 check(()=>assert.strictEqual(r.body.ok,false),'gateway denied not misreported ok true');
 check(()=>assert.strictEqual(r.body.voice.speakAllowed,false),'denied gateway stays silent');
 sessionAuth={verified:false,sessionVerified:false,role:'blocked',sessionId:''};
 packetValue={ok:true,reply:'No speech',voice:{speakAllowed:true,spokenText:'No speech',adminVoiceDeliveryAllowed:true}};
 r=await request();
 check(()=>assert.strictEqual(r.body.voice.adminVoiceDeliveryAllowed,false),'unverified request cannot enable private delivery');
 check(()=>assert.strictEqual(r.body.voice.speakAllowed,false),'unverified request cannot speak');
 check(()=>assert.strictEqual(calls[calls.length-1].context.serverVerifiedAuth.verified,false),'unverified principal handed to gateway');
 r=await request({transcript:''});
 check(()=>assert.strictEqual(r.code,400),'empty transcript rejected before gateway');
 filesReady=false;r=await request();
 check(()=>assert.strictEqual(r.code,503),'missing protected runtime blocks transcript');
 filesReady=true;gatewayReady=false;r=await request();
 check(()=>assert.strictEqual(r.code,503),'missing voice gateway blocks transcript');
 gatewayReady=true;
 console.log(`${count}/${count} checks passed`);
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1;});
