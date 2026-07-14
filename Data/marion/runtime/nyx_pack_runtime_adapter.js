"use strict";
/**
 * nyx_pack_runtime_adapter.js v1.3.0 AUTHORITY-SAFE-PACKET-BRIDGE
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

const ADAPTER_VERSION = "nyx_pack_runtime_adapter v1.3.0 AUTHORITY-SAFE-PACKET-BRIDGE";

const DIRECT_ASSISTANT_ALIAS_RE = /(^|\b(?:hi|hey|hello|morning|good morning|good afternoon|good evening)\s+)(nick|nicks|nix|mix|mike)(?=\s*(?:[,.:;!?]|$|can\b|could\b|please\b|help\b|are\b|do\b|turn\b|play\b|show\b|tell\b|debug\b|run\b|respond\b|speak\b))/gi;
const STANDALONE_ASSISTANT_ALIAS_RE = /^\s*(nick|nicks|nix|mix|mike)\s*[,.:;!?]*\s*$/i;
const CONTEXTUAL_NEXT_ALIAS_RE = /(^|\b(?:hi|hey|hello|morning|good morning|good afternoon|good evening)\s+)next(?=\s*(?:[,.:;!?]|$|can\b|could\b|please\b|help\b|are\b|do\b|turn\b|play\b|show\b|tell\b|debug\b|run\b|respond\b|speak\b))/gi;
const SMART_APOSTROPHE_RE = /[’‘`]/g;
const CONTROL_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const UNSAFE_PATCH_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const PROTECTED_SESSION_KEYS = new Set([
  "auth", "authenticated", "authorization", "role", "roles", "permission", "permissions",
  "scope", "partitionkey", "memorypartition", "sessiontoken", "token", "apitoken", "admin",
  "operator", "identity", "state", "final", "finalapproved", "freshmarionfinal", "backendfailed",
  "reply", "text", "message", "answer", "output", "response", "audio", "speech", "voice",
  "voiceroute", "speakallowed", "shouldplay", "autoplay", "playable"
]);
const MAX_PATCH_DEPTH = 4;
const MAX_PATCH_ARRAY = 24;
const MAX_PATCH_KEYS = 64;
const MAX_PATCH_STRING = 500;
const MAX_BRIDGE_TEXT = 240;
const MAX_META_TEXT = 120;
const MAX_PACKET_ID = 128;
const MAX_REPLY_TEXT = 4000;
const MAX_MATCH_TEXT = 2400;
const MAX_PACKETS = 512;
const MAX_CHIPS = 12;
const MAX_CHIP_TEXT = 160;
const MAX_SIG = 180;
const LOOP_FALLBACK_RE = /^(?:i['’]?m here\.?\s*)?(?:what['’]?s next\??|what do you want to do next\??)$/i;
const GREETING_DISTRESS_RE = /\b(stress|stressed|overwhelm|overwhelmed|anxious|anxiety|panic|sad|alone|lonely|hurt|angry|mad|frustrated|rough day|hard day|not okay|can['’]?t think|cannot think)\b/i;

function safeStr(value) {
  try {
    return value === null || value === undefined ? "" : String(value);
  } catch (_) {
    return "";
  }
}

function cleanText(value, max = MAX_REPLY_TEXT) {
  return safeStr(value).replace(CONTROL_CHAR_RE, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch (_) {
    return false;
  }
}

function firstText() {
  for (let i = 0; i < arguments.length; i += 1) {
    if (typeof arguments[i] !== "string") continue;
    const v = cleanText(arguments[i], MAX_MATCH_TEXT);
    if (v) return v;
  }
  return "";
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
  if (typeof value === "string") return cleanText(value, MAX_PATCH_STRING);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_PATCH_ARRAY)
      .map((item) => sanitizePatchValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (!isPlainObject(value)) return undefined;
  const out = Object.create(null);
  let keyCount = 0;
  for (const [key, child] of Object.entries(value)) {
    if (keyCount >= MAX_PATCH_KEYS) break;
    if (UNSAFE_PATCH_KEYS.has(key)) continue;
    const cleanKey = cleanText(key, 96);
    if (!cleanKey || UNSAFE_PATCH_KEYS.has(cleanKey)) continue;
    const clean = sanitizePatchValue(child, depth + 1);
    if (clean !== undefined) {
      out[cleanKey] = clean;
      keyCount += 1;
    }
  }
  return out;
}

function sanitizePatchObject(value) {
  return isPlainObject(value) ? sanitizePatchValue(value, 0) || {} : {};
}

function isBackendFailureEnvelope(payload) {
  if (!isPlainObject(payload)) return false;
  const error = firstNonEmpty(payload.error, payload.reason, payload.code);
  const providerStatus = Number(payload.providerStatus || payload.status || 0);
  const audioFailure = payload.playable === false && (payload.spokenUnavailable === true || /tts|audio|voice/i.test(error));
  const suppressed = payload.suppressUserFacingReply === true || payload.awaitingMarion === true || payload.emit === false;
  const blocked = payload.blocked === true && payload.final !== true;
  const explicitFailure = payload.ok === false && !!error && payload.final !== true;
  return audioFailure || suppressed || blocked || explicitFailure || providerStatus >= 500;
}

function textOfBackend(payload) {
  if (typeof payload === "string") return cleanText(payload, MAX_REPLY_TEXT);
  if (!isPlainObject(payload) || isBackendFailureEnvelope(payload)) return "";
  const paths = [
    ["directReply"], ["publicReply"], ["visibleReply"], ["finalReply"], ["displayReply"],
    ["reply"], ["answer"], ["output"], ["response"], ["text"], ["speechText"], ["spokenText"],
    ["payload", "directReply"], ["payload", "publicReply"], ["payload", "visibleReply"],
    ["payload", "finalReply"], ["payload", "reply"], ["payload", "answer"], ["payload", "output"],
    ["payload", "text"], ["payload", "speechText"], ["payload", "spokenText"],
    ["finalEnvelope", "directReply"], ["finalEnvelope", "publicReply"], ["finalEnvelope", "visibleReply"],
    ["finalEnvelope", "finalReply"], ["finalEnvelope", "reply"], ["finalEnvelope", "answer"],
    ["finalEnvelope", "output"], ["finalEnvelope", "text"], ["finalEnvelope", "speechText"],
    ["finalEnvelope", "spokenText"], ["packet", "reply"], ["packet", "answer"],
    ["packet", "output"], ["packet", "text"], ["packet", "synthesis", "reply"],
    ["packet", "synthesis", "answer"], ["packet", "synthesis", "text"],
    ["packet", "synthesis", "output"], ["packet", "synthesis", "message"], ["message"]
  ];
  for (const path of paths) {
    const cur = readPath(payload, path);
    if (typeof cur === "string") {
      const text = cleanText(cur, MAX_REPLY_TEXT);
      if (text) return text;
    }
  }
  return "";
}

function normalizeAssistantAliases(text) {
  const source = safeStr(text);
  if (STANDALONE_ASSISTANT_ALIAS_RE.test(source)) return "Nyx";
  return source
    .replace(DIRECT_ASSISTANT_ALIAS_RE, (match, prefix) => `${prefix || ""}Nyx`)
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
    .trim()
    .slice(0, MAX_MATCH_TEXT);
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

function safePacketId(packet) {
  const id = cleanText(packet && packet.id, MAX_PACKET_ID);
  if (!id || UNSAFE_PATCH_KEYS.has(id.toLowerCase())) return "";
  return id;
}

function safeChipUrl(value) {
  const url = cleanText(value, MAX_CHIP_TEXT);
  if (!url) return "";
  if (/^(?:https?:\/\/|\/|#)/i.test(url)) return url;
  return "";
}

function sanitizeChips(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_CHIPS).map((chip) => {
    if (typeof chip === "string") return cleanText(chip, MAX_CHIP_TEXT);
    if (!isPlainObject(chip)) return null;
    const out = Object.create(null);
    for (const key of ["id", "label", "text", "title", "value", "action", "intent"]) {
      if (typeof chip[key] === "string") out[key] = cleanText(chip[key], MAX_CHIP_TEXT);
    }
    for (const key of ["url", "href"]) {
      if (typeof chip[key] === "string") {
        const safeUrl = safeChipUrl(chip[key]);
        if (safeUrl) out[key] = safeUrl;
      }
    }
    return Object.keys(out).length ? out : null;
  }).filter(Boolean);
}

function packetList(pack) {
  return Array.isArray(pack && pack.packets) ? pack.packets.slice(0, MAX_PACKETS).filter(isPlainObject) : [];
}

function packetType(packet) {
  return safeStr(packet && packet.type).toLowerCase();
}

function packetId(packet) {
  return safePacketId(packet);
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
  return firstText(
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
  return cleanText(firstNonEmpty(ctx.inputSource, ctx.source, inbound.inputSource, inbound.source, payload.inputSource, payload.source, meta.inputSource, meta.source, "text"), 48).toLowerCase();
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
  for (const item of packet.trigger.slice(0, 64)) {
    const rawTrigger = safeStr(item).trim();
    if (!rawTrigger || rawTrigger.startsWith("__")) continue;
    const trigger = normalizeMatchText(rawTrigger);
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
  const id = safePacketId(packet);
  if (c.oncePerSession && id && ctx.session && isPlainObject(ctx.session.__usedPackets) && Object.prototype.hasOwnProperty.call(ctx.session.__usedPackets, id)) return false;
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
  const rawPriority = Number(packet.priority || 0);
  let score = Number.isFinite(rawPriority) ? Math.max(-10000, Math.min(10000, rawPriority)) : 0;
  if (isGreetingPacket(packet)) score += 1000;
  if (triggerMatches(packet, ctx)) score += 500;
  if (internalIntentMatches(packet, ctx)) score += 450;
  if (packetType(packet) === safeStr(ctx.intent).toLowerCase()) score += 80;
  const triggerCount = Array.isArray(packet.trigger) ? packet.trigger.filter((t) => !safeStr(t).startsWith("__")).length : 0;
  score += Math.min(triggerCount, 30);
  return score;
}

function findSignalPacket(pack, ctx) {
  const packets = packetList(pack);
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
  const packets = packetList(pack);
  return packets
    .filter((p) => desiredTypes.includes(packetType(p)) && canUsePacket(p, ctx))
    .filter((p) => triggerMatches(p, ctx) || canReplyWithoutTextTrigger(p, ctx))
    .sort((a, b) => scorePacket(b, ctx) - scorePacket(a, ctx))[0] || null;
}

function renderTemplate(template, ctx = {}) {
  const year = cleanText(ctx.session?.lastMusicYear || ctx.year || "", 24);
  const city = cleanText(ctx.session?.city || ctx.city || "", 80);
  const mode = cleanText(ctx.session?.activeMusicMode || ctx.mode || "", 80);
  return cleanText(safeStr(template)
    .replaceAll("{year}", year)
    .replaceAll("{city}", city)
    .replaceAll("{mode}", mode), MAX_REPLY_TEXT);
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
  const intent = cleanText(firstNonEmpty(packet.intent, sessionPatch.lastGreetingIntent, sessionPatch.greetingIntent, safePacketId(packet)), MAX_META_TEXT);
  const tone = cleanText(firstNonEmpty(packet.tone, sessionPatch.lastGreetingTone, sessionPatch.greetingTone, packet.presenceProfile, sessionPatch.lastPresenceProfile), MAX_META_TEXT);
  const energy = cleanText(firstNonEmpty(packet.energy, sessionPatch.lastInputEnergy, sessionPatch.greetingEnergy, "medium"), 48);
  const presenceProfile = cleanText(firstNonEmpty(packet.presenceProfile, sessionPatch.presenceProfile, sessionPatch.lastPresenceProfile, presenceFromGreeting(packet, text)), 64);
  return {
    active: true,
    id: safePacketId(packet),
    packetId: safePacketId(packet),
    type: cleanText(packet.type || "greeting", 48),
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
  const sessionPatch = sanitizeSessionPatch(packet && packet.sessionPatch);
  const memoryPatch = sanitizeSessionPatch(packet && packet.memoryPatch);
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

function sanitizeSessionPatch(value) {
  const patch = sanitizePatchObject(value);
  const out = Object.create(null);
  for (const [key, child] of Object.entries(patch)) {
    const normalized = key.toLowerCase();
    if (key.startsWith("__") || PROTECTED_SESSION_KEYS.has(normalized)) continue;
    out[key] = child;
  }
  return out;
}

function applyPacketPatchToSession(session, patch = {}) {
  if (!session || typeof session !== "object") return;
  Object.assign(session, sanitizeSessionPatch(patch.sessionPatch));
  if (isPlainObject(patch.greeting)) {
    session.greeting = {
      ...(isPlainObject(session.greeting) ? session.greeting : {}),
      active: true,
      lastId: cleanText(patch.greeting.id, MAX_PACKET_ID),
      lastIntent: cleanText(patch.greeting.intent, MAX_META_TEXT),
      lastTone: cleanText(patch.greeting.tone, MAX_META_TEXT),
      lastEnergy: cleanText(patch.greeting.energy, 48),
      lastSource: cleanText(patch.greeting.inputSource, 48),
      lastPresenceProfile: cleanText(patch.greeting.presenceProfile, 64),
      updatedAt: Date.now()
    };
  }
}

function markPacketUsed(session, packet, reply) {
  if (!session || !packet) return;
  const id = safePacketId(packet);
  if (!id) return;
  const previous = isPlainObject(session.__usedPackets) ? session.__usedPackets : {};
  const used = Object.assign(Object.create(null), previous);
  used[id] = true;
  session.__usedPackets = used;
  if (reply) session.__lastOutSig = normalizeSig(reply);
}

function desiredTypesFor(ctx = {}) {
  const intent = safeStr(ctx.intent).toLowerCase();
  if (intent === "intro") return ["intro", "greeting"];
  if (intent === "fallback" || intent === "replay") return ["fallback", "error"];
  if (intent === "error") return ["error", "fallback"];
  return ["greeting", "prompt", "intro", "fallback", "error", "help", "goodbye", "nav"];
}

function resolveNyxPacketCore(pack, ctx = {}) {
  const backendFailureEnvelope = isBackendFailureEnvelope(ctx.backendPayload);
  const backendFailed = ctx.backendFailed === true || backendFailureEnvelope;
  const backendText = backendFailed ? "" : textOfBackend(ctx.backendPayload);
  const backendUnsafeLoop = backendText ? isUnsafeBackendLoop(backendText, ctx) : false;
  const replayDetected = backendText ? (isReplay(backendText, ctx.session) || backendUnsafeLoop) : !!ctx.replayDetected;
  const localCtx = { ...ctx, backendFailed, replayDetected };

  const signalPacket = findSignalPacket(pack, localCtx);
  const signalPatch = signalPacket ? buildPacketPatches(signalPacket, localCtx) : { greeting: null, sessionPatch: {}, memoryPatch: {} };
  if (signalPacket) applyPacketPatchToSession(localCtx.session, signalPatch);

  if (backendText && !backendUnsafeLoop && !replayDetected) {
    if (localCtx.session) localCtx.session.__lastOutSig = normalizeSig(backendText);
    return {
      source: "marion",
      reply: backendText,
      packet: signalPacket ? safePacketId(signalPacket) : null,
      packetId: signalPacket ? safePacketId(signalPacket) : "",
      matchedPacketId: signalPacket ? safePacketId(signalPacket) : "",
      matchedPacketType: signalPacket ? packetType(signalPacket) : "",
      chips: sanitizeChips(signalPacket && signalPacket.chips),
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
  const signalCanReply = signalPacket && desired.includes(packetType(signalPacket)) && canUsePacket(signalPacket, localCtx);
  const chosen = signalCanReply ? signalPacket : findReplyPacket(pack, localCtx, desired);
  if (!chosen) {
    return {
      source: "empty",
      reply: "",
      packet: signalPacket ? safePacketId(signalPacket) : null,
      packetId: signalPacket ? safePacketId(signalPacket) : "",
      matchedPacketId: signalPacket ? safePacketId(signalPacket) : "",
      matchedPacketType: signalPacket ? packetType(signalPacket) : "",
      chips: sanitizeChips(signalPacket && signalPacket.chips),
      greeting: signalPatch.greeting,
      sessionPatch: signalPatch.sessionPatch,
      memoryPatch: signalPatch.memoryPatch,
      backendFirst: false,
      replayDetected,
      adapterVersion: ADAPTER_VERSION
    };
  }

  const state = localCtx.session?.state || "cold";
  const stateTemplates = isPlainObject(chosen.stateTemplates) && Array.isArray(chosen.stateTemplates[state]) ? chosen.stateTemplates[state] : null;
  const templates = stateTemplates || (Array.isArray(chosen.templates) ? chosen.templates : []);
  const seed = firstNonEmpty(localCtx.seed, `${packetId(chosen)}:${getInputText(localCtx)}:${localCtx.session?.turnId || localCtx.session?.turn || ""}`);
  const reply = renderTemplate(pick(templates, seed), localCtx).trim();
  const replyReplay = reply && isReplay(reply, localCtx.session);
  if (!reply || (chosen.constraints?.doNotLoop && replyReplay && !internalIntentMatches(chosen, localCtx))) {
    return {
      source: "empty",
      reply: "",
      packet: safePacketId(chosen),
      packetId: safePacketId(chosen),
      matchedPacketId: safePacketId(chosen),
      matchedPacketType: packetType(chosen),
      chips: sanitizeChips(chosen.chips),
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
    packet: safePacketId(chosen),
    packetId: safePacketId(chosen),
    matchedPacketId: safePacketId(chosen),
    matchedPacketType: packetType(chosen),
    chips: sanitizeChips(chosen.chips),
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

const PARTITION_WRAPPER_VERSION = "nyx.marion.phase3.liveConversationPartition.runtimeWrapper/1.1-adapter-safe-lazy";
let partitionValidatorCache;

function getPartitionValidator() {
  if (partitionValidatorCache !== undefined) return partitionValidatorCache;
  try {
    partitionValidatorCache = require("./liveConversationPartitionValidator.js");
  } catch (_) {
    partitionValidatorCache = null;
  }
  return partitionValidatorCache;
}

function projectPartitionResult(value, pack, ctx) {
  const part = getPartitionValidator();
  if (!part || typeof part.projectResult !== "function") return value;
  const localCtx = isPlainObject(ctx) ? ctx : {};
  const inbound = isPlainObject(localCtx.inbound) ? localCtx.inbound : {};
  const projectionContext = {
    payload: value,
    pack: isPlainObject(pack) ? { id: cleanText(pack.id || pack.packId || "", 128), version: cleanText(pack.version || "", 64) } : {},
    body: isPlainObject(inbound.body) ? inbound.body : localCtx,
    auth: isPlainObject(localCtx.auth) ? localCtx.auth : {},
    meta: isPlainObject(localCtx.meta) ? localCtx.meta : (isPlainObject(inbound.meta) ? inbound.meta : {}),
    headers: isPlainObject(localCtx.headers) ? localCtx.headers : (isPlainObject(inbound.headers) ? inbound.headers : {}),
    route: cleanText(localCtx.route || inbound.route || inbound.path || "", 240)
  };
  try {
    const projected = part.projectResult(value, projectionContext);
    return projected === undefined ? value : projected;
  } catch (_) {
    return value;
  }
}

function resolveNyxPacket(pack, ctx = {}) {
  return projectPartitionResult(resolveNyxPacketCore(pack, ctx), pack, ctx);
}

module.exports = {
  ADAPTER_VERSION,
  PARTITION_WRAPPER_VERSION,
  textOfBackend,
  isBackendFailureEnvelope,
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
