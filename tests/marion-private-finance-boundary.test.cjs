'use strict';
// Synthetic, local-only diagnostic. Records status codes, never reply text or IDs.
// Run in a fresh Node process: node --test tests/marion-private-finance-boundary.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const fs = require('node:fs');
const crypto = require('node:crypto');
const runtime = path.resolve(__dirname, '../Data/marion/runtime');
const composer = require(path.join(runtime, 'composeMarionResponse.js'));
const finalizer = require(path.join(runtime, 'marionFinalEnvelope.js'));
const currentTurn = require(path.join(runtime, 'marionCurrentTurnAuthority.js'));
const recorded = {composer:[], guard:[], finalizer:[], bridge:[], finalizerInputs:[], guardInputs:[]};
const fileFingerprint = (name) => {
  try {
    const source = fs.readFileSync(path.join(runtime, name));
    return {present:true, sha256:crypto.createHash('sha256').update(source).digest('hex')};
  } catch (_) { return {present:false}; }
};
const moduleFingerprints = Object.fromEntries([
  'MarionVoiceGateway.js', 'marionBridge.js', 'composeMarionResponse.js',
  'marionFinalEnvelope.js', 'marionCurrentTurnAuthority.js', 'marionIntentRouter.js',
  'marionCommandNormalizer.js', 'marionLoopGuard.js', 'emotion/emotionRuntime.js'
].map(name => [name,fileFingerprint(name)]));

const allowed = x => typeof x === 'string' && /^[a-z0-9_.:-]{1,80}$/i.test(x) ? x : 'unknown';
const snapshot = packet => {
  const p = packet && typeof packet === 'object' ? packet : {};
  const f = p.finalEnvelope && typeof p.finalEnvelope === 'object' ? p.finalEnvelope : {};
  const d = p.diagnostics && typeof p.diagnostics === 'object' ? p.diagnostics : {};
  const c = f.completionStatus && typeof f.completionStatus === 'object' ? f.completionStatus : {};
  const t = f.adaptiveTrustVerification && typeof f.adaptiveTrustVerification === 'object' ? f.adaptiveTrustVerification : {};
  return {ok:p.ok===true,final:p.final===true,blocked:p.blocked===true,requiresRetry:p.requiresRetry===true,
    replyPresent:typeof p==='string'?p.trim().length>0:typeof p.reply==='string'&&p.reply.trim().length>0,
    envelopePresent:!!p.finalEnvelope,envelopeFinal:f.final===true,turnBound:f.currentTurnBound===true,
    signed:typeof f.marionFinalSignature==='string'&&f.marionFinalSignature.length>0,
    completion:c.complete===true,trust:t.allowEmit===true,
    authorityStage:allowed(d.authorityFailureStage),
    builderReason:allowed(d.finalBuilderFailureReason),
    guardStatus:allowed(d.currentTurnGuardStatus)};
};
function wrap(obj,key,where){
  if(typeof obj[key]!=='function')return;
  const original=obj[key];
  obj[key]=function(...args){
    if(where==='finalizer')recorded.finalizerInputs.push({
      turnIdPresent:typeof args[0]?.turnId==='string'&&args[0].turnId.length>0,
      sessionIdPresent:typeof args[0]?.sessionId==='string'&&args[0].sessionId.length>0,
      currentTurnBound:args[0]?.currentTurnBound===true,
      replyPresent:typeof args[0]?.reply==='string'&&args[0].reply.trim().length>0,
      privateAdminConversation:args[0]?.privateAdminConversation===true,
      marionAdminConversation:args[0]?.marionAdminConversation===true,
      resolvedEmotionPresent:!!args[0]?.resolvedEmotion&&Object.keys(args[0].resolvedEmotion).length>0,
      spokenMatchesReply:args[0]?.spokenText===args[0]?.reply
    });
    if(where==='guard')recorded.guardInputs.push(snapshot(args[0]));
    try { const result=original.apply(this,args);
      if(result&&typeof result.then==='function')return result.then(value=>{recorded[where].push(snapshot(value));return value;},err=>{recorded[where].push({threw:true,errorName:allowed(err&&err.name)});throw err;});
      recorded[where].push(snapshot(result));return result;
    } catch(err){recorded[where].push({threw:true,errorName:allowed(err&&err.name)});throw err;}
  };
}
wrap(composer,'composeMarionResponse','composer');
wrap(finalizer,'createMarionFinalEnvelope','finalizer');
wrap(currentTurn,'enforceResult','guard');
const gp=path.join(runtime,'MarionVoiceGateway.js');
const mandatoryStubs={
  './MarionVoiceInputEnvelope':{createVoiceInputEnvelope:()=>({})},
  './MarionVoiceAuthorizationGate':{applyVoiceAuthorization:()=>({})},
  './MarionVoiceTranscriptNormalizer':{applyTranscriptNormalization:()=>({})},
  './MarionVoiceOutputPolicy':{applyVoiceOutputPolicy:()=>({})},
  './MarionVoiceTelemetry':{createVoiceTelemetryEvent:()=>({})}
};
const previous=Module._load;
let gateway;
try {Module._load=function(request,parent,isMain){
  if(parent&&parent.filename===gp&&Object.prototype.hasOwnProperty.call(mandatoryStubs,request))return mandatoryStubs[request];
  return previous.call(this,request,parent,isMain);
};gateway=require(gp);}finally{Module._load=previous;}
const bridge=require(path.join(runtime,'marionBridge.js'));
bridge.resolveRuntimeDependencies(true);
const dep=bridge.DEPENDENCY_STATUS||{};
const depPresence=Object.fromEntries(['composer','finalEnvelope','intentRouter','commandNormalizer','loopGuard','emotionRuntime'].map(k=>[k,dep[k]&&dep[k].ok===true]));
const text='How can a small business improve cash flow? Give me three concise steps.';
const opts={serverVerifiedAuth:{verified:true,sessionVerified:true,verifiedBy:'server_middleware',sessionId:'synthetic-finance-session',role:'admin',turnId:'synthetic-finance-turn'},
  adminVerified:true,serverSideAdminAuth:true,trustedServerAuth:true,bridge:null};
