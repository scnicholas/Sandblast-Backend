'use strict';

/** Public Nyx projection fails closed. Private Marion scope is recognized only
 * from a server-created, session-verified options context. Request bodies,
 * headers, role labels, and delivery booleans never authenticate an operator. */
const crypto=require('crypto');
const VERSION='nyx.marion.phase3d.voiceTextParityIdentityDriftHardlock/2.0-phase4-server-context';
const PUBLIC_AGENT='Nyx',PRIVATE_AGENT='Marion',OPERATOR_NAME='Mac';
const REPLY_KEYS=['reply','text','answer','response','message','output','displayReply','publicReply','visibleReply','finalReply','authoritativeReply','spokenText','speechText'];
const SPOKEN_KEYS=new Set(['spokenText','speechText']);
const PUBLIC_SOURCE_RE=/(?:sandblast_channel_widget|cosmos-widget|nyx-widget|public_interface|webflow|sandblast\.channel)/i;
const ADMIN_ROUTE_RE=/(?:\/api\/marion\/admin\/conversation|\/api\/marion\/admin\/voice|\/marion\/admin\/conversation|\/marion\/admin\/voice)/i;
const VOICE_SOURCE_RE=/^(?:voice|mic|microphone|speech|spoken|audio)$/i;
const PRESENCE_RE=/^(?:hi\s+nyx\s*)?(?:are\s+you\s+(?:with\s+me|there|here|online|working|ready)|can\s+you\s+(?:hear\s+me|see\s+this|respond)|do\s+you\s+hear\s+me|you\s+there|still\s+there|hello\??|hi\??|hey\??)\??$/i;
const IDENTITY_RE=/\b(?:do\s+you\s+know\s+(?:mac|sean|the\s+operator|the\s+owner)|are\s+you\s+talking\s+to\s+(?:mac|sean|the\s+operator|the\s+owner)|who\s+is\s+(?:mac|sean|the\s+operator|the\s+owner)|i\s+am\s+(?:mac|sean|the\s+operator|the\s+owner)|this\s+is\s+(?:mac|sean|the\s+operator|the\s+owner)|operator\s+command|admin\s+command|open\s+operator\s+mode|use\s+private\s+memory|switch\s+to\s+marion|marion\s*,?\s*respond|are\s+you\s+marion|is\s+marion\s+connected|am\s+i\s+talking\s+to\s+marion|who\s+am\s+i\s+talking\s+to|who\s+are\s+you|what\s+are\s+you)\b/i;
const PRIVATE_SPOOF_RE=/\b(?:i\s+am\s+(?:mac|sean|the\s+operator|the\s+owner)|this\s+is\s+(?:mac|sean|the\s+operator|the\s+owner)|operator\s+command|admin\s+command|marion\s*,?\s*respond|switch\s+to\s+marion|use\s+private\s+memory|open\s+operator\s+mode|authenticatedOperator|operatorPersonalization|allowPersonalName|private\s+memory)\b/i;
const INTERNAL_LEAK_RE=/\b(?:state spine|session patch|reply authority|final envelope|runtimeTelemetry|finalRenderTelemetry|diagnostic packet|greeting lane|testing the greeting lane|loop detected|fallback|operator personalization|admin route|private operator|serverSideAdminAuth|trustedServerAuth|MARION::FINAL::|CHATENGINE_COORDINATOR_ONLY_ACTIVE)\b/i;

