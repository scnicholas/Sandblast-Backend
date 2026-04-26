"use strict";
/**
 * nyx_pack_runtime_adapter.js v1.0.0
 * Purpose: Allow Nyx language/packet packs to serve as intro/fallback support
 * without overriding Marion. This is intentionally small and backend-first.
 */

function textOfBackend(payload) {
  if (!payload || typeof payload !== "object") return "";
  const paths = [
    ["reply"], ["text"], ["answer"], ["output"], ["response"],
    ["payload", "reply"], ["payload", "text"], ["payload", "message"],
    ["packet", "reply"], ["packet", "answer"], ["packet", "output"],
    ["packet", "synthesis", "reply"], ["packet", "synthesis", "answer"],
    ["packet", "synthesis", "text"], ["packet", "synthesis", "output"]
  ];
  for (const path of paths) {
    let cur = payload;
    for (const key of path) cur = cur && cur[key];
    if (typeof cur === "string" && cur.trim()) return cur.trim();
  }
  return "";
}

function normalizeSig(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 180);
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

function renderTemplate(template, ctx) {
  return String(template || "")
    .replaceAll("{year}", ctx.session?.lastMusicYear || ctx.year || "")
    .replaceAll("{city}", ctx.session?.city || ctx.city || "")
    .replaceAll("{mode}", ctx.session?.activeMusicMode || ctx.mode || "");
}

function resolveNyxPacket(pack, ctx) {
  const backendText = textOfBackend(ctx.backendPayload);
  if (backendText && !isReplay(backendText, ctx.session)) {
    if (ctx.session) ctx.session.__lastOutSig = normalizeSig(backendText);
    return { source: "marion", reply: backendText, packet: null, chips: [] };
  }

  const replayDetected = backendText ? isReplay(backendText, ctx.session) : !!ctx.replayDetected;
  const localCtx = { ...ctx, replayDetected };
  const packets = Array.isArray(pack?.packets) ? pack.packets.slice() : [];
  packets.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const desired = ctx.intent === "intro" ? ["intro", "greeting"] : ctx.intent === "fallback" ? ["fallback", "error"] : [];
  const chosen = packets.find(p => desired.includes(p.type) && canUsePacket(p, localCtx));
  if (!chosen) return { source: "empty", reply: "", packet: null, chips: [] };

  const state = ctx.session?.state || "cold";
  const stateTemplates = chosen.stateTemplates && chosen.stateTemplates[state];
  const templates = stateTemplates || chosen.templates || [];
  const reply = renderTemplate(pick(templates, ctx.seed), localCtx).trim();

  if (ctx.session) {
    ctx.session.__usedPackets = ctx.session.__usedPackets || {};
    ctx.session.__usedPackets[chosen.id] = true;
    ctx.session.__lastOutSig = normalizeSig(reply);
    Object.assign(ctx.session, chosen.sessionPatch || {});
  }
  return { source: "packet", reply, packet: chosen.id, chips: chosen.chips || [] };
}

module.exports = { textOfBackend, normalizeSig, isReplay, canUsePacket, resolveNyxPacket };
