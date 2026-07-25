"use strict";

const VERSION = "nyx.marion.nuanceEnvelope/1.0";
const CONTRACT = "nyx.marion.nuance.phaseA/1.0";
const STATE_CONTRACT = "nyx.marion.nuanceState/1.0";
const LAYERS = Object.freeze({ SIGNAL_NORMALIZATION:21, EMOTIONAL_CUE_DETECTION:22, EMOTIONAL_CONFIDENCE_GATE:23, INTERACTION_STATE_TRACKING:24 });

function isRecord(v){ return !!v && typeof v === "object" && !Array.isArray(v); }
function safeRecord(v){ return isRecord(v) ? v : {}; }
function safeArray(v){ return Array.isArray(v) ? v : []; }
function safePrimitiveText(v,f=""){
  if(v===null||v===undefined)return f;
  const t=typeof v;
  if(t==="string")return v;
  if(t==="number"||t==="boolean"||t==="bigint"){ try{return String(v);}catch(_){return f;} }
  if(v instanceof Error){ try{return typeof v.message==="string"&&v.message?v.message:(typeof v.name==="string"?v.name:f);}catch(_){return f;} }
  return f;
}
function cleanText(v,f=""){ return safePrimitiveText(v,f).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim(); }
function lowerText(v,f=""){ return cleanText(v,f).toLowerCase(); }
function clamp(v,min=0,max=1){ const n=Number(v); return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min; }
function clamp01(v){ return clamp(v,0,1); }
function uniquePrimitiveStrings(values,limit=32,maxLength=160){
  const out=[],seen=new Set();
  for(const value of safeArray(values)){
    const text=cleanText(value).slice(0,maxLength);
    if(!text||seen.has(text))continue;
    seen.add(text);out.push(text);
    if(out.length>=limit)break;
  }
  return out;
}
function firstText(...values){ for(const value of values){ const text=cleanText(value); if(text)return text; } return ""; }
function firstRecord(...values){ for(const value of values){ if(isRecord(value)&&Object.keys(value).length)return value; } return {}; }
function extractCanonicalText(input={}){
  if(typeof input==="string")return cleanText(input).slice(0,12000);
  const s=safeRecord(input),p=safeRecord(s.payload),b=safeRecord(s.body),t=safeRecord(s.turn),c=safeRecord(s.command),m=safeRecord(s.messageEnvelope),q=safeRecord(s.questionShape),cc=safeRecord(s.continuityCarry);
  return firstText(s.effectivePrompt,s.originalPrompt,s.rawUserText,s.userText,s.userQuery,s.inputText,s.prompt,s.text,s.query,s.message,p.effectivePrompt,p.rawUserText,p.userText,p.prompt,p.text,p.query,p.message,b.rawUserText,b.userText,b.prompt,b.text,b.query,b.message,t.rawUserText,t.userText,t.prompt,t.text,t.message,c.rawUserText,c.userText,c.prompt,c.text,c.message,m.rawUserText,m.userText,m.text,m.message,q.normalizedUserIntent,q.normalizedText,cc.resolvedText,cc.originalText).slice(0,12000);
}
function extractTurnId(input={},fallback=""){
  const s=safeRecord(input),p=safeRecord(s.payload),b=safeRecord(s.body),m=safeRecord(s.meta),t=safeRecord(s.turn);
  return firstText(s.turnId,s.currentTurnId,s.requestId,s.traceId,p.turnId,p.currentTurnId,b.turnId,b.currentTurnId,m.turnId,m.currentTurnId,t.id,t.turnId,fallback).slice(0,160);
}
function extractConversationId(input={},fallback=""){
  const s=safeRecord(input),p=safeRecord(s.payload),b=safeRecord(s.body),m=safeRecord(s.meta);
  return firstText(s.conversationId,s.sessionId,p.conversationId,p.sessionId,b.conversationId,b.sessionId,m.conversationId,m.sessionId,fallback).slice(0,200);
}
function extractInputChannel(input={}){
  const s=safeRecord(input),p=safeRecord(s.payload),v=firstRecord(s.voice,s.voiceEnvelope,p.voice,p.voiceEnvelope);
  const raw=lowerText(firstText(s.inputChannel,s.inputSource,v.inputChannel,v.source,v.modality,p.inputChannel,p.inputSource,"text"));
  return /^(voice|speech|spoken|audio|mic|microphone)$/.test(raw)?"voice":"text";
}
function extractScope(input={}){
  const s=safeRecord(input),p=safeRecord(s.payload),b=safeRecord(s.body);
  const explicit=lowerText(firstText(s.scope,s.adminInterfaceScope,p.scope,p.adminInterfaceScope,b.scope,b.adminInterfaceScope));
  const priv=s.directMarionAdminInterface===true||s.marionAdminConversation===true||p.directMarionAdminInterface===true||p.marionAdminConversation===true||b.directMarionAdminInterface===true||b.marionAdminConversation===true||explicit==="private_admin"||explicit==="marion_admin_conversation";
  return priv?"private_admin":"public";
}
function safeErrorDescriptor(error,stage=""){
  const e=safeRecord(error);
  return {stage:cleanText(stage).slice(0,80),name:cleanText(e.name||(error instanceof Error?error.name:""),"Error").slice(0,80),message:cleanText(e.message||(error instanceof Error?error.message:""),"phase_a_module_error").slice(0,240)};
}
function defaultLayerState(layer,version,status="pending"){ return {layer,version:cleanText(version),status,available:status!=="unavailable",degraded:status==="degraded"||status==="unavailable"}; }
function createMarionNuanceEnvelope(input={},seed={}){
  const s=safeRecord(input),initial=safeRecord(seed),now=Number.isFinite(Number(initial.createdAt))?Number(initial.createdAt):Date.now(),turnId=extractTurnId(s,`nuance-turn-${now}`),conversationId=extractConversationId(s,""),scope=extractScope(s);
  return {contract:CONTRACT,version:VERSION,stateContract:STATE_CONTRACT,phase:"A",hardStopLayer:24,turnId,conversationId,inputChannel:extractInputChannel(s),scope,partitionClass:scope==="private_admin"?"private_admin":"public",createdAt:now,currentTurnTextPresent:!!extractCanonicalText(s),layer21:defaultLayerState(21,"nyx.marion.conversationalSignalNormalizer/1.0"),layer22:defaultLayerState(22,"nyx.marion.emotionalCueDetector/1.0"),layer23:defaultLayerState(23,"nyx.marion.emotionalConfidenceGate/1.0"),layer24:defaultLayerState(24,"nyx.marion.interactionStateTracker/1.0"),culturalCompatibility:{version:"nyx.marion.culturalCompatibilityBoundary/1.0",status:"pending",futureResolverReady:false,culturalInferenceAllowed:false},carryPolicy:{version:"nyx.marion.nuanceCarryPolicy/1.0",status:"pending",approvedStatePatch:{}},diagnostics:{available:true,degraded:false,failedStages:[],noUserFacingDiagnostics:true,noIdentityInference:true,noPsychologicalDiagnosis:true},...initial};
}
function validateMarionNuanceEnvelope(value){
  const e=safeRecord(value),errors=[];
  if(e.contract!==CONTRACT)errors.push("contract_mismatch");
  if(e.phase!=="A")errors.push("phase_mismatch");
  if(Number(e.hardStopLayer)!==24)errors.push("hard_stop_mismatch");
  if(!cleanText(e.turnId))errors.push("turn_id_missing");
  for(const key of ["layer21","layer22","layer23","layer24"])if(!isRecord(e[key]))errors.push(`${key}_missing`);
  if(!isRecord(e.culturalCompatibility))errors.push("cultural_boundary_missing");
  if(!isRecord(e.carryPolicy))errors.push("carry_policy_missing");
  if(!isRecord(e.diagnostics))errors.push("diagnostics_missing");
  return {ok:errors.length===0,contract:CONTRACT,errors};
}
function projectInternalNuanceSummary(value){
  const e=safeRecord(value),l22=safeRecord(e.layer22),l23=safeRecord(e.layer23),l24=safeRecord(e.layer24),c=safeRecord(e.culturalCompatibility),pc=safeRecord(l22.primaryCandidate);
  return {contract:CONTRACT,version:VERSION,phase:"A",turnId:cleanText(e.turnId),inputChannel:cleanText(e.inputChannel,"text"),interactionState:cleanText(l24.currentState,"exploration"),previousInteractionState:cleanText(l24.previousState),interactionConfidence:clamp01(l24.confidence),emotionalCandidate:cleanText(pc.state),emotionalConfidence:clamp01(pc.confidence),confidenceBand:cleanText(l23.confidenceBand,"low"),responsePolicy:cleanText(l23.responsePolicy,"neutral_supportive"),explicitEmotionReferenceAllowed:l23.explicitEmotionReferenceAllowed===true,explicitLanguage:cleanText(c.explicitLanguage),explicitLocale:cleanText(c.explicitLocale),codeSwitchDetected:c.codeSwitchDetected===true,noUserFacingDiagnostics:true};
}
module.exports={VERSION,CONTRACT,STATE_CONTRACT,LAYERS,isRecord,safeRecord,safeArray,safePrimitiveText,cleanText,lowerText,clamp,clamp01,uniquePrimitiveStrings,firstText,firstRecord,extractCanonicalText,extractTurnId,extractConversationId,extractInputChannel,extractScope,safeErrorDescriptor,createMarionNuanceEnvelope,validateMarionNuanceEnvelope,projectInternalNuanceSummary,create:createMarionNuanceEnvelope,validate:validateMarionNuanceEnvelope,run:createMarionNuanceEnvelope};