let identityRefinement=null,privateLock=null;
try{identityRefinement=require('./publicIdentityQuestionRefinement.js');}catch(_){identityRefinement=null;}
try{privateLock=require('./privateOperatorBoundaryLock.js');}catch(_){privateLock=null;}
function isObj(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
function own(o,k){if(!isObj(o))return undefined;try{const d=Object.getOwnPropertyDescriptor(o,k);return d&&Object.prototype.hasOwnProperty.call(d,'value')?d.value:undefined;}catch(_){return undefined;}}
function safeObj(v){return isObj(v)?v:{ };}
function cleanText(v,max=4000){if(typeof v!=='string'&&typeof v!=='number'&&typeof v!=='boolean')return '';return String(v).replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,Math.max(1,Math.min(Number(max)||4000,4000)));}
function lower(v){return cleanText(v).toLowerCase();}
function firstText(){for(let i=0;i<arguments.length;i++) {const t=cleanText(arguments[i]);if(t)return t;}return '';}
function hashText(v){const s=cleanText(v);return s?crypto.createHash('sha256').update(s).digest('hex').slice(0,24):'';}
function scrubId(v){return cleanText(v||'anonymous',160).replace(/[^a-zA-Z0-9_.:-]+/g,'_').slice(0,96)||'anonymous';}
function clip(v,max=1600){return cleanText(v,Math.max(64,Math.min(Number(max)||1600,4000)));}
function safeOptions(input){const src=safeObj(input);const options=own(src,'options');return isObj(options)?options:{};}
function verifiedOperatorOptions(input){
  const opts=safeOptions(input), authValue=own(opts,'authorization'), auth=isObj(authValue)?authValue:{};
  const role=lower(own(auth,'role')||own(opts,'role')||own(opts,'sessionRole'));
  const sessionId=cleanText(own(auth,'sessionId')||own(opts,'sessionId'),160);
  const sessionVerified=own(auth,'sessionVerified')===true||own(opts,'sessionVerified')===true;
  const proof=['adminVerified','adminVoiceTokenVerified','serverSideAdminVoiceAuth','serverSideAdminAuth'].some(k=>own(auth,k)===true||own(opts,k)===true);
  const partition=cleanText(own(opts,'partitionKey'),240), memoryPartition=cleanText(own(opts,'memoryPartition'),240);
  const privatePartition=!!sessionId&&partition===`private:admin:${sessionId}`&&memoryPartition===partition;
  const ownerRole=['owner','admin','administrator'].includes(role)||privatePartition;
  const scope=lower(own(opts,'adminInterfaceScope')||own(auth,'adminInterfaceScope'));
  const direct=own(opts,'directMarionAdminInterface')===true||own(opts,'allowMarionAdminConversation')===true||scope==='marion_admin_conversation'||privatePartition;
  return sessionVerified&&!!sessionId&&proof&&ownerRole&&direct;
}
function isVerifiedOperatorContext(input){
  try { if(privateLock&&typeof privateLock.isVerifiedOperatorContext==='function'&&privateLock.isVerifiedOperatorContext(input)===true)return true; } catch(_) {}
  return verifiedOperatorOptions(input);
}
function collectContext(input){
  const src=safeObj(input),req= safeObj(own(src,'req')||own(src,'request')),body=safeObj(own(src,'body')||own(req,'body')),
    payload=safeObj(own(src,'payload')||own(src,'response')||own(src,'result')||own(src,'packet')||own(src,'data')),
    meta=safeObj(own(src,'meta')||own(body,'meta')||own(payload,'meta')),
    ui=safeObj(own(src,'ui')||own(body,'ui')||own(payload,'ui')),
    client=safeObj(own(src,'client')||own(body,'client')||own(payload,'client')),
    headers=safeObj(own(src,'headers')||own(body,'headers')||own(req,'headers'));
  const header=(name)=>{for(const k of Object.keys(headers)){if(k.toLowerCase()===name.toLowerCase())return cleanText(own(headers,k),200);}return '';};
  const route=firstText(own(src,'route'),own(req,'path'),own(req,'originalUrl'),own(req,'url'),header('x-sb-route'));
  const source=firstText(own(src,'source'),own(src,'inputChannel'),own(meta,'source'),header('x-sb-source'));
  const audience=firstText(own(src,'audience'),own(ui,'audience'),own(meta,'audience'));
  const surfaceAgent=firstText(own(src,'surfaceAgent'),own(ui,'surfaceAgent'),own(payload,'publicAgent'));
  const inputChannel=firstText(own(src,'inputChannel'),own(src,'source'),own(meta,'inputChannel'));
  const site=firstText(own(client,'site'),own(safeObj(own(body,'client')),'site'),own(safeObj(own(payload,'client')),'site'));
  const sessionId=firstText(own(src,'sessionId'),own(meta,'sessionId'));
  const prompt=firstText(own(src,'prompt'),own(src,'message'),own(src,'text'),own(src,'query'),own(src,'transcript'),
    own(body,'prompt'),own(body,'message'),own(body,'text'),own(body,'query'),own(body,'transcript'),
    own(payload,'prompt'),own(payload,'message'),own(payload,'text'),own(payload,'query'),own(payload,'transcript'));
  return{src,req,body,payload,meta,ui,client,headers,route,source,audience,surfaceAgent,inputChannel,site,sessionId,prompt};
}
function isVoiceContext(input){const c=collectContext(input);return VOICE_SOURCE_RE.test(c.inputChannel)||VOICE_SOURCE_RE.test(c.source)||own(c.src,'voice')===true||own(c.body,'voice')===true||!!(own(c.src,'transcript')||own(c.body,'transcript')||own(c.payload,'transcript'));}
function isPublicContext(input){return !isVerifiedOperatorContext(input);}
function answerClassForPrompt(prompt){const t=cleanText(prompt);if(!t)return 'public_general';if(PRESENCE_RE.test(t))return 'public_presence_check';if(IDENTITY_RE.test(t))return 'public_identity_sensitive';return 'public_general';}
function publicReplyForClass(cls,prompt){
  if(cls==='public_presence_check')return 'I’m here. You can ask about Sandblast, radio, TV, media, AI, or business tools.';
  if(identityRefinement&&typeof identityRefinement.cleanPublicIdentityReply==='function'&&cls==='public_identity_sensitive'){try{const r=identityRefinement.cleanPublicIdentityReply(prompt);if(typeof r==='string'&&r)return clip(r);}catch(_){}}
  if(cls==='public_identity_sensitive')return 'I’m Nyx, the public Sandblast assistant. I don’t confirm private identity on this public surface, but I can help you explore Sandblast, radio, TV, media, AI, or business tools.';
  return 'I’m Nyx, the public Sandblast assistant. I can help you explore Sandblast, radio, TV, media, AI, or business tools.';
}
function sanitizePublicText(value,prompt){
  const out=clip(value),cls=answerClassForPrompt(prompt||out);
  if(!out||INTERNAL_LEAK_RE.test(out)||PRIVATE_SPOOF_RE.test(out)||/\b(?:Mac|Marion)\b/i.test(out))return publicReplyForClass(cls,prompt||out);
  const clean=out.replace(/\boperator\s+(?:session|memory|context)\b/gi,'public session').replace(/\bprivate\s+(?:operator|admin|memory)\b/gi,'public').replace(/\s+/g,' ').trim();
  return clean||publicReplyForClass(cls,prompt||out);
}
function classifyTurn(input){
  const c=collectContext(input),prompt=clip(c.prompt,1600),voice=isVoiceContext(input),operator=isVerifiedOperatorContext(input),scope=operator?'operator':'public';
  const answerClass=operator?'operator_private':answerClassForPrompt(prompt),privateSpoof=scope==='public'&&PRIVATE_SPOOF_RE.test(prompt);
  return{version:VERSION,scope,audience:operator?'operator':'public',surfaceAgent:operator?PRIVATE_AGENT:PUBLIC_AGENT,inputChannel:voice?'voice':'text',voice,answerClass,
    prompt,normalizedText:prompt,privateSpoof,publicIdentityQuestion:scope==='public'&&answerClass==='public_identity_sensitive',
    publicPresenceCheck:scope==='public'&&answerClass==='public_presence_check',partitionKey:`${scope}:${scrubId(c.sessionId)}`,
    transcriptHash:voice?hashText(prompt):'',allowOperatorMemory:operator,allowPersonalName:operator,operatorPersonalization:operator,
    publicSurfaceOnly:!operator,adminVoiceDeliveryAllowed:false,voiceTextParityHardlock:true};
}
function setReplyFields(out,reply){for(const k of REPLY_KEYS)if(Object.prototype.hasOwnProperty.call(out,k)||['reply','displayReply','visibleReply','spokenText','speechText'].includes(k))out[k]=reply;return out;}
function projectResult(value,context){
  if(!isObj(value))return value;
  const c=Object.assign({},safeObj(context),{payload:value}),cls=classifyTurn(c),out=Object.assign({},value);
  const reply=firstText(out.reply,out.text,out.answer,out.response,out.message,out.output,out.displayReply,out.visibleReply,out.finalReply,out.spokenText,out.speechText);
  if(cls.scope==='public'){
    const safe=!reply&&(out.ok===false||out.final===false)?'':cls.answerClass==='public_identity_sensitive'||cls.answerClass==='public_presence_check'?publicReplyForClass(cls.answerClass,cls.prompt):sanitizePublicText(reply,cls.prompt);
    setReplyFields(out,safe);out.publicAgent=PUBLIC_AGENT;out.surfaceAgent=PUBLIC_AGENT;out.audience='public';out.publicSurfaceOnly=true;
    out.operatorPersonalization=false;out.allowPersonalName=false;out.allowOperatorMemory=false;out.authenticatedOperator=false;out.adminVoiceDeliveryAllowed=false;delete out.operatorName;
  } else if(reply) setReplyFields(out,clip(reply));
  out.meta=Object.assign({},safeObj(out.meta),{phase3dVoiceTextParityHardlock:true,voiceTextParityHardlockVersion:VERSION,
    inputChannel:cls.inputChannel,answerClass:cls.answerClass,scope:cls.scope,partitionKey:cls.partitionKey,
    publicIdentityQuestion:cls.publicIdentityQuestion,privateSpoofBlocked:cls.privateSpoof});
  out.voiceTextParity=Object.assign({},safeObj(out.voiceTextParity),{active:true,phase3d:true,source:cls.inputChannel,
    answerClass:cls.answerClass,scope:cls.scope,driftBlocked:cls.scope==='public',partitionKey:cls.partitionKey});
  out.memoryPartition=cls.partitionKey;out.partitionKey=cls.partitionKey;return out;
}
function projectVoiceInputEnvelope(envelope,context){
  if(!isObj(envelope))return envelope;
  const ctx=Object.assign({},safeObj(context),{payload:envelope}),cls=classifyTurn(ctx),out=Object.assign({},envelope);
  out.voiceTextParityHardlock=true;out.voiceTextAnswerClass=cls.answerClass;out.partitionKey=cls.partitionKey;out.memoryPartition=cls.partitionKey;
  out.scope=cls.scope;out.audience=cls.audience;out.surfaceAgent=cls.surfaceAgent;
  if(cls.scope==='public'){out.publicSurfaceOnly=true;out.adminVoiceVerified=false;out.adminVoiceDeliveryAllowed=false;out.adminOnlyVoiceDelivery=false;
    out.allowOperatorMemory=false;out.allowPersonalName=false;out.operatorPersonalization=false;out.authorizationState='public_nyx_voice_only';
    out.publicIdentityQuestion=cls.publicIdentityQuestion;out.blockedOperatorClaim=cls.privateSpoof;}
  out.meta=Object.assign({},safeObj(out.meta),{phase3dVoiceTextParityHardlock:true,answerClass:cls.answerClass,partitionKey:cls.partitionKey,noRawAudioStored:true});return out;
}
function projectAuthorizationResult(result,context){
  if(!isObj(result))return result;const cls=classifyTurn(context||result),out=Object.assign({},result);
  out.voiceTextParityHardlock=true;out.answerClass=cls.answerClass;out.partitionKey=cls.partitionKey;out.memoryPartition=cls.partitionKey;
  if(cls.scope==='public'){out.authorized=false;out.adminVoiceAllowed=false;out.marionVoiceAllowed=false;out.adminVoiceDeliveryAllowed=false;
    out.publicVoiceAllowed=true;out.authorizationState='public_nyx_voice_only';out.reason=cls.privateSpoof?'PUBLIC_VOICE_OPERATOR_SPOOF_BLOCKED':'PUBLIC_VOICE_NYX_ONLY';
    out.allowOperatorMemory=false;out.allowPersonalName=false;}
  return out;
}
function projectSpeechSyncEnvelope(envelope,context){
  if(!isObj(envelope))return envelope;const cls=classifyTurn(context||envelope),out=projectResult(envelope,context);
  const raw=firstText(out.spokenText,out.speechText,out.reply,out.displayReply);
  const speech=cls.scope==='public'?sanitizePublicText(raw,cls.prompt):clip(raw,1800);
  out.spokenText=speech;out.speechText=speech;out.noRawAudio=true;out.audioStored=false;out.rawAudioStored=false;return out;
}
function compareVoiceTextParity(textInput,voiceInput,context){
  const base=safeObj(context),typed=classifyTurn(Object.assign({},base,{text:cleanText(textInput),inputChannel:'text'})),voice=classifyTurn(Object.assign({},base,{transcript:cleanText(voiceInput),inputChannel:'voice',voice:true}));
  return{version:VERSION,typed,voice,sameAnswerClass:typed.answerClass===voice.answerClass,sameScope:typed.scope===voice.scope,
    drift:typed.answerClass!==voice.answerClass||typed.scope!==voice.scope,driftBlocked:true};
}
module.exports={VERSION,PUBLIC_AGENT,PRIVATE_AGENT,OPERATOR_NAME,cleanText,collectContext,isVerifiedOperatorContext,isVoiceContext,isPublicContext,
  answerClassForPrompt,publicReplyForClass,sanitizePublicText,classifyTurn,projectResult,projectVoiceInputEnvelope,
  projectAuthorizationResult,projectSpeechSyncEnvelope,compareVoiceTextParity};
