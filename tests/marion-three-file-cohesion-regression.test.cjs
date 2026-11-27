'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Module=require('node:module');
const runtime=path.resolve(__dirname,'../Data/marion/runtime');
const bridgeSource=fs.readFileSync(path.join(runtime,'marionBridge.js'),'utf8');
const gatewaySource=fs.readFileSync(path.join(runtime,'MarionVoiceGateway.js'),'utf8');
const testSource=fs.readFileSync(path.join(__dirname,'gateway-contract.test.js'),'utf8');
function fnBlock(source,name){
  const start=source.indexOf('function '+name+'('); assert.notEqual(start,-1,name+' absent');
  const boundary=source.indexOf('){',start); assert.notEqual(boundary,-1); const opening=boundary+1;let depth=0,quote=null,escaped=false;
  // Function bodies under inspection contain no template strings; count braces safely.
  for(let i=opening;i<source.length;i++){
    const c=source[i];
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=null;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw Error('Unclosed '+name);
}
const safeObj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const extractReply=c=>c&&typeof c.reply==='string'?c.reply:'';
const context=vm.createContext({safeObj,extractReply});
vm.runInContext(fnBlock(bridgeSource,'validateComposeResult')+'\n'+fnBlock(bridgeSource,'marionComposerCandidateSnapshot'),context);
test('Bridge accepts a straightforward actionable Composer contract',()=>{
  const c={ok:true,reply:'1. Invoice promptly. 2. Forecast cash flow. 3. Control expenses.'};
  assert.equal(context.validateComposeResult(c).ok,true);
});
test('Bridge rejects a nested blocked envelope despite an outer reply',()=>{
  const c={ok:true,reply:'Three cash flow actions.',finalEnvelope:{final:false,blocked:true,requiresRetry:true}};
  const result=context.validateComposeResult(c);
  assert.equal(result.ok,false);
  assert.ok(result.issues.includes('compose_nested_envelope_rejected'));
});
test('Bridge rejects a retrying payload despite outer ok=true',()=>{
  const c={ok:true,reply:'Three cash flow actions.',payload:{awaitingMarion:true}};
  assert.equal(context.validateComposeResult(c).ok,false);
});
test('Composer snapshot records only allowlisted status and reason codes',()=>{
  const c={ok:false,reply:'Sensitive reply content',finalEnvelope:{blocked:true},privateToken:'DO_NOT_LEAK'};
  const out=context.marionComposerCandidateSnapshot(c);
  assert.equal(out.ok,false);assert.equal(out.envelopeBlocked,true);
  assert.ok(!JSON.stringify(out).includes('Sensitive reply'));
  assert.ok(!JSON.stringify(out).includes('DO_NOT_LEAK'));
});
test('Normalizer preserves existing authoritative state over command-normalizer state',()=>{
  assert.match(bridgeSource,/state:safeObj\(source\.state\|\|commandPacket\.state\)/);
  assert.doesNotMatch(bridgeSource,/state:safeObj\(commandPacket\.state\|\|source\.state\)/);
});
test('Gateway enforces canonical signed turn equality before final response normalization',()=>{
  assert.match(gatewaySource,/canonicalSignature && \(safeText\(fe\.meta && fe\.meta\.turnId \|\| fe\.turnId\) !== trustedTurnId/);
  assert.match(gatewaySource,/MARION_FINAL_TURN_MISMATCH/);
});
test('Gateway contract retains strict raw Bridge certification failure',()=>{
  assert.match(testSource,/if \(!rawCertified\)/);
  assert.match(testSource,/assert\.fail\(`private Bridge failed before Gateway normalization/);
});
test('Gateway contract publishes code-only Composer candidate diagnostics',()=>{
  assert.match(testSource,/composerCandidate: \(\(\) =>/);
  assert.match(testSource,/validationCodes: codesOnly\(c\.validationCodes\)/);
});

const gatewayPath=path.join(runtime,'MarionVoiceGateway.js');
function loadGatewayWithRequiredStubs(){
  const original=Module._load;
  const stubs={
    './MarionVoiceInputEnvelope':{createVoiceInputEnvelope:()=>({})},
    './MarionVoiceAuthorizationGate':{applyVoiceAuthorization:()=>({})},
    './MarionVoiceTranscriptNormalizer':{applyTranscriptNormalization:()=>({})},
    './MarionVoiceOutputPolicy':{applyVoiceOutputPolicy:()=>({})},
    './MarionVoiceTelemetry':{createVoiceTelemetryEvent:()=>({})}
  };
  try{
    Module._load=function(request,parent,isMain){
      if(parent&&parent.filename===gatewayPath&&Object.hasOwn(stubs,request))return stubs[request];
      return original.call(this,request,parent,isMain);
    };
    delete require.cache[require.resolve(gatewayPath)];
    return require(gatewayPath);
  }finally{Module._load=original;}
}
const gw=loadGatewayWithRequiredStubs();
const verifiedAuth={serverVerifiedAuth:{verified:true,sessionVerified:true,verifiedBy:'server_middleware',sessionId:'server-session-2',turnId:'server-turn-2',role:'admin'},adminVerified:true,serverSideAdminAuth:true};
test('Gateway delegates once with matching server-established identity, ignoring body identifiers',async()=>{
  let calls=0,seenPayload,seenContext;
  const bridge={async handleMarionAdminConversation(payload,context){calls++;seenPayload=payload;seenContext=context;return {ok:false};}};
  const out=await gw.handleMarionAdminConversation({text:'How can I improve cash flow?',sessionId:'forged-session',turnId:'forged-turn'}, {...verifiedAuth,bridge});
  assert.equal(calls,1);
  assert.equal(seenPayload.sessionId,'server-session-2');
  assert.equal(seenContext.sessionId,'server-session-2');
  assert.equal(seenPayload.turnId,'server-turn-2');
  assert.equal(seenContext.turnId,'server-turn-2');
  assert.equal(out.ok,false);
});
test('Gateway rejects a canonical-looking response signed for another turn',async()=>{
  const bridge={async handleMarionAdminConversation(){return {ok:true,final:true,marionFinal:true,canEmit:true,reply:'three steps',meta:{turnId:'wrong-turn'},finalEnvelope:{reply:'three steps',turnId:'wrong-turn',marionFinalSignature:'MARION::FINAL::CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24::other'}};}};
  const out=await gw.handleMarionAdminConversation({text:'Cash flow steps'}, {...verifiedAuth,bridge});
  assert.equal(out.ok,false);
  assert.equal(out.error,'MARION_FINAL_TURN_MISMATCH');
});
test('Gateway rejects unverified caller before Bridge is invoked',async()=>{
  let calls=0;
  const bridge={async handleMarionAdminConversation(){calls++;return {};}};
  const out=await gw.handleMarionAdminConversation({text:'Cash flow steps'}, {bridge,adminVerified:true,sessionVerified:true,serverSideAdminAuth:true});
  assert.equal(calls,0);
  assert.equal(out.ok,false);
  assert.equal(out.error,'MARION_ADMIN_AUTH_REQUIRED');
});
