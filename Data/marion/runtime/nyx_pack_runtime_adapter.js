"use strict";
/**
 * nyx_pack_runtime_adapter.js v1.2.0 COMMERCIAL-HARDENED-PACKET-BRIDGE
 * Purpose: Allow Nyx language/packet packs to serve as intro/fallback/greeting
 * support without overriding Marion. Backend-first remains the authority model.
 *
 * Critical behavior:
 * - Marion reply wins when a valid, non-replayed backend reply exists.
 * - Packet matches may contribute sessionPatch / memoryPatch / greeting metadata
 *   so stateSpine can preserve tone, intent, energy, and source.
 * - Mic and text are normalized before packet matching so voice misreads such as
 *   Nick/Nix/Mix/Mike/Next can still reach Nyx greeting packets.
 * - Packet fallback cannot free-fire without a trigger, intent, replay, or backend
 *   failure signal. This prevents stale/default packets from hijacking live turns.
 */

const ADAPTER_VERSION = "nyx_pack_runtime_adapter v1.2.0 COMMERCIAL-HARDENED-PACKET-BRIDGE";

const ASSISTANT_ALIAS_RE = /\b(nick|nicks|nix|mix|mike)\b/gi;
const CONTEXTUAL_NEXT_ALIAS_RE = /(^|\b(?:hi|hey|hello|morning|good morning|good afternoon|good evening)\s+|^\s*)next(?=\s*(?:[,.:;!?]|$|can\b|could\b|please\b|help\b|are\b|do\b|turn\b|play\b|show\b|tell\b|debug\b|run\b|respond\b|speak\b))/gi;
const SMART_APOSTROPHE_RE = /[’‘`]/g;
const UNSAFE_PATCH_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_PATCH_DEPTH = 4;
const MAX_PATCH_ARRAY = 24;
const MAX_PATCH_STRING = 500;
const MAX_BRIDGE_TEXT = 240;
const MAX_SIG = 180;
const LOOP_FALLBACK_RE = /^(?:i['’]?m here\.?\s*)?(?:what['’]?s next\??|what do you want to do next\??)$/i;
const GREETING_DISTRESS_RE = /\b(stress|stressed|overwhelm|overwhelmed|anxious|anxiety|panic|sad|alone|lonely|hurt|angry|mad|frustrated|rough day|hard day|not okay|can['’]?t think|cannot think)\b/i;

function safeStr(value) {
  return value === null || value === undefined ? "" : String(value);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function firstNonEmpty() {
  for (let i = 0; i < arguments.length; i += 1) {
    const v = safeStr(arguments[i]).trim();
    if (v) return v;
  }
  return "";
}

function readPath(obj, path) {
  let cur = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return cur;
}

function sanitizePatchValue(value, depth = 0) {
  if (depth > MAX_PATCH_DEPTH) return undefined;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.slice(0, MAX_PATCH_STRING);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_PATCH_ARRAY)
      .map((item) => sanitizePatchValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (!isPlainObject(value)) return undefined;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (UNSAFE_PATCH_KEYS.has(key)) continue;
    const clean = sanitizePatchValue(child, depth + 1);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}

function sanitizePatchObject(value) {
  return isPlainObject(value) ? sanitizePatchValue(value, 0) || {} : {};
}

function textOfBackend(payload) {
  if (!payload || typeof payload !== "object") return "";
  const paths = [
    ["reply"], ["text"], ["answer"], ["output"], ["response"], ["message"], ["displayReply"],
    ["payload", "reply"], ["payload", "text"], ["payload", "answer"], ["payload", "output"], ["payload", "message"],
    ["finalEnvelope", "reply"], ["finalEnvelope", "text"], ["finalEnvelope", "answer"], ["finalEnvelope", "output"], ["finalEnvelope", "message"],
    ["packet", "reply"], ["packet", "answer"], ["packet", "output"], ["packet", "text"],
    ["packet", "synthesis", "reply"], ["packet", "synthesis", "answer"],
    ["packet", "synthesis", "text"], ["packet", "synthesis", "output"], ["packet", "synthesis", "message"]
  ];
  for (const path of paths) {
    const cur = readPath(payload, path);
    if (typeof cur === "string" && cur.trim()) return cur.trim();
  }
  return "";
}

function normalizeAssistantAliases(text) {
  return safeStr(text)
    .replace(ASSISTANT_ALIAS_RE, "Nyx")
    .replace(CONTEXTUAL_NEXT_ALIAS_RE, (match, prefix) => `${prefix || ""}Nyx`);
}

function normalizeSig(text) {
  return normalizeAssistantAliases(text)
    .replace(SMART_APOSTROPHE_RE, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, MAX_SIG);
}

function normalizeMatchText(text) {
  return normalizeAssistantAliases(text)
    .toLowerCase()
    .replace(SMART_APOSTROPHE_RE, "'")
    .replace(/[^a-z0-9#' ]+/g, " ")
    .replace(/\bnyx\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isReplay(text, session) {
  const sig = normalizeSig(text);
  return !!(sig && session && session.__lastOutSig && sig === session.__lastOutSig);
}

function isUnsafeBackendLoop(text, ctx = {}) {
  if (ctx.enforceLoopHardlock === false || ctx.freshMarionFinal) return false;
  const normalized = normalizeAssistantAliases(text).trim();
  return LOOP_FALLBACK_RE.test(normalized);
}

function hashText(text) {
  const s = safeStr(text);
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(arr, seed) {
  if (!Array.isArray(arr) || !arr.length) return "";
  const n = Math.abs(Number.isFinite(Number(seed)) ? Number(seed) : hashText(seed || "nyx")) % arr.length;
  return arr[n];
}

function packetType(packet) {
  return safeStr(packet && packet.type).toLowerCase();
}

function packetId(packet) {
  return safeStr(packet && packet.id);
}

function isGreetingPacket(packet) {
  const type = packetType(packet);
  const id = packetId(packet).toLowerCase();
  return type === "greeting" || id.includes("greet") || id.includes("greeting");
}

function getInputText(ctx = {}) {
  const inbound = isPlainObject(ctx.inbound) ? ctx.inbound : {};
  const payload = isPlainObject(inbound.payload) ? inbound.payload : {};
  const body = isPlainObject(inbound.body) ? inbound.body : {};
  const meta = isPlainObject(inbound.meta) ? inbound.meta : {};
  return firstNonEmpty(
    ctx.text, ctx.message, ctx.userText, ctx.userQuery, ctx.query,
    inbound.text, inbound.message, inbound.userText, inbound.userQuery, inbound.query,
    payload.text, payload.message, payload.userText, payload.userQuery, payload.query,
    body.text, body.message, body.userText, body.userQuery, body.query,
    meta.text, meta.message, meta.userText, meta.userQuery, meta.query
  );
}

function getInputSource(ctx = {}) {
  const inbound = isPlainObject(ctx.inbound) ? ctx.inbound : {};
  const payload = isPlainObject(inbound.payload) ? inbound.payload : {};
  const meta = isPlainObject(inbound.meta) ? inbound.meta : {};
  return firstNonEmpty(ctx.inputSource, ctx.source, inbound.inputSource, inbound.source, payload.inputSource, payload.source, meta.inputSource, meta.source, "text").toLowerCase();
}

function escapeRegExp(text) {
  return safeStr(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasInternalTrigger(packet, marker) {
  return Array.isArray(packet && packet.trigger) && packet.trigger.includes(marker);
}

function phraseMatches(input, trigger) {
  if (!input || !trigger || trigger.startsWith("__")) return false;
  if (input === trigger) return true;
  const escaped = escapeRegExp(trigger);
  const singleToken = !/\s/.test(trigger);
  const re = singleToken
    ? new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i")
    : new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i");
  return re.test(input);
}

function triggerMatches(packet, ctx) {
  if (!packet || !Array.isArray(packet.trigger)) return false;
  const input = normalizeMatchText(getInputText(ctx));
  if (!input) return false;
  for (const item of packet.trigger) {
    const trigger = normalizeMatchText(item);
    if (phraseMatches(input, trigger)) return true;
  }
  return false;
}

function internalIntentMatches(packet, ctx = {}) {
  const intent = safeStr(ctx.intent).toLowerCase();
  if (intent === "intro" && hasInternalTrigger(packet, "__intro__")) return true;
  if (intent === "fallback" && (hasInternalTrigger(packet, "__fallback__") || hasInternalTrigger(packet, "__fallback_anchor__"))) return true;
  if ((ctx.replayDetected || intent === "replay") && hasInternalTrigger(packet, "__replay_detected__")) return true;
  if ((ctx.backendFailed || intent === "error") && hasInternalTrigger(packet, "__error__")) return true;
  if (intent === "mode_prompt" && hasInternalTrigger(packet, "__mode_prompt__")) return true;
  if (intent === "schedule_need_city" && hasInternalTrigger(packet, "__schedule_need_city__")) return true;
  if (intent === "schedule_need_show" && hasInternalTrigger(packet, "__schedule_need_show__")) return true;
  if (intent === "sponsors_need_goal" && hasInternalTrigger(packet, "__sponsors_need_goal__")) return true;
  if (intent === "sponsors_need_budget" && hasInternalTrigger(packet, "__sponsors_need_budget__")) return true;
  if (intent === "movies_need_title_or_genre" && hasInternalTrigger(packet, "__movies_need_title_or_genre__")) return true;
  return false;
}

function canUsePacket(packet, ctx = {}) {
  if (!isPlainObject(packet)) return false;
  const c = isPlainObject(packet.constraints) ? packet.constraints : {};
  const a = isPlainObject(packet.marionAuthority) ? packet.marionAuthority : {};
  const backendText = textOfBackend(ctx.backendPayload);
  const backendPresent = !!backendText && !isUnsafeBackendLoop(backendText, ctx);

  if ((a.backendFirst || c.honorMarionFirst) && backendPresent) return false;
  if ((a.allowWhenBackendReplyExists === false || c.requireNoBackendReply) && backendPresent) return false;
  if ((c.requireBackendEmpty || a.requireBackendEmpty) && backendPresent) return false;
  if ((c.requireHardFailureOrNoReply || a.requireHardFailureOrNoReply) && !ctx.backendFailed && backendPresent) return false;
  if ((c.requireBackendFailure || a.requireBackendFailure) && !ctx.backendFailed) return false;
  if (c.requireReplayDetected && !ctx.replayDetected) return false;
  if (c.requireNoFreshMarionFinal && ctx.freshMarionFinal) return false;
  if (c.oncePerSession && ctx.session && ctx.session.__usedPackets && ctx.session.__usedPackets[packet.id]) return false;
  return true;
}

function canMatchPacketSignal(packet, ctx = {}) {
  const c = isPlainObject(packet && packet.constraints) ? packet.constraints : {};
  if (c.requireReplayDetected && !ctx.replayDetected) return false;
  if (c.requireNoFreshMarionFinal && ctx.freshMarionFinal) return false;
  if (c.requireBackendFailure && !ctx.backendFailed) return false;
  return true;
}

function scorePacket(packet, ctx) {
  let score = Number(packet.priority || 0) || 0;
  if (isGreetingPacket(packet)) score += 1000;
  if (triggerMatches(packet, ctx)) score += 500;
  if (internalIntentMatches(packet, ctx)) score += 450;
  if (packetType(packet) === safeStr(ctx.intent).toLowerCase()) score += 80;
  const triggerCount = Array.isArray(packet.trigger) ? packet.trigger.filter((t) => !safeStr(t).startsWith("__")).length : 0;
  score += Math.min(triggerCount, 30);
  return score;
}

function findSignalPacket(pack, ctx) {
  const packets = Array.isArray(pack && pack.packets) ? pack.packets.slice() : [];
  const localCtx = ctx || {};
  return packets
    .filter((p) => canMatchPacketSignal(p, localCtx) && triggerMatches(p, localCtx))
    .sort((a, b) => scorePacket(b, localCtx) - scorePacket(a, localCtx))[0] || null;
}

function canReplyWithoutTextTrigger(packet, ctx = {}) {
  const type = packetType(packet);
  if (internalIntentMatches(packet, ctx)) return true;
  if ((ctx.backendFailed || ctx.replayDetected) && (type === "fallback" || type === "error")) return true;
  return false;
}

function findReplyPacket(pack, ctx, desiredTypes) {
  const packets = Array.isArray(pack && pack.packets) ? pack.packets.slice() : [];
  return packets
    .filter((p) => desiredTypes.includes(packetType(p)) && canUsePacket(p, ctx))
    .filter((p) => triggerMatches(p, ctx) || canReplyWithoutTextTrigger(p, ctx))
    .sort((a, b) => scorePacket(b, ctx) - scorePacket(a, ctx))[0] || null;
}

function renderTemplate(template, ctx) {
  return safeStr(template)
    .replaceAll("{year}", ctx.session?.lastMusicYear || ctx.year || "")
    .replaceAll("{city}", ctx.session?.city || ctx.city || "")
    .replaceAll("{mode}", ctx.session?.activeMusicMode || ctx.mode || "");
}

function presenceFromGreeting(packet, inputText) {
  const tone = safeStr(packet.tone || packet.sessionPatch?.lastGreetingTone || packet.presenceProfile || "").toLowerCase();
  const intent = safeStr(packet.intent || packet.sessionPatch?.lastGreetingIntent || "").toLowerCase();
  const energy = safeStr(packet.energy || packet.sessionPatch?.lastInputEnergy || "").toLowerCase();
  const combined = `${tone} ${intent} ${energy} ${inputText}`;
  if (GREETING_DISTRESS_RE.test(combined) || /distress|sadness|anxiety|anger|loneliness|frustration|support|empathetic|calming|grounding|compassionate/.test(combined)) return "supportive";
  if (/debug|technical|diagnostic/.test(combined)) return "curious";
  if (/business|executive|strategy|urgent/.test(combined)) return "engaged";
  if (/playful|casual|joking/.test(combined)) return "warm";
  return safeStr(packet.presenceProfile || packet.sessionPatch?.presenceProfile || packet.sessionPatch?.lastPresenceProfile || "warm") || "warm";
}

function buildGreetingBridge(packet, ctx = {}) {
  if (!packet || !isGreetingPacket(packet)) return null;
  const inputSource = getInputSource(ctx);
  const text = getInputText(ctx);
  const sessionPatch = sanitizePatchObject(packet.sessionPatch);
  const intent = firstNonEmpty(packet.intent, sessionPatch.lastGreetingIntent, sessionPatch.greetingIntent, packet.id);
  const tone = firstNonEmpty(packet.tone, sessionPatch.lastGreetingTone, sessionPatch.greetingTone, packet.presenceProfile, sessionPatch.lastPresenceProfile);
  const energy = firstNonEmpty(packet.energy, sessionPatch.lastInputEnergy, sessionPatch.greetingEnergy, "medium");
  const presenceProfile = firstNonEmpty(packet.presenceProfile, sessionPatch.presenceProfile, sessionPatch.lastPresenceProfile, presenceFromGreeting(packet, text));
  return {
    active: true,
    id: packet.id || "",
    packetId: packet.id || "",
    type: packet.type || "greeting",
    intent,
    tone,
    energy,
    source: inputSource,
    inputSource,
    presenceProfile,
    text: safeStr(text).slice(0, MAX_BRIDGE_TEXT)
  };
}

function buildPacketPatches(packet, ctx = {}) {
  const sessionPatch = sanitizePatchObject(packet && packet.sessionPatch);
  const memoryPatch = sanitizePatchObject(packet && packet.memoryPatch);
  const greeting = buildGreetingBridge(packet, ctx);

  if (greeting) {
    sessionPatch.lastGreetingId = greeting.id;
    sessionPatch.lastGreetingIntent = greeting.intent;
    sessionPatch.lastGreetingTone = greeting.tone;
    sessionPatch.lastInputEnergy = greeting.energy;
    sessionPatch.lastGreetingSource = greeting.inputSource;
    sessionPatch.lastPresenceProfile = greeting.presenceProfile;
    sessionPatch.presenceProfile = greeting.presenceProfile;
    sessionPatch.lastNyxStateHint = greeting.presenceProfile;
    sessionPatch.nyxStateHint = greeting.presenceProfile;

    memoryPatch.greeting = {
      active: true,
      lastId: greeting.id,
      lastIntent: greeting.intent,
      lastTone: greeting.tone,
      lastEnergy: greeting.energy,
      lastSource: greeting.inputSource,
      lastPresenceProfile: greeting.presenceProfile
    };
    memoryPatch.lastGreetingIntent = greeting.intent;
    memoryPatch.lastGreetingTone = greeting.tone;
    memoryPatch.lastInputEnergy = greeting.energy;
    memoryPatch.presenceProfile = greeting.presenceProfile;
    memoryPatch.nyxStateHint = greeting.presenceProfile;
  }

  return { greeting, sessionPatch, memoryPatch };
}

function applyPacketPatchToSession(session, patch = {}) {
  if (!session || typeof session !== "object") return;
  Object.assign(session, sanitizePatchObject(patch.sessionPatch));
  if (patch.greeting) {
    session.greeting = {
      ...(isPlainObject(session.greeting) ? session.greeting : {}),
      active: true,
      lastId: patch.greeting.id,
      lastIntent: patch.greeting.intent,
      lastTone: patch.greeting.tone,
      lastEnergy: patch.greeting.energy,
      lastSource: patch.greeting.inputSource,
      lastPresenceProfile: patch.greeting.presenceProfile,
      updatedAt: Date.now()
    };
  }
}

function markPacketUsed(session, packet, reply) {
  if (!session || !packet) return;
  session.__usedPackets = isPlainObject(session.__usedPackets) ? session.__usedPackets : {};
  session.__usedPackets[packet.id] = true;
  if (reply) session.__lastOutSig = normalizeSig(reply);
}

function desiredTypesFor(ctx = {}) {
  const intent = safeStr(ctx.intent).toLowerCase();
  if (intent === "intro") return ["intro", "greeting"];
  if (intent === "fallback" || intent === "replay") return ["fallback", "error"];
  if (intent === "error") return ["error", "fallback"];
  return ["greeting", "prompt", "intro", "fallback", "error", "help", "goodbye", "nav"];
}

function resolveNyxPacket(pack, ctx = {}) {
  const backendText = textOfBackend(ctx.backendPayload);
  const backendUnsafeLoop = backendText ? isUnsafeBackendLoop(backendText, ctx) : false;
  const replayDetected = backendText ? (isReplay(backendText, ctx.session) || backendUnsafeLoop) : !!ctx.replayDetected;
  const localCtx = { ...ctx, replayDetected };

  const signalPacket = findSignalPacket(pack, localCtx);
  const signalPatch = signalPacket ? buildPacketPatches(signalPacket, localCtx) : { greeting: null, sessionPatch: {}, memoryPatch: {} };
  if (signalPacket) applyPacketPatchToSession(localCtx.session, signalPatch);

  if (backendText && !backendUnsafeLoop && !isReplay(backendText, localCtx.session)) {
    if (localCtx.session) localCtx.session.__lastOutSig = normalizeSig(backendText);
    return {
      source: "marion",
      reply: backendText,
      packet: signalPacket ? signalPacket.id : null,
      packetId: signalPacket ? signalPacket.id : "",
      matchedPacketId: signalPacket ? signalPacket.id : "",
      matchedPacketType: signalPacket ? packetType(signalPacket) : "",
      chips: signalPacket?.chips || [],
      greeting: signalPatch.greeting,
      sessionPatch: signalPatch.sessionPatch,
      memoryPatch: signalPatch.memoryPatch,
      presenceProfile: signalPatch.greeting?.presenceProfile || signalPatch.sessionPatch?.presenceProfile || "",
      nyxStateHint: signalPatch.greeting?.presenceProfile || signalPatch.sessionPatch?.nyxStateHint || "",
      backendFirst: true,
      replayDetected: false,
      adapterVersion: ADAPTER_VERSION
    };
  }

  const desired = desiredTypesFor(localCtx);
  const chosen = signalPacket && canUsePacket(signalPacket, localCtx) ? signalPacket : findReplyPacket(pack, localCtx, desired);
  if (!chosen) {
    return {
      source: "empty",
      reply: "",
      packet: signalPacket ? signalPacket.id : null,
      packetId: signalPacket ? signalPacket.id : "",
      matchedPacketId: signalPacket ? signalPacket.id : "",
      matchedPacketType: signalPacket ? packetType(signalPacket) : "",
      chips: signalPacket?.chips || [],
      greeting: signalPatch.greeting,
      sessionPatch: signalPatch.sessionPatch,
      memoryPatch: signalPatch.memoryPatch,
      backendFirst: false,
      replayDetected,
      adapterVersion: ADAPTER_VERSION
    };
  }

  const state = localCtx.session?.state || "cold";
  const stateTemplates = chosen.stateTemplates && chosen.stateTemplates[state];
  const templates = stateTemplates || chosen.templates || [];
  const seed = firstNonEmpty(localCtx.seed, `${packetId(chosen)}:${getInputText(localCtx)}:${localCtx.session?.turnId || localCtx.session?.turn || ""}`);
  const reply = renderTemplate(pick(templates, seed), localCtx).trim();
  const replyReplay = reply && isReplay(reply, localCtx.session);
  if (!reply || (chosen.constraints?.doNotLoop && replyReplay && !internalIntentMatches(chosen, localCtx))) {
    return {
      source: "empty",
      reply: "",
      packet: chosen.id,
      packetId: chosen.id,
      matchedPacketId: chosen.id,
      matchedPacketType: packetType(chosen),
      chips: chosen.chips || [],
      greeting: signalPatch.greeting,
      sessionPatch: signalPatch.sessionPatch,
      memoryPatch: signalPatch.memoryPatch,
      backendFirst: false,
      replayDetected: true,
      adapterVersion: ADAPTER_VERSION
    };
  }

  const chosenPatch = chosen === signalPacket ? signalPatch : buildPacketPatches(chosen, localCtx);
  applyPacketPatchToSession(localCtx.session, chosenPatch);
  markPacketUsed(localCtx.session, chosen, reply);

  return {
    source: "packet",
    reply,
    packet: chosen.id,
    packetId: chosen.id,
    matchedPacketId: chosen.id,
    matchedPacketType: packetType(chosen),
    chips: chosen.chips || [],
    greeting: chosenPatch.greeting,
    sessionPatch: chosenPatch.sessionPatch,
    memoryPatch: chosenPatch.memoryPatch,
    presenceProfile: chosenPatch.greeting?.presenceProfile || chosenPatch.sessionPatch?.presenceProfile || "",
    nyxStateHint: chosenPatch.greeting?.presenceProfile || chosenPatch.sessionPatch?.nyxStateHint || "",
    backendFirst: false,
    replayDetected,
    adapterVersion: ADAPTER_VERSION
  };
}

module.exports = {
  ADAPTER_VERSION,
  textOfBackend,
  normalizeSig,
  normalizeMatchText,
  normalizeAssistantAliases,
  isReplay,
  isUnsafeBackendLoop,
  canUsePacket,
  canMatchPacketSignal,
  triggerMatches,
  internalIntentMatches,
  findSignalPacket,
  findReplyPacket,
  buildGreetingBridge,
  buildPacketPatches,
  applyPacketPatchToSession,
  resolveNyxPacket
};


/* LIVE_CONVERSATION_PARTITION_VALIDATION_PHASE3_START */
(function(){
  "use strict";
  const V="nyx.marion.phase3.liveConversationPartition.runtimeWrapper/1.0";
  let part=null;try{part=require("./liveConversationPartitionValidator.js");}catch(_err){try{part=require("../Data/marion/runtime/liveConversationPartitionValidator.js");}catch(_err2){part=null;}}
  if(!part||!part.projectResult||typeof module==="undefined"||!module.exports)return;
  function ctx(value,args){args=Array.prototype.slice.call(args||[]);return{payload:value,body:args[0],auth:args[1],meta:args[2],headers:(args[0]&&args[0].headers)||(args[1]&&args[1].headers)||{},route:(value&&value.route)||(args[0]&&args[0].route)||(args[0]&&args[0].path)||""};}
  function project(value,args){try{return part.projectResult(value,ctx(value,args));}catch(_err){return value;}}
  function wrapFn(fn,name){if(typeof fn!=="function"||fn.__nyxPhase3Partition)return fn;const wrapped=function(){const args=arguments;const res=fn.apply(this,args);if(res&&typeof res.then==="function")return res.then(function(v){return project(v,args);});return project(res,args);};try{Object.keys(fn).forEach(function(k){wrapped[k]=fn[k];});}catch(_err){}try{Object.defineProperty(wrapped,"name",{value:fn.name||name||"phase3PartitionWrapped"});}catch(_err){}wrapped.__nyxPhase3Partition=true;return wrapped;}
  try{if(typeof module.exports==="function")module.exports=wrapFn(module.exports,"default");}catch(_err){}
  try{const obj=module.exports&&typeof module.exports==="object"?module.exports:null;if(obj){["processWithMarion","route","maybeResolve","ask","handle","handleVoiceTranscript","handleVoiceInput","default","composeMarionResponse","compose","buildReply","run","handler","createMarionFinalEnvelope","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","normalizeCommand","handleMarionAdminConversation","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","process","safeResponse","buildResponse","createResponse","finalizeTurn","updateState","advanceState","mergeState","inspectLoop","checkLoop","evaluateLoop","guardReply","matchPacket","selectPacket","resolvePacket","applyPacket"].forEach(function(n){if(typeof obj[n]==="function")obj[n]=wrapFn(obj[n],n);});obj.LIVE_CONVERSATION_PARTITION_VALIDATION_PHASE3_VERSION=V;obj.liveConversationPartitionProject=part.projectResult;obj.liveConversationPartitionPatch=part.buildPartitionPatch;obj.liveConversationPartitionValidate=part.validateNoCrossPartitionLeak;}}catch(_err){}
})();
/* LIVE_CONVERSATION_PARTITION_VALIDATION_PHASE3_END */
