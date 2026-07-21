"use strict";

/**
 * marionPrivateRuntimeAdapter.js
 * Canonical, circular-safe adapter for Marion's private conversation route.
 *
 * Dependency direction:
 *   index.js / MarionAdminConsoleGateway -> this adapter -> marionBridge
 *
 * This module never imports index.js, Chat Engine, or the Admin Console Gateway.
 */
const path = require("path");

const VERSION = "marion.privateRuntime.adapter/8.0-unified-definitive";
const CONTRACT = "nyx.marion.privateRuntime/8.0";
const MAX_SESSIONS = 256;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const sessionContinuity = new Map();
let cachedBridge = null;
let cachedBridgePath = "";
let lastBridgeError = "";

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (["number","boolean","bigint"].includes(typeof value)) { try { return String(value); } catch (_) { return fallback; } }
  if (value instanceof Error) { try { return value.message || value.name || fallback; } catch (_) { return fallback; } }
  try { return String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(); } catch (_) { return fallback; }
}
function isObj(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function obj(value) { return isObj(value) ? value : {}; }
function firstText() { for (const v of arguments) { const t = safeText(v); if (t) return t; } return ""; }
function now() { return Date.now(); }
function makeId(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`; }
function promptOf(input = {}) {
  const s=obj(input), b=obj(s.body), p=obj(s.payload), t=obj(s.turn), c=obj(s.command);
  return firstText(s.prompt,s.rawUserText,s.userText,s.originalUserText,s.userQuery,s.inputText,s.text,s.query,s.message,s.commandText,b.prompt,b.rawUserText,b.userText,b.text,b.query,b.message,p.prompt,p.rawUserText,p.userText,p.text,p.query,p.message,t.prompt,t.userText,t.text,t.message,c.prompt,c.userText,c.text,c.message).slice(0,6000);
}
function sessionIdOf(input={}, context={}) {
  const s=obj(input), c=obj(context), session=obj(s.session);
  return firstText(s.sessionId,s.conversationId,session.sessionId,c.sessionId,c.conversationId,"private-marion");
}
function isGreeting(text="") { return /^(?:hello|hi|hey|good\s+(?:morning|afternoon|evening))(?:\s*,?\s*marion)?[.!?]*$/i.test(safeText(text)); }
function isContextualFollowup(text="") {
  const t=safeText(text).toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z0-9]+/g," ").trim();
  return /^(?:go deeper|continue|keep going|next|what next|then what|what happens after that|what should (?:be|we) fix(?:ed)? first|why is that the first priority|why first|what could (?:break|go wrong)(?: if .*?)?|what is the safest implementation order|how (?:do|should) we (?:validate|test)(?: the repair)?|what is the main risk|what changed|what should i examine first)$/.test(t);
}
function explicitTechnical(text="") {
  const t=safeText(text);
  return /\b(?:javascript|typescript|node(?:\.js)?|index\.js|html|css|code|runtime|router|routing|debug|autopsy|function|module|backend|frontend|widget|handler|endpoint|api|payload|manifest|state spine|final envelope|transport|cors|http\s*502|referenceerror|typeerror|commonjs|circular dependenc|file)\b/i.test(t);
}
function explicitLegal(text="") {
  const t=safeText(text);
  if (explicitTechnical(t)) return false;
  return /\b(?:legal advice|legal risk|contract|agreement|jurisdiction|liability|lawsuit|statute|regulation|compliance|governing law|attorney|lawyer|court)\b/i.test(t);
}
function deriveSubject(text="") {
  return safeText(text).replace(/^(?:do\s+)?(?:a\s+)?surgical\s+autopsy\s+(?:on|of)\s+/i,"").replace(/[.!?]+$/g,"").slice(0,240);
}
function classifyExpectedDomain(prompt, cached) {
  if (isGreeting(prompt)) return "general";
  if (explicitTechnical(prompt)) return "technical";
  if (explicitLegal(prompt)) return "law";
  if (isContextualFollowup(prompt) && cached && cached.activeDomain) return cached.activeDomain;
  return "";
}
function pruneSessions() {
  const cutoff=now()-SESSION_TTL_MS;
  for (const [key,value] of sessionContinuity) if (!value || Number(value.updatedAt||0)<cutoff) sessionContinuity.delete(key);
  if (sessionContinuity.size>MAX_SESSIONS) {
    const rows=[...sessionContinuity.entries()].sort((a,b)=>Number(a[1].updatedAt||0)-Number(b[1].updatedAt||0));
    for (const [key] of rows.slice(0,sessionContinuity.size-MAX_SESSIONS)) sessionContinuity.delete(key);
  }
}
function getSession(id) { pruneSessions(); return obj(sessionContinuity.get(id)); }
function setSession(id, patch) { if (!id) return; sessionContinuity.set(id,{...getSession(id),...obj(patch),updatedAt:now()}); pruneSessions(); }
function clearSession(id) { if (id) sessionContinuity.delete(id); }
function loadBridge(force=false) {
  if (!force && cachedBridge && typeof cachedBridge.processWithMarion === "function") return cachedBridge;
  const candidate=path.join(__dirname,"marionBridge.js");
  try {
    const resolved=require.resolve(candidate);
    const mod=require(resolved);
    const fn=mod && typeof mod.processWithMarion === "function" ? mod.processWithMarion : null;
    if (!fn) throw Object.assign(new Error("canonical_processWithMarion_missing"),{code:"CANONICAL_HANDLER_MISSING"});
    cachedBridge=mod; cachedBridgePath=resolved; lastBridgeError=""; return mod;
  } catch (err) {
    cachedBridge=null; cachedBridgePath=""; lastBridgeError=safeText(err && (err.code||err.message||err.name),"bridge_unavailable"); return null;
  }
}
function extractReply(result) {
  if (typeof result === "string") return safeText(result);
  const r=obj(result), payload=obj(r.payload), nested=obj(r.result), fe=obj(r.finalEnvelope||payload.finalEnvelope||nested.finalEnvelope), synthesis=obj(r.synthesis||payload.synthesis||nested.synthesis);
  const candidates=[r.directReply,r.visibleReply,r.displayReply,r.finalReply,r.publicReply,r.reply,r.answer,r.output,r.response,r.text,r.message,r.spokenText,fe.directReply,fe.visibleReply,fe.displayReply,fe.finalReply,fe.publicReply,fe.reply,fe.answer,fe.output,fe.response,fe.text,fe.message,fe.spokenText,payload.reply,payload.text,payload.message,nested.reply,nested.text,nested.message,synthesis.reply,synthesis.text,synthesis.message];
  for (const value of candidates) { const t=safeText(value); if (t) return t; }
  return "";
}
function resultDomain(result) {
  const r=obj(result), fe=obj(r.finalEnvelope), routing=obj(r.routing||obj(r.routed).routing), payload=obj(r.payload);
  return firstText(r.primaryDomain,r.selectedDomain,r.knowledgeDomain,r.domain,routing.domain,fe.primaryDomain,fe.knowledgeDomain,fe.domain,payload.domain).toLowerCase();
}
function legalFallback(reply="") { return /\b(?:general legal(?:-risk)? (?:information|triage)|not legal advice|governing jurisdiction|source documents|legal category)\b/i.test(safeText(reply)); }
function genericRuntimeReply(reply="") { return /\b(?:private runtime is unavailable|turn did not complete cleanly|response did not complete cleanly|kept the request in the technical lane rather than substituting)\b/i.test(safeText(reply)); }
function normalizeInput(input={}, context={}, cached={}) {
  const source=obj(input), ctx=obj(context), prompt=promptOf(source), sessionId=sessionIdOf(source,ctx);
  const reset=source.newSession===true||source.firstTurn===true||source.resetSession===true||source.clearSession===true;
  if (reset) clearSession(sessionId);
  const state=reset?{}:getSession(sessionId);
  const expectedDomain=classifyExpectedDomain(prompt,state);
  const continuation=isContextualFollowup(prompt)&&!!state.activeSubject&&!isGreeting(prompt);
  const activeSubject=explicitTechnical(prompt)||explicitLegal(prompt)?deriveSubject(prompt):firstText(state.activeSubject,state.lastSubstantivePrompt);
  const previousMemory={...obj(source.previousMemory),...obj(state.memoryPatch),activeDomain:firstText(state.activeDomain,expectedDomain),activeSubject,activeTask:activeSubject,lastUserText:firstText(state.lastUserText),lastAssistantReply:firstText(state.lastReply),followUpDepth:Number(state.followUpDepth||0),privateRuntimeContinuity:{version:CONTRACT,activeDomain:firstText(state.activeDomain,expectedDomain),activeSubject,progressionStage:firstText(state.progressionStage),followUpDepth:Number(state.followUpDepth||0)}};
  const effectivePrompt=continuation?`${prompt} Continue the active ${expectedDomain||state.activeDomain||"substantive"} task: ${activeSubject}.`:prompt;
  return {
    ...source,prompt,message:prompt,text:prompt,query:prompt,userText:prompt,rawUserText:prompt,userQuery:prompt,inputText:prompt,effectivePrompt,
    authority:"Marion",surfaceAgent:"Marion",source:"marion-private-runtime-adapter",scope:"private_admin",lane:"private",audience:"operator",
    privateAdminConversation:true,directMarionAdminInterface:true,marionAdminConversation:true,marionAdminConversationAllowed:true,publicUsersCanAddressMarion:false,publicFallbackBlocked:true,
    adminVerified:ctx.adminVerified===true||ctx.verified===true||source.adminVerified===true,verified:ctx.adminVerified===true||ctx.verified===true||source.verified===true,
    sessionVerified:ctx.sessionVerified===true||source.sessionVerified===true,passwordFreeTestChat:source.passwordFreeTestChat===true||ctx.passwordFreeTestChat===true,
    sessionId,conversationId:firstText(source.conversationId,sessionId),turnId:firstText(source.turnId,ctx.turnId,ctx.traceId,makeId("turn")),traceId:firstText(source.traceId,ctx.traceId),
    previousMemory,requestedDomain:expectedDomain||source.requestedDomain||source.domain||"",domain:expectedDomain||source.domain||"",
    continuationRequested:continuation,continuationResolved:continuation,currentTurnOnly:true,
    continuityAnchor:continuation?{valid:true,substantive:true,domain:expectedDomain||state.activeDomain,subject:activeSubject,lastUserText:state.lastUserText,lastAssistantReply:state.lastReply}:obj(source.continuityAnchor),
    currentTurnAuthority:{version:CONTRACT,expectedDomain,activeDomain:expectedDomain||state.activeDomain||"",activeSubject,continuationRequested:continuation,substantiveAnchor:!!activeSubject},
    privateRuntimeContext:{version:CONTRACT,expectedDomain,activeDomain:expectedDomain||state.activeDomain||"",activeSubject,continuationRequested:continuation,followUpDepth:continuation?Number(state.followUpDepth||0)+1:0,progressionStage:firstText(state.progressionStage,"analysis")}
  };
}
function retryInput(input) {
  const ctx=obj(input.privateRuntimeContext), subject=firstText(ctx.activeSubject,"the active JavaScript routing repair");
  return {...input,requestedDomain:"technical",domain:"technical",effectivePrompt:`Technical software analysis only. ${input.prompt} Continue the implementation analysis for ${subject}. Do not treat the filename or word law as a legal-advice request.`,privateRuntimeContext:{...ctx,expectedDomain:"technical",activeDomain:"technical",semanticRetry:true}};
}
function updateContinuity(input, result, reply) {
  const ctx=obj(input.privateRuntimeContext), sessionId=input.sessionId;
  if (!sessionId) return;
  if (isGreeting(input.prompt)) { setSession(sessionId,{activeDomain:"",activeSubject:"",progressionStage:"social",followUpDepth:0,lastUserText:input.prompt,lastReply:reply,memoryPatch:obj(result.memoryPatch||result.sessionPatch)}); return; }
  const domain=firstText(ctx.expectedDomain,resultDomain(result),ctx.activeDomain);
  const substantive=!!domain && domain!=="general" && !isGreeting(input.prompt);
  if (!substantive) { setSession(sessionId,{lastUserText:input.prompt,lastReply:reply,memoryPatch:obj(result.memoryPatch||result.sessionPatch)}); return; }
  setSession(sessionId,{activeDomain:domain,activeSubject:firstText(ctx.activeSubject,deriveSubject(input.prompt)),lastSubstantivePrompt:input.prompt,lastUserText:input.prompt,lastReply:reply,progressionStage:firstText(ctx.progressionStage,"analysis"),followUpDepth:Number(ctx.followUpDepth||0),memoryPatch:obj(result.memoryPatch||result.sessionPatch)});
}
async function invokePrivateRuntime(input={}, context={}) {
  const source=obj(input), ctx=obj(context);
  const authorized=ctx.adminVerified===true||ctx.verified===true||source.adminVerified===true||source.verified===true;
  if(!authorized)return{ok:false,statusCode:401,stage:"private_runtime_authorization_required",reason:"verified_operator_required",reply:"",adapterVersion:VERSION,responseFinalized:true};
  const sessionId=sessionIdOf(input,context), cached=getSession(sessionId), normalized=normalizeInput(input,context,cached), prompt=normalized.prompt;
  if (!prompt) return {ok:false,statusCode:400,stage:"prompt_required",reason:"prompt_required",reply:"",adapterVersion:VERSION};
  const runtimeContext=obj(normalized.privateRuntimeContext);
  if (isContextualFollowup(prompt) && !runtimeContext.activeSubject && !runtimeContext.expectedDomain) {
    const reply="There isn’t a substantive topic active in this new session yet. Tell me what you want to continue or deepen.";
    updateContinuity(normalized,{memoryPatch:{activeDomain:"",activeSubject:"",lastUserText:prompt,lastAssistantReply:reply}},reply);
    return {ok:true,statusCode:200,stage:"private_runtime_clarifier",reason:"",reply,publicReply:reply,visibleReply:reply,displayReply:reply,directReply:reply,finalReply:reply,response:reply,text:reply,message:reply,spokenText:reply,speechText:reply,result:{ok:true,final:true,marionFinal:true,handled:true,reply,text:reply,message:reply,domain:"general",intent:"simple_chat",memoryPatch:{activeDomain:"",activeSubject:"",lastUserText:prompt,lastAssistantReply:reply,privateRuntimeContract:CONTRACT}},adapterVersion:VERSION,contract:CONTRACT,bridgeStatus:getStatus(),bridgeAttempts:[],privateRuntimeContext:runtimeContext,sessionId:normalized.sessionId,conversationId:normalized.conversationId,turnId:normalized.turnId,responseFinalized:true};
  }
  let bridge=loadBridge(false);
  if (!bridge) { await new Promise(r=>setImmediate(r)); bridge=loadBridge(true); }
  if (!bridge) return {ok:false,statusCode:503,stage:"canonical_bridge_unavailable",reason:lastBridgeError||"canonical_bridge_unavailable",reply:"",adapterVersion:VERSION,bridgeStatus:getStatus()};
  const attempts=[];
  try {
    let packet=await Promise.resolve(bridge.processWithMarion(normalized));
    let reply=extractReply(packet), domain=resultDomain(packet), retried=false;
    const expectTechnical=obj(normalized.privateRuntimeContext).expectedDomain==="technical";
    if (expectTechnical && (domain==="law"||legalFallback(reply)||genericRuntimeReply(reply))) {
      const rInput=retryInput(normalized);
      const rPacket=await Promise.resolve(bridge.processWithMarion(rInput));
      const rReply=extractReply(rPacket), rDomain=resultDomain(rPacket);
      attempts.push({kind:"semantic_retry",domain:rDomain,replyPresent:!!rReply,legalFallback:legalFallback(rReply),genericRuntimeReply:genericRuntimeReply(rReply)});
      if (rReply && rDomain!=="law" && !legalFallback(rReply) && !genericRuntimeReply(rReply)) { packet=rPacket; reply=rReply; domain=rDomain; retried=true; }
    }
    if (!reply) return {ok:false,statusCode:502,stage:"canonical_bridge_reply_missing",reason:firstText(obj(packet).reason,obj(packet).error,"clean_reply_missing"),reply:"",result:packet,adapterVersion:VERSION,bridgeStatus:getStatus(),bridgeAttempts:attempts};
    if (expectTechnical && (domain==="law"||legalFallback(reply)||genericRuntimeReply(reply))) return {ok:false,statusCode:502,stage:"private_runtime_semantic_mismatch",reason:"technical_route_reply_mismatch",reply:"",result:packet,adapterVersion:VERSION,bridgeStatus:getStatus(),bridgeAttempts:attempts};
    updateContinuity(normalized,packet,reply);
    return {ok:true,statusCode:200,stage:retried?"private_runtime_semantic_retry_complete":"private_runtime_complete",reason:"",reply,publicReply:reply,visibleReply:reply,displayReply:reply,directReply:reply,finalReply:reply,response:reply,text:reply,message:reply,spokenText:firstText(obj(packet).spokenText,reply),speechText:firstText(obj(packet).speechText,obj(packet).spokenText,reply),result:packet,adapterVersion:VERSION,contract:CONTRACT,bridgeStatus:getStatus(),bridgeAttempts:attempts,privateRuntimeContext:normalized.privateRuntimeContext,sessionId:normalized.sessionId,conversationId:normalized.conversationId,turnId:normalized.turnId,responseFinalized:true};
  } catch (err) {
    return {ok:false,statusCode:502,stage:"private_runtime_exception",reason:safeText(err&&(err.code||err.name),"private_runtime_exception"),detail:safeText(err&&(err.message||err),"private_runtime_exception"),reply:"",adapterVersion:VERSION,bridgeStatus:getStatus(),bridgeAttempts:attempts,responseFinalized:true};
  }
}
function getStatus() { const bridge=loadBridge(false); return {version:VERSION,contract:CONTRACT,available:!!(bridge&&typeof bridge.processWithMarion==="function"),handler:"processWithMarion",requested:"./marionBridge.js",resolvedPath:cachedBridgePath,bridgeVersion:safeText(bridge&&bridge.VERSION),error:lastBridgeError,sessionCount:sessionContinuity.size,circularSafe:true,indexIndependent:true,chatEngineIndependent:true,gatewayIndependent:true}; }
function resetSession(sessionId) { clearSession(safeText(sessionId)); return true; }

Object.assign(module.exports,{VERSION,CONTRACT,invokePrivateRuntime,handleMarionAdminTextRuntime:invokePrivateRuntime,invokeMarionAdminTextRuntime:invokePrivateRuntime,handleTextRuntime:invokePrivateRuntime,handleAdminConversation:invokePrivateRuntime,getStatus,resetSession,_internal:{promptOf,isGreeting,isContextualFollowup,explicitTechnical,explicitLegal,extractReply,resultDomain,normalizeInput,sessionContinuity}});
