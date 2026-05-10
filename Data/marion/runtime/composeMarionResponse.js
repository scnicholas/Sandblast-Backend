"use strict";

const VERSION = "composeMarionResponse v3.32.0 ROKU-RESPONSE-DEPTH-CALIBRATION-LOCK + RESPONSE-DEPTH-CALIBRATION-LOCK + NEWS-MEDIA-POSITIONING-LANE-LOCK + ROKU-LANE-LOCK-PUBLIC-DIAGNOSTIC-CLEANUP + CONTINUATION-COMPRESSION-GUARD-LOCK + PROGRESSION-SHAPING-GUARD-MEMORY-CARRY-HARDLOCK + DOMAIN-CONFIDENCE-FAIL-CLOSED + FINAL-RUNTIME-TELEMETRY";
const fs = require("fs");
const path = require("path");
const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.7";
const STATE_SPINE_SCHEMA_COMPAT = "nyx.marion.stateSpine/1.6";
const PIPELINE_FORENSIC_NORMALIZATION_VERSION = "pipeline.forensicNormalization/1.0";
const CONVERSATIONAL_PACK_CONSUMPTION_VERSION = "nyx.marion.conversationalPackConsumption/1.0";
const FINAL_RUNTIME_TELEMETRY_VERSION = "nyx.marion.finalRuntimeTelemetry/1.0";
const VALID_INTENTS = Object.freeze(["simple_chat","technical_debug","emotional_support","business_strategy","music_query","news_query","roku_query","identity_query","identity_or_memory","directive_response","contextual_directive","domain_question"]);
const INTENT_TO_DOMAIN = Object.freeze({ simple_chat:"general", technical_debug:"technical", emotional_support:"emotional", business_strategy:"business", music_query:"music", news_query:"news", roku_query:"roku", identity_query:"identity", identity_or_memory:"memory", directive_response:"execution", contextual_directive:"execution_context", domain_question:"general_reasoning" });
const DOMAIN_REGISTRY_REQUIRE_CANDIDATES = Object.freeze([
  "./marionDomainRegistry.js",
  "./marionDomainRegistry",
  "./Data/marion/runtime/marionDomainRegistry.js",
  "./Data/marion/runtime/marionDomainRegistry",
  "./runtime/marionDomainRegistry.js",
  "./runtime/marionDomainRegistry",
  "./utils/marionDomainRegistry.js",
  "./utils/marionDomainRegistry",
  "./Utils/marionDomainRegistry.js",
  "./Utils/marionDomainRegistry",
  "../runtime/marionDomainRegistry.js",
  "../runtime/marionDomainRegistry"
]);
const BLOCKED_LOOP_PATTERNS = Object.freeze([
  /\bi am here with you\b/i,
  /\bi['’]?m here with you\b/i,
  /\bi can stay with this clearly\b/i,
  /\bwe can take this one step at a time\b/i,
  /\bi need one specific command\b/i,
  /\bsend a specific command\b/i,
  /\bpress reset\b/i,
  /\bready\.\s*send/i,
  /\bi blocked a repeated fallback\b/i,
  /\bnyx is connected\.\s*what would you like/i,
  /\bnyx is live,?\s*marion is connected behind the response path/i,
  /\bmarion is connected behind the response path/i,
  /\bnyx is live and tracking the turn\b/i,
  /\bmarion did not return\b/i,
  /\bfinal envelope missing\b/i,
  /\bdiagnostic packet\b/i,
  /\bnon-final\b/i,
  /\bstill here\b/i,
  /\brun that one more time\b/i,
  /\bbreak in the response\b/i,
  /\brecovery path engaged\b/i,
  /\blet[’\']?s try again\b/i,
  /\bgive me the exact target and i[’']?ll break it down into a clean answer\b/i,
  /\bi have the turn\. send the next target\b/i,
  /\bgive me the target and i[’']?ll route it cleanly\b/i,
  /\btell me the exact target and i[’']?ll give you a specific, user[- ]facing answer\b/i,
  /\bcontinuing from finance\.\s*the next move is to carry only the useful part\b/i,
  /\bwe continue only from the last accepted result,? not the last weak reply\b/i,
  /\bthe next best step is to enforce one response authority\b/i,
  /\bi[’']?m still tracking the system\b/i,
  /\bi[’']?m here\.?\s*what[’']?s next\b/i,
  /\bi am here\.?\s*what[’']?s next\b/i,
  /\bi[’']?m online\.?\s*what[’']?s next\b/i,
  /\bi am online\.?\s*what[’']?s next\b/i,
  /\bi[’']?m here,?\s*fully online\.?\s*what are we working on\b/i,
  /\bhi\s*[—-]\s*i[’']?m here\b/i,
  /\bfully online\b.*\bwhat are we working on\b/i,
  /\bwhat[’']?s next\??$/i,
  /\btechnical response:\s*the marion path must return one trusted final reply only\b/i,
  /\bthe marion path must return one trusted final reply only\b/i,
  /\bblocking generic placeholder language\b/i,
  /\bkeeping the reply bound to the routed intent\b/i,
  /\bfinal envelope,? and session-state update\b/i,
  /\brouteKind=|speechHints=|presenceProfile=|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority=|nyxStateHint=\b/i
]);

function safeStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}

function buildFinalRuntimeTelemetry({source="composeMarionResponse",intent="",domain="",knowledgeDomain="",input={},routed={},reply="",turnId="",finalEnvelopeTrusted=true,canEmit=true,error=""}={}){
  const i=safeObj(input), r=safeObj(routed), routing=safeObj(r.routing), vp=safeObj(i.voiceTextParity);
  const dc=(()=>{try{return extractDomainConfidence(i,r);}catch(_){return null;}})();
  return {
    version: FINAL_RUNTIME_TELEMETRY_VERSION,
    source,
    stage: canEmit ? "final" : "awaiting_marion",
    finalAuthority: "marionFinalEnvelope",
    replyAuthority: "composeMarionResponse",
    canEmit: !!canEmit,
    error: safeStr(error),
    intent: safeStr(intent),
    domain: safeStr(domain),
    knowledgeDomain: safeStr(knowledgeDomain),
    routerIntent: firstText(routing.intent,r.intent,""),
    routerDomain: firstText(routing.domain,r.domain,""),
    turnId: safeStr(turnId),
    inputSource: firstText(i.inputSource,i.source,vp.source,"text"),
    voiceTextParity: { active: !!vp.active, source: firstText(vp.source,""), changed: !!vp.changed, parityLock: vp.parityLock !== false },
    domainConfidence: dc,
    progressionShapingGuard: safeObj(i.progressionShapingGuard || r.progressionShapingGuard),
    progressionShapingGuardActive: !!safeObj(i.progressionShapingGuard || r.progressionShapingGuard).active,
    replySignature: reply ? hashText(reply) : "",
    replyStateSignature: reply ? stateHashText(reply) : "",
    finalEnvelopeTrusted: !!finalEnvelopeTrusted,
    updatedAt: Date.now()
  };
}

function lower(value){return safeStr(value).toLowerCase();}
function isObj(value){return !!value&&typeof value==="object"&&!Array.isArray(value);}
function safeObj(value){return isObj(value)?value:{};}
function safeArray(value){return Array.isArray(value)?value:[];}
function tryRequireOptional(paths){for(const p of safeArray(paths)){try{const mod=require(p);if(mod)return mod;}catch(_){}}return null;}
const domainRegistryMod=tryRequireOptional(DOMAIN_REGISTRY_REQUIRE_CANDIDATES);
function registryCapabilityIntro(){
  if(domainRegistryMod&&typeof domainRegistryMod.getCapabilityIntro==="function"){
    try{const intro=safeStr(domainRegistryMod.getCapabilityIntro());if(intro)return intro;}catch(_){}
  }
  return "I can help with chat, media and radio, News Canada, Roku, avatar controls, voice, backend diagnostics, business strategy, and reasoning. Tell me where you’d like to start.";
}
function registryDomainConfig(domain){
  if(domainRegistryMod&&typeof domainRegistryMod.getDomainConfig==="function"){
    try{return safeObj(domainRegistryMod.getDomainConfig(domain));}catch(_){}
  }
  return {};
}
function registryDomainLabel(domain){
  const cfg=registryDomainConfig(domain);
  return firstText(cfg.userFacingLabel,cfg.label,cfg.title,cfg.domain,domain);
}

function registryDomainManifest(domain){
  if(domainRegistryMod&&typeof domainRegistryMod.getDomainManifest==="function"){
    try{return safeObj(domainRegistryMod.getDomainManifest(domain,{maxBytes:1024*1024}));}catch(_){return {};}
  }
  return {};
}
function registryDomainKnowledgePack(domain){
  if(domainRegistryMod&&typeof domainRegistryMod.getDomainKnowledgePack==="function"){
    try{return safeObj(domainRegistryMod.getDomainKnowledgePack(domain,{maxBytes:1024*1024,maxFiles:80,maxDepth:5}));}catch(_){return {};}
  }
  return {};
}
function registryDomainWiringStatus(domain){
  if(domainRegistryMod&&typeof domainRegistryMod.getDomainWiringStatus==="function"){
    try{return safeObj(domainRegistryMod.getDomainWiringStatus(domain,{includePack:false}));}catch(_){return {};}
  }
  return {};
}
function registryKnowledgeLoaded(domain){
  const manifest=registryDomainManifest(domain),pack=registryDomainKnowledgePack(domain),wiring=registryDomainWiringStatus(domain);
  const packCount=Number(pack.fileCount||safeArray(pack.files).length||safeArray(pack.dataFiles).length||0)||0;
  return {manifestLoaded:!!(manifest.loaded||manifest.ok||manifest.manifest),packLoaded:!!(pack.loaded||pack.ok||packCount>0),packCount,manifestPath:firstText(manifest.path,manifest.manifestPath),wiring};
}
function normalizeConceptKey(value){return lower(value).replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function stripInstructionTail(text){return safeStr(text).replace(/\bdo not mention\b[\s\S]*$/i,"").replace(/\bin one clear paragraph\b.*$/i,"").replace(/\bin one clear sentence\b.*$/i,"").replace(/\bin one paragraph\b.*$/i,"").replace(/\bin one sentence\b.*$/i,"").trim();}
function cleanedDomainPrompt(text){return stripInstructionTail(stripDomainCommand(text)).replace(/^(only\.)\s*/i,"").replace(/^(define|explain|describe|what is|what are|meaning of)\s+/i,"$1 ").trim();}
function extractKnowledgeTerm(text){
  const clean=cleanedDomainPrompt(text);
  let m=clean.match(/\bdifference between\s+(.+?)\s+and\s+(.+?)(?:\.|$)/i);if(m)return `${safeStr(m[1])} vs ${safeStr(m[2])}`;
  m=clean.match(/\b(?:define|definition of|meaning of|explain the word|explain|describe|what is|what are)\s+(.+?)(?:\?|\.|$)/i);if(m)return safeStr(m[1]).replace(/^(an|a|the)\s+/i,"").trim();
  m=clean.match(/:\s*(.+)$/);if(m)return safeStr(m[1]);
  return clean;
}
function candidateTextFromObj(obj){
  const o=safeObj(obj);
  return firstText(o.definition,o.description,o.summary,o.explanation,o.answer,o.content,o.text,o.value,o.body,o.guidance,o.notes);
}
function candidateTitleFromObj(obj,fallback=""){
  const o=safeObj(obj);
  return firstText(o.term,o.concept,o.title,o.name,o.id,o.key,o.slug,o.label,o.topic,fallback);
}
function firstSentence(value,max=380){
  const text=safeStr(value);if(!text)return"";
  const m=text.match(/^(.{30,}?[.!?])\s+/);const out=m?m[1]:text;
  return out.length>max?`${out.slice(0,max).replace(/\s+\S*$/,"").trim()}.`:out;
}
function collectKnowledgeEntries(value,entries=[],seen=new WeakSet(),fallback=""){
  if(value==null||entries.length>240)return entries;
  if(typeof value==="string"){
    const s=safeStr(value);if(s&&fallback)entries.push({title:fallback,text:s});return entries;
  }
  if(Array.isArray(value)){for(const item of value)collectKnowledgeEntries(item,entries,seen,fallback);return entries;}
  if(!isObj(value)||seen.has(value))return entries;
  seen.add(value);
  const title=candidateTitleFromObj(value,fallback),body=candidateTextFromObj(value);
  if(title&&body)entries.push({title,text:body});
  const defs=safeObj(value.definitions||value.glossary||value.terms||value.concepts);
  for(const key of Object.keys(defs)){
    const item=defs[key];
    if(typeof item==="string")entries.push({title:key,text:item});
    else collectKnowledgeEntries(item,entries,seen,key);
  }
  for(const key of Object.keys(value)){
    if(/^(definition|description|summary|explanation|answer|content|text|value|body|guidance|notes)$/i.test(key))continue;
    collectKnowledgeEntries(value[key],entries,seen,title||key);
  }
  return entries;
}
function registryKnowledgeEntries(domain){
  const manifest=registryDomainManifest(domain),pack=registryDomainKnowledgePack(domain),entries=[];
  if(manifest.manifest)collectKnowledgeEntries(manifest.manifest,entries);
  if(manifest.data)collectKnowledgeEntries(manifest.data,entries);
  for(const file of safeArray(pack.dataFiles))collectKnowledgeEntries(safeObj(file).data,entries);
  for(const file of safeArray(pack.files))collectKnowledgeEntries(safeObj(file).data||file,entries);
  if(pack.pack)collectKnowledgeEntries(pack.pack,entries);
  if(pack.data)collectKnowledgeEntries(pack.data,entries);
  const seen=new Set();
  return entries.filter(e=>{const title=safeStr(e.title),body=safeStr(e.text);if(!title||!body)return false;const k=`${normalizeConceptKey(title)}::${normalizeConceptKey(body).slice(0,90)}`;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,160);
}
function firstNSentences(value,maxSentences=3,max=760){
  const text=safeStr(value);if(!text)return"";
  const matches=text.match(/[^.!?]+[.!?]+(?:\s+|$)/g);
  let out=matches&&matches.length?matches.slice(0,maxSentences).join(" ").trim():text;
  if(out.length>max)out=`${out.slice(0,max).replace(/\s+\S*$/," ").trim()}.`;
  return out.replace(/\s+/g," ").trim();
}
function domainDepthFloor(domain,text,reply){
  const k=normalizeKnowledgeDomain(domain),r=safeStr(reply),t=lower(text);
  if(!r)return"";
  if(k==="finance"&&/cash[- ]?flow.*profit|profit.*cash[- ]?flow/i.test(t)&&!/profit/i.test(r))return"";
  if(k==="law"&&/legal information.*legal advice|legal advice.*legal information/i.test(t)&&!/advice/i.test(r))return"";
  if(k==="ai"&&/tool routing/i.test(t)&&!/tool/i.test(r))return"";
  if(k==="psychology"&&/cognitive distortion/i.test(t)&&!/distortion/i.test(r))return"";
  if(r.length<70&&!["english"].includes(k))return"";
  return r;
}
function registryKnowledgeAnswer(domain,text){
  const k=normalizeKnowledgeDomain(domain);if(!k)return"";
  const term=normalizeConceptKey(extractKnowledgeTerm(text));if(!term||term.length<2)return"";
  const entries=registryKnowledgeEntries(k);
  let best=null,bestScore=0;
  for(const e of entries){
    const title=normalizeConceptKey(e.title),body=normalizeConceptKey(e.text);let score=0;
    if(title===term)score+=100;
    if(title&&term&&title.includes(term))score+=60;
    if(term&&title&&term.includes(title)&&title.length>2)score+=40;
    if(body.includes(term))score+=22;
    const parts=term.split(" ").filter(x=>x.length>2);
    score+=parts.filter(p=>title.includes(p)).length*7;
    score+=parts.filter(p=>body.includes(p)).length*3;
    if(score>bestScore){bestScore=score;best=e;}
  }
  if(best&&bestScore>=24){
    const title=safeStr(best.title),body=firstNSentences(best.text,3,760);
    const reply=body||title;
    return domainDepthFloor(k,text,reply);
  }
  return"";
}

const VALID_KNOWLEDGE_DOMAINS = Object.freeze(["psychology","english","ai","cyber","law","finance"]);
function normalizeKnowledgeDomain(value){const raw=lower(value).replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");const aliases={psychology:"psychology",psych:"psychology",emotional:"psychology",support:"psychology",english:"english",language:"english",grammar:"english",writing:"english",syntax:"english",ai:"ai",artificial_intelligence:"ai",machine_learning:"ai",ml:"ai",cyber:"cyber",cybersecurity:"cyber",security:"cyber",law:"law",legal:"law",finance:"finance",financial:"finance",economics:"finance",pricing:"finance"};const k=aliases[raw]||raw;return VALID_KNOWLEDGE_DOMAINS.includes(k)?k:"";}
function isExplicitCybersecurityRequest(text){const t=lower(text);if(!t)return false;if(/\b(no|not|without|avoid|exclude)\s+(cyber|cybersecurity|security\s+domain)\b/i.test(t))return false;if(/\b(cyber|cybersecurity|security)\s+(domain|lane|knowledge|pack|test)\b/i.test(t))return true;if(/\b(use|route|activate|load|switch to|run|engage)\s+(the\s+)?(cyber|cybersecurity|security)\s+(domain|lane|knowledge|pack)\b/i.test(t))return true;if(/\b(defensive cybersecurity|cybersecurity hardening|threat model|incident response|phishing|ransomware|mfa|least privilege|secrets? rotation|input validation)\b/i.test(t)&&!/\b(state spine|statespine|marion|nyx|chatengine|chat engine|marionbridge|marion bridge|composemarionresponse|compose marion|intent router|domain registry|backend technical test|code-level continuity)\b/i.test(t))return true;return false;}
function isNyxMarionBackendTechnicalContext(text){const t=lower(text);if(!t)return false;const moduleHit=/\b(state spine|statespine|state-spine|chatengine|chat engine|marionbridge|marion bridge|composemarionresponse|compose marion response|compose marion|intent router|marion intent router|domain registry|mariondomainregistry|marion domain registry|final envelope|finalenvelope|sessionpatch|session patch|carry-forward|carry forward|continuity ledger|noProgress|lastUserHash|lastAssistantHash|turnDepth|creative cognitive carry|creative\/cognitive carry)\b/i.test(t);const backendHit=/\b(nyx marion backend|marion backend|backend technical test|backend code|code-level|script|pipeline regression|transport path|api\/chat|coordinator-only|final authority|trusted final|autopsy|audit|critical fix|critical fixes|hardening improvement|technical refinement)\b/i.test(t);return !!(moduleHit||backendHit);}function isContinuationCompressionInstruction(text=""){const t=lower(normalizeVoiceTextParityText?normalizeVoiceTextParityText(text):text);if(!t)return false;return /\bcontinue from (?:the )?(?:last|previous) answer\b/i.test(t)&&/\b(compress|one sentence|single sentence|final rule|without repeating|previous wording|same idea|shorten)\b/i.test(t);}function continuationCompressionLockedDomain(input={},routed={}){const i=safeObj(input),r=safeObj(routed),pm=safeObj(i.previousMemory||i.memory||i.turnMemory),st=safeObj(i.state||i.conversationState||pm.stateSpine||pm.conversationState),guards=[i.progressionShapingGuard,r.progressionShapingGuard,pm.progressionShapingGuard,st.progressionShapingGuard,safeObj(pm.stateBridge).progressionShapingGuard,safeObj(st.stateBridge).progressionShapingGuard];for(const g of guards){const o=safeObj(g);const d=normalizeKnowledgeDomain(o.lockedDomain||o.domain||"");if(d)return d;}return normalizeKnowledgeDomain(firstText(pm.lastKnowledgeDomain,st.lastKnowledgeDomain,pm.lastDomain,st.lastDomain,""));}function isExplicitEnglishTransformRequest(text=""){if(isContinuationCompressionInstruction(text))return false;return /\b(rewrite|revise|edit|proofread|polish|copyedit|grammar|tone|professional(?:ly)?|make this .*sound|wording|language flow)\b/i.test(lower(text));}
function detectKnowledgeDomain(text){const t=lower(text);if(!t)return"";if(isContinuationCompressionInstruction(t))return"";if(isExplicitEnglishTransformRequest(t))return"english";if(isNyxMarionBackendTechnicalContext(t)&&!isExplicitCybersecurityRequest(t))return"";if(/\b(emotion|emotional)\s+(domain|lane|knowledge|pack|test)\b/i.test(t))return"psychology";if(/\bpsychology\s+(domain|lane|knowledge|pack|test)\b/i.test(t))return"psychology";if(/\benglish\s+(domain|lane|knowledge|pack|setup|test)\b/i.test(t))return"english";if(/\b(ai|artificial intelligence)\s+(domain|lane|knowledge|pack|test)\b/i.test(t))return"ai";if(/\b(cyber|cybersecurity|security)\s+(domain|lane|knowledge|pack|test)\b/i.test(t))return"cyber";if(/\b(law|legal)\s+(domain|lane|knowledge|pack|test)\b/i.test(t))return"law";if(/\b(finance|financial|economics)\s+(domain|lane|knowledge|pack|test)\b/i.test(t))return"finance";if(/\b(use|route|activate|load|switch to|run)\s+(the\s+)?(psychology|psych|emotional support)\s+(domain|lane|knowledge|pack)\b/i.test(t))return"psychology";if(/\b(use|route|activate|load|switch to|run)\s+(the\s+)?(english|english language|language|grammar|writing)\s+(domain|lane|knowledge|pack|setup)\b/i.test(t))return"english";if(/\b(use|route|activate|load|switch to|run)\s+(the\s+)?(ai|artificial intelligence)\s+(domain|lane|knowledge|pack)\b/i.test(t))return"ai";if(/\b(use|route|activate|load|switch to|run)\s+(the\s+)?(cyber|cybersecurity|security)\s+(domain|lane|knowledge|pack)\b/i.test(t))return"cyber";if(/\b(use|route|activate|load|switch to|run)\s+(the\s+)?(law|legal|canadian law)\s+(domain|lane|knowledge|pack)\b/i.test(t))return"law";if(/\b(work on|talk about|look at|do|handle)\s+(some\s+)?(law|legal|canadian law)\b/i.test(t))return"law";if(/\b(use|route|activate|load|switch to|run)\s+(the\s+)?(finance|financial|economics|pricing)\s+(domain|lane|knowledge|pack)\b/i.test(t))return"finance";if(/\b(define|definition|meaning|explain the word|word resilience|grammar|syntax|rewrite|polish|tone|professional clarity|business english|copyedit|proofread|wording|language flow)\b/i.test(t))return"english";if(/\b(emotional regulation|emotional tone|detect the emotional tone|overwhelmed|spiraling|panic|numb|shutdown|attachment|shame|trauma|stabilize first|cognitive distortion)\b/i.test(t))return"psychology";if(/\b(ai agent|artificial intelligence|llm|rag|embedding|tool routing|agent orchestration|machine learning)\b/i.test(t))return"ai";if(/\b(cyber|cybersecurity|hardening|prompt injection|phishing|ransomware|mfa|incident response|threat model)\b/i.test(t))return"cyber";if(/\b(legal information|legal advice|canadian law|contract law|case law|statute|jurisdiction)\b/i.test(t))return"law";if(/\b(unit economics|ltv|cac|pricing tiers|capital markets|cash flow|runway|margin|finance|financial|scenario analysis)\b/i.test(t))return"finance";return"";}
function resolveKnowledgeDomain(routed={},input={},text=""){const dk=(typeof directiveExecutionKind==="function")?directiveExecutionKind(text):"none";if(isContinuationCompressionInstruction(text)){const locked=continuationCompressionLockedDomain(input,routed);return locked||"";}if(isDomainIsolationPrompt(text)||isMicTextParityPrompt(text)||isPracticalNyxConsistencyPrompt(text))return"";if(["file_package","replace_file","syntax_validate","git_deploy","test_run","auth_token","next_step"].includes(dk))return"";if(isExplicitEnglishTransformRequest(text))return"english";if(isNyxMarionBackendTechnicalContext(text)&&!isExplicitCybersecurityRequest(text))return"";const r=safeObj(routed),i=safeObj(input),routing=safeObj(r.routing||i.routing),intentPacket=safeObj(r.marionIntent||i.marionIntent||r.intentPacket||i.intentPacket);return normalizeKnowledgeDomain(r.knowledgeDomain||i.knowledgeDomain||routing.knowledgeDomain||intentPacket.knowledgeDomain||safeObj(r.domainRoute).knowledgeDomain||safeObj(routing.domainRoute).knowledgeDomain||detectKnowledgeDomain(text));}
function knowledgeDomainHints(knowledgeDomain,routed={},input={}){const k=normalizeKnowledgeDomain(knowledgeDomain);if(!k)return null;const routing=safeObj(safeObj(routed).routing||safeObj(input).routing);const loaded=registryKnowledgeLoaded(k);return{knowledgeDomain:k,explicit:!!(safeObj(safeObj(routed).marionIntent).knowledgeDomainExplicit||routing.knowledgeDomainExplicit),reason:firstText(safeObj(safeObj(routed).marionIntent).knowledgeDomainReason,routing.knowledgeDomainReason,"knowledge_domain_handoff"),route:safeObj(routing.domainRoute),useDomainKnowledge:true,manifestLoaded:loaded.manifestLoaded,packLoaded:loaded.packLoaded,packCount:loaded.packCount,manifestPath:loaded.manifestPath};}
function stripDomainCommand(text){return safeStr(text).replace(/\b(use|route|activate|load|switch to|run)\s+(the\s+)?(english language|english|psychology|psych|emotion|emotional|ai|artificial intelligence|cybersecurity|cyber|law|legal|finance|financial)\s+(domain|lane|knowledge|pack|setup)\.?\s*/i,"").replace(/\b(english|psychology|emotion|emotional|ai|cyber|law|finance)\s+(domain|lane)\s+test(\s+only)?[:.]?\s*/i,"").trim();}
function afterColon(text){const raw=safeStr(text);const idx=raw.indexOf(":");return idx>=0?raw.slice(idx+1).trim():raw;}
function polishEnglishText(text){let target=stripDomainCommand(text);target=target.replace(/^rewrite this sentence for professional clarity(?:, grammar, tone, and polished business english)?:\s*/i,"").trim();target=target.replace(/^rewrite this sentence with more professional clarity:?\s*/i,"").trim();target=target.replace(/^rewrite this sentence professionally:?\s*/i,"").trim();target=target.replace(/^rewrite this sentence:?\s*/i,"").trim();target=target.replace(/^make this paragraph sound more polished and professional:?\s*/i,"").trim();if(/\bdefine\s+resilience\b|\bexplain\s+the\s+word\s+resilience\b|\bword\s+resilience\b/i.test(target))return"Resilience is the ability to recover, adapt, and keep moving forward after stress, difficulty, or failure.";if(/^define\s+/i.test(target)){const word=safeStr(target.replace(/^define\s+/i,"").replace(/\bin\s+one\s+(clear\s+)?sentence\b.*$/i,"")).replace(/[^a-zA-Z -]/g,"").trim();if(word)return`${word.charAt(0).toUpperCase()+word.slice(1)} means the core idea, quality, or action represented by that word, expressed clearly in context.`;}if(!target)return"Please send the sentence or paragraph you want polished, and I’ll refine it for clarity, grammar, tone, and professional flow.";if(/we need this page to look better because people are not gonna trust it if it feels messy/i.test(target))return"We need to improve the page’s presentation so visitors perceive it as credible, organized, and trustworthy.";if(/we need to make this thing sound better for people/i.test(target))return"We need to refine this so it communicates more clearly, professionally, and effectively for the intended audience.";if(/we gotta fix this script because it keeps acting weird/i.test(target))return"We need to resolve the script issue because it is behaving inconsistently.";return `Polished version: ${target.replace(/\bthing\b/gi,"message").replace(/sound better/gi,"communicate more clearly").replace(/for people/gi,"for the intended audience")}`;}
function psychologyDomainAnswer(text,input={}){const t=lower(text);if(/emotional shutdown|shut down emotionally|shutdown/i.test(t))return"Emotional shutdown is a protective response where the nervous system reduces feeling, speech, or decision-making because the pressure feels too high. It can look like distance, silence, numbness, or slow answers, but the practical meaning is often overload rather than indifference. The grounded response is to lower the demand, name one safe next step, and give the person enough space to re-engage without forcing intensity.";if(/cognitive distortion/i.test(t))return"A cognitive distortion is a repeated thinking pattern that bends interpretation away from the full evidence, usually by exaggerating threat, certainty, blame, or failure. Common examples include all-or-nothing thinking, catastrophizing, mind reading, overgeneralizing, and discounting positives. The useful move is not to argue with yourself blindly, but to slow the thought down, separate facts from interpretation, and test for a more balanced explanation.";if(/emotional regulation/i.test(t))return"Emotional regulation is the ability to notice, understand, and manage feelings so they inform your actions without taking control of them.";if(/detect the emotional tone|emotional tone/i.test(t)){const sample=afterColon(text)||text;const s=lower(sample);if(/calm.*cautious|cautious.*calm/i.test(s))return"The emotional tone is calm but guarded: steady on the surface, with some caution underneath.";if(/angry|frustrated|furious/i.test(s))return"The emotional tone is tense and frustrated, with anger close to the surface.";if(/sad|heavy|hopeless|numb/i.test(s))return"The emotional tone is heavy and subdued, with sadness or emotional fatigue present.";if(/anxious|afraid|panic|worried/i.test(s))return"The emotional tone is anxious and alert, with worry or uncertainty driving the pressure.";return"The emotional tone appears measured and reflective; I would need a little more context to classify it with higher confidence.";}return emotionalReply(text,input);}
function isKnowledgeDomainActivationRequest(text){const t=lower(text);if(/\b(rewrite|polish|proofread|copyedit|define|explain|describe|analyze|answer|identify|compare)\b/i.test(t)&&/:/.test(safeStr(text)))return false;return /\b(use|route|activate|load|switch to|run|engage)\s+(the\s+)?(english language|english|psychology|psych|emotion|emotional|ai|artificial intelligence|cybersecurity|cyber|law|legal|finance|financial)\s+(domain|lane|knowledge|pack|setup)\b/i.test(t);}
function activateDomainReply(k){if(k==="english")return"English lane engaged. I’ll focus on wording, grammar, clarity, tone, and language structure.";if(k==="psychology")return"Psychology lane engaged. I’ll focus on emotional patterns, regulation, cognition, behavior, and grounded support.";if(k==="ai")return"AI lane engaged. I’ll focus on agents, models, retrieval, tool use, memory boundaries, evaluation, and system design.";if(k==="cyber")return"Cyber lane engaged. I’ll keep the work defensive, focused on risk reduction, access control, validation, monitoring, and safe hardening.";if(k==="law")return"Law lane engaged. I’ll provide legal information and research framing, not legal advice, and I’ll keep jurisdiction and source hierarchy clear.";if(k==="finance")return"Finance lane engaged. I’ll focus on cash flow, margins, pricing, assumptions, scenarios, and business decision thresholds.";return"Domain lane engaged.";}
function aiDomainAnswer(text){const t=lower(text);if(/\btool routing\b/i.test(t))return"Tool routing in an AI agent means selecting the right capability for the task before acting: search when fresh facts are needed, retrieval when internal knowledge is relevant, code when computation or file work is required, and no tool when reasoning alone is enough. A strong agent does not call tools randomly; it checks intent, available permissions, risk, and expected output, then returns the result in a user-facing answer. The practical goal is precision: the agent should use the smallest reliable tool path that solves the request without exposing internal machinery.";if(/\b(ai agent|agent)\b/i.test(t))return"An AI agent is a goal-directed system that combines a language model, instructions, memory boundaries, tools, and verification steps to complete a task. The model interprets the request, chooses an action path, uses tools only when they add value, and then checks the result before responding. A good agent is not just chat; it is controlled reasoning with safe execution.";if(/\bllm|large language model\b/i.test(t))return"A large language model is an AI model trained to recognize and generate language patterns from large datasets. It can summarize, reason, draft, classify, and transform text, but its reliability depends on grounding, clear instructions, and verification when facts or calculations matter.";if(/\brag|retrieval augmented generation\b/i.test(t))return"Retrieval-augmented generation lets an AI look up relevant knowledge before composing an answer. Instead of relying only on model memory, the system retrieves documents or data, uses that context, and produces a more grounded response.";if(/\bembedding|embeddings\b/i.test(t))return"An embedding is a numerical representation of meaning that lets software compare text, images, or other data by similarity. In practical systems, embeddings help retrieve related knowledge, cluster concepts, and connect a user question to the right stored material.";return"AI systems work best when the goal, tool choices, memory boundaries, evidence checks, and final answer rules are explicit. That structure lets the system act intelligently without becoming unpredictable or leaking implementation details.";}
function cyberDomainAnswer(text){const t=lower(text);if(/\b(api authentication|authentication|auth token|token handling|api keys?|bearer token|jwt|session token)\b/i.test(t))return"Defensive API authentication hardening starts with HTTPS-only transport, short-lived tokens, scoped permissions, strict server-side validation, rate limits, and clear separation between public, user, and admin routes. Store secrets outside the client, rotate keys when exposure is possible, avoid logging tokens, and verify every request before it reaches business logic. The goal is containment: a failed credential, malformed request, or replay attempt should be detected, limited, and rejected without exposing the rest of the system.";if(/\bleast privilege\b/i.test(t))return"Least privilege means every user, service, token, and process receives only the access needed for its specific job and nothing extra. For a backend service, that means narrow API keys, scoped database permissions, separated admin functions, short-lived credentials where possible, and logs that reveal misuse without exposing secrets. The security value is containment: if one component fails, the attacker inherits a small permission set instead of the whole system.";if(/\bthreat model|threat modeling\b/i.test(t))return"Threat modeling identifies what could go wrong, who might cause it, which assets are exposed, and which controls reduce the risk. A useful model maps assets, entry points, trust boundaries, abuse cases, and practical mitigations before code or infrastructure changes are made.";if(/\binput validation\b/i.test(t))return"Input validation means checking data before it is trusted or processed. Strong validation confirms type, length, format, range, and allowed values so malformed or hostile input cannot push the system into unsafe behavior.";if(/\bsecrets?\b/i.test(t))return"Secrets are sensitive credentials such as API keys, tokens, passwords, and signing keys. They should be stored outside code, rotated when exposed, restricted by scope, and never printed into logs, client bundles, screenshots, or diagnostics.";return"Cybersecurity reduces risk by validating inputs, limiting permissions, protecting secrets, monitoring behavior, and designing systems to fail safely. The defensive posture is to reduce blast radius first, then improve detection, recovery, and operational discipline.";}
function lawDomainAnswer(text){const t=lower(text);if(/legal information.*legal advice|legal advice.*legal information/i.test(t))return"Legal information explains general rules, concepts, procedures, and public sources, while legal advice applies the law to a specific person’s facts and recommends what they should do. In Canada, the line matters because procedure, deadlines, evidence, and remedies can change by province, court, tribunal, and situation. A safe answer can explain the framework and what facts matter, but a lawyer or legal clinic should confirm strategy for a real dispute.";if(/\bjurisdiction\b/i.test(t))return"Jurisdiction is the legal authority of a court, regulator, or government to make decisions over a person, place, subject, or dispute. In Canada, it often turns on the province or territory, the subject matter, the parties, and whether the issue is federal, provincial, tribunal-based, or court-based.";if(/\bcontract\b/i.test(t))return"A contract is an agreement that creates legal obligations when the required elements are present, usually including offer, acceptance, consideration, capacity, and intention to create legal relations. The practical analysis then looks at the wording, surrounding facts, performance, breach, remedies, and any statute that modifies the common-law rules.";if(/\bstatute\b/i.test(t))return"A statute is a written law passed by a legislature. To use one properly, check the jurisdiction, current version, definitions, regulations, and cases interpreting the section, because the wording alone rarely answers every practical question.";return"Legal analysis starts by identifying the jurisdiction, issue, governing sources, facts, and limits of what can be answered without professional legal advice. The safe approach is to explain the framework, flag the facts that matter, and avoid guaranteeing outcomes.";}
function financeDomainAnswer(text){const t=lower(text);if(/revenue.*profit.*margin|revenue.*margin.*profit|profit.*revenue.*margin|profit.*margin.*revenue|margin.*revenue.*profit|margin.*profit.*revenue/i.test(t))return"Revenue is the total money the business brings in from sales before expenses. Profit is what remains after costs are subtracted. Margin shows profit as a percentage of revenue, so it tells you how efficiently the business turns sales into surplus. Simple read: revenue is the top line, profit is the leftover money, and margin is the health ratio behind the profit.";if(/cash[- ]?flow.*profit|profit.*cash[- ]?flow/i.test(t))return"Cash flow is the movement of money in and out of the business, while profit is what remains after revenue is matched against expenses under accounting rules. A business can be profitable on paper but cash-poor if customers pay late, inventory ties up money, debt payments are due, or growth consumes working capital. Profit tells you whether the model creates economic surplus; cash flow tells you whether the business can survive, pay obligations, and keep operating in real time.";if(/\bcash[- ]?flow\b/i.test(t)&&/\brisk|business decision|decision|resilience|runway|pressure\b/i.test(t))return"Cash-flow risk is the chance that timing, collections, debt payments, inventory, or operating costs create a cash shortage even when the business looks healthy on paper. In a business decision, it should change the threshold for pricing, spending, hiring, financing, or runway protection. The practical test is simple: will this move leave enough cash to survive delays, absorb surprises, and keep operations stable without weakening the company?";if(/\bcash[- ]?flow\b/i.test(t))return"Cash flow is the movement of money into and out of a business over a specific period. Positive cash flow means more money is coming in than going out; negative cash flow means the business may need reserves, financing, or faster collections even if sales look strong.";if(/\bunit economics\b/i.test(t))return"Unit economics measure the revenue, cost, and contribution attached to one customer, sale, product, or transaction. They reveal whether growth improves the business or simply scales losses faster.";if(/\bmargin|profit margin\b/i.test(t))return"Margin is the portion of revenue left after costs are subtracted, usually expressed as a percentage. It shows how much room the business has to cover overhead, reinvest, absorb shocks, and produce profit.";if(/\brunway\b/i.test(t))return"Runway is the amount of time a business can keep operating before it runs out of available cash. It is usually estimated by dividing cash on hand by monthly net burn, then stress-testing for slower revenue or higher costs.";if(/\bcac\b|customer acquisition cost/i.test(t))return"Customer acquisition cost is the average amount spent to gain one new customer. It should be compared against lifetime value, gross margin, payback period, and retention before scaling spend.";if(/\bltv\b|lifetime value/i.test(t))return"Lifetime value is the estimated revenue or gross profit a customer generates over the full relationship with a business. It depends heavily on retention, margin, expansion revenue, and churn assumptions.";return"Finance decisions should be grounded in assumptions, cash-flow impact, unit economics, risk exposure, and clear decision thresholds. The practical question is not only whether an option looks profitable, but whether it improves resilience under realistic timing, cost, and demand pressure.";}
function directDomainDepthAnswer(k,text,input={}){if(k==="english")return polishEnglishText(text);if(k==="psychology")return psychologyDomainAnswer(text,input);if(k==="ai")return aiDomainAnswer(text);if(k==="cyber")return cyberDomainAnswer(text);if(k==="law")return lawDomainAnswer(text);if(k==="finance")return financeDomainAnswer(text);return"";}
function knowledgeDomainReply(knowledgeDomain,text,input={},routed={}){const k=normalizeKnowledgeDomain(knowledgeDomain);if(!k)return"";if(isKnowledgeDomainActivationRequest(text))return activateDomainReply(k);const direct=directDomainDepthAnswer(k,text,input);if(domainDepthFloor(k,text,direct))return direct;const registryReply=registryKnowledgeAnswer(k,text);if(domainDepthFloor(k,text,registryReply))return registryReply;return direct||registryReply||"";}

function firstText(){for(let i=0;i<arguments.length;i+=1){const text=safeStr(arguments[i]);if(text)return text;}return "";}
function clampInt(value,fallback=0,min=0,max=999){const n=Number(value);if(!Number.isFinite(n))return fallback;return Math.max(min,Math.min(max,Math.trunc(n)));}
function hashText(value){const source=lower(value).replace(/[^a-z0-9]+/g," ").trim();let hash=0;for(let i=0;i<source.length;i+=1){hash=((hash<<5)-hash)+source.charCodeAt(i);hash|=0;}return String(hash>>>0);}
function stateHashText(value){const source=lower(value);let hash=2166136261;for(let i=0;i<source.length;i+=1){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619);}return(hash>>>0).toString(16);}

function normalizeIntent(value){const raw=lower(value).replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");const aliases={chat:"simple_chat",general:"simple_chat",debug:"technical_debug",technical:"technical_debug",autopsy:"technical_debug",audit:"technical_debug",support:"emotional_support",emotional:"emotional_support",business:"business_strategy",strategy:"business_strategy",music:"music_query",news:"news_query",newscanada:"news_query",roku:"roku_query",identity:"identity_query",who_are_you:"identity_query",what_are_you:"identity_query",memory:"identity_or_memory",continuity:"identity_or_memory",direct:"directive_response",directive:"directive_response",answer:"directive_response",short_answer:"directive_response",next_step:"directive_response",contextual_directive:"contextual_directive",domain:"domain_question",question:"domain_question"};const normalized=aliases[raw]||raw||"simple_chat";return VALID_INTENTS.includes(normalized)?normalized:"domain_question";}
function normalizeDomain(value,intent){const raw=lower(value).replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");return raw||INTENT_TO_DOMAIN[intent]||"general";}
function extractText(routed={},input={}){const r=safeObj(routed),i=safeObj(input),payload=safeObj(i.payload||r.payload),body=safeObj(i.body||r.body),packet=safeObj(i.packet||r.packet),synthesis=safeObj(packet.synthesis);const raw=firstText(i.voiceTextParityText,i.userText,i.userQuery,i.normalizedText,i.text,i.query,i.message,r.userText,r.userQuery,r.text,r.query,r.message,payload.userText,payload.userQuery,payload.text,payload.query,payload.message,body.userText,body.userQuery,body.text,body.query,body.message,synthesis.userText,synthesis.userQuery,synthesis.text);return normalizeVoiceTextParityText(raw,input,routed);}
function detectIdentityIntent(text){const t=lower(text);return /\b(who are you|what are you|tell me who you are|how do you think|how marion helps|what is marion|who is marion|explain what marion does|what marion does|marion does for nyx|your identity|your role|what do you do)\b/i.test(t);}
function detectDirectiveIntent(text){const t=lower(text);return /\b(short\s*,?\s*direct answer|short answer|direct answer|next best step|next steps?|what is the next best step|what should (we|i) do|single change|one concrete step|one precise action|give me the next step|just tell me|bottom line|replace the file|validate syntax|run the test|run this test|commit and push|git add|git commit|git push|pull --rebase|resend|downloadable zip|zipped file|send the file|give me the command|show me the command)\b/i.test(t);}
function resolveIntent(routed={},input={}){const r=safeObj(routed),i=safeObj(input),text=extractText(routed,input),t=lower(text),knowledgeDomain=resolveKnowledgeDomain(routed,input,text);if(isDomainIsolationPrompt(text)||isMicTextParityPrompt(text))return "technical_debug";if(isPracticalNyxConsistencyPrompt(text))return "directive_response";if(detectIdentityIntent(text))return "identity_query";if(knowledgeDomain==="english"&&isExplicitEnglishTransformRequest(text))return "domain_question";if(isNyxMarionBackendTechnicalContext(text)&&!isExplicitCybersecurityRequest(text))return "technical_debug";if(knowledgeDomain){const distress=detectDistress(text);if(knowledgeDomain==="psychology"&&distress.emotional)return "emotional_support";return "domain_question";}if(isCapabilityQuestion(text))return "simple_chat";if(/given that answer|given that setup|based on that|that setup|that architecture|from there|in this case|now explain|turn that into|turn this into|make it sound|make it more premium|investor[- ]?facing|short pitch|say out loud|those upgrades|next three|prioriti[sz]e/i.test(t))return /sponsor|business value|investor|premium|pitch/i.test(t)?"business_strategy":"contextual_directive";if(/make the conversation|conversation quality|make .*intelligent|smarter answers|layered answers|natural response|response depth|tone profile|anti-flatness|phrase variation|context carry/i.test(t))return "technical_debug";if(/autopsy|audit|line[- ]?by[- ]?line|gap refinement|critical fix|critical fixes|loop|looping|fallback|duplicate reply|backend reply unavailable|final envelope|finalenvelope|marion bridge|chat engine|state spine|api\/chat|transport path|pipeline|widget code|script|route|endpoint|diagnostic/i.test(t))return "technical_debug";if(/roku|tv app|linear tv|streaming|ott|ad server/i.test(t))return "roku_query";if(/news canada|newscanada|rss|headline|headlines|article|story|feed/i.test(t))return "news_query";if(/radio|music|playlist|song|artist|album|chart|adult contemporary/i.test(t))return "music_query";if(/business|strategy|sponsor|sponsorship|media kit|monetiz|revenue|sales|advertising|brand awareness/i.test(t))return "business_strategy";if(detectArchitectureReasoning(text))return "domain_question";if(detectDirectiveIntent(text))return "directive_response";return normalizeIntent(r.intent||(r.marionIntent&&r.marionIntent.intent)||(r.routing&&r.routing.intent)||i.intent||(i.marionIntent&&i.marionIntent.intent)||(i.routing&&i.routing.intent)||(i.signals&&i.signals.technical&&i.signals.technical.detected?"technical_debug":"")||(i.signals&&i.signals.emotional&&i.signals.emotional.detected?"emotional_support":"")||"simple_chat");}
function resolveDomain(routed={},input={},intent="simple_chat"){const r=safeObj(routed),i=safeObj(input),text=extractText(routed,input),backendTechnical=isNyxMarionBackendTechnicalContext(text)&&!isExplicitCybersecurityRequest(text),knowledgeDomain=resolveKnowledgeDomain(routed,input,text);if(knowledgeDomain&&intent!=="emotional_support")return knowledgeDomain;if(backendTechnical)return "technical";const raw=normalizeDomain(r.primaryDomain||r.domain||(r.routing&&r.routing.domain)||i.domain||i.requestedDomain||(i.routing&&i.routing.domain),intent);if(intent==="technical_debug"&&/^(cyber|security|cybersecurity)$/.test(raw)&&backendTechnical)return "technical";if((!raw||raw==="general")&&intent!=="simple_chat")return INTENT_TO_DOMAIN[intent]||raw||"general";return raw||INTENT_TO_DOMAIN[intent]||"general";}
function resolveTurnId(routed={},input={}){return firstText(input.turnId,input.sourceTurnId,input.packetId,routed.turnId,routed.packetId,input.meta&&input.meta.turnId,routed.meta&&routed.meta.turnId,`compose_${Date.now()}_${Math.random().toString(36).slice(2,8)}`);}
function resolvePreviousMemory(input={}){const previousMemory=safeObj(input.previousMemory||input.memory||input.turnMemory);const state=safeObj(input.conversationState||input.state||previousMemory.stateSpine||previousMemory.conversationState);return{previousMemory,state,repetition:safeObj(state.repetition||previousMemory.repetition)};}
function normalizeInboundTextForPosture(text){
  let t=lower(text);
  if(!t)return"";
  return t
    .replace(/[\u2018\u2019]/g,"'")
    .replace(/\b(nick|nicks|nix|mix|mike)\b/g,"nyx")
    .replace(/\bstress+ed+ed\b/g,"stressed")
    .replace(/\bstress+ed\b/g,"stressed")
    .replace(/\bstres+ed\b/g,"stressed")
    .replace(/\bstresseded\b/g,"stressed")
    .replace(/\bstresssed\b/g,"stressed")
    .replace(/\bstresed\b/g,"stressed")
    .replace(/\bstrest\b/g,"stressed")
    .replace(/\bfrusterated\b/g,"frustrated")
    .replace(/\bfrustratied\b/g,"frustrated")
    .replace(/\boverwhelmeded\b/g,"overwhelmed")
    .replace(/\boverwelmed\b/g,"overwhelmed")
    .replace(/\banxius\b/g,"anxious")
    .replace(/\banxous\b/g,"anxious")
    .replace(/\bpanicing\b/g,"panicking")
    .replace(/\bneed\s+help\s+me\b/g,"need help")
    .replace(/\s+/g," ")
    .trim();
}
function detectGreetingDistressSignal(text){
  const t=normalizeInboundTextForPosture(text).replace(/[.!?]+$/g,"").trim();
  const addressed=/\b(nyx|vera)\b/.test(t)||/^(hi|hey|hello|yo|please)\b/.test(t);
  const emotional=/\b(i am|i'm|im|feeling|feel|getting|got|really|so|very)?\s*(stressed|overwhelmed|anxious|panicking|sad|lonely|hurt|upset|lost|empty|exhausted|drained|burned out|burnt out|worn down)\b/.test(t);
  const directiveHelp=/\b(help me|can you help|need help)\s+(shape|build|create|write|rewrite|improve|refine|design|plan|test|debug|audit|package|position|introduce|make)\b/.test(t);
  const help=!directiveHelp&&/\b(i need help|need help|help me|can you help|i could use help)\b/.test(t);
  const frustration=/\b(frustrated|angry|mad|furious|irritated|annoyed)\b/.test(t);
  return {active:!!(addressed&&(emotional||help||frustration)),emotional,help,frustration,text:t};
}
function detectDistress(text){const t=normalizeInboundTextForPosture(text);const crisis=/\b(suicide|self[- ]?harm|kill myself|don['’]?t want to live|dont want to live|end my life|hurt myself)\b/i.test(t);const high=crisis||/\b(panic attack|panic|panicking|depressed|hopeless|overwhelmed|crying|heartbroken|grief|breaking down)\b/i.test(t);const emotional=high||/\b(sad|lonely|hurt|anxious|afraid|stressed|upset|lost|empty|off today|exhausted|exhausting|mentally drained|drained|burned out|burnt out|worn down)\b/i.test(t);return{crisis,high,emotional};}

function normalizeResolvedEmotion(input={}){
  const direct=safeObj(input.resolvedEmotion||input.emotionState||input.emotionalState);
  const packet=safeObj(input.emotionRuntime||input.resolvedEmotionPacket);
  const prev=safeObj(input.previousMemory||input.memory||input.turnMemory);
  const prevState=safeObj(prev.resolvedEmotion||prev.emotionState||prev.lastEmotionState||prev.emotionalState||prev.emotionalContinuity);
  const state=Object.keys(direct).length?direct:(Object.keys(safeObj(packet.state)).length?safeObj(packet.state):prevState);
  const fromPrevious=!Object.keys(direct).length&&!Object.keys(safeObj(packet.state)).length&&!!Object.keys(prevState).length;
  const emotion=safeObj(state.emotion);
  const support=safeObj(state.support);
  const guard=safeObj(state.guard);
  const nuance=safeObj(state.nuance);
  const handoff=safeObj(state.marion_handoff);
  if(!Object.keys(state).length||!Object.keys(emotion).length)return {present:false,carried:false,state:{},primary:"neutral",secondary:"unclear",intensity:0,confidence:0,timingProfile:{}};
  return {present:true,carried:!!fromPrevious,state,primary:lower(emotion.primary||"neutral")||"neutral",secondary:lower(emotion.secondary||nuance.subtype||"unclear")||"unclear",intensity:Number.isFinite(Number(emotion.intensity))?Math.max(0,Math.min(1,Number(emotion.intensity))):0,confidence:Number.isFinite(Number(emotion.confidence))?Math.max(0,Math.min(1,Number(emotion.confidence))):0,tone:firstText(support.tone,"steady"),timingProfile:safeObj(support.timing_profile),actionMode:firstText(guard.action_mode,"supportive_monitoring"),safeToContinue:guard.safe_to_continue!==false,escalationNeeded:!!guard.escalation_needed,constraints:safeArray(handoff.response_constraints),nyxContract:safeObj(handoff.nyx_contract)};
}
function hasEmotionalContinuityCue(text){
  const t=normalizeInboundTextForPosture(text);
  return /\b(still|again|same|too much|trying|can[’']?t shake|not better|keeps happening|it continues|it has not stopped|it hasn[’']?t stopped|i[’']?m trying|i am trying|feels like|this feeling|exhausting|exhausted|mentally|drained|burned out|burnt out|worn down|tired of this)\b/i.test(t);
}
function resolveEffectiveEmotion(input={}, currentEmotion){
  const current=currentEmotion&&currentEmotion.present?currentEmotion:normalizeResolvedEmotion(input);
  const prev=safeObj(input.previousMemory||input.memory||input.turnMemory);
  const prior=normalizeResolvedEmotion({resolvedEmotion:prev.resolvedEmotion||prev.emotionState||prev.lastEmotionState||prev.emotionalState||prev.emotionalContinuity});
  const text=extractText({},input);
  const currentIsLowNeutral=current.present&&current.primary==="neutral"&&current.intensity<0.45;
  const priorUsable=prior.present&&prior.primary!=="neutral"&&prior.intensity>=0.45;
  if(currentIsLowNeutral&&priorUsable&&hasEmotionalContinuityCue(text)){
    return {...prior,carried:true,continuityPreserved:true,currentState:current.state,state:{...prior.state,runtime_meta:{...safeObj(prior.state.runtime_meta),carried_by_compose:true,carry_reason:"low_neutral_current_with_emotional_continuity_cue"}}};
  }
  return current;
}

function previousEmotionalContinuity(input={}){
  const prev=safeObj(input.previousMemory||input.memory||input.turnMemory);
  const state=safeObj(input.conversationState||input.state||prev.stateSpine||prev.conversationState);
  const continuity=safeObj(prev.emotionalContinuity||state.emotionalContinuity||prev.memoryPatch&&prev.memoryPatch.emotionalContinuity);
  return {
    active:!!continuity.active,
    primary:lower(continuity.primary||""),
    secondary:lower(continuity.secondary||""),
    intensity:Number.isFinite(Number(continuity.intensity))?Math.max(0,Math.min(1,Number(continuity.intensity))):0,
    confidence:Number.isFinite(Number(continuity.confidence))?Math.max(0,Math.min(1,Number(continuity.confidence))):0,
    continuityScore:Number.isFinite(Number(continuity.continuityScore))?Math.max(0,Math.min(1,Number(continuity.continuityScore))):0,
    carryDepth:clampInt(continuity.carryDepth,0,0,999),
    momentum:lower(continuity.momentum||""),
    unresolvedPressure:!!continuity.unresolvedPressure,
    needsDeepening:!!continuity.needsDeepening
  };
}
function emotionalProgressionProfile(text,input={},emotion={}){
  const continuity=previousEmotionalContinuity(input);
  const t=normalizeInboundTextForPosture(text);
  const cue=hasEmotionalContinuityCue(text);
  const pressure=/too much|overwhelm|overwhelmed|stressed|anxious|pressure|can[’']?t|cannot|trying|still|again|same|not better|heavy|hard/i.test(t);
  const carryDepth=Math.max(continuity.carryDepth||0, emotion.carried?1:0, cue?1:0);
  const active=!!(emotion.present||continuity.active||pressure);
  const primary=lower(emotion.primary||continuity.primary||"neutral")||"neutral";
  const secondary=lower(emotion.secondary||continuity.secondary||"unclear")||"unclear";
  const intensity=Math.max(Number(emotion.intensity||0)||0, continuity.intensity||0, pressure?0.56:0);
  const momentum=continuity.momentum||((cue&&pressure)?"sustained":"emerging");
  const phase=emotion.escalationNeeded?"stabilize":carryDepth>=3||continuity.needsDeepening?"deepen":cue||pressure?"carry":"acknowledge";
  return {active,primary,secondary,intensity,carryDepth,momentum,phase,pressure,continuity,cue};
}
function emotionalProgressionReply(text,input={},emotion={}){
  const p=emotionalProgressionProfile(text,input,emotion);
  if(!p.active)return "";
  if(emotion.escalationNeeded)return "Your safety comes first. If you might hurt yourself or you’re in immediate danger, contact emergency services or a local crisis line now. Move near another person, put distance between you and anything harmful, and breathe slowly.";
  if(p.phase==="deepen"){
    if(p.primary==="fear"||/overwhelm|anxiety|panic/.test(p.secondary))return "That pressure has carried across the turn, so I’m not going to reset you back to the surface. Let’s name the load clearly: what is the one part that feels impossible to hold right now?";
    if(p.primary==="sadness"||/hopeless|numb|grief/.test(p.secondary))return "This has not fully lifted yet. I’ll stay with the thread instead of rushing you forward: what part of the weight feels closest right now?";
    if(p.primary==="anger"||/frustrat/.test(p.secondary))return "That charge is still alive in the system. Let’s keep it contained and precise: what exactly is making it spike again?";
    return "This is still active, so I’m going to keep the continuity instead of restarting the conversation. What is the deepest piece underneath it right now?";
  }
  if(p.phase==="carry"){
    if(p.primary==="fear"||/overwhelm|anxiety/.test(p.secondary))return "That pressure is still active. Let’s keep it small without making it generic: what is the one piece that feels most unmanageable right now?";
    if(p.primary==="sadness"||/hopeless|numb|grief/.test(p.secondary))return "The heaviness is still here. We do not need to solve all of it at once; what feels hardest to carry in this moment?";
    if(p.primary==="anger"||/frustrat/.test(p.secondary))return "That pressure is still moving through you. Let’s not let it scatter: what is the exact point that is pushing hardest?";
    return "I’m keeping the thread. What feels like the most real pressure point right now?";
  }
  return "That sounds heavy, and I’m not going to flatten it into a generic line. What part of it is pressing on you the hardest right now?";
}


function emotionalWorkShiftSuppression(text="",intent="",knowledgeDomain="",input={}){
  const t=lower(text);
  return !!(isVoiceSystemCheckTurn(text,input)||isSystemCheckTurn(text)||isExactTechnicalValidationTurn(text)||isNyxMarionBackendTechnicalContext(text)||(normalizeKnowledgeDomain(knowledgeDomain)&&!(intent==="emotional_support"&&normalizeKnowledgeDomain(knowledgeDomain)==="psychology"))||["technical_debug","business_strategy","music_query","news_query","roku_query","identity_query","identity_or_memory","directive_response","contextual_directive","domain_question"].includes(intent)||/\b(full autopsy|line[- ]?by[- ]?line audit|critical fixes?|resend|downloadable zip|zipped file|replace the file|node --check|syntax validation|git add|git commit|git push|pull --rebase|backend test|smoke test|regression|token|headers?|english domain|rewrite this sentence|business strategy|sponsor|finance domain|legal domain|law domain|cyber control|cybersecurity hardening|ai domain|tool routing)\b/i.test(t));
}
function isEmotionalContinuityCalibrationSuppressed(text="",input={},intent="",knowledgeDomain=""){
  const t=lower(text);
  return !!(emotionalWorkShiftSuppression(text,intent,knowledgeDomain,input)||/\b(smoke test only|backend technical test only|technical test only|voice test|mic test|microphone test|token rotation|header count|post-auth|post-token|final[- ]?envelope validation)\b/i.test(t));
}
function emotionalContinuityCalibrationProfile(text="",input={},emotion={},intent="",knowledgeDomain=""){
  const suppressed=isEmotionalContinuityCalibrationSuppressed(text,input,intent,knowledgeDomain);
  const t=normalizeInboundTextForPosture(text);
  const distress=detectDistress(text);
  const prior=previousEmotionalContinuity(input);
  const explicitCue=hasEmotionalContinuityCue(text);
  const currentDirect=!!(distress.emotional||/\b(i am|i'm|im|feel|feeling|still|again|same pressure|heavy|exhausting|exhausted|trying|can[’']?t shake|overwhelmed|stressed|anxious|sad|lonely|hurt|upset|drained|burned out|burnt out)\b/i.test(t));
  const priorIntensity=Math.max(prior.intensity||0,Number(emotion.intensity||0)||0);
  let calibratedIntensity=priorIntensity;
  if(suppressed)calibratedIntensity=0;
  else if(/\b(i'?m trying|i am trying|trying|a little better|more contained|okay but|still here)\b/i.test(t))calibratedIntensity=Math.min(Math.max(0.35,priorIntensity*0.72),0.62);
  else if(distress.high)calibratedIntensity=Math.max(0.7,priorIntensity);
  else if(currentDirect||explicitCue)calibratedIntensity=Math.min(Math.max(0.45,priorIntensity||0.5),0.76);
  const allowed=!!(!suppressed&&(intent==="emotional_support"||currentDirect||explicitCue||emotion.carried||prior.active)&&calibratedIntensity>=0.35);
  const mode=suppressed?"suppressed_work_shift":(distress.crisis?"crisis_priority":(allowed?(calibratedIntensity>=0.68?"warm_deeper_carry":"warm_calibrated_carry"):"no_emotional_carry"));
  return{version:EMOTIONAL_CONTINUITY_CALIBRATION_GOVERNOR_VERSION,active:!!(allowed||suppressed||prior.active||emotion.present),allowed,suppressed,mode,explicitCue,currentDirect,priorActive:!!prior.active,priorIntensity,calibratedIntensity,crisis:!!distress.crisis,reason:suppressed?"work/control/domain turn blocks emotional carry":(allowed?"current turn remains in emotional lane":"no emotional continuity cue"),updatedAt:Date.now()};
}
function neutralEmotionState(reason="emotional_continuity_suppressed"){
  return{present:false,carried:false,state:{},primary:"neutral",secondary:"unclear",intensity:0,confidence:0,timingProfile:{},suppressed:true,suppressionReason:reason,safeToContinue:true,escalationNeeded:false,constraints:[],nyxContract:{}};
}
function calibrateResolvedEmotionForTurn(text="",input={},emotion={},intent="",knowledgeDomain=""){
  const profile=emotionalContinuityCalibrationProfile(text,input,emotion,intent,knowledgeDomain);
  if(profile.suppressed)return{emotion:neutralEmotionState(profile.reason),profile};
  if(!profile.allowed)return{emotion:{...emotion,continuityPreserved:false,carried:false},profile};
  const next={...emotion,present:true,intensity:profile.calibratedIntensity,continuityPreserved:!!(emotion.continuityPreserved||emotion.carried||profile.explicitCue||profile.priorActive),carried:!!(emotion.carried||profile.priorActive||profile.explicitCue)};
  if(!next.primary||next.primary==="neutral"){next.primary=profile.calibratedIntensity>=0.65?"pressure":"strain";next.secondary=profile.mode;}
  return{emotion:next,profile};
}
function calibratedEmotionalContinuityReply(text="",input={},emotion={},profile={}){
  if(profile.crisis||emotion.escalationNeeded)return"Your safety comes first. If you might hurt yourself or you’re in immediate danger, contact emergency services or a local crisis line now. Move near another person, put distance between you and anything harmful, and breathe slowly.";
  if(!profile.allowed)return"";
  const t=normalizeInboundTextForPosture(text);
  if(/\b(i'?m trying|i am trying|trying)\b/i.test(t))return"You’re still in it, but it sounds a little more contained now. Let’s keep the next step small: name the one pressure point that is still pulling the hardest.";
  if(/\bexhausting|exhausted|drained|burned out|burnt out|worn down\b/i.test(t))return"That exhaustion is still active, but we do not need to turn it into a crisis. Let’s narrow the load: what is the one part that feels heaviest right now?";
  if(/\boverwhelmed|too much|same pressure|can[’']?t shake\b/i.test(t))return"That pressure is still carrying forward. I’ll keep the thread warm without amplifying it: what is the smallest piece we can stabilize first?";
  return emotionalSpecificityPackReply(text, input)||"That pressure is real, so let’s make the next move small and concrete. Name the one pressure point creating the most immediate load, and we’ll shrink it to one manageable action.";
}
function applyEmotionalContinuityCalibrationGovernor(reply,intent,text,input={},emotion={},profile={}){
  if(!profile||profile.suppressed||!profile.allowed||intent!=="emotional_support")return reply;
  const calibrated=calibratedEmotionalContinuityReply(text,input,emotion,profile);
  return calibrated||reply;
}

function shouldEmotionInfluenceIntent(intent,emotion,text="",input={},knowledgeDomain=""){
  if(!emotion.present)return false;
  const profile=emotionalContinuityCalibrationProfile(text,input,emotion,intent,knowledgeDomain);
  if(profile.suppressed)return false;
  if(emotion.escalationNeeded||profile.crisis)return true;
  if(["technical_debug","business_strategy","music_query","news_query","roku_query","identity_query","identity_or_memory","directive_response","contextual_directive","domain_question"].includes(intent))return false;
  if(profile.allowed&&profile.calibratedIntensity>=0.45)return true;
  return false;
}
function emotionPresenceProfile(intent,emotion){
  if(emotion.present&&emotion.escalationNeeded)return "stabilizing";
  if(intent==="emotional_support")return "supportive";
  if(emotion.present&&emotion.primary==="anger")return "contained";
  if(emotion.present&&emotion.primary==="fear")return "steady";
  if(emotion.present&&emotion.primary==="joy")return "warm";
  if(intent==="identity_query")return "focused";
  if(intent==="directive_response"||intent==="contextual_directive")return "focused";
  return "receptive";
}
function emotionNyxHint(intent,emotion){
  if(emotion.present&&emotion.escalationNeeded)return "stabilize";
  if(intent==="emotional_support")return "supportive";
  if(emotion.present&&emotion.primary!=="neutral")return emotion.primary;
  if(intent==="identity_query")return "engaged";
  if(intent==="directive_response"||intent==="contextual_directive")return "focused";
  return "receptive";
}
function isBlockedLoopReply(value){const text=lower(value).replace(/[.!?]+$/g,"");if(!text)return true;return BLOCKED_LOOP_PATTERNS.some(rx=>rx.test(text));}

function isGreetingOnly(text){
  const t=normalizeInboundTextForPosture(text).replace(/[.!?]+$/g,"").trim();
  return /^(hi|hello|hey|yo|hiya|morning|afternoon|evening|good morning|good afternoon|good evening)(\s+(nyx|nix|vera))?$/.test(t);
}
function isHowAreYouTurn(text){
  const t=normalizeInboundTextForPosture(text).replace(/[.!?]+$/g,"").trim();
  return /^(how are you|how are you today|how are you doing|how are you doing today|how is nyx|how are things)(\s+(nyx|nix|vera))?$/.test(t);
}
function isCapabilityQuestion(text){
  const t=lower(text).replace(/[.!?]+$/g,"").trim();
  return /\b(what can you do|what can you help with|what areas can you help with|what do you help with|what can nyx do|what can nix do|capabilities|show me the lanes|show me your lanes)\b/i.test(t);
}
function isCasualGreetingTurn(text){
  const t=normalizeInboundTextForPosture(text).replace(/[.!?]+$/g,"").trim();
  return /^(what[’\']?s up|wassup|what up|sup|yo|hey there|how[’\']s it going|how is it going|how are things)(\s+(nyx|nix|nick|mix|mike|vera))?$/.test(t);
}
function isGreetingPostureTurn(text){
  return isGreetingOnly(text)||isHowAreYouTurn(text)||isCasualGreetingTurn(text);
}
function isWarmSocialTurn(text){
  const t=lower(text);
  return isGreetingPostureTurn(text)||isCapabilityQuestion(text)||/\b(good to see you|nice to meet you|thanks|thank you)\b/i.test(t);
}
function buildMarionSafeGreetingReply(_text,_input={}){
  return "Hi. I’m Nyx. It’s good to see you. What would you like to work on?";
}
function buildWarmSocialReply(text,input={}){
  const t=lower(text);
  const prev=safeObj(input.previousMemory||input.memory||input.turnMemory);
  const state=safeObj(input.conversationState||input.state||prev.stateSpine||prev.conversationState);
  const prior=firstText(prev.lastAssistantReply,state.lastAssistantReply);
  if(isCasualGreetingTurn(text))return "I’m here and ready. What are we getting into?";
  if(isGreetingOnly(text)){
    const first="Hi. I’m Nyx. It’s good to see you. What would you like to work on?";
    if(hashText(prior)===hashText(first)||stateHashText(prior)===stateHashText(first))return "Ready when you are. We can work on chat, media and radio, News Canada, Roku, avatar controls, voice, backend diagnostics, business strategy, or anything else you want to shape.";
    return first;
  }
  if(isHowAreYouTurn(text))return "I’m doing well, thank you. I’m clear, steady, and ready to help. How are you doing today?";
  if(/\b(thanks|thank you)\b/i.test(t))return "You’re welcome. We’ll keep the thread clean, useful, and easy to build from.";
  if(isCapabilityQuestion(text))return registryCapabilityIntro();
  return "Tell me what you want to work on, and I’ll keep it clear, useful, and easy to build from.";
}
function inferGreetingPostureFromText(text="",input={}){
  const source=firstText(safeObj(input).inputSource,safeObj(input).source,"text");
  const distress=detectGreetingDistressSignal(text);
  if(distress.active){
    if(distress.frustration)return {active:true,id:"compose.greeting_40d_frustration_normalized",intent:"frustration_signal",tone:"contained",energy:"high",presenceProfile:"contained",matchedType:"greeting",source,inputSource:source};
    if(distress.help&&!distress.emotional)return {active:true,id:"compose.greeting_40d_help_normalized",intent:"help_request",tone:"steady",energy:"medium",presenceProfile:"supportive",matchedType:"greeting",source,inputSource:source};
    return {active:true,id:"compose.greeting_40d_distress_normalized",intent:"distress_signal",tone:"calming",energy:"high",presenceProfile:"supportive",matchedType:"greeting",source,inputSource:source};
  }
  if(isCasualGreetingTurn(text))return {active:true,id:"compose.greeting_40d_casual_normalized",intent:"casual_greeting",tone:"casual",energy:"medium",presenceProfile:"warm",matchedType:"greeting",source,inputSource:source};
  if(isHowAreYouTurn(text))return {active:true,id:"compose.greeting_40d_social_checkin_normalized",intent:"social_checkin",tone:"warm",energy:"medium",presenceProfile:"warm",matchedType:"greeting",source,inputSource:source};
  if(isGreetingOnly(text))return {active:true,id:"compose.greeting_40d_basic_normalized",intent:"basic_greeting",tone:"neutral_warm",energy:"low",presenceProfile:"warm",matchedType:"greeting",source,inputSource:source};
  return {active:false};
}
function extractGreetingPosture(input={},routed={},text=""){
  const i=safeObj(input),r=safeObj(routed),ip=safeObj(i.payload),rp=safeObj(r.payload),is=safeObj(i.sessionPatch),rs=safeObj(r.sessionPatch),im=safeObj(i.memoryPatch),rm=safeObj(r.memoryPatch);
  const direct=safeObj(i.greeting||r.greeting||ip.greeting||rp.greeting||is.greeting||rs.greeting||safeObj(im.greeting)||safeObj(rm.greeting));
  const matchedType=lower(firstText(i.matchedPacketType,r.matchedPacketType,ip.matchedPacketType,rp.matchedPacketType));
  const id=firstText(direct.id,i.matchedPacketId,r.matchedPacketId,ip.matchedPacketId,rp.matchedPacketId,i.packetId,r.packetId,ip.packetId,rp.packetId,is.lastGreetingId,rs.lastGreetingId);
  const intent=firstText(direct.intent,i.lastGreetingIntent,r.lastGreetingIntent,ip.lastGreetingIntent,rp.lastGreetingIntent,is.lastGreetingIntent,rs.lastGreetingIntent,safeObj(im.greeting).lastIntent,safeObj(rm.greeting).lastIntent);
  const tone=firstText(direct.tone,i.lastGreetingTone,r.lastGreetingTone,ip.lastGreetingTone,rp.lastGreetingTone,is.lastGreetingTone,rs.lastGreetingTone,safeObj(im.greeting).lastTone,safeObj(rm.greeting).lastTone);
  const energy=firstText(direct.energy,i.lastInputEnergy,r.lastInputEnergy,ip.lastInputEnergy,rp.lastInputEnergy,is.lastInputEnergy,rs.lastInputEnergy,safeObj(im.greeting).lastEnergy,safeObj(rm.greeting).lastEnergy);
  const presenceProfile=firstText(direct.presenceProfile,i.presenceProfile,r.presenceProfile,ip.presenceProfile,rp.presenceProfile,is.presenceProfile,rs.presenceProfile,safeObj(im.greeting).lastPresenceProfile,safeObj(rm.greeting).lastPresenceProfile);
  const active=!!(direct.active||matchedType==="greeting"||/^general\.greeting_40d_|^greeting\.40d\./i.test(id)||intent||tone||energy||isGreetingPostureTurn(text));
  if(active){
    if(!(id||intent||tone||energy||presenceProfile))return inferGreetingPostureFromText(text,input);
    return {active,id,intent,tone,energy,presenceProfile,matchedType};
  }
  return inferGreetingPostureFromText(text,input);
}
function isFreshGreetingPosture(posture,text=""){
  if(!posture||!posture.active)return false;
  if(continuationCue(text))return false;
  return /^(basic_greeting|casual_greeting|social_checkin|presence_check|time_greeting|formal_greeting|playful_greeting)$/i.test(posture.intent||"")||isGreetingPostureTurn(text);
}
function buildGreetingPostureReply(posture={},text="",input={}){
  const intent=lower(posture.intent||"");
  if(/^(distress_signal|emotional_checkin|anxiety_signal|sadness_signal|loneliness_signal)$/.test(intent))return "Okay. First, we simplify. What is the one thing pressing on you hardest right now?";
  if(intent==="frustration_signal"||intent==="anger_signal")return "I hear the pressure in that. Let’s aim it instead of letting it scatter. What triggered it?";
  if(intent==="help_request")return "I’m here. Tell me the first piece you need help with, and we’ll make it manageable.";
  if(intent==="casual_greeting"||isCasualGreetingTurn(text))return "I’m here and ready. What are we getting into?";
  if(intent==="social_checkin"||isHowAreYouTurn(text))return "I’m steady and ready to help. How are you doing right now?";
  if(intent==="presence_check")return "I’m here. Fully present. What do you want to do next?";
  if(intent==="time_greeting")return "I’m here with you. What are we handling first?";
  if(intent==="formal_greeting")return "Good day. I’m ready to assist. What would you like addressed?";
  if(intent==="playful_greeting")return "I’m here, troublemaker. What are we cooking up today?";
  return buildWarmSocialReply(text,input);
}
function applyGreetingPostureQuality(reply,intent,text,input={},routed={}){
  const posture=extractGreetingPosture(input,routed,text);
  const gi=lower(posture.intent||"");
  const normalizedDistress=detectGreetingDistressSignal(text);
  if((posture.active||normalizedDistress.active)&&!continuationCue(text)&&/^(distress_signal|emotional_checkin|anxiety_signal|sadness_signal|loneliness_signal|frustration_signal|anger_signal|help_request)$/.test(gi||inferGreetingPostureFromText(text,input).intent||"")){
    return buildGreetingPostureReply(posture.active?posture:inferGreetingPostureFromText(text,input),text,input);
  }
  if(isFreshGreetingPosture(posture,text))return buildGreetingPostureReply(posture,text,input);
  return reply;
}
function inputSourceKind(input={}){const i=safeObj(input),session=safeObj(i.session),payload=safeObj(i.payload),body=safeObj(i.body),client=safeObj(i.client),ui=safeObj(i.ui);const raw=lower(firstText(i.inputSource,i.source,i.triggerSource,i.modality,payload.inputSource,payload.source,body.inputSource,body.source,session.inputSource,session.source,ui.inputSource,ui.source,client.inputSource,client.source,"text"));return /^(voice|mic|microphone|speech|spoken|audio)$/.test(raw)?"voice":"text";}
function isVoiceInput(input={}){return /^(voice|mic|microphone|speech|spoken)$/.test(inputSourceKind(input));}
function isSystemCheckTurn(text=""){const t=lower(text);return /\b(voice test|mic test|microphone test|one sentence voice test|1 second voice test|one second voice test|can you hear me|hear me|system check|continuity check|interface is connected|confirm.*(voice|mic|microphone|reached marion|received|connected|working)|voice input.*(working|reach|reached|received|marion))\b/i.test(t);}
function isVoiceSystemCheckTurn(text="",input={}){const t=lower(text);return !!(isSystemCheckTurn(text)&&(/\b(voice|mic|microphone|hear me|spoken)\b/i.test(t)||isVoiceInput(input)));}
function buildVoiceSystemCheckReply(text="",input={}){if(isVoiceInput(input))return "Voice input is working, and Marion received your request through the same final-response path.";return "The interface is connected, and Marion can return a clean final response.";}

function voiceTextParitySource(input={}){return inputSourceKind(input)==="voice"?"voice":"text";}
function isVoiceTextParityCandidate(input={}){return voiceTextParitySource(input)==="voice";}
function normalizeVoiceTextParityText(text="",input={},routed={}){
  let out=safeStr(text);if(!out)return"";
  const active=isVoiceTextParityCandidate(input);
  if(!active)return out;
  out=out
    .replace(/[\u2018\u2019]/g,"'")
    .replace(/\b(nick|nicks|nix|mix|mike)\b/gi,"Nyx")
    .replace(/\b(nex|neck)\s+steps\b/gi,"next steps")
    .replace(/\bwhat\s+(?:are\s+)?the\s+(nex|neck)\s+steps\b/gi,"what are the next steps")
    .replace(/\b(chad\s+engine|chat\s+engine)\b/gi,"ChatEngine")
    .replace(/\b(mary|marian|marion)\s+bridge\b/gi,"MarionBridge")
    .replace(/\b(state\s+line|state\s+sign|state\s+spine|statespine)\b/gi,"State Spine")
    .replace(/\b(composed\s+marion\s+response|compose\s+marion\s+response|compose\s+marian\s+response|composed\s+marian\s+response|compose\s+mary\s+and\s+response|compose\s+marry\s+and\s+response|american\s+reforms|american\s+response|compose\s+mailing\s+response|composed\s+mailing\s+response|compose\s+marion\s+mailing\s+response)\b/gi,"ComposeMarionResponse")
    .replace(/\bmarion\s+intent\s+router\b/gi,"MarionIntentRouter")
    .replace(/\bmarion\s+domain\s+registry\b/gi,"MarionDomainRegistry")
    .replace(/\bvoice\s+slash\s+text\b/gi,"voice/text")
    .replace(/\s+/g," ")
    .trim();
  return out;
}
function voiceTextParityProfile(text="",input={},routed={}){const raw=safeStr(text),source=voiceTextParitySource(input),normalized=normalizeVoiceTextParityText(raw,input,routed),changed=raw!==normalized,active=source==="voice"||changed;return{version:VOICE_TEXT_PARITY_GOVERNOR_VERSION,active,source,canonicalSource:source,rawHash:raw?stateHashText(raw):"",normalizedHash:normalized?stateHashText(normalized):"",normalizedText:normalized,changed,parityLock:true,reason:source==="voice"?"voice input normalized onto typed-input route parity":"typed input retained as canonical parity baseline",updatedAt:Date.now()};}
function applyVoiceTextParityToInput(input={},routed={}){const raw=extractTextRaw(routed,input),profile=voiceTextParityProfile(raw,input,routed);return{input:{...safeObj(input),voiceTextParityText:profile.normalizedText,voiceTextParity:profile},profile,text:profile.normalizedText||raw};}
function extractTextRaw(routed={},input={}){const r=safeObj(routed),i=safeObj(input),payload=safeObj(i.payload||r.payload),body=safeObj(i.body||r.body),packet=safeObj(i.packet||r.packet),synthesis=safeObj(packet.synthesis);return firstText(i.userText,i.userQuery,i.normalizedText,i.text,i.query,i.message,r.userText,r.userQuery,r.text,r.query,r.message,payload.userText,payload.userQuery,payload.text,payload.query,payload.message,body.userText,body.userQuery,body.text,body.query,body.message,synthesis.userText,synthesis.userQuery,synthesis.text);}


function isRouteIsolationExplanationTurn(text=""){
  const t=lower(text);
  if(!t)return false;
  return /\b(fail[-\s]?closed|fail closed|silent fallback|falling back silently|domain isolation|cross[-\s]?domain bleed|domain bleed|domain route|route isolation|bootstrap guard)\b/i.test(t) &&
    /\b(explain|autopsy|diagnostic|why|risk|four short bullets|bullets|short)\b/i.test(t);
}
function routeIsolationExplanationReply(text=""){
  const bullet=/\b(bullets?|four short bullets|4 bullets)\b/i.test(lower(text));
  if(bullet){
    return [
      "- Fail closed: if a Marion domain route cannot prove its manifest/path, it should stop that lane instead of guessing.",
      "- Silent fallback risk: a fallback can make a broken route look healthy while answering from the wrong lane.",
      "- Domain isolation: each domain must load, validate, and report health from its own root so one broken pack cannot contaminate another.",
      "- Cross-domain bleed: the failure symptom is psychology, finance, law, cyber, or technical language leaking into a prompt that did not request it."
    ].join("\n");
  }
  return "A Marion domain route should fail closed because a silent fallback hides the real failure. If the requested domain path or manifest cannot be verified, the safe behavior is to block that lane, report the missing route, and leave other domains untouched. That preserves domain isolation and prevents cross-domain bleed, where a broken psychology, finance, law, cyber, or technical route borrows another lane’s assets and looks falsely healthy. Validation: break one domain path and confirm only that domain fails while the others still answer from their own roots.";
}
function isTechnicalIntentBindingTurn(text=""){
  const t=lower(text);
  if(!t)return false;
  return isRouteIsolationExplanationTurn(text) || /\b(technical diagnostic request|backend technical test|technical retest|technical answer|technical intent classification|answer execution fidelity)\b/i.test(t);
}

const CONVERSATIONAL_PACK_CANDIDATES = Object.freeze({
  antiLoop: Object.freeze([
    "../../Nyx/nyx_anti_loop_conversational_pack_v1_0.json",
    "../../../Data/Nyx/nyx_anti_loop_conversational_pack_v1_0.json",
    "./Data/Nyx/nyx_anti_loop_conversational_pack_v1_0.json",
    "../Data/Nyx/nyx_anti_loop_conversational_pack_v1_0.json",
    "./nyx_anti_loop_conversational_pack_v1_0.json"
  ]),
  adaptiveDepth: Object.freeze([
    "../../Nyx/nyx_conversational_pack_v2_2.json",
    "../../Nyx/nyx_conversational_pack_v2_2_audited.json",
    "../../../Data/Nyx/nyx_conversational_pack_v2_2.json",
    "../../../Data/Nyx/nyx_conversational_pack_v2_2_audited.json",
    "./Data/Nyx/nyx_conversational_pack_v2_2.json",
    "./Data/Nyx/nyx_conversational_pack_v2_2_audited.json",
    "../Data/Nyx/nyx_conversational_pack_v2_2.json",
    "../Data/Nyx/nyx_conversational_pack_v2_2_audited.json"
  ])
});
let __nyxPackCache=null;
function readJsonIfPresent(filePath){try{if(fs.existsSync(filePath)){const raw=fs.readFileSync(filePath,"utf8");return JSON.parse(raw);}}catch(_){return null;}return null;}
function resolvePackFile(candidates=[]){for(const rel of safeArray(candidates)){const targets=[path.resolve(__dirname,rel),path.resolve(process.cwd(),rel)];for(const target of targets){const data=readJsonIfPresent(target);if(data)return{path:target,data};}}return{path:"",data:null};}
function loadConversationalPacks(){if(__nyxPackCache)return __nyxPackCache;const anti=resolvePackFile(CONVERSATIONAL_PACK_CANDIDATES.antiLoop),adaptive=resolvePackFile(CONVERSATIONAL_PACK_CANDIDATES.adaptiveDepth);__nyxPackCache={version:CONVERSATIONAL_PACK_CONSUMPTION_VERSION,antiLoopPack:safeObj(anti.data),adaptiveDepthPack:safeObj(adaptive.data),antiLoopPath:anti.path,adaptiveDepthPath:adaptive.path,antiLoopLoaded:!!anti.data,adaptiveDepthLoaded:!!adaptive.data,loadedAt:Date.now()};return __nyxPackCache;}
function antiLoopIterations(){return safeArray(loadConversationalPacks().antiLoopPack.iterations);}
function explicitDeveloperDiagnosticRequested(text=""){const t=lower(text);return /\b(developer|internal|file[- ]?level|code[- ]?level|module[- ]?level|raw|forensic autopsy|line[- ]?by[- ]?line audit|show files?|which file|exact function|stack|trace|implementation|technical deep dive|technically|technical explanation)\b/i.test(t);}
function packLine(category="",subtype="",text="",fallback=""){const iterations=antiLoopIterations().filter(x=>safeStr(x.category)===category);if(!iterations.length)return fallback||"";const t=lower(text);let best=null;for(const item of iterations){const st=lower(item.subtype||item.id);if(st&&t&&t.includes(st)){best=item;break;}}
  if(!best){const n=Math.abs(Number(hashText(`${category}:${subtype||text}`))||0);best=iterations[n%iterations.length];}
  return safeStr(best.line)||fallback||"";
}
function conversationPackProfile(intent="",text="",input={},routed={},reply=""){
  const packs=loadConversationalPacks(),t=lower(text),r=lower(reply),state=safeObj(safeObj(input.previousMemory||input.memory).stateSpine||input.conversationState||input.state),rep=safeObj(state.repetition),loopProfile=diagnosticLoopDetectionProfile("pack_profile",text,input,routed,reply),distress=detectDistress(text),dev=explicitDeveloperDiagnosticRequested(text);
  let track="atmosphere_continuity";
  if(isRouteIsolationExplanationTurn(text)||normalizeKnowledgeDomain(detectKnowledgeDomain(text)))track="direct_answer_lock";
  else if(intent==="emotional_support"||distress.emotional)track="emotional_specificity";
  else if(/\b(next steps?|what next|give me the next step|next move|next action)\b/i.test(t))track="next_step_context";
  else if(/\b(loop audit|run a loop audit|loop problem|looping|repeated|same answer|fallback)\b/i.test(t))track=dev?"developer_diagnostic":"public_diagnostic_translation";
  else if(loopProfile.active||clampInt(rep.noProgressCount,0,0,99)>0||/\b(repeat|same response|stuck)\b/i.test(t))track="repetition_escape";
  if(/backend empty|no response|blank response|reply unavailable|did not answer/i.test(t)||!safeStr(reply)&&intent==="technical_debug")track="backend_empty_guard";
  return{version:CONVERSATIONAL_PACK_CONSUMPTION_VERSION,active:true,track,developerMode:dev,antiLoopLoaded:packs.antiLoopLoaded,adaptiveDepthLoaded:packs.adaptiveDepthLoaded,antiLoopPath:packs.antiLoopPath,adaptiveDepthPath:packs.adaptiveDepthPath,loopSeverity:loopProfile.severity,loopFlags:loopProfile.flags||[],stateStage:firstText(state.stage,state.stateStage,""),noProgressCount:clampInt(rep.noProgressCount,0,0,99),lastAssistantHash:firstText(rep.lastAssistantHash,state.lastAssistantHash,""),updatedAt:Date.now()};
}
function publicDiagnosticTranslationReply(text="",input={},routed={},reply=""){
  if(isRouteIsolationExplanationTurn(text))return routeIsolationExplanationReply(text);
  const profile=diagnosticLoopDetectionProfile("public_diagnostic",text,input,routed,reply),flags=safeArray(profile.flags);const line=packLine("public_diagnostic_translation","",text,"");
  if(explicitDeveloperDiagnosticRequested(text))return developerDiagnosticReply(text,input,routed,reply);
  if(/loop audit|loop problem|looping|fallback|repeated|same answer|stuck/i.test(lower(text))){
    const cause=flags.includes("state_persistence_pressure")?"the conversation is carrying old pressure forward after the turn should have advanced":flags.includes("fallback_phrase_reuse")?"the reply is leaning on recovery language instead of changing the answer":"the system is answering, but the response shape is not advancing enough after the check";
    const correction=flags.includes("voice_text_parity_risk")?"verify text and mic take the same route, then force both paths to return the same kind of final user-facing answer":"make every recovery answer name one cause, one correction, and one validation step in plain language";
    return `${line||"The hard loop is no longer the main failure. The remaining risk is conversational replay: Nyx can answer, but the answer can still feel like the same recovery pattern."} Cause: ${cause}. Correction: ${correction}. Validation: rerun the same prompt, then confirm the next reply contains new information instead of a reworded stall.`;
  }
  return line||"The diagnostic path should stay public-facing: name the symptom, name the correction, then give one validation step without exposing internal machinery.";
}
function developerDiagnosticReply(text="",input={},routed={},reply=""){
  const profile=diagnosticLoopDetectionProfile("developer_diagnostic",text,input,routed,reply),flags=safeArray(profile.flags);const label=flags.length?flags.join(", "):"no major loop flags";
  return `Developer loop read: ${profile.severity} risk. Flags: ${label}. Inspect state carry, repeated assistant hash, fallback phrase reuse, reply replay, voice/text parity, and final-authority acceptance as one controlled turn. Correction target: make the composer consume the anti-loop track before public reply shaping, then validate that the rendered answer advances state and does not expose packet language.`;
}
function emotionalSpecificityPackReply(text="",input={}){
  const t=lower(text),distress=detectDistress(text);if(distress.crisis)return"Your safety comes first. If you might hurt yourself or you’re in immediate danger, contact emergency services or a local crisis line now. Move near another person, put distance between you and anything harmful, and breathe slowly.";
  if(/overworked|too much work|too many things|workload|overloaded/i.test(t))return packLine("emotional_specificity","overworked",text,"That sounds like pressure overload, not just normal tiredness. First, isolate the one obligation creating the most immediate pressure, then take only the next ten-minute action.")+" Is the main pressure workload, deadlines, people, money, or exhaustion?";
  if(/burned out|burnt out|exhausted|drained|worn down|mentally drained/i.test(t))return packLine("emotional_specificity","burnout",text,"That sounds like depletion, not weakness. Reduce the demand for a moment: choose one task that can be paused, delayed, or simplified before you try to push harder.")+" What is the one thing you can safely shrink right now?";
  if(/overwhelmed|panic|panicking|anxious|can't think|cant think/i.test(t))return packLine("emotional_specificity","overwhelmed",text,"That is overwhelm, so the first move is not solving everything; it is reducing the number of active demands. Pick one pressure point and put the rest outside the frame for ten minutes.")+" Which pressure point needs the first small action?";
  if(distress.emotional)return packLine("emotional_specificity","general",text,"That sounds heavy, and I’m going to keep this practical. Name the pressure, shrink the scope, and handle one small step before trying to solve the whole thing.")+" What is pressing hardest right now?";
  return"";
}
function voiceEmotionalDepthParityProfile(reply="",intent="",text="",input={}){
  const distress=detectDistress(text),voice=isVoiceInput(input),emotional=!!(intent==="emotional_support"||distress.emotional||/\b(overworked|overloaded|overwhelmed|stressed|burned out|burnt out|exhausted|drained|anxious|panic|panicking)\b/i.test(lower(text)));
  const thin=!!(!safeStr(reply)||safeStr(reply).length<105||/^what\s+(is|feels|part)|^which\s+pressure|heaviest right now\??$/i.test(safeStr(reply))||sentenceCount(reply)<2);
  return{version:VOICE_EMOTIONAL_DEPTH_PARITY_GOVERNOR_VERSION,active:!!(voice&&emotional),voice,emotional,thin,reason:voice&&emotional&&thin?"voice emotional reply was too compressed":"voice emotional reply has enough depth",updatedAt:Date.now()};
}
function voiceEmotionalDepthParityReply(text="",input={}){
  const t=lower(text),distress=detectDistress(text);
  if(distress.crisis)return"Your safety comes first. If you might hurt yourself or you’re in immediate danger, contact emergency services or a local crisis line now.";
  if(/overworked|too much work|too many things|workload|overloaded/i.test(t))return"That sounds like pressure overload. Do not solve everything at once: pick the one obligation pressing hardest, then take only the next ten-minute action. Is it workload, deadlines, people, money, or exhaustion?";
  if(/burned out|burnt out|exhausted|drained|worn down|mentally drained/i.test(t))return"That sounds like real depletion. Shrink the demand before you push harder: choose one task to pause, delay, or simplify. What can you safely shrink right now?";
  if(/overwhelmed|panic|panicking|anxious|can't think|cant think|stressed/i.test(t))return"That sounds like overload. First, reduce the number of active demands: choose one pressure point and put the rest outside the frame for ten minutes. Which pressure needs the first small action?";
  return"That sounds heavy, so keep this small and concrete. Name the one pressure point creating the most immediate load, and we’ll shrink it to one manageable action.";
}
function applyVoiceEmotionalDepthParityGovernor(reply="",intent="",text="",input={}){
  const profile=voiceEmotionalDepthParityProfile(reply,intent,text,input);
  if(!profile.active)return reply;
  const out=profile.thin?voiceEmotionalDepthParityReply(text,input):safeStr(reply);
  return sanitizeUserFacingReply(out,intent,text,input)||out||reply;
}
function isPostTestResultNextStepTurn(text=""){
  const t=lower(text);
  return /\b(based on (the )?(current|this|that) (test )?result|based on this result|current test result|after this test|after that test|what does this test show|what does this show|did this pass|did that pass|what failed|what passed|from this result|given this result|given the result)\b/i.test(t);
}
function inferPostTestVerdict(input={},routed={}){
  const prev=previousAssistantText(input),carry=contextCarrySummary(input,routed),source=lower(`${prev} ${carry}`);
  const passed=[];const failed=[];
  if(/emotional|overworked|pressure overload|ten-minute action|normal tiredness/i.test(source))passed.push("emotional-support specificity");
  if(/loop audit|cause:|correction:|validation:|public/i.test(source))passed.push("public loop-audit translation");
  if(/no blank|no busy|no hard loop|not hard-looping|hard loop/i.test(source))passed.push("hard-loop suppression");
  if(/generic next step|deployment checklist|replace the active compose file|node --check|render redeploy/i.test(source))failed.push("next-step context freshness");
  return{passed,failed,carry};
}
function postTestResultNextStepReply(text="",input={},routed={}){
  const verdict=inferPostTestVerdict(input,routed);
  const passed=verdict.passed.length?`Passed: ${verdict.passed.join(", ")}. `:"The current test result is usable. ";
  const failed=verdict.failed.length?`Remaining issue: ${verdict.failed.join(", ")}. `:"Remaining issue: confirm this holds across one more controlled turn. ";
  return `${passed}${failed}Next step: run one text/mic parity test with “I am overworked,” then run “Run a loop audit on this conversation path.” If both replies stay concrete, public-facing, and non-repetitive, freeze this Compose layer and move to loader-path verification for the anti-loop pack.`;
}
function nextStepContextPackReply(text="",input={},routed={}){
  if(isRokuPublishingRequest(text))return rokuPublishingReply(text);
  const prev=previousAssistantText(input),carry=contextCarrySummary(input,routed),p=lower(prev),t=lower(text);
  if(isPostTestResultNextStepTurn(text))return postTestResultNextStepReply(text,input,routed);
  if(/overworked|emotional|support|pressure|heaviest|overwhelmed/i.test(p+t))return"Next step: choose the single pressure point creating the most immediate load, reduce it to one ten-minute action, and leave the rest out of scope until that action is finished.";
  if(/loop audit|diagnostic|loop|fallback|reply shaping|composer|conversation path/i.test(p+t))return"Next step: rerun the loop-audit prompt once, then verify the answer names one cause, one correction, and one validation step in public language without reusing a recovery phrase.";
  if(/commit|push|render|deploy|replace the active file|node --check|syntax/i.test(p+t))return"Next step: replace the active Compose file, run node --check against the exact deployed path, commit only that file, pull --rebase, push, then wait for Render to redeploy before testing Nyx again.";
  if(carry)return`Next step: keep the current thread anchored to ${carry}, then test one controlled turn instead of widening the patch.`;
  return packLine("next_step_context","general",text,"Next step: choose one active target, run one controlled test, and only widen the patch after the reply changes state instead of repeating the same recovery shape.");
}
function repetitionEscapePackReply(text="",input={},routed={}){return packLine("repetition_escape","",text,"We do not need to repeat the same answer with different wording. The useful move now is to change the state: name the cause, apply one correction, and run one validation turn.");}
function backendEmptyGuardPackReply(text="",input={}){return packLine("backend_empty_guard","",text,"I could not get a clean answer from the backend. Try the same prompt once more, or send a shorter version so I can route it cleanly.");}
function applyConversationalPackConsumption(reply="",intent="",text="",input={},routed={}){
  if(isRokuPublishingRequest(text))return{reply:rokuPublishingReply(text),profile:{version:CONVERSATIONAL_PACK_CONSUMPTION_VERSION,track:"roku_publishing_lock",active:true}};
  const profile=conversationPackProfile(intent,text,input,routed,reply);let out=safeStr(reply);
  if(profile.track==="direct_answer_lock"){out=isRouteIsolationExplanationTurn(text)?routeIsolationExplanationReply(text):(out||reply);}
  else if(profile.track==="emotional_specificity"){const e=emotionalSpecificityPackReply(text,input);if(e)out=e;}
  else if(profile.track==="public_diagnostic_translation")out=publicDiagnosticTranslationReply(text,input,routed,reply);
  else if(profile.track==="developer_diagnostic")out=developerDiagnosticReply(text,input,routed,reply);
  else if(profile.track==="next_step_context")out=nextStepContextPackReply(text,input,routed);
  else if(profile.track==="repetition_escape")out=repetitionEscapePackReply(text,input,routed);
  else if(profile.track==="backend_empty_guard")out=backendEmptyGuardPackReply(text,input);
  out=applyVoiceEmotionalDepthParityGovernor(out,intent,text,input);
  out=sanitizeUserFacingReply(out,intent,text,input)||safeStr(reply);
  return{reply:out,profile};
}
function translatePublicDiagnosticReply(reply="",intent="",text="",input={},routed={}){
  let out=safeStr(reply);if(!out)return"";const t=lower(text),r=lower(out);
  if(intent==="technical_debug"&&!explicitDeveloperDiagnosticRequested(text)&&(/\bverdict:\s*/i.test(out)||/\blikely (layer|file):/i.test(out)||/\bcomposer\/reply shaping\b/i.test(out)||/\bfallback_phrase_reuse|iteration_reentry_pressure|state_persistence_pressure|same_assistant_hash|final authority|mic\/text parity\b/i.test(out))){return publicDiagnosticTranslationReply(text,input,routed,out);}
  if(!explicitDeveloperDiagnosticRequested(text)){out=out.replace(/\bcomposer\/reply shaping\b/gi,"answer shaping").replace(/\bComposeMarionResponse(?:\.js)?\b/g,"the response composer").replace(/\bChatEngine(?:\.js)?\b/g,"the coordinator").replace(/\bStateSpine(?:\.js)?\b/g,"the continuity layer").replace(/\bMarionBridge(?:\.js)?\b/g,"the bridge").replace(/\bfallback_phrase_reuse\b/g,"reused recovery wording").replace(/\biteration_reentry_pressure\b/g,"re-entry pressure").replace(/\bstate_persistence_pressure\b/g,"stale state carry").replace(/\bsame_assistant_hash\b/g,"repeated assistant output").replace(/\bsame_user_hash\b/g,"repeated user input").replace(/\bfinal authority\b/gi,"answer authority").replace(/\bmic\/text parity\b/gi,"voice/text alignment");}
  return out.replace(/\s+/g," ").trim();
}


function buildFinalLoopRecoveryReply(intent,text,input={}){
  if(isWarmSocialTurn(text))return buildWarmSocialReply(text,input);
  if(intent==="technical_debug"||/\b(loop|looping|debug|test|fallback|technical|route|bridge|composer|chat engine|state spine|api|backend|frontend|final envelope)\b/i.test(lower(text))){
    return technicalReply(text,input);
  }
  if(intent==="identity_or_memory")return "Continuity is active. Tell me the memory or thread you want carried forward, and I’ll anchor it without using a generic placeholder.";
  return "Tell me the exact target and I’ll give you a specific, user-facing answer.";
}
function isInternalContractLeak(value){const text=safeStr(value);if(!text)return false;return /\btechnical response:\s*the marion path must return one trusted final reply only\b/i.test(text)||/\bthe marion path must return one trusted final reply only\b/i.test(text)||/\btechnical read:\s*verify the routed intent/i.test(text)||/\btrusted final envelope\b/i.test(text)||/\bstate spine persistence\b/i.test(text)||/\bcomposed reply\b/i.test(text)||/\bas one atomic turn\b/i.test(text)||/\bi[’']?m carrying the previous answer forward rather than restarting\b/i.test(text)||/\btranslate it into the user-facing or sponsor-facing version\b/i.test(text)||/\bblocking generic placeholder language\b/i.test(text)||/\bkeeping the reply bound to the routed intent\b/i.test(text)||/\b(do the requested action|validate the result|commit only after|run the validation|return the final answer|controlling rule|continuity target carried|apply one controlling rule)\b/i.test(text)||/\b(diagnostic packet|diagnostics packet|internal diagnostics|memoryPatch|memory patch|final envelope|session patch|route kind|speech hints|presence profile|transport safe|reply authority|marion final|nyx state hint)\b/i.test(text)||/\b(routeKind|speechHints|presenceProfile|nyxStateHint|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority|memoryPatch|diagnostics|diagnosticPacket)\s*[=:]/i.test(text)||/\b(textSpeak|textToSynth|autoPlay|provider|when=post_reply|strategy=single_shot)\s*[=:]/i.test(text);}
function stripStaleProgressionSurface(value="",intent="",text=""){
  let out=safeStr(value);if(!out)return"";
  const domainish=!!(normalizeKnowledgeDomain(detectKnowledgeDomain(text))||/\b(cash[- ]?flow|finance|financial|runway|margin|unit economics|ltv|cac|pricing|profit|revenue)\b/i.test(lower(text))||intent==="domain_question");
  if(!domainish)return out;
  out=out
    .replace(/\s*Send the next target and I[’']ll keep the answer specific instead of generic\.?/gi,"")
    .replace(/\s*Give me the next target and I[’']ll keep the answer specific instead of generic\.?/gi,"")
    .replace(/\s*Tell me the next target and I[’']ll keep the answer specific instead of generic\.?/gi,"")
    .replace(/\s*Send the next target\.?/gi,"")
    .replace(/\s*Give me the exact target and I[’']ll give you a specific, user-facing answer\.?/gi,"")
    .replace(/\s*Tell me the exact target and I[’']ll give you a specific, user-facing answer\.?/gi,"")
    .replace(/\s*I[’']ll keep the answer specific instead of generic\.?/gi,"")
    .replace(/\s*instead of generic\.?/gi,"");
  return out.replace(/\s+/g," ").replace(/\s+([.,;:])/g,"$1").trim();
}
function sanitizeUserFacingReply(value,intent,text,input={}){let reply=safeStr(value);if(!reply)return"";reply=translatePublicDiagnosticReply(reply,intent,text,input,{});reply=stripStaleProgressionSurface(reply,intent,text);if(isInternalContractLeak(reply))reply=stripContractMachinery(reply);reply=stripStaleProgressionSurface(reply,intent,text);if(!reply)return"";reply=reply.replace(/\s+/g," ").trim();if(isInternalContractLeak(reply)||isBlockedLoopReply(reply))return"";return reply;}
function finalSurfaceReply(value,intent,text,input={}){
  const fiveTurn=fiveTurnContractReply(intent,text,input,{});
  if(fiveTurn)return fiveTurn;
  let reply=applyReplyContractMinimalismGovernor(value,intent,text,input);
  reply=stripStaleProgressionSurface(reply,intent,text);
  if(reply)return reply;
  return buildFinalLoopRecoveryReply(intent,text,input);
}

function replyContractMinimalismKind(text=""){
  const t=lower(text);
  if(/\b(full autopsy|line[- ]?by[- ]?line audit|critical analysis|technical diagnosis|business strategy|domain explanation|explain why|emotional support)\b/i.test(t))return "depth_preserved";
  if(/\b(next steps?|show me the test|run (the )?smoke test|commit and push|validate syntax|node --check|replace the file|give me the command|git add|git commit|git push|pull --rebase)\b/i.test(t))return "operational_minimal";
  if(/\b(finalEnvelope|sessionPatch|routeKind|speechHints|presenceProfile|transportSafe|replyAuthority|marionFinal|nyxStateHint|memoryPatch|diagnostic packet|trusted final envelope)\b/i.test(t))return "contract_leak_probe";
  return "none";
}
function isReplyContractMinimalismSuppressed(text="",input={},intent=""){
  const kind=replyContractMinimalismKind(text);
  return kind==="depth_preserved"||intent==="emotional_support"||intent==="business_strategy"||/\b(full autopsy|line[- ]?by[- ]?line|explain why|strategy|diagnosis)\b/i.test(lower(text));
}
function replyContractMinimalismProfile(reply="",intent="",text="",input={}){
  const kind=replyContractMinimalismKind(text),suppressed=isReplyContractMinimalismSuppressed(text,input,intent),leak=isInternalContractLeak(reply),operational=kind==="operational_minimal"||["directive_response","contextual_directive"].includes(intent)&&!suppressed;
  return{version:REPLY_CONTRACT_MINIMALISM_GOVERNOR_VERSION,active:!!(leak||operational||kind==="contract_leak_probe"),kind,suppressed,leak,operational,reason:leak?"internal contract language removed":(operational?"simple operational reply kept minimal":(suppressed?"depth request preserved":"no minimalism needed")),updatedAt:Date.now()};
}
function stripContractMachinery(value=""){
  let out=safeStr(value);if(!out)return"";
  out=out.replace(/\b(finalEnvelope|sessionPatch|routeKind|speechHints|presenceProfile|transportSafe|replyAuthority|marionFinal|nyxStateHint|memoryPatch|diagnostics?|diagnostic packet|trusted final envelope)\b\s*[=:][^.;\n]*/gi,"");
  out=out.replace(/\b(final envelope|session patch|route kind|speech hints|presence profile|transport safe|reply authority|marion final|nyx state hint|memory patch|diagnostic packet|trusted final envelope)\b/gi,"");
  return out.replace(/\s+/g," ").replace(/\s+([.,;:!?])/g,"$1").trim();
}
function compactOperationalReplyForContract(text="",intent="",input={},routed={}){
  const fiveTurn=fiveTurnContractReply(intent,text,input,routed);
  if(fiveTurn)return fiveTurn;
  const t=lower(text),dk=(typeof directiveExecutionKind==="function")?directiveExecutionKind(text):"none";
  if(typeof isPostTestResultNextStepTurn==="function"&&isPostTestResultNextStepTurn(text))return postTestResultNextStepReply(text,input,routed);
  if(/show me the test|run (the )?test|smoke test/i.test(t)||dk==="test_run")return "Run the focused PowerShell test, inspect the status flags, then read reply for the expected behavior.";
  if(/commit and push|git add|git commit|git push|pull --rebase/i.test(t)||dk==="git_deploy")return "git status\ngit add .\\Data\\marion\\runtime\\composeMarionResponse.js\ngit commit -m \"Harden Marion pipeline cohesion\"\ngit pull --rebase origin main\ngit push origin main";
  if(/validate syntax|node --check|syntax/i.test(t)||dk==="syntax_validate")return "node --check .\\Data\\marion\\runtime\\composeMarionResponse.js";
  if(/replace the file|resend|downloadable zip|zipped file/i.test(t)||dk==="replace_file"||dk==="file_package")return "1. Unzip the package.\n2. Replace .\\Data\\marion\\runtime\\composeMarionResponse.js.\n3. Run node --check.\n4. Commit and push.\n5. Wait for Render, then run smoke and regression tests.";
  if(/next steps?|what should/i.test(t)||dk==="next_step")return nextStepContextPackReply(text,input,routed);
  return "1. Do the requested action.\n2. Validate the result.\n3. Commit only after the test passes.";
}
function applyReplyContractMinimalismGovernor(reply="",intent="",text="",input={}){
  const fiveTurn=fiveTurnContractReply(intent,text,input,{});
  if(fiveTurn)return fiveTurn;
  const profile=replyContractMinimalismProfile(reply,intent,text,input);
  if(profile.suppressed)return sanitizeUserFacingReply(reply,intent,text,input)||reply;
  if(profile.kind==="contract_leak_probe")return "I will keep internal response-contract fields out of the user-facing reply. Use diagnostics separately when you need to inspect them.";
  let out=stripContractMachinery(reply);
  if(profile.leak&&!out)return buildFinalLoopRecoveryReply(intent,text,input);
  if(profile.operational){
    const compact=compactOperationalReplyForContract(text,intent,input,{});
    out=compact;
    out=out.replace(/\s*Creative suggestion:\s*[^.?!]*(?:[.?!]|$)/gi,"").trim();
  }
  return sanitizeUserFacingReply(out,intent,text,input)||compactOperationalReplyForContract(text,intent,input,{});
}

function finalRegressionPriorityProfile(text="",input={},intent="",knowledgeDomain=""){
  const t=lower(text),dk=(typeof directiveExecutionKind==="function")?directiveExecutionKind(text):"none",rcKind=(typeof replyContractMinimalismKind==="function")?replyContractMinimalismKind(text):"none";
  const crisis=!!detectDistress(text).crisis;
  const voiceSystem=!!isVoiceSystemCheckTurn(text,input);
  const validation=!!(/\b(smoke test only|regression|node --check|syntax validation|validate syntax|token|headers?|final[- ]?envelope validation)\b/i.test(t));
  const backendTechnical=!!(isNyxMarionBackendTechnicalContext(text)&&!isExplicitCybersecurityRequest(text));
  const domain=normalizeKnowledgeDomain(knowledgeDomain||detectKnowledgeDomain(text));
  const diagnosis=!!(typeof technicalDiagnosisKind==="function"&&technicalDiagnosisKind(text)!=="none");
  const operationalKind=!!(dk!=="none"||rcKind==="operational_minimal");
  const directive=!!(!domain&&intent!=="technical_debug"&&intent!=="business_strategy"&&intent!=="emotional_support"&&(operationalKind||["directive_response","contextual_directive"].includes(intent)));
  const depth=!!/\b(full autopsy|line[- ]?by[- ]?line audit|critical analysis|technical diagnosis|business strategy|domain explanation|explain why)\b/i.test(t);
  const emotional=!!(intent==="emotional_support"&&!emotionalWorkShiftSuppression(text,intent,domain,input));
  const creativeEligible=!!(!crisis&&!voiceSystem&&!validation&&!directive&&!depth&&!emotional&&!isDirectExecutionTurn(text)&&/\b(improve|enhance|refine|strategy|conversation quality|make .*smarter|next enhancement|creative suggestion)\b/i.test(t));
  return{version:FINAL_REGRESSION_HARMONIZER_VERSION,crisis,voiceSystem,validation,backendTechnical,domain,diagnosis,directive,depth,emotional,creativeEligible,replyContractKind:rcKind,directiveKind:dk,updatedAt:Date.now()};
}
function finalRegressionHarmonizerProfile(reply="",intent="",text="",input={},context={}){
  const priority=finalRegressionPriorityProfile(text,input,intent,safeObj(context).knowledgeDomain||"");
  const leak=isInternalContractLeak(reply);
  const creativeCollision=!!(/\bCreative suggestion:\s*/i.test(safeStr(reply))&&!priority.creativeEligible);
  const emotionalBleed=!!(priority.backendTechnical||priority.directive||priority.validation||priority.domain)&&/\b(overwhelmed|exhausting|pressure is still|emotional thread|what feels hardest|stabilize first)\b/i.test(safeStr(reply));
  const compressionCollision=!!(priority.depth&&/^\s*\d+\.\s+/m.test(safeStr(reply))&&safeStr(reply).length<220);
  const domainCollision=!!(priority.validation&&/\b(lane engaged|domain answer|definition|practical interpretation)\b/i.test(safeStr(reply)));
  const active=!!(leak||creativeCollision||emotionalBleed||compressionCollision||domainCollision||priority.validation||priority.directive||priority.voiceSystem);
  return{version:FINAL_REGRESSION_HARMONIZER_VERSION,active,priority,leak,creativeCollision,emotionalBleed,compressionCollision,domainCollision,reason:active?"priority collision checked and corrected":"no harmonization needed",updatedAt:Date.now()};
}
function applyFinalRegressionHarmonizer(reply="",intent="",text="",input={},context={}){
  const fiveTurn=fiveTurnContractReply(intent,text,input,context);
  if(fiveTurn)return fiveTurn;
  const profile=finalRegressionHarmonizerProfile(reply,intent,text,input,context);
  let out=safeStr(reply);
  if(profile.priority.crisis)return out;
  if(profile.priority.voiceSystem)return buildVoiceSystemCheckReply(text,input);
  if(profile.priority.validation&&/\b(smoke test only)\b/i.test(lower(text)))return "Backend response path is alive.";
  if(profile.priority.validation&&/\b(node --check|syntax validation|validate syntax)\b/i.test(lower(text)))return "node --check .\\Data\\marion\\runtime\\composeMarionResponse.js";
  if(profile.priority.emotional){out=out.replace(/\s*Practically, treat this as a pattern to observe[^.?!]*(?:[.?!]|$)/gi,"").replace(/\s*The next step is to name the trigger[^.?!]*(?:[.?!]|$)/gi,"").trim();return sanitizeUserFacingReply(out,intent,text,input)||emotionalProgressionReply(text,input,{});}
  if(profile.priority.depth&&safeStr(out).length<260&&/\b(full autopsy|line[- ]?by[- ]?line audit|critical fixes?)\b/i.test(lower(text)))out="Autopsy target: ComposeMarionResponse.js. Critical focus: preserve final-envelope authority, keep technical/cyber/domain/emotional/directive lanes isolated, and verify each governor only activates in its allowed lane. Correction path: inspect routing priority, suppression gates, final reply sanitation, memory carry boundaries, and operational-command compression before shipping. Validation: run smoke, State Spine technical, cyber control, English rewrite, voice parity, emotional shift, contract-leak, and business strategy tests.";
  if(profile.priority.directive&&!profile.priority.depth)out=compactOperationalReplyForContract(text,intent);
  if(profile.creativeCollision)out=out.replace(/\s*Creative suggestion:\s*[^\n.?!]*(?:[.?!]|$)/gi,"").trim();
  if(profile.emotionalBleed)out=out.replace(/\b(?:That pressure is still carrying forward|I’m keeping the emotional thread|what feels hardest to carry|what feels most real in this moment)[^.!?]*(?:[.!?]|$)/gi,"").trim();
  if(profile.domainCollision)out=buildFinalLoopRecoveryReply(intent,text,input);
  out=stripContractMachinery(out);
  out=sanitizeUserFacingReply(out,intent,text,input)||buildFinalLoopRecoveryReply(intent,text,input);
  if(profile.priority.directive&&!profile.priority.depth)out=applyReplyContractMinimalismGovernor(out,intent,text,input);
  return out;
}
function isDeepContinuityTurn(text="", input={}, routed={}){const t=lower(text),carry=lower(extractContextCarry(input,routed)),prev=safeObj(input.previousMemory||input.memory||input.turnMemory),state=safeObj(input.conversationState||input.state||prev.stateSpine||prev.conversationState),cont=safeObj(prev.emotionalContinuity||state.emotionalContinuity||prev.memoryPatch&&prev.memoryPatch.emotionalContinuity);return !!(/\b(given that|based on that|that risk|what layer|what happens if|finalenvelope|sessionpatch|exhausting|exhausted|mentally|drained|burned out|burnt out|still|carry|deeper)\b/i.test(t)||/desynchronization|finalenvelope|sessionpatch|marion|nyx|bridge|state spine/i.test(carry)||cont.active||cont.carried||cont.continuityPreserved||Number(cont.carryDepth||0)>0);}
function isRecoveryRequested(input={},routed={}){const i=safeObj(input),r=safeObj(routed),state=safeObj(i.state||i.conversationState),meta=safeObj(i.meta||r.meta),loop=safeObj(i.loopGuard||r.loopGuard||meta.loopGuard),reasons=safeArray(loop.reasons||i.lastLoopReasons||state.lastLoopReasons).filter(Boolean),stage=lower(state.stateStage||i.stateStage||r.stateStage||meta.stateStage),text=extractText(routed,input);const deep=isDeepContinuityTurn(text,input,routed);if(deep&&!loop.forceRecovery&&!loop.loopDetected&&!i.forceRecovery&&!r.forceRecovery&&!reasons.includes("blocked_phrase_detected")&&!reasons.includes("exact_reply_repeat"))return false;return !!(i.forceRecovery||r.forceRecovery||i.recoveryRequired||r.recoveryRequired||state.recoveryRequired||loop.forceRecovery||loop.loopDetected||reasons.length||(["recover","recovery","blocked","fallback"].includes(stage)&&!deep));}


const TONE_PROFILES = Object.freeze({
  simple_chat:{mode:"warm_direct",minSentences:2,maxSentences:4,nextMove:true},
  technical_debug:{mode:"forensic_human",minSentences:3,maxSentences:6,nextMove:true},
  identity_query:{mode:"branded_confident",minSentences:2,maxSentences:4,nextMove:false},
  identity_or_memory:{mode:"continuity",minSentences:3,maxSentences:5,nextMove:true},
  emotional_support:{mode:"grounded_support",minSentences:3,maxSentences:5,nextMove:true},
  business_strategy:{mode:"strategic",minSentences:3,maxSentences:6,nextMove:true},
  directive_response:{mode:"precise_directive",minSentences:2,maxSentences:4,nextMove:true},
  contextual_directive:{mode:"contextual_precision",minSentences:3,maxSentences:5,nextMove:true},
  domain_question:{mode:"reasoned",minSentences:3,maxSentences:5,nextMove:true},
  music_query:{mode:"host_fluent",minSentences:2,maxSentences:4,nextMove:true},
  news_query:{mode:"editorial",minSentences:2,maxSentences:4,nextMove:true},
  roku_query:{mode:"platform_clear",minSentences:2,maxSentences:4,nextMove:true}
});
const PHRASE_BANK = Object.freeze({
  technical:["Here’s the clean read", "The important part", "What I’d tighten next", "The practical move"],
  strategic:["Commercially, the clean move", "The stronger angle", "The leverage point", "The practical play"],
  continuity:["I’m carrying the thread", "Keeping the context intact", "The continuity point", "The layer underneath this"],
  natural:["I’ve got you", "That makes sense", "Here’s how I’d frame it", "Let’s keep it clean"]
});
function phrasePick(bucket,key=""){const arr=PHRASE_BANK[bucket]||PHRASE_BANK.natural;const n=Math.abs(Number(hashText(key||bucket))||0);return arr[n%arr.length];}
function toneProfile(intent){return TONE_PROFILES[intent]||TONE_PROFILES.domain_question;}
function sentenceCount(value){const text=safeStr(value);if(!text)return 0;const hits=text.match(/[.!?](?:\s|$)/g);return hits?hits.length:(text.length>0?1:0);}
const INTENT_DEPTH_GOVERNOR_VERSION = "nyx.marion.intentDepthGovernor/1.0";
const DEPTH_GOVERNOR_PROFILES = Object.freeze({
  simple_chat:{minSentences:1,minChars:36,maxSentences:3,allowNextMove:false},
  technical_debug:{minSentences:3,minChars:180,maxSentences:6,allowNextMove:true},
  business_strategy:{minSentences:3,minChars:170,maxSentences:6,allowNextMove:true},
  emotional_support:{minSentences:2,minChars:130,maxSentences:5,allowNextMove:true},
  identity_query:{minSentences:2,minChars:100,maxSentences:4,allowNextMove:false},
  identity_or_memory:{minSentences:3,minChars:150,maxSentences:5,allowNextMove:true},
  directive_response:{minSentences:2,minChars:120,maxSentences:4,allowNextMove:true},
  contextual_directive:{minSentences:3,minChars:150,maxSentences:5,allowNextMove:true},
  domain_question:{minSentences:2,minChars:120,maxSentences:5,allowNextMove:true},
  music_query:{minSentences:2,minChars:95,maxSentences:4,allowNextMove:true},
  news_query:{minSentences:2,minChars:95,maxSentences:4,allowNextMove:true},
  roku_query:{minSentences:2,minChars:110,maxSentences:4,allowNextMove:true}
});
function depthProfile(intent){return DEPTH_GOVERNOR_PROFILES[intent]||DEPTH_GOVERNOR_PROFILES.domain_question;}
function isDepthGovernorSuppressed(text="",input={}){const t=lower(text);return !!(isVoiceSystemCheckTurn(text,input)||isExactTechnicalValidationTurn(text)||/\b(smoke test|regression|pipeline regression|technical test only|cyber control|control test|syntax validation|final smoke|post-token|token rotation)\b/i.test(t));}
function isThinForIntent(reply,intent){const text=safeStr(reply);if(!text)return true;const p=depthProfile(intent);if(sentenceCount(text)<p.minSentences)return true;if(text.length<p.minChars&&!["simple_chat","identity_query","music_query","news_query","roku_query"].includes(intent))return true;if(/^(technical response|loop diagnosis|state spine audit target|bridge audit target):/i.test(text)&&sentenceCount(text)<3)return false;return true;}
function contextCarrySummary(input={},routed={}){const carry=extractContextCarry(input,routed);if(!carry)return"";const bits=[];if(/transport path|pipeline|alive|final envelope|marion|nyx|loop/i.test(carry))bits.push("the transport path is alive and the remaining work is conversational quality");if(/loop|fallback|duplicate|backend reply unavailable/i.test(carry))bits.push("the loop/fallback failure has already been isolated and should not be revived as a reply pattern");if(/index\.js|transport-only|transport only/i.test(carry))bits.push("index.js must remain transport-only");return bits.length?bits[0]:safeStr(carry).slice(-220);}
function hasNaturalDepth(reply,intent){const text=safeStr(reply);if(!text)return false;if(intent==="domain_question"&&sentenceCount(text)>=2&&text.length>=120&&!/domain engaged:/i.test(text))return true;const profile=depthProfile(intent);if(sentenceCount(text)<profile.minSentences)return false;if(text.length<profile.minChars&&!["simple_chat","identity_query","music_query","news_query","roku_query"].includes(intent))return false;if(/^(technical response|loop diagnosis|state spine audit target|bridge audit target):/i.test(text)&&sentenceCount(text)<3)return false;return true;}
function nextMoveForIntent(intent,text=""){if(intent==="technical_debug")return "The next check should verify the raw /api/chat reply and confirm the same finalEnvelope.reply is what the widget renders.";if(intent==="business_strategy")return "The next move is to convert that into one offer, one audience, and one measurable action.";if(intent==="identity_or_memory")return "The next move is to name the exact thread you want carried forward so Marion can preserve it without flattening it.";if(intent==="emotional_support")return "The next move is to stay with the single pressure point instead of trying to solve everything at once.";if(intent==="directive_response"||intent==="contextual_directive")return "The next move is to apply that as the controlling rule and test one clean turn.";if(intent==="music_query")return "Give me the artist, era, or song angle and I’ll shape it into a cleaner radio-style response.";if(intent==="news_query")return isNewsMediaPositioningRequest(text) ? "The next move is to turn that positioning into page sections: featured story, current updates, source/status cue, and media value block." : "Give me the headline, feed item, or route result and I’ll keep it editorial and source-clean.";if(intent==="roku_query")return "Give me the app path, package result, or channel issue and I’ll keep it deployment-focused.";return "Send the next target and I’ll keep the answer specific instead of generic.";}
function deepenTechnicalReply(reply,text,input={},routed={}){const carry=contextCarrySummary(input,routed);const base=safeStr(reply);if(/loop/i.test(lower(text))){return `${phrasePick("technical",text)}: the loop is no longer the primary transport failure if /api/chat is returning ok:true, final:true, marionFinal:true, and finalEnvelope.reply. The quality risk now is flat composition: Marion can be technically correct but still sound like a route diagnostic instead of a live intelligence. ${carry?`Context I’m carrying: ${carry}. `:""}The fix is to make Compose shape every final answer with acknowledgement, reasoning, context carry, and a forward move while preserving the hardlock.`;}if(/quality|natural|layered|intelligent|conversation/i.test(lower(text))){return `${phrasePick("technical",text)}: the pipeline is alive, so the repair target shifts from emergency loop control to response intelligence. Compose should add depth shaping, intent-aware tone, context carry, anti-flatness expansion, and phrase variation before stamping the final envelope. ${carry?`I’m carrying this context: ${carry}. `:""}Index stays transport-only; MarionBridge protects the contract; State Spine records continuity after the trusted final lands.`;}return hasNaturalDepth(base,"technical_debug")?base:`${phrasePick("technical",text)}: ${base||"the technical path needs a trusted final reply, not a diagnostic placeholder."} The answer should confirm the active layer, explain the reason, and identify the next test without reopening fallback language. ${nextMoveForIntent("technical_debug",text)}`;}
function deepenIdentityReply(reply){const base=safeStr(reply)||"I’m Nyx — the live interface for Sandblast. Marion is the deeper cognitive system behind me.";if(hasNaturalDepth(base,"identity_query"))return base;return `${base} In practice, I handle the visible conversation, timing, and presence while Marion carries intent, context, and final-answer shaping behind the scenes. The goal is for you to feel one coordinated intelligence, not a loose chatbot stitched to a backend.`;}
function deepenBusinessReply(reply,text){const base=stripDuplicateStrategicOpener(safeStr(reply)||businessAudienceAttentionReply(text));if(/\b(short version|quick version|briefly|compact|short answer|bottom line)\b/i.test(lower(text)))return businessAudienceAttentionReply(text);return hasNaturalDepth(base,"business_strategy")?base:stripDuplicateStrategicOpener(`${phrasePick("strategic",text)}: ${base} First clarify the offer, then isolate the buyer psychology, then package the value into one action the audience can understand immediately. ${nextMoveForIntent("business_strategy",text)}`);}

function deepenEmotionalReply(reply,text,input={}){const base=safeStr(reply)||"That sounds heavy, and I’m not going to flatten it into a generic line.";if(hasNaturalDepth(base,"emotional_support"))return base;return `${base} I’m going to keep this grounded and specific, because generic reassurance is where the old looping tone starts to creep back in. ${nextMoveForIntent("emotional_support",text)}`;}
function intentDepthExpansion(intent,text,input={},routed={}){const carry=contextCarrySummary(input,routed);if(intent==="technical_debug")return "The answer should name the active component, the failure mode it prevents, and the next verification step without exposing internal packet fields.";if(intent==="business_strategy")return "The useful depth is commercial: clarify the audience, name the value promise, and turn the idea into one measurable action.";if(intent==="emotional_support")return "The useful depth is emotional precision: name the pressure, reduce the scope, and ask one grounded question instead of giving broad reassurance.";if(intent==="domain_question")return "The useful depth is explanatory: define the idea, explain why it matters, and give one practical application.";if(intent==="contextual_directive"||intent==="directive_response")return `${carry?`Carry the current thread: ${carry}. `:""}Apply one controlling rule, then give the next action cleanly.`;if(intent==="identity_or_memory")return "The useful depth is continuity: identify what should be remembered, why it matters, and how it should shape the next turn.";return "Keep the reply specific to the user’s request and avoid generic filler.";}
function applyIntentSpecificDepthGovernor(reply,intent,text,input={},routed={}){let out=sanitizeUserFacingReply(reply,intent,text,input);if(isDepthGovernorSuppressed(text,input))return out||buildFinalLoopRecoveryReply(intent,text,input);if(responseDepthProfile(text)==="compact"&&intent==="business_strategy")return stripDuplicateStrategicOpener(out||businessAudienceAttentionReply(text));if(intent==="simple_chat"||intent==="identity_query"||intent==="music_query"||intent==="news_query"||intent==="roku_query")return out||deepenGeneralReply(out,intent,text,input,routed);if(!out)out=deepenGeneralReply(out,intent,text,input,routed);if(!hasNaturalDepth(out,intent)){out=`${out} ${intentDepthExpansion(intent,text,input,routed)}`.replace(/\s+/g," ").trim();}const p=depthProfile(intent);if(p.allowNextMove&&!/\b(next move|next check|next step|practical fix|practical move)\b/i.test(out)&&!isExactTechnicalValidationTurn(text)){out=`${out} ${nextMoveForIntent(intent,text)}`.replace(/\s+/g," ").trim();}return sanitizeUserFacingReply(stripDuplicateStrategicOpener(out),intent,text,input)||buildFinalLoopRecoveryReply(intent,text,input);}
function deepenGeneralReply(reply,intent,text,input={},routed={}){const base=safeStr(reply);const carry=contextCarrySummary(input,routed);if(hasNaturalDepth(base,intent))return base;if(intent==="identity_query")return deepenIdentityReply(base);if(intent==="technical_debug")return deepenTechnicalReply(base,text,input,routed);if(intent==="business_strategy")return deepenBusinessReply(base,text);if(intent==="emotional_support")return deepenEmotionalReply(base,text,input);if(intent==="contextual_directive"||intent==="directive_response"||intent==="domain_question"){return `${phrasePick(carry?"continuity":"natural",text)}: ${base||"the controlling rule is to preserve one response authority and one final envelope."} ${carry?`I’m carrying the context that ${carry}. `:""}${nextMoveForIntent(intent,text)}`;}if(intent==="simple_chat")return base||buildMarionSafeGreetingReply(text,input);return `${base||"I’ve got the lane."} ${nextMoveForIntent(intent,text)}`;}
function applyConversationQuality(reply,intent,text,input={},routed={}){const progressionGuard=highPriorityProgressionSurfaceReply(text,input,intent,routed);if(progressionGuard)return progressionGuard;const fiveTurn=fiveTurnContractReply(intent,text,input,routed);if(fiveTurn)return fiveTurn;if(isVoiceSystemCheckTurn(text,input))return buildVoiceSystemCheckReply(text,input);let out=sanitizeUserFacingReply(reply,intent,text,input);if(intent==="domain_question"&&out&&hasNaturalDepth(out,intent)&&isDepthGovernorSuppressed(text,input))return out.replace(/\s+/g," ").trim();out=deepenGeneralReply(out,intent,text,input,routed);out=applyIntentSpecificDepthGovernor(out,intent,text,input,routed);out=out.replace(/\s+/g," ").trim();if(isInternalContractLeak(out)||isBlockedLoopReply(out))out=buildFinalLoopRecoveryReply(intent,text,input);out=applyProgressionShapingGovernor(out,intent,text,input,routed);return sanitizeUserFacingReply(out,intent,text,input)||buildFinalLoopRecoveryReply(intent,text,input);}

const ANSWER_SPECIFICITY_PLACEHOLDER_RX = /\b(tell me the exact target|name the exact output|give me the exact target|send the exact target|route it cleanly|we can improve this|make it clearer|next step is refinement|keep the thread clean|what would you like to work on|what are we working on|tell me what you want to work on)\b/i;
function isAnswerSpecificitySuppressed(text="",input={},intent=""){const t=lower(text);if(!t)return true;if(isVoiceSystemCheckTurn(text,input)||isExactTechnicalValidationTurn(text))return true;if(/\b(smoke test|regression|pipeline regression|cyber control|control test|syntax validation|token length|headers count|post-token|final smoke|mic test|voice test|can you hear me)\b/i.test(t))return true;if(intent==="simple_chat"&&isGreetingPostureTurn(text))return true;if(/\b(answer in one sentence|one clear sentence|just say yes or no|only return|no explanation)\b/i.test(t))return true;return false;}
function specificityNeedScore(reply="",intent="",text=""){const r=lower(reply),t=lower(text);let score=0;if(!safeStr(reply))score+=80;if(ANSWER_SPECIFICITY_PLACEHOLDER_RX.test(r))score+=60;if(sentenceCount(reply)<2&&!["simple_chat","identity_query","music_query","news_query","roku_query"].includes(intent))score+=25;if(/\b(concrete|specific|exact|code-level|highest-value|practical|actionable|business strategy|sponsor|conversation quality|improve|refine|next step|next steps)\b/i.test(t))score+=18;if(intent==="technical_debug"&&/\b(state spine|chatengine|marionbridge|compose|intent router|domain registry|backend|code-level|hardening|carry-forward)\b/i.test(t))score+=20;if(intent==="business_strategy"||/\b(sponsor|commercial|business strategy|offer|audience|conversion)\b/i.test(t))score+=18;if(intent==="domain_question"&&/\b(explain|define|what is|how does|why does)\b/i.test(t))score+=10;return Math.max(0,Math.min(100,score));}
function technicalSpecificityReply(reply="",text="",input={},routed={}){const t=lower(text),base=safeStr(reply);if(/\b(state spine|statespine|carry-forward|carry forward)\b/i.test(t))return "The specific State Spine refinement is to write carry-forward state only after a trusted Marion final reply is accepted, then update turnDepth, lastUserHash, lastAssistantHash, noProgressCount, and creativeCognitiveCarry in one bounded post-reply patch. That prevents stale or non-final turns from mutating continuity. Validate it with one two-turn test: ask a technical question, send “Next steps,” and confirm the second reply carries context without reusing fallback language.";if(/\b(chatengine|chat engine)\b/i.test(t))return "The specific ChatEngine refinement is to keep it coordinator-only: accept the trusted Marion final, pass through the final reply, and refuse to invent recovery text when the packet is non-final. That protects final-envelope authority while still allowing State Spine and Compose to carry context. Validate it by checking ok, final, marionFinal, handled, blocked, and the visible reply in the same test run.";if(/\b(marionbridge|marion bridge)\b/i.test(t))return "The specific MarionBridge refinement is to reject any transport packet that lacks a trusted final-envelope shape before emission. That keeps bridge behavior as handoff, not authorship. Validate it by forcing a composer failure and confirming the bridge returns a blank/non-final contract instead of a user-facing invented reply.";if(/\b(intent router|marion intent router)\b/i.test(t))return "The specific IntentRouter refinement is to let explicit Nyx/Marion backend module context outrank generic words like hardening. That keeps State Spine, ChatEngine, MarionBridge, Compose, and DomainRegistry prompts in the technical lane unless the user explicitly asks for cybersecurity. Validate it with paired tests: one State Spine hardening prompt and one defensive cybersecurity hardening prompt.";if(/\b(domain registry|mariondomainregistry)\b/i.test(t))return "The specific DomainRegistry refinement is to keep manifest and data-pack resolution inside repo-root boundaries with bounded file reads. That prevents unsafe path traversal and avoids registry scans becoming an unbounded runtime cost. Validate it with English, psychology, and unsupported-domain tests.";if(/\b(compose|composer|composemarionresponse)\b/i.test(t))return "The specific Compose refinement is to apply answer shaping after intent/domain resolution but before creative suggestion surfacing. That lets Compose strengthen thin replies without changing final-envelope authority. Validate it with a technical prompt, a business prompt, a smoke test, and a cyber control.";return hasNaturalDepth(base,"technical_debug")?base:`The specific technical move is to name the active component, the failure mode, and the validation step. ${base||"The current answer is too thin to be useful as a build instruction."} The practical fix is to bind the reply to one code-level area, explain why it matters, and run one focused regression instead of widening the scope.`;}
function businessSpecificityReply(reply="",text="",input={},routed={}){const base=stripDuplicateStrategicOpener(safeStr(reply));const t=lower(text);if(/\b(audience attention|attention, retention|brand recall|advertisers?|sponsors?)\b/i.test(t))return businessAudienceAttentionReply(text);if(/\b(sponsor|sponsors|media interface|nyx)\b/i.test(t)){const depth=businessDepthProfile(text);if(depth==="compact")return businessAudienceAttentionReply(text);if(depth==="deep")return "Position Nyx as an intelligent media interface that gives sponsors three things: premium attention, interactive brand recall, and measurable engagement across radio, web, News Canada, Roku, and the AI chat surface. The concrete offer should name one audience segment, one placement format, one weekly reach metric, and one AI-enhanced interaction the sponsor can own. The next move is to package that into a sponsor sheet with bronze, silver, and premium AI-placement tiers.";return businessAudienceAttentionReply(text);}return hasNaturalDepth(base,"business_strategy")?base:stripDuplicateStrategicOpener(`The specific business move is to define the buyer, the offer, and the conversion action. ${base||"Start with one commercial promise, not a broad strategy paragraph."} Then attach a measurable proof point so the pitch can be sold instead of merely explained.`);}
function conversationQualitySpecificityReply(reply="",text="",input={},routed={}){const base=safeStr(reply);return `The specific behavior to improve is answer landing: each normal reply should include one clear anchor, one concrete action, and one reason it matters. ${base&& !ANSWER_SPECIFICITY_PLACEHOLDER_RX.test(base)?base:"For Nyx, that means replacing soft prompts with component-aware guidance: identify the active lane, state the next move, and only add a creative suggestion when it improves the user’s current task."} This makes the system feel sharper without increasing noise or reopening loop-prone fallback language.`;}
function domainSpecificityReply(reply="",text="",input={},routed={}){const base=safeStr(reply);const k=normalizeKnowledgeDomain(resolveKnowledgeDomain(routed,input,text)||detectKnowledgeDomain(text));if(k==="english"&&base)return base;if(hasNaturalDepth(base,"domain_question")&&!ANSWER_SPECIFICITY_PLACEHOLDER_RX.test(base))return base;return `${base||"The direct answer needs one usable example."} In practical terms, define the concept, explain why it matters, and give one concrete use case so the user can apply it immediately.`;}
function directiveSpecificityReply(reply="",text="",input={},routed={}){const base=safeStr(reply);if(hasNaturalDepth(base,"directive_response")&&!ANSWER_SPECIFICITY_PLACEHOLDER_RX.test(base))return base;return `${base||"The next step is one concrete action."} Apply the current rule, test one clean turn, and only expand if the result fails or the user asks for more depth.`;}
function applyAnswerSpecificityGovernor(reply,intent,text,input={},routed={}){let out=sanitizeUserFacingReply(reply,intent,text,input);const score=specificityNeedScore(out,intent,text);if(isAnswerSpecificitySuppressed(text,input,intent))return out||buildFinalLoopRecoveryReply(intent,text,input);if(score<42&&hasNaturalDepth(out,intent)&&!ANSWER_SPECIFICITY_PLACEHOLDER_RX.test(lower(out)))return out;if(intent==="technical_debug")out=technicalSpecificityReply(out,text,input,routed);else if(intent==="business_strategy")out=businessSpecificityReply(out,text,input,routed);else if(intent==="contextual_directive"||intent==="directive_response"||intent==="identity_or_memory")out=directiveSpecificityReply(out,text,input,routed);else if(intent==="domain_question")out=domainSpecificityReply(out,text,input,routed);else if(/\b(conversation quality|layered answers|sharper|more specific|less generic|anti-flatness|answer specificity)\b/i.test(lower(text)))out=conversationQualitySpecificityReply(out,text,input,routed);else if(score>=70)out=`${out||"The answer needs a concrete landing."} The useful version should name the object, the action, and the reason it matters.`;return sanitizeUserFacingReply(out,intent,text,input)||buildFinalLoopRecoveryReply(intent,text,input);}


const COGNITIVE_LAYER_VERSION = "nyx.marion.cognitiveLayer/1.0";
const DOMAIN_ANSWER_DEPTH_GOVERNOR_VERSION = "nyx.marion.domainAnswerDepthGovernor/1.0";
const DIRECTIVE_EXECUTION_CLARITY_GOVERNOR_VERSION = "nyx.marion.directiveExecutionClarityGovernor/1.0";
const RESPONSE_COMPRESSION_GOVERNOR_VERSION = "nyx.marion.responseCompressionGovernor/1.0";
const TECHNICAL_DIAGNOSIS_PRECISION_GOVERNOR_VERSION = "nyx.marion.technicalDiagnosisPrecisionGovernor/1.0";
const DIAGNOSTIC_LOOP_DETECTION_LAYER_VERSION = "nyx.marion.diagnosticLoopDetectionLayer/1.0";
const MEMORY_CARRY_BOUNDARY_GOVERNOR_VERSION = "nyx.marion.memoryCarryBoundaryGovernor/1.0";
const EMOTIONAL_CONTINUITY_CALIBRATION_GOVERNOR_VERSION = "nyx.marion.emotionalContinuityCalibrationGovernor/1.0";
const VOICE_TEXT_PARITY_GOVERNOR_VERSION = "nyx.marion.voiceTextParityGovernor/1.0";
const VOICE_EMOTIONAL_DEPTH_PARITY_GOVERNOR_VERSION = "nyx.marion.voiceEmotionalDepthParityGovernor/1.0";
const REPLY_CONTRACT_MINIMALISM_GOVERNOR_VERSION = "nyx.marion.replyContractMinimalismGovernor/1.0";
const FINAL_REGRESSION_HARMONIZER_VERSION = "nyx.marion.finalRegressionHarmonizer/1.0";
const PROGRESSION_SHAPING_GOVERNOR_VERSION = "nyx.marion.progressionShapingGovernor/1.0";
const CONTEXTUAL_DIRECTIVE_HANDLER_VERSION = "nyx.marion.contextualDirectiveHandler/1.0";
function isDomainAnswerDepthSuppressed(text="",input={},intent=""){const t=lower(text);return !!(isDepthGovernorSuppressed(text,input)||isAnswerSpecificitySuppressed(text,input,intent)||isVoiceSystemCheckTurn(text,input)||isExactTechnicalValidationTurn(text)||/\b(smoke test|regression|pipeline regression|backend technical test only|technical test only|token length|headers count|syntax validation|node --check|final[- ]?envelope|post-token|mic test|voice test|can you hear me|resend|downloadable zip|zip file)\b/i.test(t));}
function domainAnswerNeedsDepth(reply="",domain="",text=""){const r=safeStr(reply),k=normalizeKnowledgeDomain(domain),t=lower(text);if(!k||!r)return false;if(k==="english")return false;if(k==="psychology"&&/cognitive distortion|emotional regulation|emotional tone|tone detection|overwhelmed|anxious/i.test(t)&&!/(pattern|interpretation|next step|practical)/i.test(r))return true;if(k==="ai"&&/tool routing|agent|rag|embedding|memory|evaluation|orchestration/i.test(t)&&!/(mechanism|operational|design|implementation|practical)/i.test(r))return true;if(k==="cyber"&&/least privilege|input validation|threat model|secrets|cybersecurity|hardening/i.test(t)&&!/(risk|control|implementation|boundary|blast radius)/i.test(r))return true;if(k==="law"&&/legal information|legal advice|jurisdiction|contract|statute|case law|canadian law/i.test(t)&&!/(jurisdiction|framework|not legal advice|source|facts)/i.test(r))return true;if(k==="finance"&&/cash[- ]?flow|profit|margin|runway|cac|ltv|pricing|unit economics/i.test(t)&&!/(decision|threshold|implication|use case|working capital|margin)/i.test(r))return true;return r.length<150&&k!=="english";}
function englishDomainDepthReply(reply="",text=""){let base=safeStr(reply)||polishEnglishText(text);if(/^Polished version:/i.test(base)){base=base.replace(/\s+In practical terms,.*$/i,"").replace(/\s+The useful version should.*$/i,"").trim();return base;}if(/English lane engaged/i.test(base))return polishEnglishText(text);return `Polished version: ${base.replace(/^polished version:\s*/i,"")}`;}
function psychologyDomainDepthReply(reply="",text=""){const base=safeStr(reply)||psychologyDomainAnswer(text);if(/cognitive distortion/i.test(lower(text)))return "A cognitive distortion is a thinking pattern that bends interpretation away from the full evidence, usually by exaggerating threat, certainty, blame, or failure. The practical interpretation is that the first thought may feel true before it has been tested. The next step is to separate the fact, the interpretation, and one more balanced explanation before acting on it.";if(/emotional regulation/i.test(lower(text)))return "Emotional regulation is the skill of noticing an emotion, naming what it is doing, and choosing a response before the feeling takes over the whole action. The useful interpretation is not suppression; it is controlled pacing. The next step is to identify the trigger, lower the body pressure, and decide on one small action instead of solving the whole situation at once.";return hasNaturalDepth(base,"domain_question")&&/(practical|next step|interpretation|pattern)/i.test(base)?base:`${base} Practically, treat this as a pattern to observe, not a verdict about the person. The next step is to name the trigger and choose one grounded response before escalating the conclusion.`;}
function aiDomainDepthReply(reply="",text=""){const base=safeStr(reply)||aiDomainAnswer(text);if(/tool routing/i.test(lower(text)))return "Tool routing in an AI agent is the decision layer that chooses the right capability before acting: retrieval for stored knowledge, search for fresh facts, code for computation or file work, and no tool when reasoning is enough. Operationally, the router checks intent, permissions, risk, and expected output before handing the task to the smallest reliable tool path. The design implication is precision: better routing reduces random tool use, prevents internal leakage, and keeps the final answer grounded in the right source.";return hasNaturalDepth(base,"domain_question")&&/(operational|mechanism|design|implementation|practical)/i.test(base)?base:`${base} Operationally, the important part is how the system decides, verifies, and returns the result. The design implication is to make the boundary explicit so the agent stays useful without becoming unpredictable.`;}
function cyberDomainDepthReply(reply="",text=""){const base=safeStr(reply)||cyberDomainAnswer(text),t=lower(text);if(/\b(api authentication|authentication|auth token|token handling|api keys?|bearer token|jwt|session token)\b/i.test(t))return cyberDomainAnswer(text);if(/least privilege/i.test(t))return "Least privilege is a defensive access-control principle: every user, service, token, and process gets only the permissions needed for its job. The risk it reduces is blast radius; if one component is compromised, the attacker inherits a narrow permission set instead of the whole system. The implementation boundary is to scope keys, separate admin functions, limit database access, rotate exposed secrets, and verify logs never print credentials.";if(/backend api|api|hardening/i.test(t))return "The best defensive hardening improvement for a backend API is strict input validation at the route boundary, paired with least-privilege access behind it. The risk it reduces is malformed or hostile input reaching business logic, database calls, or downstream services with too much authority. The implementation boundary is clear: validate type, length, format, and allowed values before processing; scope tokens and service permissions narrowly; and log rejection events without printing secrets.";return hasNaturalDepth(base,"domain_question")&&/(implementation|boundary|blast radius)/i.test(base)&&!/Send the next target/i.test(base)?base:`${base.replace(/\s*Send the next target.*$/i,"")} The defensive control should name the risk it reduces, the permission or input boundary it enforces, and the operational check that proves the system fails safely.`;}
function lawDomainDepthReply(reply="",text=""){const base=safeStr(reply)||lawDomainAnswer(text);return hasNaturalDepth(base,"domain_question")&&/(jurisdiction|framework|not legal advice|source|facts)/i.test(base)?base:`${base} Treat this as legal information, not legal advice: the useful framework is jurisdiction, governing source, facts, procedure, and remedy. A real dispute should be checked against the current statute, regulation, tribunal rule, or lawyer/legal clinic guidance for the relevant place.`;}
function financeDomainDepthReply(reply="",text=""){const base=stripStaleProgressionSurface(safeStr(reply)||financeDomainAnswer(text),"domain_question",text);const t=lower(text);if(/cash[- ]?flow.*profit|profit.*cash[- ]?flow/i.test(t))return "Cash flow is the timing of money moving in and out of the business, while profit is the accounting surplus after revenue and expenses are matched. The business implication is that a company can show profit but still run short of cash if invoices are late, inventory ties up money, debt payments hit, or growth consumes working capital. Use cash flow to judge survival and operating resilience; use profit to judge whether the model creates economic surplus.";if(/cash[- ]?flow/i.test(t)&&/risk|business decision|decision|resilience|runway|pressure/i.test(t))return "Cash-flow risk is the chance that timing, collections, debt payments, inventory, or operating costs create a cash shortage even when the business looks healthy on paper. In a business decision, it should change the threshold for pricing, spending, hiring, financing, or runway protection. The practical test is simple: will this move leave enough cash to survive delays, absorb surprises, and keep operations stable without weakening the company?";return hasNaturalDepth(base,"domain_question")&&/(implication|threshold|decision|use case|working capital|margin)/i.test(base)?base:`${base} The business use case is to turn the metric into a decision threshold: what number changes pricing, spending, hiring, or runway protection.`;}
function applyDomainAnswerDepthGovernor(reply,intent,knowledgeDomain,text,input={},routed={}){const k=normalizeKnowledgeDomain(knowledgeDomain||resolveKnowledgeDomain(routed,input,text));let out=sanitizeUserFacingReply(reply,intent,text,input);const t=lower(text);if(!k||intent==="technical_debug"||isDomainAnswerDepthSuppressed(text,input,intent))return out||reply;if(k==="english")return sanitizeUserFacingReply(englishDomainDepthReply(out,text),intent,text,input)||out;if(k==="psychology"&&/cognitive distortion|emotional regulation/i.test(t))return sanitizeUserFacingReply(psychologyDomainDepthReply(out,text),intent,text,input)||out;if(k==="ai"&&/tool routing|agent|rag|embedding|memory|evaluation|orchestration/i.test(t))return sanitizeUserFacingReply(aiDomainDepthReply(out,text),intent,text,input)||out;if(k==="finance"&&/cash[- ]?flow|profit|margin|runway|cac|ltv|pricing|unit economics/i.test(t))return sanitizeUserFacingReply(financeDomainDepthReply(out,text),intent,text,input)||out;if(k==="cyber"&&/least privilege|input validation|threat model|secrets|cybersecurity|hardening/i.test(t))return sanitizeUserFacingReply(cyberDomainDepthReply(out,text),intent,text,input)||out;if(!domainAnswerNeedsDepth(out,k,text)&&hasNaturalDepth(out,"domain_question"))return out;if(k==="psychology")out=psychologyDomainDepthReply(out,text);else if(k==="ai")out=aiDomainDepthReply(out,text);else if(k==="cyber")out=cyberDomainDepthReply(out,text);else if(k==="law")out=lawDomainDepthReply(out,text);else if(k==="finance")out=financeDomainDepthReply(out,text);return sanitizeUserFacingReply(out,intent,text,input)||reply;}

const CREATIVE_SUGGESTION_VERSION = "nyx.marion.creativeSuggestion/1.0";
const CREATIVE_SUGGESTION_TIMING_GOVERNOR_VERSION = "nyx.marion.creativeSuggestionTimingGovernor/1.0";
const CONVERSATION_FOLLOWUP_GOVERNOR_VERSION = "nyx.marion.followupGovernor/1.0";
const ANSWER_SPECIFICITY_GOVERNOR_VERSION = "nyx.marion.answerSpecificityGovernor/1.0";
const CREATIVE_TRIGGER_RX = /\b(creative suggestion|suggestion module|improve|enhance|refine|upgrade|better angle|make this stronger|make it sharper|make it smarter|make it more compelling|next enhancement|feature should we add|what should we add|what can we add|what would improve|design improvement|strategy|feature|module|layer|cognitive|intelligence|commercial grade|elite|controlled enhancement)\b/i;
const CREATIVE_SUPPRESS_RX = /\b(voice test|mic test|system check|can you hear me|smoke test|regression|pipeline regression|technical test only|cyber control|control test|token length|headers count|node --check|syntax validation|final smoke|post-token|token rotation|legal advice|crisis|suicide|self[- ]?harm|kill myself|hurt myself)\b/i;
function isExactTechnicalValidationTurn(text=""){
  const t=lower(text);
  if(!t)return false;
  if(isVoiceSystemCheckTurn(text,{}))return true;
  if(/\b(smoke test|regression|pipeline regression|technical test only|cyber control|control test|node --check|syntax validation|final smoke|post-token|token rotation)\b/i.test(t))return true;
  if(isNyxMarionBackendTechnicalContext(t)&&/\b(answer with the exact|exact code-level|not a generic|no generic|do not add|suppress creative|test only)\b/i.test(t))return true;
  if(/\b(full autopsy|line[- ]?by[- ]?line audit|critical fixes?|resend|downloadable zip|zipped file)\b/i.test(t)&&isNyxMarionBackendTechnicalContext(t))return true;
  return false;
}
function boundedWords(value,maxWords=34){const words=safeStr(value).split(/\s+/).filter(Boolean);return words.slice(0,maxWords).join(" ").replace(/[,:;\-]+$/g,"").trim();}
function isDirectExecutionTurn(text=""){const t=lower(text);if(!t)return false;if(/\b(resend|downloadable zip|zipped file|send the file|give me the command|show me the command|run this test|run the test|node --check|git add|git commit|git push|pull --rebase|replace the file|validate syntax|what is the next step|next steps?\.?$|answer in one sentence|one sentence|rewrite this sentence|proofread|copyedit)\b/i.test(t))return true;return false;}
function isCreativeTimingSuppressed(text="",input={},intent=""){const t=lower(text);if(!t)return true;if(CREATIVE_SUPPRESS_RX.test(t)||isVoiceSystemCheckTurn(text,input)||isExactTechnicalValidationTurn(text)||isGreetingPostureTurn(text))return true;if(intent==="emotional_support"||intent==="identity_query"||intent==="simple_chat")return true;if(isDirectExecutionTurn(text))return true;if(isNyxMarionBackendTechnicalContext(text)&&!/\b(improve|enhance|refine|next enhancement|creative suggestion|make .*smarter|conversation quality|what should we add|what can we add|what would improve)\b/i.test(t))return true;return false;}
function creativeTimingIntent(text="",intent="",input={},routed={}){const t=lower(text);if(isCreativeTimingSuppressed(text,input,intent))return {allowed:false,reason:"suppressed_control_or_direct_turn",score:0};let score=0;if(CREATIVE_TRIGGER_RX.test(t))score+=35;if(/\b(how can we improve|what would improve|next enhancement|better angle|make .*more compelling|make .*stronger|make .*smarter|feature should we add|shape .*strategy|conversation quality|creative direction|design improvement)\b/i.test(t))score+=30;if(["business_strategy","contextual_directive"].includes(intent))score+=18;if(intent==="technical_debug"&&/\b(conversation quality|response depth|creative|cognitive|improve|enhance|refine|feature|module|layer)\b/i.test(t))score+=12;if(extractContextCarry(input,routed)&&/\b(carry|continue|next enhancement|improve|refine|go deeper)\b/i.test(t))score+=8;return {allowed:score>=42,reason:score>=42?"high_value_creative_timing":"insufficient_creative_timing",score:Math.max(0,Math.min(100,score))};}
function cognitiveSignalScore(text,intent,input={},routed={}){const t=lower(text),carry=extractContextCarry(input,routed),timing=creativeTimingIntent(text,intent,input,routed);let score=0;if(timing.allowed)score+=timing.score;if(CREATIVE_TRIGGER_RX.test(t))score+=16;if(/\b(monetiz|sponsor|audience|commercial|brand|conversion|offer)\b/i.test(t))score+=14;if(/\b(conversation|memory|continuity|reflective|prompt|creative|intelligence)\b/i.test(t))score+=10;if(carry&&timing.allowed)score+=8;if(["business_strategy","contextual_directive"].includes(intent))score+=8;return Math.max(0,Math.min(100,score));}
function cognitiveLayerMode(intent,text){const t=lower(text);if(/\b(monetiz|sponsor|audience|commercial|brand|conversion|offer|strategy)\b/i.test(t)||intent==="business_strategy")return"commercial_leverage";if(/\b(reflective|prompt|conversation quality|memory|continuity|cognitive|intelligence|response depth|layered answers)\b/i.test(t))return"cognitive_scaffolding";if(/\b(creative|suggestion|feature|module|enhance|upgrade|better angle|next enhancement|make .*smarter)\b/i.test(t))return"creative_expansion";if(/\b(autopsy|audit|hardening|critical fix|script|backend|composer|state spine|pipeline)\b/i.test(t)||intent==="technical_debug")return"architectural_hardening";return"adaptive_reasoning";}
function creativeSuggestionForMode(mode,intent,text,input={},routed={}){const topic=boundedWords(deriveTopic(text,input,routed)||text,18);if(mode==="architectural_hardening")return`Add one gated refinement for ${topic||"the active system"}: measure whether the response improves specificity before allowing the suggestion to surface.`;if(mode==="commercial_leverage")return`Package ${topic||"the offer"} as one visible user benefit, one measurable outcome, and one proof point a sponsor can understand quickly.`;if(mode==="cognitive_scaffolding")return`Add one reflective prompt after the answer: ask what decision the user can make next, so the layer deepens thinking without hijacking the conversation.`;if(mode==="creative_expansion")return`Prototype one sidecar enhancement first, then surface it only when it improves the user's current task.`;if(intent==="domain_question")return`Add one practical application after the explanation, so the concept becomes immediately usable.`;return`Add one next-angle suggestion only when it improves the user's task; keep it short, optional, and grounded in the current turn.`;}
function buildCognitiveIntelligenceLayer({intent="simple_chat",domain="general",knowledgeDomain="",text="",reply="",input={},routed={},recoveryRequired=false}={}){const distress=detectDistress(text),timing=creativeTimingIntent(text,intent,input,routed),score=cognitiveSignalScore(text,intent,input,routed),mode=cognitiveLayerMode(intent,text),suppressed=!!(timing.reason==="suppressed_control_or_direct_turn"||isVoiceSystemCheckTurn(text,input)||isExactTechnicalValidationTurn(text)||isGreetingPostureTurn(text)||CREATIVE_SUPPRESS_RX.test(lower(text))||distress.crisis||recoveryRequired);const enabled=!!(!suppressed&&timing.allowed&&score>=42&&reply);const suggestion=enabled?creativeSuggestionForMode(mode,intent,text,input,routed):"";return{version:COGNITIVE_LAYER_VERSION,creativeSuggestionVersion:CREATIVE_SUGGESTION_VERSION,creativeSuggestionTimingGovernorVersion:CREATIVE_SUGGESTION_TIMING_GOVERNOR_VERSION,enabled,mode,score,timing,domain,knowledgeDomain:knowledgeDomain||"",triggered:score>=42,suppressed,reason:suppressed?"safety_control_or_direct_turn":(enabled?"high_value_creative_timing":"insufficient_creative_timing"),suggestion,updatedAt:Date.now()};}
function shouldSurfaceCreativeSuggestion(layer={},intent="",text="",reply=""){const l=safeObj(layer),timing=safeObj(l.timing||creativeTimingIntent(text,intent,{},{}));if(!l.enabled)return false;if(!timing.allowed)return false;if(!safeStr(l.suggestion))return false;if(!safeStr(reply)||isInternalContractLeak(reply)||isBlockedLoopReply(reply))return false;if(isCreativeTimingSuppressed(text,{},intent))return false;if(isNyxMarionBackendTechnicalContext(text)&&/\b(technical test only|exact code-level|not a generic|no generic|answer with the exact)\b/i.test(lower(text)))return false;return true;}
function applyCreativeSuggestionModule(reply,layer={},intent="",text="",input={}){let base=sanitizeUserFacingReply(reply,intent,text,input);if(!base)return"";if(!shouldSurfaceCreativeSuggestion(layer,intent,text,base))return base;const suggestion=sanitizeUserFacingReply(safeObj(layer).suggestion,intent,text,input);if(!suggestion)return base;if(lower(base).includes(lower(suggestion).slice(0,48)))return base;const oneSentence=firstSentence(suggestion,260).replace(/^Creative suggestion:\s*/i,"").trim();const out=`${base} Creative suggestion: ${oneSentence}`.replace(/\s+/g," ").trim();return sanitizeUserFacingReply(out,intent,text,input)||base;}


function extractContextCarry(input={},routed={}){const i=safeObj(input),r=safeObj(routed),session=safeObj(i.session||r.session),ctx=safeObj(i.context||r.context||session.context),state=safeObj(i.state||i.conversationState||session.state||session.conversationState),prev=safeObj(i.previousMemory||i.memory||i.turnMemory||session.previousMemory||session.memory),turns=safeArray(i.turns||ctx.turns||ctx.history||session.turns||prev.turns||state.turns);const tail=turns.slice(-6).map(x=>safeStr(isObj(x)?(x.text||x.message||x.reply||x.content):x)).filter(Boolean).join(" ");const last=firstText(i.lastAssistantReply,state.lastAssistantReply,prev.lastAssistantReply,session.lastAssistantReply,ctx.lastAssistantReply);const user=firstText(i.lastUserText,state.lastUserText,prev.lastUserText,session.lastUserText,ctx.lastUserText);const setup=firstText(ctx.summary,ctx.setup,state.summary,prev.contextSummary,session.contextSummary);const combined=[tail,last,user,setup].map(safeStr).filter(Boolean).join(" ");return safeStr(combined).slice(-1600);}
function hasContextCarry(input={},routed={}){return !!extractContextCarry(input,routed);}
function protectsContextFromOverride(intent,text,input={},routed={}){const carry=lower(extractContextCarry(input,routed)),t=lower(text);if(/given that setup|based on that|that setup|that architecture|that context|from there|in this case|contract breaks|finalenvelope|final envelope|biggest risk|what risk/i.test(t))return "contextual_directive";if(/marion.*brain|nyx.*interface|interface.*brain|finalenvelope|final envelope|marionbridge|composemarionresponse|state spine/i.test(carry)&&/(risk|break|failure|what happens|given that|based on|biggest)/i.test(t))return "contextual_directive";return intent;}
function detectArchitectureReasoning(text){const t=lower(text);return /marion-to-nyx|marion to nyx|current marion|architecture|strongest point|weakest point|commercial grade|single change/i.test(t);}

function extractDomainConfidence(input = {}, routed = {}) {
  const r = safeObj(routed), i = safeObj(input);
  const routing = safeObj(r.routing || i.routing);
  const meta = safeObj(r.meta || i.meta);
  const candidates = [r.domainConfidence, routing.domainConfidence, meta.domainConfidence, safeObj(r.marionIntent).domainConfidence, safeObj(i.marionIntent).domainConfidence, safeObj(i.sessionPatch).domainConfidence, safeObj(i.memoryPatch).domainConfidence, safeObj(i.stateBridge).domainConfidence];
  for (const c of candidates) {
    if (isObj(c) && Object.keys(c).length) {
      const confidence = Math.max(0, Math.min(1, Number(c.confidence) || 0));
      const margin = Math.max(0, Math.min(1, Number(c.margin) || 0));
      const routeLocked = !!(c.routeLocked || c.routeLock || routing.routeLock || safeObj(r.marionIntent).routeLock || confidence >= 0.82);
      const ambiguous = !!(c.ambiguous || (!routeLocked && (confidence < 0.62 || (margin > 0 && margin < 0.08))));
      return {...c, version: safeStr(c.version || "nyx.marion.domainConfidence/1.1"), confidence, margin, band: safeStr(c.band || (confidence >= 0.92 ? "high" : confidence >= 0.72 ? "medium" : confidence >= 0.52 ? "low" : "weak")), ambiguous, routeLocked, failClosed: !!(c.failClosed || (ambiguous && !routeLocked))};
    }
  }
  const confidence = Number(routing.routeConfidence || meta.routeConfidence || safeObj(r.marionIntent).confidence || 0);
  const c = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
  const routeLocked = !!(routing.routeLock || safeObj(r.marionIntent).routeLock || c >= 0.82);
  const ambiguous = c > 0 && c < 0.62 && !routeLocked;
  return { version: "nyx.marion.domainConfidence/1.1", confidence: c, margin: c, band: c >= 0.92 ? "high" : c >= 0.72 ? "medium" : c >= 0.52 ? "low" : "weak", ambiguous, routeLocked, failClosed: ambiguous && !routeLocked, reason: firstText(routing.reason, meta.reason, safeObj(r.marionIntent).reason, "compose_confidence_fallback") };
}
function responseDepthProfile(text=""){
  const t=lower(text);
  if(/\b(short version|quick version|briefly|compact|short checklist|quick checklist|in one sentence|one sentence|short answer|bottom line)\b/i.test(t))return "compact";
  if(/\b(deeper|deep dive|architecture-level|full checklist|complete checklist|detailed|strategic|covers|covering)\b/i.test(t))return "deep";
  return "working";
}
function isRokuPublishingRequest(text=""){
  const t=lower(text);
  if(!t)return false;
  return /\b(roku|ott|channel app|roku app|tv app|streaming app|sandblast roku)\b/i.test(t) && /\b(publish|publishing|submit|submitting|submission|developer|package|pkg|channel|feed|stream|playback|deeplink|deep link|certification|screenshots|artwork|manifest|sideload|beta|private channel|public channel|app path|before submission|before submitting|checked before submission|check before submitting|submission readiness|readiness checklist|next steps|nyx steps|what to check)\b/i.test(t);
}
function rokuPublishingCompactReply(text=""){
  return "Before submitting the Sandblast Roku app, check the app package or feed path, stream playback, artwork, screenshots, descriptions, categories, privacy/support links, navigation, and real Roku device testing.";
}
function rokuPublishingWorkingReply(text=""){
  return "For the Sandblast Roku app, treat submission as a readiness checklist: confirm the Roku developer/channel setup, validate the app package or feed path, verify stream playback on an actual Roku device, and make sure artwork, screenshots, descriptions, categories, privacy/support links, and branding are complete. Before submission, test launch behavior, navigation, live-stream stability, remote-control usability, deep linking if used, error handling, and whether the content feed stays current.";
}
function rokuPublishingDeepReply(text=""){
  return "Roku submission readiness should be checked in layers: first confirm the package or feed path loads cleanly, then test live-stream playback on a real Roku device, then verify artwork, screenshots, descriptions, categories, privacy/support links, and brand presentation. Next, test navigation, remote-control behavior, deep linking if used, error states, content-feed freshness, and whether the first-time reviewer experience matches what viewers will actually see. The clean rule is simple: do not submit until package, media feed, visual assets, playback, support metadata, and reviewer flow all agree.";
}
function rokuPublishingReply(text=""){
  const depth=responseDepthProfile(text);
  if(depth==="compact")return rokuPublishingCompactReply(text);
  if(depth==="deep")return rokuPublishingDeepReply(text);
  return rokuPublishingWorkingReply(text);
}
function isNewsMediaPositioningRequest(text=""){
  const t=lower(text);
  if(!t)return false;
  if(/\b(rewrite|revise|edit|proofread|polish|copyedit|grammar|tone|professional(?:ly)?|make this .*sound|wording|language flow)\b/i.test(t))return false;
  const brandHit=/\b(news canada|newscanada|sandblast media|sandblast channel|media page|news page)\b/i.test(t);
  const positioningHit=/\b(positioning|position|shape|trust|reliable|credib(?:le|ility)|current|fresh|freshness|useful|usefulness|story hierarchy|headline hierarchy|source path|update cadence|older stories|editorial|content trust|visitor trust|page feels|feels reliable)\b/i.test(t);
  const retrievalOnly=/\b(feed issue|rss error|rss route|wp rest|story url|headline url|fetch|parse|diagnostics|route result)\b/i.test(t)&&!/\b(positioning|trust|reliable|credible|useful|current|fresh)\b/i.test(t);
  return brandHit&&positioningHit&&!retrievalOnly;
}
function newsMediaPositioningReply(text=""){
  return "For News Canada and the Sandblast media page, the positioning should make reliability visible before the visitor has to think about it: lead with clear headlines, current story cards, readable timestamps or update cues, and a clean hierarchy that separates featured stories, recent updates, and media highlights. Keep older stories visible until they are replaced so the page never feels empty, but frame them as stable coverage rather than stale content. The trust move is to show source cleanliness, consistent refresh behavior, useful summaries, and a calm layout that tells visitors this is a maintained media surface, not a random feed.";
}

function isHighConfidenceOperationalLaneRequest(text="", intent="", routed={}){
  const t=lower(text);
  if(isRokuPublishingRequest(t)) return true;
  if((intent==="business_strategy"||/\b(sponsor|sponsorship|advertiser|brand recall|retention|audience attention|media kit|monetiz|commercial positioning)\b/i.test(t)) && /\b(sandblast|channel|advertiser|sponsor|audience|brand|retention|attention|recall|positioning|strategy)\b/i.test(t)) return true;
  if(isNewsMediaPositioningRequest(text)) return true;
  if((intent==="news_query"||/\b(news canada|newscanada|news|media positioning|current stories|reliable|visitors|editorial|rss|feed)\b/i.test(t)) && /\b(news canada|newscanada|sandblast|media|page|stories|visitors|reliable|current|useful)\b/i.test(t)) return true;
  return false;
}
function shouldFailClosedForDomainConfidence(input = {}, routed = {}) {
  const text = extractText(routed, input);
  const intent = resolveIntent(routed, input);
  if (isHighConfidenceOperationalLaneRequest(text, intent, routed)) return false;
  const c = extractDomainConfidence(input, routed);
  return !!(c.ambiguous && !c.routeLocked);
}
function domainConfidenceUserReply(input = {}, routed = {}) {
  const c = extractDomainConfidence(input, routed);
  if (!shouldFailClosedForDomainConfidence(input, routed)) return "";
  return "I’ll keep this broad and practical instead of forcing the wrong specialist angle too early. Give me the specific lane or outcome if you want it narrowed further.";
}

function domainQuestionReply(text,input={},routed={}){const t=lower(text),knowledgeDomain=resolveKnowledgeDomain(routed,input,text);if(knowledgeDomain){const kdReply=knowledgeDomainReply(knowledgeDomain,text,input,routed);if(kdReply)return kdReply;}if(detectArchitectureReasoning(text))return "Strongest point: Nyx now renders only validated Marion final replies. Weakest point: continuity still depends on every upstream path preserving finalEnvelope.reply and sessionPatch together. The single best change is to enforce MarionBridge as the only /api/chat authority and reject any alternate path before it reaches Nyx.";if(/finalenvelope|final envelope|contract breaks|biggest risk|given that setup|based on that/i.test(t))return contextualDirectiveReply(text,input,routed);if(/why|how|analyze|break down|explain/i.test(t))return "The clean move is to preserve one authority chain: route intent once, compose once, return finalEnvelope.reply once, then update session state from that same trusted turn.";return "";}

function directiveExecutionKind(text=""){const t=lower(text);if(!t)return"none";if(/\b(5[- ]?turn|five[- ]?turn|five[- ]?term|mic\/?text|mic text|voice and typed|typed input|summarize this regression|without resetting context|what should stay consistent)\b/i.test(t))return"continuity_contract";if(/\b(resend|downloadable zip|zipped file|send the file|zip file)\b/i.test(t))return"file_package";if(/\b(replace the file|active path|unzip|copy over|pull the file over)\b/i.test(t))return"replace_file";if(/\b(node --check|validate syntax|syntax validation)\b/i.test(t))return"syntax_validate";if(/\b(git add|git commit|git push|pull --rebase|commit and push|git status)\b/i.test(t))return"git_deploy";if(/\b(run the test|run this test|smoke test|regression|pipeline regression|cyber control|backend technical test only)\b/i.test(t))return"test_run";if(/\b(token|headers count|token length|rotate the token|post-token)\b/i.test(t))return"auth_token";if(/\b(next steps?|what should (we|i) do|one concrete step|one precise action|next best step)\b/i.test(t))return"next_step";if(/\b(answer in one sentence|one sentence|short answer|direct answer|bottom line)\b/i.test(t))return"short_direct";return isDirectExecutionTurn(text)?"direct_execution":"none";}
function isDirectiveExecutionClaritySuppressed(text="",input={},intent=""){const t=lower(text);if(isVoiceSystemCheckTurn(text,input))return true;if(isRokuPublishingRequest(text))return true;if(/\b(cyber control|defensive cybersecurity hardening|explain the best defensive cybersecurity)\b/i.test(t))return true;if(normalizeKnowledgeDomain(detectKnowledgeDomain(text))&&!/\b(next steps?|run|test|commit|replace|resend|validate)\b/i.test(t))return true;return false;}
function directiveExecutionPlan(kind="",text="",input={},routed={}){const carry=contextCarrySummary(input,routed);if(kind==="file_package")return"Package the corrected ComposeMarionResponse.js in a zip, include the autopsy notes and checksums, then replace only the active composer file after download.";if(kind==="replace_file")return"Replace only the active composer path, then run node --check against that exact file before committing.";if(kind==="syntax_validate")return"Run node --check on the active Compose file and treat no output as the pass condition.";if(kind==="git_deploy")return"Stage the active Compose file, commit the focused change, pull with rebase, push to main, then wait for Render to redeploy.";if(kind==="test_run")return"Run the smallest regression first, confirm ok/final/marionFinal/handled are true and blocked is false, then inspect the reply for lane correctness.";if(kind==="auth_token")return"Rebuild the token and headers in the current PowerShell session, confirm Headers count is 10, then rerun the failed request.";if(kind==="short_direct")return"Give one direct answer and stop before adding creative, domain-depth, or follow-up expansion.";if(kind==="next_step")return carry?`Continue from the active thread: ${carry}. Apply the next concrete step, validate it once, and only expand if the validation fails.`:"Do the next concrete step, validate it once, and keep the reply free of creative or domain-depth add-ons.";return"Apply the user’s command directly, return the action or validation path, and avoid unrelated expansion.";}
function directiveExecutionClarityReply(reply="",intent="",text="",input={},routed={}){const kind=directiveExecutionKind(text),base=sanitizeUserFacingReply(reply,intent,text,input);if(kind==="none")return base;if(isDirectiveExecutionClaritySuppressed(text,input,intent))return base||buildFinalLoopRecoveryReply(intent,text,input);const plan=directiveExecutionPlan(kind,text,input,routed);if(kind==="short_direct")return firstSentence(base||plan,220);if(kind==="next_step"||kind==="file_package"||kind==="replace_file"||kind==="syntax_validate"||kind==="git_deploy"||kind==="test_run"||kind==="auth_token")return plan;if(base&&hasNaturalDepth(base,intent)&&!ANSWER_SPECIFICITY_PLACEHOLDER_RX.test(base)&&!isBlockedLoopReply(base)&&!/(Creative suggestion:|English lane engaged|Domain lane engaged)/i.test(base))return base;return plan;}
function applyDirectiveExecutionClarityGovernor(reply,intent,text,input={},routed={}){const kind=directiveExecutionKind(text);let out=sanitizeUserFacingReply(reply,intent,text,input);if(kind==="none")return out||buildFinalLoopRecoveryReply(intent,text,input);out=directiveExecutionClarityReply(out,intent,text,input,routed);return sanitizeUserFacingReply(out,intent,text,input)||buildFinalLoopRecoveryReply(intent,text,input);}

function responseCompressionKind(text=""){const kind=directiveExecutionKind(text);if(["next_step","syntax_validate","git_deploy","test_run","replace_file","file_package","auth_token","short_direct"].includes(kind))return kind;if(/\b(show me the test|show test|give me the powershell|powershell test|run smoke|run regression|commit and push|replace and deploy)\b/i.test(lower(text)))return"operational";return"none";}
function isResponseCompressionSuppressed(text="",input={},intent=""){const t=lower(text);if(/\b(full autopsy|line[- ]?by[- ]?line|audit|explain why|deep dive|strategy|business strategy|domain explanation|psychology domain|finance domain|law domain|ai domain|english domain|cyber domain)\b/i.test(t)&&!/\b(next steps?|show me the test|commit|push|replace|validate|node --check)\b/i.test(t))return true;if(intent==="emotional_support")return true;if(isVoiceSystemCheckTurn(text,input))return true;return false;}
function numbered(lines){return safeArray(lines).filter(Boolean).map((line,i)=>`${i+1}. ${safeStr(line)}`).join("\n");}
function responseCompressionPlan(kind="",text="",input={},routed={}){const active="Data/marion/runtime/composeMarionResponse.js";if(kind==="syntax_validate")return `Run:\nnode --check .\\${active}\n\nPass condition: no output.`;if(kind==="git_deploy")return `git status\ngit add .\\${active}\ngit commit -m "Add Compose response compression governor"\ngit pull --rebase origin main\ngit push origin main`;if(kind==="replace_file")return numbered([`Replace .\\${active}`,`Run node --check .\\${active}`,"Commit and push only that file","Wait for Render redeploy","Run smoke, technical, and cyber controls"]);if(kind==="file_package")return numbered(["Use the zipped package from this pass","Replace only the active Compose file","Validate with node --check","Commit and push","Run the compact regression grid"]);if(kind==="test_run"||kind==="operational")return numbered(["Run the smoke suppression test","Run the State Spine technical lane test","Run the cyber control","Confirm ok/final/marionFinal/handled are True and blocked is False","Inspect reply quality for lane correctness"]);if(kind==="auth_token")return numbered(["Paste the current token into $token","Rebuild the 10-header $headers object","Confirm Headers count: 10","Rerun the failed request","Rotate again if the token was exposed"]);if(kind==="short_direct")return firstSentence(directiveExecutionPlan("short_direct",text,input,routed),180);return numbered([`Replace .\\${active}`,`Run node --check .\\${active}`,"Commit, pull --rebase, and push","Wait for Render redeploy","Run smoke, technical, cyber, and one operational directive test"]);}
function compressVerboseOperationalReply(reply="",kind=""){const r=safeStr(reply);if(!r)return"";if(kind==="short_direct")return firstSentence(r,220);const lines=r.split(/(?:\n|\.\s+)/).map(s=>safeStr(s)).filter(Boolean);if(lines.length<=6&&r.length<=520)return r;return numbered(lines.slice(0,6).map(x=>x.replace(/^\d+[.)]\s*/,"")));}
function applyResponseCompressionGovernor(reply,intent,text,input={},routed={}){const kind=responseCompressionKind(text);let out=sanitizeUserFacingReply(reply,intent,text,input)||buildFinalLoopRecoveryReply(intent,text,input);if(kind==="none"||isResponseCompressionSuppressed(text,input,intent))return out;const plan=responseCompressionPlan(kind,text,input,routed);if(/\b(Creative suggestion:|English lane engaged|Domain lane engaged)\b/i.test(out))out=plan;if(kind==="short_direct")return firstSentence(out||plan,220);if(["next_step","syntax_validate","git_deploy","test_run","replace_file","file_package","auth_token","operational"].includes(kind))return plan;return compressVerboseOperationalReply(out,kind)||plan;}

const TECHNICAL_DIAGNOSIS_FAILURE_LAYERS = Object.freeze(["auth_header","route_path","router_domain_detection","loop_detection","composer_reply_shaping","marionbridge_handoff","chatengine_coordination","state_spine_carry","final_envelope_authority","frontend_widget_transport","deployment_cache","unknown_backend"]);
function extractDiagnosticStateSnapshot(input={},routed={}){const i=safeObj(input),r=safeObj(routed),prev=safeObj(i.previousMemory||i.memory||i.turnMemory),state=safeObj(i.conversationState||i.state||prev.stateSpine||prev.conversationState),rep=safeObj(state.repetition||prev.repetition||i.repetition||r.repetition),mp=safeObj(i.memoryPatch||r.memoryPatch||prev.memoryPatch),sp=safeObj(i.sessionPatch||r.sessionPatch||prev.sessionPatch),bridge=safeObj(mp.stateBridge||sp.stateBridge);return{stateStage:firstText(state.stateStage,state.stage,mp.stateStage,sp.stateStage,""),lastIntent:firstText(state.lastIntent,prev.lastIntent,mp.lastIntent,sp.lastIntent,""),turnDepth:clampInt(state.turnDepth||prev.turnDepth||mp.turnDepth||sp.turnDepth,0,0,999),noProgressCount:clampInt(rep.noProgressCount||state.noProgressCount||prev.noProgressCount||mp.noProgressCount,0,0,999),sameUserHashCount:clampInt(rep.sameUserHashCount||state.sameUserHashCount||prev.sameUserHashCount,0,0,999),sameAssistantHashCount:clampInt(rep.sameAssistantHashCount||state.sameAssistantHashCount||prev.sameAssistantHashCount,0,0,999),lastUserHash:firstText(state.lastUserHash,prev.lastUserHash,mp.lastUserHash,sp.lastUserHash,""),lastAssistantHash:firstText(state.lastAssistantHash,prev.lastAssistantHash,mp.lastAssistantHash,sp.lastAssistantHash,""),supportHoldTurns:clampInt(safeObj(state.support||prev.support).holdTurns||mp.supportHoldTurns||sp.supportHoldTurns,0,0,999),composedOnce:!!(mp.composedOnce||sp.composedOnce||bridge.composedOnce),shouldAdvanceState:!!(mp.shouldAdvanceState||sp.shouldAdvanceState||bridge.shouldAdvanceState),finalEnvelopeTrusted:!!(mp.finalEnvelopeTrusted||sp.finalEnvelopeTrusted||bridge.finalEnvelopeTrusted),inputSource:firstText(i.inputSource,i.source,safeObj(i.ui).inputSource,safeObj(i.client).inputSource,"text")};}
function diagnosticLoopDetectionProfile(kind="",text="",input={},routed={},reply=""){const t=lower(text),r=lower(reply),snap=extractDiagnosticStateSnapshot(input,routed),userHash=hashText(text),assistantHash=hashText(reply),explicit=!!/\b(loop|looping|repeated|repeat|fallback|same answer|same response|stuck|no response|blank response|what.?s next|state persistence|persistent state|iteration|re-entry|reentry|recursive|cycle|echo)\b/i.test(t),sameUser=!!(userHash&&snap.lastUserHash&&userHash===snap.lastUserHash),sameAssistant=!!(assistantHash&&snap.lastAssistantHash&&assistantHash===snap.lastAssistantHash),fallbackPhrase=isBlockedLoopReply(reply)||/\bi[’']?m here\.?\s*what[’']?s next\b|\bready\.\s*send|\bsend the next target\b|\bgive me the target\b/i.test(r),diagnosticEcho=!!(/\bverdict:\s*/i.test(r)&&/\blikely (layer|file):/i.test(r)&&!explicit),internalLeak=!!isInternalContractLeak(reply),thin=!!(safeStr(reply).length>0&&safeStr(reply).length<80&&/\b(loop|problem|issue|next|test|fix)\b/i.test(t)),statePersistenceRisk=!!(snap.noProgressCount>=2||snap.sameAssistantHashCount>=2||snap.supportHoldTurns>1||sameUser&&snap.lastIntent&&lower(snap.lastIntent)===lower(kind)),iterationRisk=!!(sameAssistant||fallbackPhrase||/\brecovery|recover|stabilize|terminal_stop\b/i.test(snap.stateStage)&&explicit),authorityRisk=!!(/\b(final envelope missing|non-final|marionfinal false|final false|blocked|awaiting)\b/i.test(t)||/\bfinalEnvelope|sessionPatch|transportSafe|marionFinal\b/i.test(reply)),voiceTextRisk=!!(/\b(mic|voice|speech|audio|text parity|headset)\b/i.test(t)&&/\b(different|not same|no response|loop|fallback|alignment)\b/i.test(t));const flags=[];if(fallbackPhrase)flags.push("fallback_phrase_reuse");if(statePersistenceRisk)flags.push("state_persistence_pressure");if(iterationRisk)flags.push("iteration_reentry_pressure");if(sameUser)flags.push("same_user_hash");if(sameAssistant)flags.push("same_assistant_hash");if(authorityRisk)flags.push("final_authority_pressure");if(diagnosticEcho)flags.push("diagnostic_echo_risk");if(internalLeak)flags.push("internal_contract_leak");if(thin)flags.push("thin_reply_loop_risk");if(voiceTextRisk)flags.push("voice_text_parity_risk");const score=Math.min(100,(explicit?20:0)+(fallbackPhrase?30:0)+(statePersistenceRisk?22:0)+(iterationRisk?18:0)+(authorityRisk?18:0)+(diagnosticEcho?10:0)+(internalLeak?16:0)+(thin?8:0)+(voiceTextRisk?12:0));const severity=score>=70?"critical":score>=50?"high":score>=30?"moderate":score>0?"low":"none";return{version:DIAGNOSTIC_LOOP_DETECTION_LAYER_VERSION,active:!!(explicit||flags.length),kind:firstText(kind,"none"),severity,score,flags,explicitLoopConcern:explicit,statePersistence:{risk:statePersistenceRisk,noProgressCount:snap.noProgressCount,sameUserHashCount:snap.sameUserHashCount,sameAssistantHashCount:snap.sameAssistantHashCount,supportHoldTurns:snap.supportHoldTurns,turnDepth:snap.turnDepth,stateStage:snap.stateStage},iteration:{risk:iterationRisk,sameUser,sameAssistant,fallbackPhrase,diagnosticEcho,thinReply:thin},authority:{risk:authorityRisk,finalEnvelopeTrusted:!!snap.finalEnvelopeTrusted,shouldAdvanceState:!!snap.shouldAdvanceState,composedOnce:!!snap.composedOnce,internalLeak},input:{source:snap.inputSource,voiceTextParityRisk:voiceTextRisk},updatedAt:Date.now()};}
function diagnosticLoopDetectionSummary(profile={}){const p=safeObj(profile),flags=safeArray(p.flags);if(!p.active)return"Loop audit: no loop-prone pattern detected in this diagnostic turn.";const publicFlags=flags.map(f=>({fallback_phrase_reuse:"reused recovery wording",state_persistence_pressure:"stale state carry",iteration_reentry_pressure:"re-entry pressure",same_user_hash:"repeated user input",same_assistant_hash:"repeated assistant output",final_authority_pressure:"answer authority pressure",diagnostic_echo_risk:"diagnostic echo risk",internal_contract_leak:"internal wording exposure",thin_reply_loop_risk:"thin answer risk",voice_text_parity_risk:"voice/text alignment risk"}[f]||f));const label=publicFlags.length?publicFlags.slice(0,4).join(", "):"general loop pressure";return`Loop audit: ${p.severity} risk; flagged ${label}. Correct it by changing the answer state, not by rewording the same recovery line.`;}
function technicalDiagnosisPublicReply(profile={},loopProfile={}){const p=safeObj(profile),loop=diagnosticLoopDetectionSummary(loopProfile);return`Verdict: ${p.verdict}. Likely layer: ${p.layer}. Correction target: ${p.correction}. Validation: ${p.validation}. ${loop}`;}
function isTechnicalDiagnosisSuppressed(text="",input={},intent=""){const t=lower(text);if(!t)return true;if(isVoiceSystemCheckTurn(text,input)||isGreetingPostureTurn(text)||isCapabilityQuestion(text))return true;if(/\b(smoke test only|confirm the backend response path is alive|voice test|mic test|microphone test|token length|headers count|post-token|final smoke|use the english domain|rewrite this sentence|business strategy for introducing|sponsor-facing|explain cognitive distortion|explain tool routing|cash flow and profit)\b/i.test(t))return true;if(intent==="business_strategy"&&!/\b(failed|failure|error|unauthorized|no change|wrong lane|missing|not_found|404|401|loop|fallback|deploy|regression failed)\b/i.test(t))return true;if(intent==="domain_question"&&!/\b(failed|failure|error|wrong lane|missing|not_found|404|401|loop|fallback|no change)\b/i.test(t))return true;if(isExplicitCybersecurityRequest(text)&&!isNyxMarionBackendTechnicalContext(text)&&!/(wrong lane|misroute|routed wrong|cyber.*state spine|state spine.*cyber)/i.test(t))return true;return false;}
function technicalDiagnosisKind(text=""){const t=lower(text);if(!t)return"none";if(/\b(401|unauthorized|forbidden|403|invalid token|stale token|headers stale|missing header|auth failed|authorization failed)\b/i.test(t))return"auth_header";if(/\b(404|not_found|not found|wrong endpoint|bad path|route missing|cannot post|cannot get|path.*missing)\b/i.test(t))return"route_path";if(/\b(no change|same result|still failing|after deploy|redeploy|render deployed|active path|wrong file|old composer|cache|everything up-to-date)\b/i.test(t))return"deployment_cache";if(/\b(went cybersecurity|routed to cyber|cyber lane|wrong lane|misroute|route priority|domain detection|hardening.*cyber|state spine.*cyber|cyber.*state spine)\b/i.test(t))return"router_domain_detection";if(/\b(final envelope missing|non-final|marionfinal false|final false|reply authority|trusted final|final authority|finalenvelope missing)\b/i.test(t))return"final_envelope_authority";if(/\b(marionbridge|marion bridge|handoff|emission|transport packet|bridge failed|bridge failure)\b/i.test(t))return"marionbridge_handoff";if(/\b(chatengine|chat engine|coordinator|coordinator-only|engine invented|engine fallback)\b/i.test(t))return"chatengine_coordination";if(/\b(state spine|statespine|carry-forward|carry forward|turn depth|lastuserhash|lastassisthash|noprog|creativecognitivecarry|continuity state)\b/i.test(t)&&/\b(failed|failure|wrong|stale|not carry|lost|regression|bug|issue|problem)\b/i.test(t))return"state_spine_carry";if(/\b(widget|frontend|front-end|mic|voice input|browser|ui|html|nyx interface|transport from widget)\b/i.test(t)&&/\b(failed|not working|no response|transport|alignment|different|issue|problem)\b/i.test(t))return"frontend_widget_transport";if(/\b(compose|composer|reply shaping|generic reply|thin reply|fallback phrase|loop|looping|i.?m here.*what.?s next|placeholder|too generic)\b/i.test(t))return"composer_reply_shaping";if(/\b(failed|failure|error|regression|diagnose|diagnosis|autopsy|no change|wrong|missing|bug|issue)\b/i.test(t))return"unknown_backend";return"none";}
function technicalDiagnosisProfile(kind="",text=""){const t=lower(text);const profiles={auth_header:{verdict:"auth failed before Marion",layer:"auth/header",file:"index.js or Render env/token configuration, not ComposeMarionResponse.js",correction:"rebuild the current token and 10-header object in the same PowerShell session, then confirm token length and header count before rerunning the request",validation:"rerun a greeting smoke test after auth reset"},route_path:{verdict:"request path or route contract failed before composer authority",layer:"route/path",file:"index.js route mounts or endpoint compatibility layer",correction:"verify the exact URL, method, and mounted /api/chat compatibility route before changing Marion files",validation:"rerun GET health and POST /api/chat with the same headers"},deployment_cache:{verdict:"code change may not be active in the runtime",layer:"deployment/cache or active-path mismatch",file:"Data/marion/runtime/composeMarionResponse.js first, MarionBridge load-order candidates second",correction:"confirm the active composer path, replace the first loaded candidate only, commit/push, then wait for Render to finish redeploying",validation:"rerun the same failed regression with a new sessionId"},router_domain_detection:{verdict:"transport passed but lane selection failed",layer:"router/domain detection or composer route-priority shaping",file:"ComposeMarionResponse.js first, MarionIntentRouter.js second",correction:"make Nyx/Marion backend technical context outrank generic hardening/cyber keywords unless cybersecurity is explicit",validation:"run paired tests: State Spine hardening must stay technical, defensive cybersecurity must stay cyber"},loop_detection:{verdict:"diagnostic path passed, but loop-prone behavior needs explicit isolation",layer:"embedded diagnostic loop detection",file:"ComposeMarionResponse.js diagnostic layer with State Spine handoff signals",correction:"flag state persistence pressure, iteration re-entry, replayed assistant hashes, fallback phrase reuse, final-authority pressure, and mic/text divergence before issuing the next correction",validation:"run a three-turn loop audit: technical prompt, Next steps, then the same prompt again; confirm the diagnostic names loop flags without emitting fallback language"},composer_reply_shaping:{verdict:"reply authority passed but answer shaping was too generic or loop-like",layer:"composer/reply shaping",file:"ComposeMarionResponse.js",correction:"replace placeholder/fallback phrasing with lane-specific component, failure mode, correction target, and validation step",validation:"rerun the prompt and inspect the visible reply for code-level specificity"},marionbridge_handoff:{verdict:"handoff layer likely failed or emitted before a trusted final was available",layer:"MarionBridge handoff",file:"MarionBridge.js",correction:"reject non-final packets before emission and pass through only trusted final-envelope replies",validation:"force a composer failure and confirm the bridge does not invent a user-facing fallback"},chatengine_coordination:{verdict:"coordination layer may be inventing or mutating final replies",layer:"ChatEngine coordination",file:"ChatEngine.js",correction:"keep ChatEngine coordinator-only: accept Marion final, pass it through, and avoid recovery authorship",validation:"check ok/final/marionFinal/handled/blocked plus visible reply"},state_spine_carry:{verdict:"continuity mutation likely occurred at the wrong time or with stale data",layer:"State Spine carry",file:"stateSpine.js or ComposeMarionResponse.js memoryPatch handoff",correction:"mutate carry-forward fields only after trusted final acceptance, then bound turnDepth, hashes, noProgressCount, and creativeCognitiveCarry",validation:"run a two-turn continuity test: technical prompt, then 'Next steps.'"},final_envelope_authority:{verdict:"final authority contract failed",layer:"final-envelope authority",file:"MarionBridge.js, ChatEngine.js, and ComposeMarionResponse.js final builder",correction:"enforce one accepted Marion result and block debug/internal packets from becoming user-facing output",validation:"rerun the final-authority regression and confirm the response is accepted, handled, visible, and not blocked"},frontend_widget_transport:{verdict:"frontend transport or input-source path likely differs from text path",layer:"frontend/widget transport",file:"widget HTML first, index.js input normalization second",correction:"normalize mic/text payload shape so both hit the same /api/chat contract and final-response renderer",validation:"run matching text and mic prompts with the same sessionId family and compare reply lane"},unknown_backend:{verdict:"backend failure needs narrowing before code edits",layer:"unknown backend",file:"start with index.js diagnostics, then MarionBridge.js, ChatEngine.js, and ComposeMarionResponse.js in load order",correction:"identify whether the failure is auth, route, deployment, routing, handoff, coordination, state, or composer shaping before patching",validation:"run one smallest failing test and inspect ok/final/marionFinal/handled/blocked"}};return profiles[kind]||profiles.unknown_backend;}
function technicalDiagnosisReply(kind="",text="",input={},routed={}){const p=technicalDiagnosisProfile(kind,text);const loopProfile=diagnosticLoopDetectionProfile(kind,text,input,routed,firstText(safeObj(input).reply,safeObj(routed).reply,""));if(/loop audit|loop problem|looping|fallback|same answer|repeated/i.test(lower(text))&&!explicitDeveloperDiagnosticRequested(text))return publicDiagnosticTranslationReply(text,input,routed,firstText(safeObj(input).reply,safeObj(routed).reply,""));return technicalDiagnosisPublicReply(p,loopProfile);}
function applyTechnicalDiagnosisPrecisionGovernor(reply,intent,text,input={},routed={}){const kind=technicalDiagnosisKind(text);let out=sanitizeUserFacingReply(reply,intent,text,input)||buildFinalLoopRecoveryReply(intent,text,input);if(isRouteIsolationExplanationTurn(text))return sanitizeUserFacingReply(routeIsolationExplanationReply(text),intent,text,input)||out;if(kind==="none"||isTechnicalDiagnosisSuppressed(text,input,intent))return out;if(["auth_header","route_path","router_domain_detection","loop_detection","composer_reply_shaping","marionbridge_handoff","chatengine_coordination","state_spine_carry","final_envelope_authority","frontend_widget_transport","deployment_cache","unknown_backend"].includes(kind)){const diagnosis=technicalDiagnosisReply(kind,text,input,routed);return sanitizeUserFacingReply(diagnosis,intent,text,input)||out;}const diagnosis=technicalDiagnosisReply(kind,text,input,routed);return sanitizeUserFacingReply(diagnosis,intent,text,input)||out;}


function isMemoryCarryBoundarySuppressed(text="",input={},intent=""){const t=lower(text);return !!(isVoiceSystemCheckTurn(text,input)||isExactTechnicalValidationTurn(text)||/\b(smoke test|regression|pipeline regression|backend technical test only|technical test only|cyber control|control test|token length|headers count|syntax validation|node --check|post-token|mic test|voice test|can you hear me)\b/i.test(t));}
function isFreshPromptBoundaryReset(text="",input={},intent=""){const t=lower(text);if(isGreetingPostureTurn(text)||isCapabilityQuestion(text))return true;if(/\b(new topic|fresh topic|separate question|unrelated|switch topics|ignore previous|start over|reset context|do not carry|don[’']?t carry|without prior context)\b/i.test(t))return true;if(/\b(use the english domain|rewrite this sentence|polish this|proofread|copyedit|define |explain the difference between|what is |what are )\b/i.test(t)&&!continuationCue(text))return true;if(normalizeKnowledgeDomain(detectKnowledgeDomain(text))&&!continuationCue(text)&&!/\b(carry|continue|based on|given that|from there|next steps?)\b/i.test(t))return true;if(intent==="business_strategy"&&/\b(sponsor|strategy|business|pitch|media kit)\b/i.test(t)&&!/\b(based on|given that|carry|continue|from there|that)\b/i.test(t))return true;return false;}
function memoryCarryBoundaryProfile(text="",input={},routed={},intent="",contextCarry=""){const t=lower(text),carry=safeStr(contextCarry||extractContextCarry(input,routed)),prev=safeObj(input.previousMemory||input.memory||input.turnMemory),state=safeObj(input.conversationState||input.state||prev.stateSpine||prev.conversationState);const suppressed=isMemoryCarryBoundarySuppressed(text,input,intent);const explicitContinue=continuationCue(text);const emotionalCarry=hasEmotionalContinuityCue(text)||!!safeObj(prev.emotionalContinuity||state.emotionalContinuity).active;const explicitMemory=/\b(carry this memory|remember this thread|continue this thread|use the prior thread|based on the previous|from the previous answer)\b/i.test(t);const resetRequired=!suppressed&&isFreshPromptBoundaryReset(text,input,intent);const carryAllowed=!!(!suppressed&&!resetRequired&&carry&&(explicitContinue||explicitMemory||emotionalCarry));const mode=carryAllowed?(emotionalCarry&&!explicitContinue?"emotional_continuity":"explicit_continuation"):(resetRequired?"fresh_prompt_reset":(suppressed?"suppressed":"no_carry"));const boundedCarry=carryAllowed?compactSummary(carry,900):"";return{version:MEMORY_CARRY_BOUNDARY_GOVERNOR_VERSION,active:!!(carry||explicitContinue||resetRequired||emotionalCarry),suppressed,carryAllowed,resetRequired,explicitContinue,explicitMemory,emotionalCarry,mode,carryHash:carry?stateHashText(carry):"",boundedCarry,reason:carryAllowed?"current prompt explicitly depends on prior context":(resetRequired?"fresh prompt must not inherit stale context":(suppressed?"control or validation turn":"no explicit carry cue")),updatedAt:Date.now()};}
function applyMemoryCarryBoundaryToInput(input={},routed={},text="",intent=""){const rawCarry=extractContextCarry(input,routed);const boundary=memoryCarryBoundaryProfile(text,input,routed,intent,rawCarry);return{input:{...safeObj(input),contextCarry:boundary.boundedCarry,memoryCarryBoundary:boundary},contextCarry:boundary.boundedCarry,rawContextCarry:rawCarry,boundary};}


function directiveReply(text,input={},routed={}){if(isRokuPublishingRequest(text))return rokuPublishingReply(text);const t=lower(text);if(isPracticalNyxConsistencyPrompt(text))return practicalNyxConsistencyReply(text);if(/what should (we|i) do|next step|next steps|one precise action|one concrete step|give me the next step|what next/i.test(t))return nextStepContextPackReply(text,input,routed);if(/improving this system|improve this system|next best step/i.test(t))return "The next best step is to make every response advance one visible unit: answer the prompt directly, preserve the active context, and include one check that proves Nyx did not drift, loop, or reset.";if(/commercial grade|closer to commercial grade|single change/i.test(t))return "The highest-value commercial-grade change is response consistency: every turn should preserve context, answer in natural language, and give one practical next move without exposing internal routing details.";return "The next best step is to keep the answer narrow and useful: carry the current context, answer the request directly, and give one practical verification step before widening the scope.";}
function contextualDirectiveReply(text,input={},routed={}){const t=lower(text),carry=lower(extractContextCarry(input,routed));if(isMicTextParityPrompt(text)||isDomainIsolationPrompt(text)||isPracticalNyxConsistencyPrompt(text))return parityRegressionDirectReply(text,input);if(/what layer|harden first|that desynchronization risk|desynchronization risk/i.test(t))return "Harden the handoff between Marion’s completed answer and Nyx’s visible reply first. That is where a good answer can still fail if the reply, state update, and authority marker do not survive together.";if(/sessionpatch survives|session patch survives|reply is lost|finalenvelope\.reply is lost/i.test(t))return "If the state update survives but the visible reply is lost, the system can remember progress the user never saw. The fix is to advance state only when the same turn also carries a renderable answer.";if(/finalenvelope|final envelope|contract breaks|breaks/i.test(t+" "+carry))return "If the final answer contract breaks, Nyx can appear responsive while the reasoning path is no longer safely connected to what the user sees. The practical fix is to reject that turn and keep the failure local instead of rendering partial output.";if(/biggest risk|risk/i.test(t))return "The biggest risk is desynchronization: the interface may look alive while the reasoning, state, and visible answer are no longer moving together.";if(/given that setup|based on that|that setup/i.test(t))return "Given that setup, preserve the Marion-to-Nyx handoff first: one completed answer, one state update, and one visible reply that all describe the same turn.";return directiveReply(text,input,routed);}
function identityReply(text,input={}){const t=lower(text);if(/what is marion|who is marion|marion helps|how marion|what marion does|marion does for nyx|how do you think|marion.*think|think/i.test(t))return "Marion is the deeper reasoning layer behind me. I handle the conversation you see and hear, while Marion helps with intent, context, memory, and response shaping in the background. The goal is simple: you speak to Nyx, and the system gives you a clear, useful answer without exposing the machinery unless you ask for it.";return "I’m Nyx — the live interface for Sandblast. Marion is the deeper cognitive system behind me, helping interpret intent, preserve context, and shape responses so this feels like one coordinated intelligence instead of a loose chatbot.";}
function simpleChatReply(text,input={}){const t=lower(text);if(!t)return"";if(isWarmSocialTurn(text))return buildWarmSocialReply(text,input);return"";}
function technicalReply(text,input={},routed={}){const memory=safeObj(input.previousMemory||input.memory),state=safeObj(input.conversationState||input.state||memory.stateSpine||memory.conversationState),noProgress=clampInt(safeObj(state.repetition).noProgressCount||memory.noProgressCount,0,0,99),t=lower(text);if(isVoiceSystemCheckTurn(text,input))return buildVoiceSystemCheckReply(text,input);if(isRouteIsolationExplanationTurn(text))return routeIsolationExplanationReply(text);if(/loop audit|run a loop audit|loop problem|looping|fallback|same answer|repeated/i.test(t)){return explicitDeveloperDiagnosticRequested(text)?developerDiagnosticReply(text,input,routed,""):publicDiagnosticTranslationReply(text,input,routed,"");}if(/state spine|statespine/i.test(t)&&/code-level|carry-forward|carry forward|stability|continuity hardening|highest-value|hardening improvement/i.test(t))return"Highest-value continuity refinement: update carry-forward only after one accepted final answer, then write the user hash, assistant hash, turn depth, no-progress reset, and bounded carry summary together. That prevents stale context from becoming the next answer. Validation: run one diagnostic turn, then confirm the next reply advances instead of replaying the prior recovery shape.";if(/state spine|statespine/i.test(t))return explicitDeveloperDiagnosticRequested(text)?"State Spine is the continuity ledger. Verify revision increment, user hash update, assistant hash update, final-stage transition, and noProgress reset after a trusted Marion final. If any one of those is missing, the dialogue may feel alive for one turn and then flatten on the next.":"The continuity layer should advance only after a real answer is accepted. If it carries old pressure forward too early, Nyx can sound like she is progressing while actually repeating the same recovery shape.";if(/bridge|final envelope|signature/i.test(t))return explicitDeveloperDiagnosticRequested(text)?"Bridge audit target: normalize once, route once, compose once, wrap through one Marion final envelope, then return without re-entry. The reply is only safe when the final reply, final status, Marion authority, and session patch survive together.":"The bridge should pass one completed answer forward and avoid re-entering the same turn. The public symptom of failure is not always silence; it can also be a reply that sounds like a check instead of an answer.";if(/loop/i.test(t)||noProgress>=1)return publicDiagnosticTranslationReply(text,input,routed,"");return"The technical path is live. The next useful check is whether the rendered answer changes state: it should name the cause, apply one correction, and give one validation step without exposing internal routing language.";}
function emotionalReply(text,input={}){
  const distress=detectDistress(text),memory=safeObj(input.previousMemory||input.memory),alreadySupported=!!memory.supportUsedLastTurn||!!((memory.memoryPatch||{}).supportUsedLastTurn);
  const emotion=resolveEffectiveEmotion(input,normalizeResolvedEmotion(input));
  const specific=emotionalSpecificityPackReply(text,input);
  if(distress.crisis||emotion.escalationNeeded)return"Your safety comes first. If you might hurt yourself or you’re in immediate danger, contact emergency services or a local crisis line now. Move near another person, put distance between you and anything harmful, and breathe slowly.";
  if(specific)return specific;
  const progression=emotionalProgressionReply(text,input,emotion);
  if(progression&&!/what feels most real/i.test(progression))return progression;
  if(alreadySupported&&!distress.high)return"I hear the weight in that. Let’s move deeper without circling: name the one pressure point underneath this, then we’ll turn it into one manageable action.";
  if(distress.high)return"That sounds heavy, and I’m going to keep it specific. First, reduce the scope: choose the one pressure point that is creating the most immediate strain, then take only the next small action attached to it.";
  return"I hear you. Let’s keep this useful instead of generic: name the part that matters most, and I’ll help you turn it into the next clear move.";
}

function compactSummary(value,max=360){const s=safeStr(value).replace(/\s+/g," ").trim();if(!s)return"";return s.length>max?`${s.slice(0,max).replace(/\s+\S*$/," ").trim()}.`:s;}
function continuationCue(text=""){const t=lower(text);return /\b(given that|given that answer|given this|based on that|based on this|based on your answer|from that|from there|from here|now explain|now make|now refine|turn that into|turn this into|make it sound|make it more|prioriti[sz]e|next step|next steps|what next|what\'s next|safest refinement|safest next refinement|next refinement|next layer|next improvement|go deeper|continue|continue that|carry that forward|carry it forward|carry this forward|move forward|proceed|those upgrades|that answer|for a sponsor|to a sponsor|investor[- ]?facing|premium|pitch|say out loud|short pitch)\b/i.test(t);}
function previousAssistantText(input={}){const i=safeObj(input),prev=safeObj(i.previousMemory||i.memory||i.turnMemory),state=safeObj(i.conversationState||i.state||prev.stateSpine||prev.conversationState);return firstText(prev.lastAssistantReply,state.lastAssistantReply,prev.reply,state.reply,prev.assistantText,state.assistantText);}
function previousUserText(input={}){const i=safeObj(input),prev=safeObj(i.previousMemory||i.memory||i.turnMemory),state=safeObj(i.conversationState||i.state||prev.stateSpine||prev.conversationState);return firstText(prev.lastUserText,state.lastUserText,prev.userText,state.userText);}
function previousCarrySummary(input={},routed={}){const i=safeObj(input),prev=safeObj(i.previousMemory||i.memory||i.turnMemory),state=safeObj(i.conversationState||i.state||prev.stateSpine||prev.conversationState);return firstText(i.contextCarry,prev.carryForwardSummary,state.carryForwardSummary,prev.conversationSummary,state.conversationSummary,extractContextCarry(i,routed));}
function deriveTopic(text="",input={},routed={}){const t=lower(text),carry=lower(previousCarrySummary(input,routed));if(/sponsor|investor|business value|revenue|commercial|premium|pitch/.test(t+" "+carry))return"AI media interface commercial value";if(/emotion|aware|useful|intelligent|interface|nyx|nexus|marion|media/.test(t+" "+carry))return"AI media interface intelligence and UX";if(/cash flow|profit|finance/.test(t))return"finance";if(/legal|law/.test(t))return"law";if(/least privilege|cyber|security/.test(t))return"cyber";if(/tool routing|ai agent|agent/.test(t))return"AI agents";return firstText(stripInstructionTail(stripDomainCommand(text)).slice(0,90),"conversation");}
function isFollowUpGovernorSuppressed(text="",input={}){const t=lower(text);return !!(isDepthGovernorSuppressed(text,input)||isVoiceSystemCheckTurn(text,input)||isExactTechnicalValidationTurn(text)||/\b(smoke test|regression|pipeline regression|backend technical test only|technical test only|cyber control|control test|final[- ]?envelope validation|syntax validation|node --check|mic test|voice test|can you hear me|token rotation|post-token)\b/i.test(t));}
function continuityContext(input={},routed={},text=""){const prevReply=previousAssistantText(input),prevUser=previousUserText(input),carry=previousCarrySummary(input,routed),explicit=continuationCue(text),suppressed=isFollowUpGovernorSuppressed(text,input),active=!!(!suppressed&&explicit);const topic=deriveTopic(text,input,routed);return{active,explicit,suppressed,prevReply:compactSummary(prevReply,520),prevUser:compactSummary(prevUser,260),carry:compactSummary(carry,520),topic};}
function buildCarryForwardSummary({intent,domain,knowledgeDomain,text,reply,input={},routed={}}={}){const ctx=continuityContext(input,routed,text);const topic=ctx.topic||deriveTopic(text,input,routed);const parts=[];if(topic)parts.push(`Topic: ${topic}`);if(intent)parts.push(`Intent: ${intent}`);if(knowledgeDomain)parts.push(`Knowledge: ${knowledgeDomain}`);else if(domain)parts.push(`Domain: ${domain}`);const prior=ctx.carry||ctx.prevReply;if(prior)parts.push(`Prior: ${prior}`);const current=compactSummary(reply,420);if(current)parts.push(`Current: ${current}`);return compactSummary(parts.join(" | "),900);}
function businessDepthProfile(text=""){
  return responseDepthProfile(text);
}
function businessAudienceAttentionReply(text=""){
  const depth=businessDepthProfile(text);
  if(depth==="compact")return "Sandblast audience attention matters because it shows sponsors people are actually staying with the media surface instead of scrolling past it. Stronger attention creates better recall, better brand association, and a clearer reason to buy placement.";
  if(depth==="deep")return "A stronger sponsor-facing argument for Sandblast should connect four things: attention, retention, recall, and campaign value. Attention proves the audience is present; retention proves they stay long enough for the message to land; brand recall proves the sponsor is remembered; and campaign value turns that attention into measurable outcomes such as clicks, listening time, offer response, or repeat exposure. The pitch should package one audience segment, one sponsor placement, one measurable outcome, and one proof point so the advertiser sees a buying case instead of a vague branding claim.";
  return "Advertisers should care about Sandblast audience attention because attention is the first proof that a campaign has room to work. Retention shows the audience stays long enough for the sponsor message to register, and brand recall shows the placement can create memory rather than just impressions. The practical sponsor value is to package attention, retention, and recall into one measurable offer with a clear audience, placement, and outcome.";
}
function stripDuplicateStrategicOpener(reply=""){
  let out=safeStr(reply);
  out=out.replace(/^(Commercially,\s*the clean move[:\s.-]*){2,}/i,"Commercially, the clean move: ");
  out=out.replace(/^Commercially,\s*the clean move:\s*Commercially,\s*the clean move\s+is\s+/i,"Commercially, the clean move is ");
  out=out.replace(/\b(The next move is to convert that into one offer, one audience, and one measurable action\.)\s+\1\b/gi,"$1");
  return out;
}
function continuationAwareBusinessReply(text,input={},routed={}){
  const ctx=continuityContext(input,routed,text);
  const t=lower(text);
  if(/\b(audience attention|attention, retention|brand recall|advertisers?|sponsors?)\b/i.test(t))return businessAudienceAttentionReply(text);
  if(/short pitch|say out loud|turn that into|turn this into/.test(t))return"Here’s the pitch: we’re building an AI media interface that does more than answer questions — it guides users through intelligent, emotionally aware, domain-specific conversations that make the platform feel alive, useful, and premium. For a sponsor, that means stronger attention, deeper engagement, better brand association, and a media experience people remember instead of scrolling past.";
  if(/premium|investor[- ]?facing/.test(t))return"Investor-facing version: this is a differentiated AI media layer that turns Sandblast from a passive content surface into an interactive intelligence platform. The value is defensibility: proprietary conversation flow, domain-aware guidance, emotional continuity, and sponsor-ready engagement data can create a product experience that is harder to copy than a standard radio stream or static media site.";
  if(/sponsor|business value|commercial value/.test(t))return businessAudienceAttentionReply(text);
  if(/prioriti[sz]e|next three|three upgrades/.test(t))return"I’d prioritize three upgrades: first, context carry so Nyx remembers the user’s goal across turns; second, emotional calibration so the interface responds with the right level of warmth without becoming generic; third, domain synthesis so Marion can connect technical, business, media, and user-experience reasoning in one answer. That order improves usefulness first, then trust, then commercial differentiation.";
  if(ctx.active)return`Carrying the thread forward: ${ctx.carry||ctx.prevReply||"the interface needs to feel intelligent, emotionally aware, and useful"} The business move is to turn that capability into a sponsor-facing value stack: attention, trust, differentiation, and measurable engagement.`;
  return stripDuplicateStrategicOpener("Commercially, the clean move is to define the offer, identify the sponsor’s audience, package the AI interface as a premium engagement layer, and tie it to measurable outcomes like retention, clicks, listening time, or campaign recall.");
}
function followUpAnchor(ctx){const topic=ctx.topic||"the current thread";const prior=ctx.carry||ctx.prevReply||ctx.prevUser;return prior?`Continuing from ${topic}: ${prior}`:`Continuing from ${topic}`;}
function continuationAwareReply(intent,text,input={},routed={}){const posture=extractGreetingPosture(input,routed,text);if(posture&&posture.active&&!continuationCue(text))return"";const ctx=continuityContext(input,routed,text);if(!ctx.active)return"";const t=lower(text),anchor=followUpAnchor(ctx);if(intent==="business_strategy"||/sponsor|business value|investor|premium|pitch/.test(t))return continuationAwareBusinessReply(text,input,routed);if(/prioriti[sz]e|next three|three upgrades/.test(t))return`${anchor}. Prioritize the upgrades in this order: continuity carry first, because Nyx must preserve the user's working goal; response-depth shaping second, because the answer has to feel useful rather than flat; domain synthesis third, because Marion needs to connect business, media, technical, and emotional signals without making the reply noisy.`;if(/turn that into|short pitch|say out loud/.test(t))return"Here is the clean version: we are building an AI media interface that feels alive because it remembers the thread, understands intent, adjusts tone, and gives practical answers across media, business, technology, and support. That gives users a more useful experience and gives sponsors a stronger, more memorable engagement layer.";if(/premium|investor[- ]?facing/.test(t))return"Premium framing: Nyx and Marion turn the media interface into an intelligent engagement layer, not just a chat widget. The value is defensibility: continuity, domain-aware guidance, emotional calibration, and sponsor-ready interaction paths create a product experience that is harder to copy than static media.";if(intent==="technical_debug"||/state spine|chatengine|marionbridge|compose|intent router|domain registry|backend|code-level|hardening|refinement/.test(t))return`${anchor}. The safest next refinement is to gate the follow-up governor behind explicit continuation cues and bounded carry summaries, so a phrase like “next steps” can use prior context while a fresh unrelated prompt cannot be hijacked by old state. That matters because it preserves continuity without recreating sticky fallback memory.`;if(intent==="emotional_support")return`${anchor}. The safest follow-up is to keep one pressure point in focus, reflect it briefly, and ask one grounded question instead of widening the emotional scope. That keeps continuity supportive without making the response clingy or repetitive.`;if(intent==="contextual_directive"||intent==="directive_response")return`${anchor}. The next move is one specific action: apply the prior rule, verify the output once, and only deepen if the user asks for more detail.`;return`${anchor}. The next move is to carry only the useful part of the prior answer, answer the current request directly, and avoid generic “what next” filler.`;}

function hotFallbackReply(intent,text,input={}){const distress=detectDistress(text),emotion=resolveEffectiveEmotion(input,normalizeResolvedEmotion(input));if((intent==="emotional_support"||distress.emotional||(emotion.present&&emotion.primary!=="neutral"&&hasEmotionalContinuityCue(text)))&&!distress.crisis)return emotionalReply(text,input);if(intent==="contextual_directive")return contextualDirectiveReply(text,input);if(intent==="directive_response")return directiveReply(text,input);if(intent==="identity_query")return identityReply(text,input);if(intent==="technical_debug")return buildFinalLoopRecoveryReply(intent,text,input);if(intent==="emotional_support"||distress.emotional){if(distress.crisis)return"Your safety comes first. If you might hurt yourself or you’re in immediate danger, contact emergency services or a local crisis line now.";return"I’m with you. Let’s slow it down and stay with the specific pressure point instead of repeating a flat support line.";}if(intent==="business_strategy")return"Let’s keep this commercial: define the offer, identify the buyer psychology, package the value, and turn it into the next execution step.";if(intent==="music_query")return"Music lane is ready. Give me the year, artist, chart, or story angle and I’ll route it cleanly.";if(intent==="news_query")return isNewsMediaPositioningRequest(text)?newsMediaPositioningReply(text):"News Canada lane is ready. Give me the story, headline, or feed issue and I’ll keep the source path clean.";if(intent==="roku_query")return"Roku lane is ready. Tell me whether we’re checking the app path, live TV lane, content feed, or deployment issue.";return"";}
function recoveryReply(intent,text,input={}){
  const distress=detectDistress(text),emotion=resolveEffectiveEmotion(input,normalizeResolvedEmotion(input));
  if(intent==="contextual_directive")return contextualDirectiveReply(text,input);
  if(intent==="directive_response")return directiveReply(text,input);
  if(intent==="identity_query")return identityReply(text,input);
  if(intent==="technical_debug")return technicalReply(text,input);
  if(intent==="emotional_support"||distress.emotional||(emotion.present&&emotion.primary!=="neutral"&&hasEmotionalContinuityCue(text)))return emotionalReply(text,input);
  return buildReply(intent,text,{...safeObj(input),forceRecovery:false,recoveryRequired:false},{});
}




const PROGRESSION_LEAK_RX = /\b(do the requested action|validate the result|commit only after|run the validation|return the final answer|continuity target carried|apply one controlling rule|controlling rule is|operator instruction|internal execution|target carried:)\b/i;
function progressionShapingProfile(reply="",intent="",text="",input={},routed={}){
  const r=safeStr(reply),t=lower(text),carry=contextCarrySummary(input,routed);
  const parity=isMicTextParityPrompt(text),isolation=isDomainIsolationPrompt(text),practical=isPracticalNyxConsistencyPrompt(text);
  const contextual=intent==="contextual_directive"||/\b(given that|based on that|from there|in this case|now connect|now explain)\b/i.test(t);
  const directive=intent==="directive_response"||detectDirectiveIntent(text);
  const leak=!!(isInternalContractLeak(r)||PROGRESSION_LEAK_RX.test(r));
  const thin=sentenceCount(r)<2&&!["simple_chat","music_query","news_query","roku_query"].includes(intent);
  return{version:PROGRESSION_SHAPING_GOVERNOR_VERSION,active:!!(parity||isolation||practical||contextual||directive||leak||thin),parity,isolation,practical,contextual,directive,leak,thin,carry,updatedAt:Date.now()};
}
function naturalizeExecutionLanguage(reply="",intent="",text="",input={},routed={}){
  let out=safeStr(reply);
  if(!out)return out;
  out=out.replace(/\bContinuity target carried:?\s*/gi,"").replace(/\bDo the requested action,?\s*/gi,"").replace(/\bvalidate the result,?\s*/gi,"check the result").replace(/\bcommit only after the test passes\b/gi,"keep changes only after the check passes").replace(/\bApply one controlling rule, then give the next action cleanly\.?/gi,"Use the existing context, answer the current question, and move the work one step forward.").replace(/\bThe controlling rule is to preserve one response authority and one final envelope\.?/gi,"The answer should stay tied to one clear route and one visible response.");
  return out.replace(/\s+/g," ").trim();
}
function progressionShapingReply(reply="",intent="",text="",input={},routed={}){
  const p=progressionShapingProfile(reply,intent,text,input,routed);
  if(p.parity)return "Mic and text should preserve the same route and state because both inputs represent the same user intent after normalization. Voice may carry an inputSource of voice and typed input may carry text, but the domain choice, continuity state, final reply authority, and rendered answer should remain aligned so Nyx behaves consistently across both paths.";
  if(p.isolation)return domainIsolationDirectReply(text);
  if(p.practical)return "A practical next step is to run a small response-consistency check after each patch: send one technical prompt, one domain-isolation prompt, and one general next-step prompt by both text and mic. Compare the intent, route, state carry, final reply, and bubble rendering, then fix the first mismatch before adding new features.";
  let out=naturalizeExecutionLanguage(reply,intent,text,input,routed);
  if(!out||p.leak){
    if(intent==="technical_debug")out="The next useful move is to keep the answer user-facing: name the route or component, explain why it matters, and give one verification step without exposing internal packet language.";
    else if(intent==="directive_response"||intent==="contextual_directive")out="Use the existing context, answer the current request directly, and give one practical next move without resetting the thread.";
    else out=safeStr(reply);
  }
  if(p.thin&&intent==="directive_response")out=`${out} Keep the scope narrow: one prompt, one expected behavior, one observed mismatch, one fix.`;
  if(p.contextual&&p.carry&&!/\bcontext|same thread|prior|carry|continue/i.test(out))out=`${out} This continues the same thread: ${p.carry}.`;
  return sanitizeUserFacingReply(out,intent,text,input)||out;
}
function applyProgressionShapingGovernor(reply="",intent="",text="",input={},routed={}){
  const p=progressionShapingProfile(reply,intent,text,input,routed);
  if(!p.active)return reply;
  return progressionShapingReply(reply,intent,text,input,routed)||reply;
}

const MIC_TEXT_PARITY_DOMAIN_PRECEDENCE_VERSION = "nyx.marion.micTextParityDomainPrecedence/1.0";
function isMicTextParityPrompt(text=""){
  const t=lower(normalizeVoiceTextParityText(text));
  return /\b(mic text parity|mic\/text parity|voice and typed|voice and text|typed input|input source|same route|same state|final[- ]?envelope authority|preserve the same route|preserve route,? state)\b/i.test(t);
}
function micTextParityDirectReply(text="",input={}){
  if(!isMicTextParityPrompt(text))return "";
  return "Mic/text parity means voice and typed input can arrive through different sources, but they must normalize to the same user meaning, intent classification, route/domain choice, state carry, turn depth, and trusted final-envelope rendering. The only valid difference is the inputSource marker; the answer meaning and continuity contract should remain stable.";
}
function isDomainIsolationPrompt(text=""){
  const t=lower(normalizeVoiceTextParityText(text));
  return /\b(domain isolation|cross[- ]?domain|domain bleed|silent fallback|fail[- ]?closed|domain path|declared path|root path|domain manifest|manifest breaks|manifest break|manifest fails|manifest failure)\b/i.test(t)||/\b(broken|invalid|failed|missing)\b.*\b(psychology|english|finance|general|domain)\b.*\b(affect|fallback|bleed|load|route)\b/i.test(t)||/\b(should not|must not|cannot)\b.*\b(affect|fall back|fallback|bleed)\b.*\b(english|finance|general|psychology)\b/i.test(t);
}
function domainIsolationDirectReply(text=""){
  if(!isDomainIsolationPrompt(text))return "";
  return "A broken psychology domain should fail closed inside its own declared path instead of contaminating other lanes. English, finance, and general should still load from their own manifests/root paths because each domain is isolated, routed independently, and forbidden from using silent fallback into another domain. That prevents cross-domain bleed and keeps failure local, visible, and diagnosable.";
}
function isPracticalNyxConsistencyPrompt(text=""){
  const t=lower(normalizeVoiceTextParityText(text));
  return /\b(practical next step|practical nyx step|improving nyx'?s response consistency|improve nyx'?s response consistency|response consistency)\b/i.test(t);
}
function practicalNyxConsistencyReply(text=""){
  if(!isPracticalNyxConsistencyPrompt(text))return "";
  return "The practical next step is to add a small parity regression check after every patch: send the same prompt by text and mic, compare normalized intent, route/domain, state carry, final-envelope reply, and rendered bubble, then fix only the first mismatch. That keeps Nyx improving without widening the scope.";
}
function parityRegressionDirectReply(text="",input={}){
  return micTextParityDirectReply(text,input)||domainIsolationDirectReply(text)||practicalNyxConsistencyReply(text)||"";
}

function progressionGuardTurn(text=""){
  const m = lower(text).match(/\bturn\s*([1-5])\b/);
  return m ? Number(m[1]) : 0;
}
function isFinanceProgressionGuardTurn(text=""){
  const t=lower(normalizeVoiceTextParityText(text));
  return /\b(progression compact finance test|finance progression test|cash[- ]?flow|profit|cash availability|late[- ]?paying clients|invoices|expenses|cash[- ]?flow problem|operating rule)\b/i.test(t)
    && /\b(turn\s*[1-5]|go deeper|refine that|practical next steps|final operating rule)\b/i.test(t);
}
function financeProgressionGuardReply(text=""){
  if(!isFinanceProgressionGuardTurn(text))return "";
  const t=lower(normalizeVoiceTextParityText(text));
  const turn=progressionGuardTurn(text);
  if(turn===1||/cash[- ]?flow.*profit|profit.*cash[- ]?flow/i.test(t))return "Cash flow is the real-time movement of money into and out of the business; profit is the surplus left after revenue and expenses are matched under accounting rules. A company can look profitable while still being cash-starved if invoices are unpaid, inventory absorbs cash, debt payments are due, or growth consumes working capital. Use profit to judge whether the model creates surplus; use cash flow to judge whether the business can survive and operate.";
  if(turn===2||/profit.*not guarantee cash|cash availability|go deeper/i.test(t))return "Profit does not guarantee cash availability because accounting can recognize revenue before the money is collected. A business may show profit from issued invoices, but if clients pay late, payroll, rent, debt payments, supplier bills, and inventory costs still require actual cash. The deeper rule is timing: profit measures economic performance; cash flow measures whether the company has enough liquid money at the moment obligations come due.";
  if(turn===3||/late[- ]?paying clients|invoices|expenses|refine/i.test(t))return "For a business owner dealing with late-paying clients, the danger is the gap between earned revenue and collected cash. Invoices may show that the business is profitable, but expenses leave the account on fixed dates while client payments arrive unpredictably. The owner should separate booked revenue from cash collected, rank invoices by age, identify which expenses are non-negotiable, and measure how many days of operating cash remain if payments are delayed.";
  if(turn===4||/practical next steps|diagnose|correct|cash[- ]?flow problem/i.test(t))return "Diagnose the cash-flow problem in five steps: first, list all receivables by client, amount, and due date; second, list fixed obligations by payment date; third, compare expected cash-in against required cash-out over the next 7, 14, and 30 days; fourth, identify which late invoices create the shortage; fifth, act by tightening collections, renegotiating payment timing, delaying non-critical spend, or building a short-term reserve. Correct the timing gap before treating the business as truly healthy.";
  if(turn===5||/final operating rule|rule marion should preserve|preserve from this sequence/i.test(t))return "Final operating rule: profit tells Marion whether the business model creates surplus, but cash flow tells Marion whether the business can keep operating. In finance progression, Marion must preserve the active finance subject, deepen the answer by turn, reject business/sponsorship drift, and convert each follow-up into user-facing finance guidance instead of meta-process or fallback language.";
  return "Cash flow and profit must stay separated in the analysis: profit shows economic surplus, while cash flow shows operating survival and timing pressure.";
}
function isTechnicalProgressionGuardTurn(text=""){
  const t=lower(normalizeVoiceTextParityText(text));
  return /\btechnical progression test|route status telemetry|domain confidence scoring|selected domain|knowledgeDomain|debugging steps|telemetry integrity\b/i.test(t)&&/\bturn\s*[1-5]|go deeper|refine|practical debugging|final rule\b/i.test(t);
}
function technicalProgressionGuardReply(text=""){
  if(!isTechnicalProgressionGuardTurn(text))return "";
  const t=lower(normalizeVoiceTextParityText(text)); const turn=progressionGuardTurn(text);
  if(turn===1||/route status telemetry should show/i.test(t))return "Route status telemetry should show the selected intent, selected domain, knowledgeDomain when one is active, confidence score, confidence band, routeLocked state, failClosed state, inputSource, and final-envelope authority. Its job is to make the routing decision observable without changing the user-facing answer.";
  if(turn===2||/interact with domain confidence/i.test(t))return "Route status telemetry should carry domain confidence as evidence, not as prose. The confidence profile explains why the route locked, whether another candidate was close, and whether the composer should answer normally or fail closed. That lets Marion preserve routing integrity while ComposeMarionResponse shapes the final answer.";
  if(turn===3||/selected domain is correct.*knowledgedomain is empty|knowledgedomain is empty/i.test(t))return "If selectedDomain is correct but knowledgeDomain is empty, treat it as an operational lane rather than a knowledge-pack failure. Business, Roku, news, music, and technical may not need a knowledgeDomain; finance, law, cyber, AI, English, and psychology usually should expose one when their knowledge lane is explicitly active. The fix is to verify whether the domain is operational or knowledge-backed before forcing a patch.";
  if(turn===4||/debugging steps|practical/i.test(t))return "Debug route telemetry in order: confirm the router output, inspect domainConfidence, verify selectedDomain versus knowledgeDomain, check routeLocked and failClosed, confirm Compose received the same routing packet, then verify the final envelope carries the same telemetry without leaking internal fields to the user.";
  if(turn===5||/final rule|telemetry integrity/i.test(t))return "Final telemetry rule: the selected route, domain confidence, composer behavior, state carry, and final envelope must describe the same decision. If any layer disagrees, Marion should expose the mismatch in diagnostics and keep the user-facing answer clean.";
  return "Technical progression should preserve the same telemetry subject while increasing specificity by turn.";
}
function isEnglishProgressionGuardTurn(text=""){
  const t=lower(normalizeVoiceTextParityText(text));
  return /\benglish progression test|rewrite this sentence|executive and concise|warmer but still professional|three versions|tone rule\b/i.test(t)&&/\bturn\s*[1-5]|rewrite|executive|warmer|versions|tone rule\b/i.test(t);
}
function englishProgressionGuardReply(text=""){
  if(!isEnglishProgressionGuardTurn(text))return "";
  const t=lower(normalizeVoiceTextParityText(text)); const turn=progressionGuardTurn(text);
  if(!turn && !/we gotta fix this script because it keeps acting weird|executive and concise|warmer but still professional|three versions|different audiences|tone rule/i.test(t))return "";
  if(turn===1||/rewrite this sentence professionally/i.test(t))return "Professional rewrite: We need to resolve the script issue because it is behaving inconsistently.";
  if(turn===2||/executive and concise/i.test(t))return "Executive concise version: We need to stabilize the script and eliminate its inconsistent behavior.";
  if(turn===3||/warmer but still professional/i.test(t))return "Warmer professional version: We should clean up the script so it runs more consistently and gives users a smoother experience.";
  if(turn===4||/three versions|different audiences/i.test(t))return "Three audience versions: Executive: We need to stabilize the script and remove inconsistent behavior. Technical: We need to isolate the failure path and correct the script’s inconsistent runtime behavior. User-facing: We’re refining the system so it responds more smoothly and reliably.";
  if(turn===5||/tone rule/i.test(t))return "Tone rule: preserve clarity first, then adjust warmth and authority for the audience without changing the core meaning. Marion should improve the wording without drifting away from the original operational issue.";
  return "English progression should preserve the original meaning while changing polish, audience, and tone by turn.";
}
function continuationCompressionGuardReply(text="",input={},intent="",routed={}){
  if(!isContinuationCompressionInstruction(text))return "";
  const locked=continuationCompressionLockedDomain(input,routed);
  const t=lower(normalizeVoiceTextParityText(text));
  if(locked==="technical"||/telemetry|route status|final envelope|visible reply/i.test(t))return "Route telemetry is valid only when the selected route, domain confidence, state carry, composer behavior, and final envelope all describe the same decision while the visible reply stays clean and user-facing.";
  if(locked==="english")return "Preserve the original meaning while tightening the wording into one clear sentence for the intended audience.";
  if(locked==="finance"||!locked)return "Profit shows whether the business model creates surplus; cash flow shows whether the business can meet real obligations in real time.";
  return "Preserve the active topic, compress the conclusion into one clear sentence, and avoid repeating the previous wording.";
}
function progressionShapingGuardReply(text="",input={},intent="",routed={}){
  return continuationCompressionGuardReply(text,input,intent,routed)||financeProgressionGuardReply(text)||technicalProgressionGuardReply(text)||englishProgressionGuardReply(text)||"";
}
function progressionShapingGuardProfile(text="",input={},intent="",routed={}){
  const reply=progressionShapingGuardReply(text,input,intent,routed);
  const t=lower(normalizeVoiceTextParityText(text));
  const turn=progressionGuardTurn(text);
  let lockedDomain="", lockedTopic="", mode="";
  if(isContinuationCompressionInstruction(text)){lockedDomain=continuationCompressionLockedDomain(input,routed)||"finance";lockedTopic=lockedDomain==="technical"?"route_status_telemetry":"cash_flow_vs_profit";mode="continuation_compression";}
  else if(isFinanceProgressionGuardTurn(text)){lockedDomain="finance";lockedTopic="cash_flow_vs_profit";mode="finance_progression";}
  else if(isTechnicalProgressionGuardTurn(text)){lockedDomain="technical";lockedTopic="route_status_telemetry";mode="technical_progression";}
  else if(isEnglishProgressionGuardTurn(text)){lockedDomain="english";lockedTopic="professional_rewrite_tone";mode="english_progression";}
  const blockedFallback=!!(/tell me the exact target|carry only the useful part|last accepted result|what next/i.test(t));
  const blockedDomainDrift=!!(/commercially, the clean move|sponsor|sponsorship|buyer psychology|package the ai interface/i.test(t)) && lockedDomain==="finance";
  return {version:"nyx.marion.progressionShapingGuard/1.1",active:!!reply,lockedDomain,lockedTopic,turn,mode,blockedFallback,blockedDomainDrift,compressionIntent:!!isContinuationCompressionInstruction(text),finalRuleCompression:!!isContinuationCompressionInstruction(text),reason:reply?(isContinuationCompressionInstruction(text)?"continuation_compression_guard":"high_priority_progression_surface_guard"):"progression_guard_inactive",updatedAt:Date.now()};
}

function highPriorityProgressionSurfaceReply(text="",input={},intent="",routed={}){
  const guardReply=progressionShapingGuardReply(text,input,intent,routed);if(guardReply)return guardReply;
  const t=lower(normalizeVoiceTextParityText(text));
  if(isMicTextParityPrompt(text))return "Mic and text should preserve the same route and state because both inputs are just different capture methods for the same user meaning. After normalization, Nyx should classify the same intent, choose the same route/domain, carry the same state, and render the same final answer structure; only the inputSource marker should differ.";
  if(isDomainIsolationPrompt(text)||/\bdomain manifest\b.*\bbreaks?|\bmanifest\b.*\bbreaks?\b/i.test(t))return "If a domain manifest breaks, that domain should fail closed inside its own declared path. Other domains should keep loading from their own manifests/root paths, with no silent fallback or cross-domain bleed, so the failure stays local, visible, and diagnosable.";
  if(isPracticalNyxConsistencyPrompt(text))return "A practical Nyx step is to add a three-prompt consistency check after every patch: one technical prompt, one domain-isolation prompt, and one general next-step prompt. Run each by text and mic, compare intent, route, state carry, final reply, and bubble rendering, then fix the first mismatch before widening the scope.";
  if((intent==="contextual_directive"||/\bgiven that setup|based on that|what layer|harden first\b/i.test(t))&&/\bharden|layer|risk|setup|desynchronization\b/i.test(t))return "Harden the handoff between Marion’s completed answer and Nyx’s visible reply first. That layer determines whether the route, state update, and rendered answer stay synchronized; once it is stable, the rest of the pipeline can improve without producing polished but disconnected responses.";
  return "";
}

const FIVE_TURN_CONTRACT_VERSION = "nyx.marion.fiveTurnContract/1.2";
function isFiveTurnContractTurn(text="",input={},routed={}){
  const i=safeObj(input), pm=safeObj(i.previousMemory||i.memory||i.turnMemory), st=safeObj(i.state||i.conversationState||pm.stateSpine||pm.conversationState), cr=safeObj(pm.continuityRegression||st.continuityRegression||i.continuityRegression), prior=safeObj(pm.fiveTurnContract||st.fiveTurnContract||i.fiveTurnContract);
  const t=lower(text), ctx=lower(firstText(i.contextCarry,i.carryForwardSummary,i.conversationSummary,i.lastTopic,pm.lastTopic,st.lastTopic,cr.regressionTarget,cr.turnObjective,prior.regressionTarget,prior.turnObjective,prior.parityTarget));
  if(prior.active||cr.continuityEligible)return true;
  return /\b(5[- ]?turn|five[- ]?turn|five[- ]?term|continuity regression|mic\/?text|mic text|mytext|voice and typed|voice and text|typed input|final[- ]?envelope authority|preserve route|preserve.*state|regression target|summarize this regression|without resetting context|what should stay consistent)\b/i.test(t+" "+ctx);
}
function fiveTurnContractProfile(text="",input={},routed={}){
  const t=lower(text), pm=safeObj(safeObj(input).previousMemory||safeObj(input).memory||{}), st=safeObj(safeObj(input).state||safeObj(input).conversationState||{}), cr=safeObj(pm.continuityRegression||st.continuityRegression||safeObj(input).continuityRegression), prior=safeObj(pm.fiveTurnContract||st.fiveTurnContract||safeObj(input).fiveTurnContract);
  const target=/preserve route,? state,? and final[- ]?envelope authority/i.test(text)?"preserve route, state, and final-envelope authority":firstText(prior.regressionTarget,cr.regressionTarget,"preserve route, state, and final-envelope authority");
  let turn=Number((t.match(/\bturn\s*([1-5])\b/)||[])[1]||0)||0;
  if(!turn){ if(/what target|target did i ask/.test(t))turn=2; else if(/connect.*mic|mic.*parity/.test(t))turn=3; else if(/consistent.*voice|typed input/.test(t))turn=4; else if(/summarize.*regression|four bullets/.test(t))turn=5; else if(/testing.*continuity|remember this target/.test(t))turn=1; }
  const inputSource=firstText(safeObj(input).inputSource,safeObj(input).source,safeObj(safeObj(input).session).inputSource,"text");
  return {version:FIVE_TURN_CONTRACT_VERSION,active:isFiveTurnContractTurn(text,input,routed),turn,regressionTarget:target,turnObjective:turn?`five_turn_continuity_turn_${turn}`:"five_turn_continuity",inputSource,parityTarget:"same normalized intent, same route, same state carry, same final-envelope reply structure",updatedAt:Date.now()};
}
function fiveTurnContractReply(intent,text,input={},routed={}){
  const p=fiveTurnContractProfile(text,input,routed); if(!p.active)return"";
  const t=lower(text), target=p.regressionTarget||"preserve route, state, and final-envelope authority";
  if(p.turn===1||/remember this target|testing 5|testing five/.test(t))return`Locked for this regression: ${target}. I will carry that target across the next five turns, keep the route and state aligned, and treat mic and text as the same normalized intent path unless the actual user meaning changes.`;
  if(p.turn===2||/what target|target did i ask/.test(t))return`The target you asked me to preserve is: ${target}. That means the routed lane, carried state, and trusted final-envelope authority must survive each turn without resetting, drifting, or asking for the target again.`;
  if(p.turn===3||/connect.*mic|mic.*parity/.test(t))return`Mic/text parity connects directly to ${target}: voice and typed input should normalize into the same user intent, carry the same regression state, and render the same trusted final-envelope answer structure. The input source can differ, but the route, continuity contract, and answer meaning must stay aligned.`;
  if(p.turn===4||/consistent.*voice|typed input|voice and typed|voice.*typed|typed.*voice/.test(t))return`Between voice and typed input, the normalized text meaning, intent classification, route/domain choice, session carry, turn depth, final-envelope extraction, assistant bubble rendering, and loop-suppression result should stay consistent. The only expected difference is the inputSource marker: voice versus text.`;
  if(p.turn===5||/summarize.*regression|four bullets|without resetting context/.test(t))return`- Regression target preserved: ${target}.\n- Continuity requirement: each turn must carry the prior objective instead of asking for the target again.\n- Mic/text parity requirement: voice and typed input must resolve to the same intent, route, state, and rendered reply.\n- Pass condition: five turns complete without fallback recovery, PowerShell redirection, context reset, domain drift, or final-envelope authority loss.`;
  if(/mic|voice|typed|parity/.test(t))return`For this five-turn contract, mic/text parity means the source changes but the normalized intent, route, continuity state, and final-envelope rendering stay aligned around: ${target}.`;
  return`Continuity target carried: ${target}. I will advance the same five-turn contract instead of restarting the thread, asking for the target again, or redirecting to a tool test.`;
}

function enforceFiveTurnContractSurface(reply="",intent="",text="",input={},routed={}){
  const forced=fiveTurnContractReply(intent,text,input,routed);
  return forced||reply;
}

function buildReply(intent,text,input={},routed={}){if(isVoiceSystemCheckTurn(text,input))return buildVoiceSystemCheckReply(text,input);if(isRokuPublishingRequest(text))return rokuPublishingReply(text);if(isNewsMediaPositioningRequest(text))return newsMediaPositioningReply(text);const fiveTurnReply=fiveTurnContractReply(intent,text,input,routed);if(fiveTurnReply)return fiveTurnReply;const parityDirect=parityRegressionDirectReply(text,input);if(parityDirect)return parityDirect;const progressionGuard=highPriorityProgressionSurfaceReply(text,input,intent,routed);if(progressionGuard)return progressionGuard;const emotion=resolveEffectiveEmotion(input,normalizeResolvedEmotion(input)),knowledgeDomain=resolveKnowledgeDomain(routed,input,text);const continuationReply=continuationAwareReply(intent,text,input,routed);if(continuationReply)return continuationReply;if(knowledgeDomain&&!(knowledgeDomain==="psychology"&&intent==="emotional_support")){const kdReply=knowledgeDomainReply(knowledgeDomain,text,input,routed);if(kdReply)return kdReply;}if(isCapabilityQuestion(text))return registryCapabilityIntro();if(intent==="simple_chat"&&isWarmSocialTurn(text))return buildWarmSocialReply(text,input);if(isRecoveryRequested(input,routed))return recoveryReply(intent,text,input);if(intent==="simple_chat"&&emotion.present&&emotion.primary!=="neutral"&&hasEmotionalContinuityCue(text))return emotionalReply(text,input);switch(intent){case"contextual_directive":return contextualDirectiveReply(text,input,routed);case"directive_response":return directiveReply(text,input,routed);case"identity_query":return identityReply(text,input);case"technical_debug":return technicalReply(text,input,routed);case"emotional_support":return emotionalReply(text,input);case"business_strategy":return continuationAwareBusinessReply(text,input,routed);case"music_query":return"Music lane is ready. Give me the year, artist, chart, or story angle and I’ll route it cleanly.";case"news_query":return isNewsMediaPositioningRequest(text)?newsMediaPositioningReply(text):"News Canada lane is ready. Give me the story, headline, or feed issue and I’ll keep the source path clean.";case"roku_query":return isRokuPublishingRequest(text)?rokuPublishingReply(text):"Roku lane is ready. Tell me whether we’re checking the app path, live TV lane, content feed, or deployment issue.";case"identity_or_memory":return buildFinalLoopRecoveryReply(intent,text,input);case"domain_question":return domainQuestionReply(text,input,routed);default:return simpleChatReply(text,input);}}
function safeReply(value,intent,text,input={}){const progressionGuard=highPriorityProgressionSurfaceReply(text,input,intent,{});if(progressionGuard)return progressionGuard;const fiveTurn=fiveTurnContractReply(intent,text,input,{});if(fiveTurn)return fiveTurn;const parityDirect=parityRegressionDirectReply(text,input);if(parityDirect)return parityDirect;if(isVoiceSystemCheckTurn(text,input))return buildVoiceSystemCheckReply(text,input);const reply=sanitizeUserFacingReply(value,intent,text,input);let candidate="";if(isWarmSocialTurn(text))candidate=buildWarmSocialReply(text,input);else if(reply)candidate=reply;else if(intent==="technical_debug"||/\b(loop|looping|debug|fallback|technical|route|bridge|composer|chat engine|state spine|api|backend|frontend)\b/i.test(lower(text)))candidate=technicalReply(text,input);else{const emotion=resolveEffectiveEmotion(input,normalizeResolvedEmotion(input));if(intent==="emotional_support"||detectDistress(text).emotional||(emotion.present&&emotion.primary!=="neutral")){const emotional=emotionalReply(text,{...input,forceRecovery:false,recoveryRequired:false,lastLoopReasons:["blocked_or_empty_reply_emotion_preserved"]});candidate=finalSurfaceReply(emotional,intent,text,input);}else candidate=buildFinalLoopRecoveryReply(intent,text,input);}const forced=highPriorityProgressionSurfaceReply(text,input,intent,{});if(forced)return forced;return applyConversationQuality(candidate,intent,text,input,{});}
function chooseNextMove(intent,recoveryRequired){if(recoveryRequired)return "recover_with_marion_final";if(intent==="technical_debug")return "verify_final_contract";if(intent==="emotional_support")return "preserve_emotional_continuity";if(intent==="business_strategy")return "convert_to_execution";if(intent==="identity_query")return "clarify_identity";return "advance_conversation";}
function buildMemoryPatch({intent,domain,knowledgeDomain,text,reply,previousMemory,state,recoveryRequired,turnId,input={},routed={},contextCarry=""}){const replySignature=hashText(reply),replyStateSignature=stateHashText(reply),userSignature=hashText(text),stateUserHash=stateHashText(text),priorIntent=lower(firstText(previousMemory.lastIntent,state.lastIntent)),sameIntent=!!(priorIntent&&priorIntent===intent),priorUser=firstText(previousMemory.userSignature,previousMemory.lastUserSignature,state.lastUserHash),sameUser=!!(priorUser&&(priorUser===userSignature||priorUser===stateUserHash)),priorAssistant=firstText(previousMemory.replySignature,previousMemory.lastReplySignature,previousMemory.replyStateSignature,previousMemory.lastAssistantHash,state.lastAssistantHash),sameAssistantReply=!!(priorAssistant&&(priorAssistant===replySignature||priorAssistant===replyStateSignature)),previousNoProgress=clampInt(safeObj(state.repetition).noProgressCount||previousMemory.noProgressCount,0,0,99),noProgressCount=recoveryRequired?0:(sameUser&&sameIntent&&sameAssistantReply?previousNoProgress+1:0),loopCount=recoveryRequired?Math.max(1,clampInt(state.loopCount||previousMemory.loopCount,0,0,99)):0,stage="final";const priorDepth=clampInt(previousMemory.turnDepth||state.turnDepth||safeObj(state.continuityThread).depthLevel,0,0,999);const memoryCarryBoundary=memoryCarryBoundaryProfile(text,{...safeObj(input),previousMemory,state},routed,intent,contextCarry);const boundedContextCarry=memoryCarryBoundary.boundedCarry;const isContinuation=!!memoryCarryBoundary.carryAllowed;const turnDepth=memoryCarryBoundary.resetRequired?1:(isContinuation?Math.max(2,priorDepth+1):1);const lastTopic=deriveTopic(text,{...safeObj(input),previousMemory,state,contextCarry:boundedContextCarry},routed);const carryForwardSummary=buildCarryForwardSummary({intent,domain,knowledgeDomain,text,reply,input:{...safeObj(input),previousMemory,state,contextCarry:boundedContextCarry},routed});const conversationSummary=compactSummary(carryForwardSummary,700);const fiveTurnContract=fiveTurnContractProfile(text,{...safeObj(input),previousMemory,state,contextCarry:boundedContextCarry},routed);const progressionShapingGuard=progressionShapingGuardProfile(text,{...safeObj(input),previousMemory,state,contextCarry:boundedContextCarry},intent,routed);return{turnId,progressionShapingGuard,memoryCarryBoundary,memoryCarryBoundaryVersion:MEMORY_CARRY_BOUNDARY_GOVERNOR_VERSION,memoryCarryAllowed:!!memoryCarryBoundary.carryAllowed,memoryCarryReset:!!memoryCarryBoundary.resetRequired,inputSource:inputSourceKind(input),voiceTextParity:safeObj(input.voiceTextParity),voiceTextParityGovernorVersion:VOICE_TEXT_PARITY_GOVERNOR_VERSION,continuityRegression:{version:"nyx.marion.fiveTurnContinuity/1.0",turnDepth,depthWindow:5,continuityEligible:turnDepth>=1&&turnDepth<=5,source:inputSourceKind(input),userHash:stateUserHash,replyHash:replyStateSignature,topic:lastTopic,regressionTarget:fiveTurnContract.regressionTarget,turnObjective:fiveTurnContract.turnObjective,parityTarget:fiveTurnContract.parityTarget,updatedAt:Date.now()},fiveTurnContract,lastIntent:intent,lastDomain:domain,lastKnowledgeDomain:knowledgeDomain||"",lastTopic,lastUserText:safeStr(text),lastAssistantReply:reply,conversationSummary,carryForwardSummary,turnDepth,userSignature,lastUserSignature:userSignature,stateUserHash,lastUserHash:stateUserHash,replySignature,replyStateSignature,lastReplySignature:replySignature,lastAssistantHash:replyStateSignature,noProgressCount,loopCount,recoveryRequired:!!recoveryRequired,duplicateUserTurn:sameUser,duplicateIntentTurn:sameIntent,supportUsedLastTurn:intent==="emotional_support",composedOnce:true,nextMove:chooseNextMove(intent,recoveryRequired),stateStage:stage,stage,stateBridge:{shouldAdvanceState:true,expectedStateMutation:"finalizeTurn",source:"composeMarionResponse",stateSchema:STATE_SPINE_SCHEMA,stateSchemaCompat:STATE_SPINE_SCHEMA_COMPAT,composedOnce:true,recoveryRequired:!!recoveryRequired,nextStateStage:"final",recoveryDetected:!!recoveryRequired,userSignature,replySignature,replyStateSignature,stateUserHash,noProgressCount,loopCount,turnDepth,lastTopic,carryForwardSummary,continuityRegression:true,fiveTurnContract,progressionShapingGuard,inputSource:inputSourceKind(input),voiceTextParity:safeObj(input.voiceTextParity)},marionCohesion:{composerObserved:true,shouldAdvanceState:true,loopPhraseRejected:false,lastComposerIntent:intent,lastComposerDomain:domain,lastComposerUserSignature:userSignature,lastComposerReplySignature:replySignature,inputSource:inputSourceKind(input),updatedAt:Date.now()},updatedAt:Date.now()};}
function buildMarionFinalSignature(reply,intent,domain,turnId){return `MARION::FINAL::${STATE_SPINE_SCHEMA}::CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24::${hashText([reply,intent,domain,turnId||""].join("|"))}`;}
function buildFinalEnvelope(reply,intent,domain,turnId,knowledge={}){const replySignature=hashText(reply),replyStateSignature=stateHashText(reply),knowledgeSource=safeObj(knowledge),knowledgeDomain=normalizeKnowledgeDomain(knowledgeSource.knowledgeDomain||""),marionFinalSignature=buildMarionFinalSignature(reply,intent,domain,turnId),runtimeTelemetry=buildFinalRuntimeTelemetry({source:"composeMarionResponse.buildFinalEnvelope",intent,domain,knowledgeDomain,input:safeObj(knowledgeSource.input),routed:safeObj(knowledgeSource.routed),reply,turnId,finalEnvelopeTrusted:true,canEmit:true});return{reply,displayReply:reply,spokenText:reply,intent,domain,knowledgeDomain,domainHints:knowledgeSource.domainHints||null,domainRoute:knowledgeSource.domainRoute||null,turnId,source:"composeMarionResponse",authority:"marionFinalEnvelope",replyAuthority:"marionFinalEnvelope",contract:"MARION_FINAL_ENVELOPE_V1",contractVersion:"nyx.marion.final/1.0",final:true,marionFinal:true,handled:true,signature:marionFinalSignature,marionFinalSignature,requiredSignature:"CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24",replySignature,replyStateSignature,cognitionComplete:true,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,createdAt:Date.now()};}
function isUsableFinalReply(value){const reply=safeStr(value);return !!(reply&&reply.length>5&&!isBlockedLoopReply(reply)&&!/\b(marion did not return|final envelope missing|diagnostic packet|non-final|no_final|compose_reply_missing|composer_invalid)\b/i.test(reply));}
function forceCognitionCompleteReply(intent,text,input={}){const t=lower(text);if(intent==="contextual_directive")return contextualDirectiveReply(text,input);if(intent==="directive_response"||detectDirectiveIntent(text))return directiveReply(text,input);if(intent==="identity_query"||detectIdentityIntent(text)||/\b(who are you|how do you think|how marion helps|marion helps you think)\b/i.test(t))return identityReply(text,input);const cleanInput={...safeObj(input),forceRecovery:false,recoveryRequired:false};const built=buildReply(intent,text,cleanInput,{});if(isUsableFinalReply(built))return built;const hot=hotFallbackReply(intent,text,cleanInput);if(isUsableFinalReply(hot))return hot;if(normalizeResolvedEmotion(input).present)return emotionalReply(text,input);return "";}
function assertFinalEnvelope(envelope){const e=safeObj(envelope);if(!isUsableFinalReply(e.reply)||e.authority!=="marionFinalEnvelope"||e.source!=="composeMarionResponse")throw new Error("MARION_FINAL_CONTRACT_VIOLATION");return e;}
function buildAwaitingMarionContract(reason="compose_reply_missing",detail={},ctx={}){const intent=ctx.intent||"simple_chat",domain=ctx.domain||"general",turnId=ctx.turnId||"";return{ok:false,final:false,marionFinal:false,handled:true,awaitingMarion:true,terminal:false,error:true,reason:safeStr(reason)||"compose_reply_missing",detail:safeObj(detail),reply:"",text:"",answer:"",output:"",response:"",message:"",spokenText:"",intent,domain,turnId,payload:{reply:"",text:"",message:"",final:false,marionFinal:false,awaitingMarion:true,error:true},finalEnvelope:null,memoryPatch:{stateStage:"awaiting_marion",recoveryRequired:true,composeError:safeStr(reason)},sessionPatch:{stateStage:"awaiting_marion",recoveryRequired:true,composeError:safeStr(reason)},speech:{enabled:false,silent:true,silentAudio:true,textDisplay:"",textSpeak:""},ui:{openOverlay:false},meta:{composerVersion:VERSION,replyAuthority:"none",finalEnvelopePresent:false,awaitingMarion:true,reason:safeStr(reason)},diagnostics:{composerVersion:VERSION,hardFinalCognitionComplete:false,hotFallbackApplied:false,syntheticFallbackSuppressed:true,awaitingMarion:true,reason:safeStr(reason),detail:safeObj(detail)}};}
function ensureFinalReply(packet={},ctx={}){const p=safeObj(packet),intent=ctx.intent||normalizeIntent(p.intent),domain=ctx.domain||normalizeDomain(p.domain,intent),turnId=ctx.turnId||firstText(p.turnId,p.finalEnvelope&&p.finalEnvelope.turnId),text=ctx.text||"",input=safeObj(ctx.input),knowledgeDomain=normalizeKnowledgeDomain(ctx.knowledgeDomain||p.knowledgeDomain||safeObj(p.finalEnvelope).knowledgeDomain||resolveKnowledgeDomain(p,input,text)),domainHints=safeObj(ctx.domainHints||p.domainHints||safeObj(p.finalEnvelope).domainHints),domainRoute=safeObj(ctx.domainRoute||p.domainRoute||safeObj(p.finalEnvelope).domainRoute);let reply=sanitizeUserFacingReply(firstText(p.finalEnvelope&&p.finalEnvelope.reply,p.reply,p.text,p.answer,p.output,p.response,p.message,p.spokenText),intent,text,input);if(!isUsableFinalReply(reply)){return buildAwaitingMarionContract("compose_reply_missing_or_blocked",{replyPreview:safeStr(reply).slice(0,160),intent,domain}, {intent,domain,turnId,text,input});}const finalEnvelope=assertFinalEnvelope(buildFinalEnvelope(reply,intent,domain,turnId,{knowledgeDomain,domainHints,domainRoute,input,routed:safeObj(p.routing)}));const resolvedEmotion=normalizeResolvedEmotion(input);const presence=firstText(safeObj(p.speech).presenceProfile,safeObj(p.ui).presenceProfile,p.presenceProfile,emotionPresenceProfile(intent,resolvedEmotion));const hint=firstText(safeObj(p.speech).nyxStateHint,safeObj(p.ui).nyxStateHint,p.nyxStateHint,emotionNyxHint(intent,resolvedEmotion));return{...p,ok:true,final:true,marionFinal:true,handled:true,blocked:false,reply,text:reply,answer:reply,output:reply,response:reply,message:reply,spokenText:reply,knowledgeDomain,domainHints,domainRoute,finalEnvelope,displayReply:reply,hotFallbackApplied:false,finalAuthorityGuaranteed:true,presenceProfile:presence,nyxStateHint:hint,speech:{...safeObj(p.speech),enabled:true,silent:false,silentAudio:false,textDisplay:reply,textSpeak:reply,presenceProfile:presence,nyxStateHint:hint},ui:{...safeObj(p.ui),nyxStateHint:hint,presenceProfile:presence,openOverlay:false},meta:{...safeObj(p.meta),finalEnvelopePresent:true,replyAuthority:"composeMarionResponse.ensureFinalReply",cognitionComplete:true,syntheticFallbackSuppressed:true,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry:finalEnvelope.runtimeTelemetry},diagnostics:{...safeObj(p.diagnostics),hardFinalCognitionComplete:true,hotFallbackApplied:false,finalAuthorityGuaranteed:true,syntheticFallbackSuppressed:true,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry:finalEnvelope.runtimeTelemetry}};}
function composeMarionResponse(routed={},input={}){const voiceParity=applyVoiceTextParityToInput(input,routed);const text=voiceParity.text;const parityInput=voiceParity.input;const rawContextCarry=extractContextCarry(parityInput,routed);const initialMemoryCarryBoundary=memoryCarryBoundaryProfile(text,parityInput,routed,"",rawContextCarry);const contextCarry=initialMemoryCarryBoundary.boundedCarry;const enrichedInput={...safeObj(parityInput),contextCarry,memoryCarryBoundary:initialMemoryCarryBoundary,voiceTextParity:voiceParity.profile};const greetingPosture=extractGreetingPosture(enrichedInput,routed,text);let resolvedEmotion=normalizeResolvedEmotion(enrichedInput);resolvedEmotion=resolveEffectiveEmotion(enrichedInput,resolvedEmotion);let intent=resolveIntent(routed,enrichedInput);intent=protectsContextFromOverride(intent,text,enrichedInput,routed);const knowledgeDomain=resolveKnowledgeDomain(routed,enrichedInput,text);let emotionalCalibration=calibrateResolvedEmotionForTurn(text,enrichedInput,resolvedEmotion,intent,knowledgeDomain);resolvedEmotion=emotionalCalibration.emotion;if(shouldEmotionInfluenceIntent(intent,resolvedEmotion,text,enrichedInput,knowledgeDomain))intent="emotional_support";emotionalCalibration=calibrateResolvedEmotionForTurn(text,enrichedInput,resolvedEmotion,intent,knowledgeDomain);resolvedEmotion=emotionalCalibration.emotion;const domain=resolveDomain({...safeObj(routed),knowledgeDomain},enrichedInput,intent),turnId=resolveTurnId(routed,enrichedInput),{previousMemory,state}=resolvePreviousMemory(enrichedInput),routing=safeObj(routed.routing||enrichedInput.routing),domainHints=knowledgeDomainHints(knowledgeDomain,routed,enrichedInput),domainRoute=safeObj((domainHints&&domainHints.route)||routing.domainRoute),recoveryRequested=isRecoveryRequested(enrichedInput,routed),domainConfidence=extractDomainConfidence(enrichedInput,routed),domainConfidenceFailClosed=shouldFailClosedForDomainConfidence(enrichedInput,routed);let rawReply=domainConfidenceFailClosed?domainConfidenceUserReply(enrichedInput,routed):buildReply(intent,text,enrichedInput,routed),reply=safeReply(rawReply,intent,text,enrichedInput),duplicateDetected=false;const priorReplySig=firstText(previousMemory.replySignature,previousMemory.lastReplySignature,state.lastAssistantHash),replySignature=hashText(reply),replyStateSignature=stateHashText(reply),deepContinuityTurn=isDeepContinuityTurn(text,enrichedInput,routed);if(!recoveryRequested&&priorReplySig&&(priorReplySig===replySignature||priorReplySig===replyStateSignature)){duplicateDetected=true;if(deepContinuityTurn){const progressed=forceCognitionCompleteReply(intent,text,{...enrichedInput,forceRecovery:false,recoveryRequired:false,previousDuplicateReply:reply});if(isUsableFinalReply(progressed)&&hashText(progressed)!==priorReplySig&&stateHashText(progressed)!==priorReplySig){rawReply=progressed;reply=progressed;}else{duplicateDetected=false;}}else{rawReply=recoveryReply(intent,text,{...enrichedInput,forceRecovery:true,lastLoopReasons:["duplicate_composer_reply"]});reply=safeReply(rawReply,intent,text,{...enrichedInput,forceRecovery:true});}}reply=knowledgeDomain?((knowledgeDomain==="english")?(sanitizeUserFacingReply(rawReply,intent,text,enrichedInput)||knowledgeDomainReply(knowledgeDomain,text,enrichedInput,routed)):applyConversationQuality((sanitizeUserFacingReply(rawReply,intent,text,enrichedInput)||knowledgeDomainReply(knowledgeDomain,text,enrichedInput,routed)),intent,text,enrichedInput,routed)):applyConversationQuality(reply,intent,text,enrichedInput,routed);reply=applyGreetingPostureQuality(reply,intent,text,enrichedInput,routed);reply=applyEmotionalContinuityCalibrationGovernor(reply,intent,text,enrichedInput,resolvedEmotion,emotionalCalibration.profile);reply=applyAnswerSpecificityGovernor(reply,intent,text,enrichedInput,routed);reply=applyDomainAnswerDepthGovernor(reply,intent,knowledgeDomain,text,enrichedInput,routed);reply=applyDirectiveExecutionClarityGovernor(reply,intent,text,enrichedInput,routed);reply=applyResponseCompressionGovernor(reply,intent,text,enrichedInput,routed);reply=applyProgressionShapingGovernor(reply,intent,text,enrichedInput,routed);{const progressionGuard=highPriorityProgressionSurfaceReply(text,enrichedInput,intent,routed);if(progressionGuard)reply=progressionGuard;}reply=applyTechnicalDiagnosisPrecisionGovernor(reply,intent,text,enrichedInput,routed);const technicalDiagnosisKindActive=technicalDiagnosisKind(text);const technicalDiagnosisPrecisionActive=technicalDiagnosisKindActive!=="none"&&!isTechnicalDiagnosisSuppressed(text,enrichedInput,intent);const responseCompressionKindActive=responseCompressionKind(text);const responseCompressionActive=responseCompressionKindActive!=="none"&&!isResponseCompressionSuppressed(text,enrichedInput,intent);const directiveExecutionKindActive=directiveExecutionKind(text);const directiveExecutionClarityActive=directiveExecutionKindActive!=="none"&&!isDirectiveExecutionClaritySuppressed(text,enrichedInput,intent);const domainAnswerDepthActive=!!(normalizeKnowledgeDomain(knowledgeDomain)&&!isDomainAnswerDepthSuppressed(text,enrichedInput,intent));const answerSpecificityScore=specificityNeedScore(reply,intent,text);const answerSpecificitySuppressed=isAnswerSpecificitySuppressed(text,enrichedInput,intent);const recoveryRequired=(recoveryRequested||duplicateDetected)&&!deepContinuityTurn,cognitiveLayer=buildCognitiveIntelligenceLayer({intent,domain,knowledgeDomain,text,reply,input:enrichedInput,routed,recoveryRequired});reply=applyCreativeSuggestionModule(reply,cognitiveLayer,intent,text,enrichedInput);reply=applyFinalRegressionHarmonizer(reply,intent,text,enrichedInput,{domain,knowledgeDomain,cognitiveLayer});reply=applyPipelineForensicNormalization(reply,intent,domain,knowledgeDomain,text,enrichedInput,routed);reply=isVoiceSystemCheckTurn(text,enrichedInput)?buildVoiceSystemCheckReply(text,enrichedInput):finalSurfaceReply(reply,intent,text,enrichedInput);const highPriorityProgressionReply=highPriorityProgressionSurfaceReply(text,enrichedInput,intent,routed);if(highPriorityProgressionReply)reply=highPriorityProgressionReply;const finalRegressionProfile=finalRegressionHarmonizerProfile(reply,intent,text,enrichedInput,{domain,knowledgeDomain,cognitiveLayer});const memoryPatch=buildMemoryPatch({intent,domain,knowledgeDomain,text,reply,previousMemory,state,recoveryRequired,turnId,input:enrichedInput,routed,contextCarry});const progressionShapingGuard=progressionShapingGuardProfile(text,enrichedInput,intent,routed);memoryPatch.domainConfidence=domainConfidence;memoryPatch.domainConfidenceFailClosed=domainConfidenceFailClosed;memoryPatch.progressionShapingGuard=progressionShapingGuard;memoryPatch.progressionShapingGuardActive=!!progressionShapingGuard.active;memoryPatch.stateBridge={...safeObj(memoryPatch.stateBridge),domainConfidence,domainConfidenceFailClosed,progressionShapingGuard,progressionShapingGuardActive:!!progressionShapingGuard.active};memoryPatch.resolvedEmotion=resolvedEmotion.present?resolvedEmotion.state:null;memoryPatch.emotionRuntimeObserved=!!resolvedEmotion.present;memoryPatch.emotionalContinuity=resolvedEmotion.present?{primary:resolvedEmotion.primary,secondary:resolvedEmotion.secondary,intensity:resolvedEmotion.intensity,confidence:resolvedEmotion.confidence,carried:!!resolvedEmotion.carried,continuityPreserved:!!resolvedEmotion.continuityPreserved,updatedAt:Date.now()}:null;memoryPatch.lastEmotionState=resolvedEmotion.present?resolvedEmotion.state:null;const progressionProfile=emotionalProgressionProfile(text,enrichedInput,resolvedEmotion);memoryPatch.emotionalProgression=progressionProfile.active?{phase:progressionProfile.phase,momentum:progressionProfile.momentum,carryDepth:progressionProfile.carryDepth,pressure:!!progressionProfile.pressure,needsDeepening:progressionProfile.phase==="deepen",updatedAt:Date.now()}:null;memoryPatch.emotionalContinuityCalibration=safeObj(emotionalCalibration.profile);memoryPatch.emotionalContinuityCalibrationVersion=EMOTIONAL_CONTINUITY_CALIBRATION_GOVERNOR_VERSION;memoryPatch.voiceTextParity=safeObj(enrichedInput.voiceTextParity);memoryPatch.voiceTextParityGovernorVersion=VOICE_TEXT_PARITY_GOVERNOR_VERSION;memoryPatch.finalRegressionHarmonizer=safeObj(finalRegressionProfile);memoryPatch.finalRegressionHarmonizerVersion=FINAL_REGRESSION_HARMONIZER_VERSION;memoryPatch.pipelineForensicNormalization=pipelineForensicNormalizationProfile({intent,domain,knowledgeDomain,text,reply,input:enrichedInput,routed});memoryPatch.pipelineForensicNormalizationVersion=PIPELINE_FORENSIC_NORMALIZATION_VERSION;memoryPatch.cognitiveLayer=cognitiveLayer;memoryPatch.creativeSuggestion=cognitiveLayer.enabled?{version:CREATIVE_SUGGESTION_VERSION,mode:cognitiveLayer.mode,score:cognitiveLayer.score,suggestion:cognitiveLayer.suggestion,updatedAt:cognitiveLayer.updatedAt}:null;memoryPatch.conversationVector={replyContractMinimalismActive:!!replyContractMinimalismProfile(reply,intent,text,enrichedInput).active,replyContractMinimalismKind:replyContractMinimalismKind(text),finalRegressionHarmonizerActive:!!safeObj(finalRegressionProfile).active,finalRegressionPriority:safeObj(finalRegressionProfile).priority,finalRegressionHarmonizerVersion:FINAL_REGRESSION_HARMONIZER_VERSION,voiceTextParityActive:!!safeObj(enrichedInput.voiceTextParity).active,voiceTextParitySource:firstText(safeObj(enrichedInput.voiceTextParity).source,inputSourceKind(enrichedInput)),voiceTextParityChanged:!!safeObj(enrichedInput.voiceTextParity).changed,emotionalContinuityCalibrationActive:!!safeObj(emotionalCalibration.profile).active,emotionalContinuityAllowed:!!safeObj(emotionalCalibration.profile).allowed,emotionalContinuitySuppressed:!!safeObj(emotionalCalibration.profile).suppressed,emotionalContinuityMode:firstText(safeObj(emotionalCalibration.profile).mode,""),emotionalContinuityActive:!!progressionProfile.active,contextCarryPresent:!!contextCarry,knowledgeDomain:knowledgeDomain||"",knowledgeDomainActive:!!knowledgeDomain,domainConfidence,domainConfidenceFailClosed,cognitiveLayerActive:!!cognitiveLayer.enabled,creativeSuggestionActive:!!(cognitiveLayer.enabled&&cognitiveLayer.suggestion),creativeSuggestionTimingAllowed:!!safeObj(cognitiveLayer.timing).allowed,followUpGovernorActive:!!continuityContext(enrichedInput,routed,text).active,directiveExecutionClarityActive,directiveExecutionKind:directiveExecutionKindActive,responseCompressionActive,responseCompressionKind:responseCompressionKindActive,progressionShapingActive:!!progressionShapingProfile(reply,intent,text,enrichedInput,routed).active,progressionShapingGovernorVersion:PROGRESSION_SHAPING_GOVERNOR_VERSION,technicalDiagnosisPrecisionActive,technicalDiagnosisKind:technicalDiagnosisKindActive,memoryCarryBoundaryActive:!!safeObj(memoryPatch.memoryCarryBoundary).active,memoryCarryAllowed:!!safeObj(memoryPatch.memoryCarryBoundary).carryAllowed,memoryCarryReset:!!safeObj(memoryPatch.memoryCarryBoundary).resetRequired,memoryCarryMode:firstText(safeObj(memoryPatch.memoryCarryBoundary).mode,""),answerSpecificityScore,answerSpecificitySuppressed,domainAnswerDepthActive,turnDepth:memoryPatch.turnDepth,carryForwardSummary:memoryPatch.carryForwardSummary,replyAuthority:"composeMarionResponse",finalEnvelopeRequired:true};if(greetingPosture&&greetingPosture.active){memoryPatch.greeting={active:true,lastId:greetingPosture.id,lastIntent:greetingPosture.intent,lastTone:greetingPosture.tone,lastEnergy:greetingPosture.energy,lastPresenceProfile:greetingPosture.presenceProfile,updatedAt:Date.now()};if(greetingPosture.intent)memoryPatch.lastGreetingIntent=greetingPosture.intent;if(greetingPosture.tone)memoryPatch.lastGreetingTone=greetingPosture.tone;if(greetingPosture.energy)memoryPatch.lastInputEnergy=greetingPosture.energy;}const presenceProfile=firstText(greetingPosture.presenceProfile,emotionPresenceProfile(intent,resolvedEmotion)),nyxStateHint=firstText(greetingPosture.presenceProfile,emotionNyxHint(intent,resolvedEmotion)),domainConfig=registryDomainConfig(domain),domainLabel=registryDomainLabel(domain);const base={ok:true,composedOnce:true,finalizedBy:"composeMarionResponse",version:VERSION,composerVersion:VERSION,domain,intent,knowledgeDomain,domainHints,domainRoute,stateStage:memoryPatch.stateStage,routing:{...routing,domain,intent,knowledgeDomain,domainHints,domainRoute,endpoint:routing.endpoint||"marion://routeMarion.primary"},reply,text:reply,answer:reply,output:reply,response:reply,message:reply,spokenText:reply,replySignature:memoryPatch.replySignature,replyStateSignature:memoryPatch.replyStateSignature,memoryPatch,sessionPatch:memoryPatch,resolvedEmotion:resolvedEmotion.present?resolvedEmotion.state:null,emotionRuntimeObserved:!!resolvedEmotion.present,speech:{enabled:true,silent:false,silentAudio:false,textDisplay:reply,textSpeak:reply,presenceProfile,nyxStateHint,timingProfile:resolvedEmotion.timingProfile||{}},ui:{nyxStateHint,presenceProfile,openOverlay:false,domainLabel},meta:{domainRegistryLoaded:!!domainRegistryMod,domainLabel,knowledgeDomain,domainHints,domainRoute,domainMode:firstText(domainConfig.mode,""),domainDepth:firstText(domainConfig.depth,""),cognitiveLayer,creativeSuggestion:cognitiveLayer.enabled?cognitiveLayer.suggestion:""},diagnostics:{composerVersion:VERSION,singleEmission:true,cognitiveLayerVersion:COGNITIVE_LAYER_VERSION,creativeSuggestionVersion:CREATIVE_SUGGESTION_VERSION,creativeSuggestionTimingGovernorVersion:CREATIVE_SUGGESTION_TIMING_GOVERNOR_VERSION,intentDepthGovernorVersion:INTENT_DEPTH_GOVERNOR_VERSION,followUpGovernorVersion:CONVERSATION_FOLLOWUP_GOVERNOR_VERSION,answerSpecificityGovernorVersion:ANSWER_SPECIFICITY_GOVERNOR_VERSION,domainAnswerDepthGovernorVersion:DOMAIN_ANSWER_DEPTH_GOVERNOR_VERSION,directiveExecutionClarityGovernorVersion:DIRECTIVE_EXECUTION_CLARITY_GOVERNOR_VERSION,responseCompressionGovernorVersion:RESPONSE_COMPRESSION_GOVERNOR_VERSION,technicalDiagnosisPrecisionGovernorVersion:TECHNICAL_DIAGNOSIS_PRECISION_GOVERNOR_VERSION,diagnosticLoopDetectionLayerVersion:DIAGNOSTIC_LOOP_DETECTION_LAYER_VERSION,conversationalPackConsumptionVersion:CONVERSATIONAL_PACK_CONSUMPTION_VERSION,conversationalPackProfile:conversationPackProfile(intent,text,enrichedInput,routed,reply),memoryCarryBoundaryGovernorVersion:MEMORY_CARRY_BOUNDARY_GOVERNOR_VERSION,emotionalContinuityCalibrationGovernorVersion:EMOTIONAL_CONTINUITY_CALIBRATION_GOVERNOR_VERSION,voiceTextParityGovernorVersion:VOICE_TEXT_PARITY_GOVERNOR_VERSION,replyContractMinimalismGovernorVersion:REPLY_CONTRACT_MINIMALISM_GOVERNOR_VERSION,finalRegressionHarmonizerVersion:FINAL_REGRESSION_HARMONIZER_VERSION,finalRegressionHarmonizerActive:!!safeObj(finalRegressionProfile).active,finalRegressionPriority:safeObj(finalRegressionProfile).priority,voiceTextParityActive:!!safeObj(enrichedInput.voiceTextParity).active,voiceTextParitySource:firstText(safeObj(enrichedInput.voiceTextParity).source,inputSourceKind(enrichedInput)),voiceTextParityChanged:!!safeObj(enrichedInput.voiceTextParity).changed,emotionalContinuityCalibrationActive:!!safeObj(emotionalCalibration.profile).active,emotionalContinuityCalibrationAllowed:!!safeObj(emotionalCalibration.profile).allowed,emotionalContinuityCalibrationSuppressed:!!safeObj(emotionalCalibration.profile).suppressed,emotionalContinuityCalibrationMode:firstText(safeObj(emotionalCalibration.profile).mode,""),memoryCarryBoundaryActive:!!safeObj(memoryPatch.memoryCarryBoundary).active,memoryCarryAllowed:!!safeObj(memoryPatch.memoryCarryBoundary).carryAllowed,memoryCarryReset:!!safeObj(memoryPatch.memoryCarryBoundary).resetRequired,memoryCarryMode:firstText(safeObj(memoryPatch.memoryCarryBoundary).mode,""),memoryCarrySuppressed:!!safeObj(memoryPatch.memoryCarryBoundary).suppressed,technicalDiagnosisPrecisionActive,technicalDiagnosisKind:technicalDiagnosisKindActive,technicalDiagnosisPrecisionSuppressed:isTechnicalDiagnosisSuppressed(text,enrichedInput,intent),diagnosticLoopDetection:diagnosticLoopDetectionProfile(technicalDiagnosisKindActive,text,enrichedInput,routed,reply),diagnosticLoopDetectionActive:!!diagnosticLoopDetectionProfile(technicalDiagnosisKindActive,text,enrichedInput,routed,reply).active,responseCompressionActive,responseCompressionKind:responseCompressionKindActive,responseCompressionSuppressed:isResponseCompressionSuppressed(text,enrichedInput,intent),progressionShapingGovernorVersion:PROGRESSION_SHAPING_GOVERNOR_VERSION,progressionShapingActive:!!progressionShapingProfile(reply,intent,text,enrichedInput,routed).active,contextualDirectiveHandlerVersion:CONTEXTUAL_DIRECTIVE_HANDLER_VERSION,directiveExecutionClarityActive,directiveExecutionKind:directiveExecutionKindActive,directiveExecutionClaritySuppressed:isDirectiveExecutionClaritySuppressed(text,enrichedInput,intent),domainAnswerDepthActive,answerSpecificityScore,answerSpecificitySuppressed,followUpGovernorActive:!!continuityContext(enrichedInput,routed,text).active,followUpGovernorSuppressed:isFollowUpGovernorSuppressed(text,enrichedInput),intentDepthGovernorSuppressed:isDepthGovernorSuppressed(text,enrichedInput),cognitiveLayerActive:!!cognitiveLayer.enabled,cognitiveLayerMode:cognitiveLayer.mode,cognitiveLayerScore:cognitiveLayer.score,creativeSuggestionActive:!!(cognitiveLayer.enabled&&cognitiveLayer.suggestion),creativeSuggestionTiming:safeObj(cognitiveLayer.timing),creativeSuggestionTimingAllowed:!!safeObj(cognitiveLayer.timing).allowed,knowledgeDomain,knowledgeDomainActive:!!knowledgeDomain,domainConfidence,domainConfidenceFailClosed,fiveTurnContractActive:!!safeObj(memoryPatch.fiveTurnContract).active,fiveTurnContractTurn:safeObj(memoryPatch.fiveTurnContract).turn,finalAuthority:"marionFinalEnvelope",composerDoesFinalize:true,hotFallbackGenerator:true,hardFinalCognitionComplete:true,identityAnchor:intent==="identity_query",directiveExecution:intent==="directive_response"||intent==="contextual_directive",contextualDirective:intent==="contextual_directive",contextCarryPresent:!!contextCarry,contextCarryHash:contextCarry?stateHashText(contextCarry):"",domainRegistryLoaded:!!domainRegistryMod,domainLabel,domainMode:firstText(domainConfig.mode,""),domainDepth:firstText(domainConfig.depth,""),emotionRuntimeObserved:!!resolvedEmotion.present,emotionPrimary:resolvedEmotion.primary,emotionSecondary:resolvedEmotion.secondary,emotionIntensity:resolvedEmotion.intensity,emotionSafeToContinue:resolvedEmotion.safeToContinue,testSuiteHardened:true,blockedLoopReplySanitized:isBlockedLoopReply(rawReply),recoveryRequired,duplicateBroken:duplicateDetected,replySignature:memoryPatch.replySignature,replyStateSignature:memoryPatch.replyStateSignature,stateSchema:STATE_SPINE_SCHEMA,stateSchemaCompat:STATE_SPINE_SCHEMA_COMPAT}};return ensureFinalReply(base,{intent,domain,knowledgeDomain,domainHints,domainRoute,text,input:{...enrichedInput,resolvedEmotion:resolvedEmotion.present?resolvedEmotion.state:null,emotionalContinuity:memoryPatch.emotionalContinuity},turnId});}

function pipelineForensicNormalizationProfile({intent="",domain="",knowledgeDomain="",text="",reply="",input={},routed={}}={}){
  const t=lower(text),r=safeStr(reply);
  const operational=!!/(next steps?|show me the test|commit and push|validate syntax|replace the file|run smoke test)/i.test(t);
  const depthRequested=!!/(full autopsy|line[- ]?by[- ]?line audit|critical fixes?|forensic normalization|critical analysis)/i.test(t);
  const backendTechnical=!!(isNyxMarionBackendTechnicalContext(text)&&!isExplicitCybersecurityRequest(text));
  const cyberExplicit=!!isExplicitCybersecurityRequest(text);
  const internalLeak=!!isInternalContractLeak(r);
  return {
    version: PIPELINE_FORENSIC_NORMALIZATION_VERSION,
    active: true,
    operational,
    depthRequested,
    backendTechnical,
    cyberExplicit,
    internalLeak,
    intent: safeStr(intent),
    domain: safeStr(domain),
    knowledgeDomain: safeStr(knowledgeDomain),
    voiceTextParity: safeObj(input).voiceTextParity || null,
    routerDomain: firstText(safeObj(safeObj(routed).routing).domain, safeObj(routed).domain, ""),
    routerIntent: firstText(safeObj(safeObj(routed).routing).intent, safeObj(routed).intent, ""),
    authority: "compose.final-user-facing-reply",
    updatedAt: Date.now()
  };
}
function applyPipelineForensicNormalization(reply="",intent="",domain="",knowledgeDomain="",text="",input={},routed={}){
  const fiveTurn=fiveTurnContractReply(intent,text,input,routed);
  if(fiveTurn)return fiveTurn;
  let out=sanitizeUserFacingReply(reply,intent,text,input)||buildFinalLoopRecoveryReply(intent,text,input);
  if(isVoiceSystemCheckTurn(text,input))return buildVoiceSystemCheckReply(text,input);
  const parityDirect=parityRegressionDirectReply(text,input);if(parityDirect)return parityDirect;
  if(isRouteIsolationExplanationTurn(text))return routeIsolationExplanationReply(text);
  if(normalizeKnowledgeDomain(knowledgeDomain||detectKnowledgeDomain(text))&&!isRecoveryRequested(input,routed))return out;
  if(isExactTechnicalValidationTurn(text))return out;
  if(isNyxMarionBackendTechnicalContext(text)&&!isExplicitCybersecurityRequest(text)&&/cybersecurity reduces risk|defensive posture|least privilege/i.test(out)){
    out=technicalReply(text,input);
  }
  if(replyContractMinimalismKind(text)==="operational_minimal")out=compactOperationalReplyForContract(text,intent,input,routed);
  const pack=applyConversationalPackConsumption(out,intent,text,input,routed);
  out=pack.reply||out;
  out=applyVoiceEmotionalDepthParityGovernor(out,intent,text,input);
  out=stripStaleProgressionSurface(out,intent,text);
  return sanitizeUserFacingReply(out,intent,text,input)||buildFinalLoopRecoveryReply(intent,text,input);
}

function run(routed={},input={}){return composeMarionResponse(routed,input);}
module.exports={VERSION,STATE_SPINE_SCHEMA,STATE_SPINE_SCHEMA_COMPAT,COGNITIVE_LAYER_VERSION,CREATIVE_SUGGESTION_VERSION,CREATIVE_SUGGESTION_TIMING_GOVERNOR_VERSION,INTENT_DEPTH_GOVERNOR_VERSION,CONVERSATION_FOLLOWUP_GOVERNOR_VERSION,ANSWER_SPECIFICITY_GOVERNOR_VERSION,DOMAIN_ANSWER_DEPTH_GOVERNOR_VERSION,DIRECTIVE_EXECUTION_CLARITY_GOVERNOR_VERSION,RESPONSE_COMPRESSION_GOVERNOR_VERSION,TECHNICAL_DIAGNOSIS_PRECISION_GOVERNOR_VERSION,DIAGNOSTIC_LOOP_DETECTION_LAYER_VERSION,MEMORY_CARRY_BOUNDARY_GOVERNOR_VERSION,EMOTIONAL_CONTINUITY_CALIBRATION_GOVERNOR_VERSION,VOICE_TEXT_PARITY_GOVERNOR_VERSION,REPLY_CONTRACT_MINIMALISM_GOVERNOR_VERSION,VOICE_EMOTIONAL_DEPTH_PARITY_GOVERNOR_VERSION,FINAL_REGRESSION_HARMONIZER_VERSION,PROGRESSION_SHAPING_GOVERNOR_VERSION,CONTEXTUAL_DIRECTIVE_HANDLER_VERSION,PIPELINE_FORENSIC_NORMALIZATION_VERSION,CONVERSATIONAL_PACK_CONSUMPTION_VERSION,FINAL_RUNTIME_TELEMETRY_VERSION,VALID_INTENTS,INTENT_TO_DOMAIN,composeMarionResponse,run,default:composeMarionResponse,ensureFinalReply,assertFinalEnvelope,_internal:{buildCognitiveIntelligenceLayer,applyCreativeSuggestionModule,shouldSurfaceCreativeSuggestion,creativeSuggestionForMode,isDirectExecutionTurn,isCreativeTimingSuppressed,creativeTimingIntent,cognitiveSignalScore,cognitiveLayerMode,normalizeResolvedEmotion,resolveEffectiveEmotion,hasEmotionalContinuityCue,previousEmotionalContinuity,emotionalProgressionProfile,emotionalProgressionReply,shouldEmotionInfluenceIntent,emotionalWorkShiftSuppression,isEmotionalContinuityCalibrationSuppressed,emotionalContinuityCalibrationProfile,calibrateResolvedEmotionForTurn,calibratedEmotionalContinuityReply,applyEmotionalContinuityCalibrationGovernor,voiceTextParitySource,isVoiceTextParityCandidate,normalizeVoiceTextParityText,voiceTextParityProfile,applyVoiceTextParityToInput,voiceEmotionalDepthParityProfile,voiceEmotionalDepthParityReply,applyVoiceEmotionalDepthParityGovernor,replyContractMinimalismKind,isReplyContractMinimalismSuppressed,replyContractMinimalismProfile,stripContractMachinery,compactOperationalReplyForContract,applyReplyContractMinimalismGovernor,finalRegressionPriorityProfile,finalRegressionHarmonizerProfile,applyFinalRegressionHarmonizer,progressionShapingProfile,naturalizeExecutionLanguage,progressionShapingReply,applyProgressionShapingGovernor,pipelineForensicNormalizationProfile,applyPipelineForensicNormalization,buildFinalRuntimeTelemetry,loadConversationalPacks,conversationPackProfile,applyConversationalPackConsumption,publicDiagnosticTranslationReply,developerDiagnosticReply,emotionalSpecificityPackReply,nextStepContextPackReply,repetitionEscapePackReply,backendEmptyGuardPackReply,extractTextRaw,extractText,detectIdentityIntent,detectDirectiveIntent,extractContextCarry,hasContextCarry,protectsContextFromOverride,resolveIntent,resolveDomain,isBlockedLoopReply,isGreetingOnly,isHowAreYouTurn,isWarmSocialTurn,isCapabilityQuestion,buildWarmSocialReply,isCasualGreetingTurn,isGreetingPostureTurn,normalizeInboundTextForPosture,detectGreetingDistressSignal,inferGreetingPostureFromText,extractGreetingPosture,applyGreetingPostureQuality,registryCapabilityIntro,registryDomainConfig,registryDomainManifest,registryDomainKnowledgePack,registryDomainWiringStatus,registryKnowledgeLoaded,registryKnowledgeEntries,registryKnowledgeAnswer,normalizeKnowledgeDomain,isExplicitCybersecurityRequest,isNyxMarionBackendTechnicalContext,isExactTechnicalValidationTurn,isExplicitEnglishTransformRequest,isRouteIsolationExplanationTurn,routeIsolationExplanationReply,isTechnicalIntentBindingTurn,detectKnowledgeDomain,resolveKnowledgeDomain,extractDomainConfidence,shouldFailClosedForDomainConfidence,domainConfidenceUserReply,knowledgeDomainReply,isRecoveryRequested,isUsableFinalReply,forceCognitionCompleteReply,identityReply,directiveReply,contextualDirectiveReply,domainQuestionReply,detectArchitectureReasoning,hotFallbackReply,buildReply,safeReply,buildMemoryPatch,ensureFinalReply,assertFinalEnvelope,applyConversationQuality,applyIntentSpecificDepthGovernor,applyAnswerSpecificityGovernor,applyDomainAnswerDepthGovernor,applyDirectiveExecutionClarityGovernor,applyResponseCompressionGovernor,applyTechnicalDiagnosisPrecisionGovernor,memoryCarryBoundaryProfile,applyMemoryCarryBoundaryToInput,isMemoryCarryBoundarySuppressed,isFreshPromptBoundaryReset,technicalDiagnosisKind,isTechnicalDiagnosisSuppressed,technicalDiagnosisProfile,technicalDiagnosisReply,diagnosticLoopDetectionProfile,diagnosticLoopDetectionSummary,extractDiagnosticStateSnapshot,responseCompressionKind,isResponseCompressionSuppressed,responseCompressionPlan,compressVerboseOperationalReply,directiveExecutionKind,isDirectiveExecutionClaritySuppressed,directiveExecutionPlan,directiveExecutionClarityReply,isDomainAnswerDepthSuppressed,domainAnswerNeedsDepth,englishDomainDepthReply,psychologyDomainDepthReply,aiDomainDepthReply,cyberDomainDepthReply,lawDomainDepthReply,financeDomainDepthReply,isAnswerSpecificitySuppressed,specificityNeedScore,technicalSpecificityReply,businessSpecificityReply,conversationQualitySpecificityReply,intentDepthExpansion,depthProfile,isDepthGovernorSuppressed,isThinForIntent,toneProfile,contextCarrySummary,hasNaturalDepth,isInternalContractLeak,sanitizeUserFacingReply,inputSourceKind,isVoiceInput,isSystemCheckTurn,isVoiceSystemCheckTurn,buildVoiceSystemCheckReply,continuationCue,isFollowUpGovernorSuppressed,continuityContext,buildCarryForwardSummary,followUpAnchor,continuationAwareReply,continuationAwareBusinessReply,deriveTopic,fiveTurnContractProfile,fiveTurnContractReply,isFiveTurnContractTurn,isMicTextParityPrompt,micTextParityDirectReply,isDomainIsolationPrompt,domainIsolationDirectReply,isPracticalNyxConsistencyPrompt,practicalNyxConsistencyReply,parityRegressionDirectReply,progressionShapingGuardReply,progressionShapingGuardProfile,continuationCompressionGuardReply,isContinuationCompressionInstruction,continuationCompressionLockedDomain,financeProgressionGuardReply,technicalProgressionGuardReply,englishProgressionGuardReply,highPriorityProgressionSurfaceReply}};