function rawCertified(r){const p=snapshot(r);return p.ok&&p.final&&p.envelopeFinal&&p.turnBound&&p.signed&&p.completion&&p.trust;}
test('private finance follows authenticated Gateway -> Composer -> Final Envelope',async()=>{
  let bridgeCalls=0;let result;let bridgeRaw;
  const traced=Object.create(bridge);
  traced.handleMarionAdminConversation=async function(input,context){
    bridgeCalls++;
    const facts={turnIdsPresent:!!input.turnId&&!!context.turnId,
      turnIdsMatch:!!input.turnId&&input.turnId===context.turnId,
      sessionIdsMatch:!!input.sessionId&&input.sessionId===context.sessionId,
      partitionsMatch:!!input.partitionKey&&input.partitionKey===context.partitionKey,
      verifiedBoth:input.adminVerified===true&&context.adminVerified===true};
    const raw=await bridge.handleMarionAdminConversation.call(bridge,input,context);
    bridgeRaw=raw;
    recorded.bridge.push({handoff:facts,output:snapshot(raw)});
    return raw;
  };
  opts.bridge=traced;
  try {result=await gateway.handleMarionAdminConversation({text},opts);} finally {
    // Output contains status booleans and allowlisted reason codes ONLY.
    process.stdout.write('MARION_BOUNDARY_TRACE '+JSON.stringify({dependencies:depPresence,moduleFingerprints,counts:{composer:recorded.composer.length,guard:recorded.guard.length,finalizer:recorded.finalizer.length,bridge:bridgeCalls},
      composer:recorded.composer,guard:recorded.guard,guardInputs:recorded.guardInputs,finalizer:recorded.finalizer,finalizerInputs:recorded.finalizerInputs,bridge:recorded.bridge,
      gateway:snapshot(result)})+'\n');
  }
  assert.equal(bridgeCalls,1,'One Bridge call per private turn');
  assert.ok(recorded.bridge[0].handoff.turnIdsMatch && recorded.bridge[0].handoff.sessionIdsMatch && recorded.bridge[0].handoff.partitionsMatch,'Trusted identity must match');
  assert.ok(rawCertified(bridgeRaw),'Bridge must return a genuinely certified final before Gateway normalization');
  assert.ok(rawCertified(result),'Gateway must preserve the certified final');
});


test('uncertified draft cannot be accepted as a canonical final',async()=>{
  const result=await finalizer.createMarionFinalEnvelope({reply:'Synthetic finance test response.',sessionId:'synthetic-test',turnId:'',currentTurnBound:true,semanticAuthority:'marion',intent:'domain_question',domain:'finance'});
  const e=result&&result.finalEnvelope||result||{};
  const verified=finalizer.validateReplyContract(e);
  assert.notEqual(verified.ok,true,'A missing turn ID must not certify');
});
