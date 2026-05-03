"use strict";
/**
 * nyx_pack_runtime_adapter.js v1.1.0 GREETING-STATE-BRIDGE
 * Purpose: Allow Nyx language/packet packs to serve as intro/fallback/greeting
 * support without overriding Marion. Backend-first remains the authority model.
 *
 * Critical behavior:
 * - Marion reply wins when a valid backend reply exists.
 * - Packet matches may still contribute sessionPatch / memoryPatch / greeting
 *   metadata so stateSpine can preserve tone, intent, energy, and source.
 * - Mic and text are normalized before packet matching so voice misreads such as
 *   Nick/Nix/Mix/Mike/Next can still reach Nyx greeting packets.
 */

const ADAPTER_VERSION = "nyx_pack_runtime_adapter v1.1.0 GREETING-STATE-BRIDGE";

const ASSISTANT_ALIAS_RE = /\b(nick|nicks|nix|mix|mike|next)\b/gi;
const GREETING_DISTRESS_RE = /\b(stress|stressed|overwhelm|overwhelmed|anxious|anxiety|panic|sad|alone|lonely|hurt|angry|mad|frustrated|rough day|hard day|not okay|can't think|cannot think)\b/i;

function safeStr(value) {
  return value === null || value === undefined ? "" : String(value);
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
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
  return safeStr(text).replace(ASSISTANT_ALIAS_RE, "Nyx");
}

function normalizeSig(text) {
  return normalizeAssistantAliases(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 180);
}

function normalizeMatchText(text) {
  return normalizeAssistantAliases(text)
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9#' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isReplay(text, session) {
  const sig = normalizeSig(text);
  return !!(sig && session && session.__lastOutSig && sig === session.__lastOutSig);
}

function pick(arr, seed) {
  if (!Array.isArray(arr) || !arr.length) return "";
  const n = Math.abs(Number(seed || Date.now())) % arr.length;
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
  return type === "greeting" || id.indexOf("greet") !== -1 || id.indexOf("greeting") !== -1;
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

function canUsePacket(packet, ctx) {
  const c = packet.constraints || {};
  const a = packet.marionAuthority || {};
  const backendText = textOfBackend(ctx.backendPayload);
  const backendPresent = !!backendText;

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

function canMatchPacketSignal(packet, ctx) {
  const c = packet.constraints || {};
  if (c.requireReplayDetected && !ctx.replayDetected) return false;
  if (c.requireNoFreshMarionFinal && ctx.freshMarionFinal) return false;
  if (c.requireBackendFailure && !ctx.backendFailed) return false;
  return true;
}

function triggerMatches(packet, ctx) {
  if (!packet || !Array.isArray(packet.trigger)) return false;
  const rawInput = getInputText(ctx);
  const input = normalizeMatchText(rawInput);
  if (!input) return false;

  for (const item of packet.trigger) {
    const trigger = normalizeMatchText(item);
    if (!trigger || trigger.indexOf("__") === 0) continue;
    if (input === trigger) return true;
    if (input.indexOf(trigger) !== -1) return true;
    if (trigger.indexOf(" ") === -1 && new RegExp(`(^|\\s)${escapeRegExp(trigger)}(\\s|$)`, "i").test(input)) return true;
  }
  return false;
}

function escapeRegExp(text) {
  return safeStr(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scorePacket(packet, ctx) {
  let score = Number(packet.priority || 0) || 0;
  if (isGreetingPacket(packet)) score += 1000;
  if (triggerMatches(packet, ctx)) score += 500;
  if (packetType(packet) === safeStr(ctx.intent).toLowerCase()) score += 80;
  const triggerCount = Array.isArray(packet.trigger) ? packet.trigger.length : 0;
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

function findReplyPacket(pack, ctx, desiredTypes) {
  const packets = Array.isArray(pack && pack.packets) ? pack.packets.slice() : [];
  return packets
    .filter((p) => desiredTypes.includes(packetType(p)) && canUsePacket(p, ctx))
    .sort((a, b) => scorePacket(b, ctx) - scorePacket(a, ctx))[0] || null;
}

function renderTemplate(template, ctx) {
  return String(template || "")
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
  return safeStr(packet.presenceProfile || packet.sessionPatch?.presenceProfile || "warm") || "warm";
}

function buildGreetingBridge(packet, ctx = {}) {
  if (!packet || !isGreetingPacket(packet)) return null;
  const inputSource = getInputSource(ctx);
  const text = getInputText(ctx);
  const sessionPatch = isPlainObject(packet.sessionPatch) ? { ...packet.sessionPatch } : {};
  const intent = firstNonEmpty(packet.intent, sessionPatch.lastGreetingIntent, sessionPatch.greetingIntent, packet.id);
  const tone = firstNonEmpty(packet.tone, sessionPatch.lastGreetingTone, sessionPatch.greetingTone, packet.presenceProfile);
  const energy = firstNonEmpty(packet.energy, sessionPatch.lastInputEnergy, sessionPatch.greetingEnergy, "medium");
  const presenceProfile = firstNonEmpty(packet.presenceProfile, sessionPatch.presenceProfile, presenceFromGreeting(packet, text));
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
    text: safeStr(text).slice(0, 240)
  };
}

function buildPacketPatches(packet, ctx = {}) {
  const sessionPatch = isPlainObject(packet && packet.sessionPatch) ? { ...packet.sessionPatch } : {};
  const memoryPatch = isPlainObject(packet && packet.memoryPatch) ? { ...packet.memoryPatch } : {};
  const greeting = buildGreetingBridge(packet, ctx);

  if (greeting) {
    sessionPatch.lastGreetingId = greeting.id;
    sessionPatch.lastGreetingIntent = greeting.intent;
    sessionPatch.lastGreetingTone = greeting.tone;
    sessionPatch.lastInputEnergy = greeting.energy;
    sessionPatch.lastGreetingSource = greeting.inputSource;
    sessionPatch.presenceProfile = greeting.presenceProfile;
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
  Object.assign(session, patch.sessionPatch || {});
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
  session.__usedPackets = session.__usedPackets || {};
  session.__usedPackets[packet.id] = true;
  if (reply) session.__lastOutSig = normalizeSig(reply);
}

function resolveNyxPacket(pack, ctx = {}) {
  const backendText = textOfBackend(ctx.backendPayload);
  const replayDetected = backendText ? isReplay(backendText, ctx.session) : !!ctx.replayDetected;
  const localCtx = { ...ctx, replayDetected };

  const signalPacket = findSignalPacket(pack, localCtx);
  const signalPatch = signalPacket ? buildPacketPatches(signalPacket, localCtx) : { greeting: null, sessionPatch: {}, memoryPatch: {} };
  if (signalPacket) applyPacketPatchToSession(localCtx.session, signalPatch);

  if (backendText && !isReplay(backendText, localCtx.session)) {
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
      adapterVersion: ADAPTER_VERSION
    };
  }

  const desired = ctx.intent === "intro" ? ["intro", "greeting"] : ctx.intent === "fallback" ? ["fallback", "error"] : ["greeting", "prompt", "intro", "fallback", "error"];
  const chosen = signalPacket && canUsePacket(signalPacket, localCtx) ? signalPacket : findReplyPacket(pack, localCtx, desired);
  if (!chosen) {
    return {
      source: "empty",
      reply: "",
      packet: signalPacket ? signalPacket.id : null,
      packetId: signalPacket ? signalPacket.id : "",
      matchedPacketId: signalPacket ? signalPacket.id : "",
      chips: signalPacket?.chips || [],
      greeting: signalPatch.greeting,
      sessionPatch: signalPatch.sessionPatch,
      memoryPatch: signalPatch.memoryPatch,
      adapterVersion: ADAPTER_VERSION
    };
  }

  const state = localCtx.session?.state || "cold";
  const stateTemplates = chosen.stateTemplates && chosen.stateTemplates[state];
  const templates = stateTemplates || chosen.templates || [];
  const reply = renderTemplate(pick(templates, localCtx.seed), localCtx).trim();
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
  canUsePacket,
  canMatchPacketSignal,
  triggerMatches,
  findSignalPacket,
  buildGreetingBridge,
  buildPacketPatches,
  applyPacketPatchToSession,
  resolveNyxPacket
};
