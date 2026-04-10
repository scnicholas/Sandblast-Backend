"use strict";

const VERSION = "conversationalResponseSystem v1.2.0 NYX-DETAIL-STABLE";

function safeStr(v) { return v == null ? "" : String(v); }
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function arr(v) { return Array.isArray(v) ? v : []; }
function toFiniteNumber(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clamp(v, min, max, fallback = min) { const n = toFiniteNumber(v, fallback); return Math.max(min, Math.min(max, n)); }
function clamp01(v, fallback = 0) { return clamp(v, 0, 1, fallback); }
function firstNonEmpty() { for (const value of arguments) { const s = safeStr(value).trim(); if (s) return s; } return ""; }
function uniq(items) {
  const out = [];
  const seen = new Set();
  for (const item of arr(items)) {
    const key = typeof item === "string" ? item.trim().toLowerCase() : JSON.stringify(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
function normalizeSupportFlags(raw) {
  const src = isObj(raw) ? raw : {};
  return { highDistress: !!src.highDistress, needsContainment: !!src.needsContainment, needsGrounding: !!src.needsGrounding, vulnerable: !!src.vulnerable };
}
function normalizeEmotion(raw) {
  const src = isObj(raw) ? raw : {};
  return {
    primaryEmotion: firstNonEmpty(src.primaryEmotion, src.emotion, "neutral").toLowerCase(),
    secondaryEmotion: firstNonEmpty(src.secondaryEmotion, "").toLowerCase(),
    intensity: clamp01(src.intensity, 0),
    valence: clamp(src.valence, -1, 1, 0),
    supportFlags: normalizeSupportFlags(src.supportFlags)
  };
}
function normalizeContext(result, packet) {
  const synthesis = isObj(packet && packet.synthesis) ? packet.synthesis : {};
  const routing = isObj(packet && packet.routing) ? packet.routing : {};
  const evidence = arr(packet && packet.evidence);
  const domain = firstNonEmpty(result && result.domain, routing.domain, synthesis.domain, "general").toLowerCase();
  const requestedMode = firstNonEmpty(result && result.mode, synthesis.mode, synthesis.supportMode, "balanced").toLowerCase();
  const intent = firstNonEmpty(result && result.intent, routing.intent, synthesis.intent, "general").toLowerCase();
  const emotion = normalizeEmotion((result && result.emotion) || (packet && packet.emotion && packet.emotion.lockedEmotion) || {});
  const evidenceCount = Math.max(0, evidence.length || toFiniteNumber(packet && packet.evidence && packet.evidence.count, 0));
  return { domain, requestedMode, intent, emotion, evidenceCount, synthesis, routing, evidence };
}
function inferState(domain, emotion, requestedMode) {
  const d = safeStr(domain).toLowerCase();
  const m = safeStr(requestedMode).toLowerCase();
  if (d === "psychology") return "supportive";
  if (m === "recovery" || m === "acute_regulation") return "clarifying";
  if (emotion.supportFlags.highDistress || emotion.supportFlags.needsContainment) return "supportive";
  if (["sad", "sadness", "anxious", "fear", "overwhelmed"].includes(emotion.primaryEmotion)) return "supportive";
  return "focused";
}
function splitReply(reply) {
  const text = safeStr(reply).trim();
  if (!text) return { lead: "", body: "", bridge: "" };
  const parts = text.split(/\n{2,}|\n/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return { lead: text, body: "", bridge: "" };
  return { lead: parts[0], body: parts.slice(1).join("\n").trim(), bridge: "" };
}
function sanitizeUserFacingReply(reply) {
  let out = safeStr(reply).trim();
  if (!out) return "";
  const banned = [/\b(shell is active|guiding properly)\b/ig,/\broute[_ ]?guard\b/ig,/\bturn lifecycle\b/ig,/\bphase \d+\b/ig,/\bfallback packet\b/ig,/\btelemetry\b/ig,/\bsystem(?:-|\s)?log\b/ig,/\bruntime(?:-|\s)?trace\b/ig,/\binternal(?:-|\s)?pipeline\b/ig];
  for (const rx of banned) out = out.replace(rx, "");
  return out.replace(/[ \t]{2,}/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/\s+([,.;:!?])/g, "$1").trim();
}
function buildFallbackReply(context) {
  if (context.domain === "psychology") return context.emotion.supportFlags.highDistress || context.emotion.intensity >= 0.75 ? "I am here with you. We can take this one step at a time." : "I am with you. Tell me what feels most important right now.";
  if (context.domain === "finance") return "Let’s break this down clearly and focus on the numbers that matter most.";
  if (context.domain === "law") return "Let’s sort out what applies, where the risk sits, and what the clean next move is.";
  return "I am with you. Give me a little more, and I will help tighten the next move.";
}
function domainPlaceholder(domain) {
  switch (safeStr(domain).toLowerCase()) {
    case "psychology": return "Tell Nyx what feels heavy…";
    case "finance": return "Ask Nyx to break down the numbers…";
    case "law": return "Ask Nyx what applies and where the risk is…";
    default: return "Ask Nyx anything about Sandblast…";
  }
}
function action(label, payload, role = "advance") {
  const clean = safeStr(label).trim();
  if (!clean) return null;
  return { label: clean, role, payload: isObj(payload) ? payload : { text: clean } };
}
function buildSuggestedActions(context) {
  const actions = [];
  if (context.domain === "psychology") {
    actions.push(action("Keep talking"));
    actions.push(action("What happened?"));
    actions.push(action("What do you need right now?"));
  } else if (context.domain === "finance") {
    actions.push(action("Break it down"));
    actions.push(action("Risk view"));
    actions.push(action("Show the numbers"));
  } else if (context.domain === "law") {
    actions.push(action("What applies?"));
    actions.push(action("Key risk"));
    actions.push(action("Next legal step"));
  } else {
    actions.push(action("Tell me more"));
    actions.push(action("Next step"));
  }
  if (context.evidenceCount > 0) actions.push(action("Detail", { action: "open_detail", domain: context.domain }, "explore"));
  if (["sad", "sadness", "anxious", "fear"].includes(context.emotion.primaryEmotion) || context.emotion.supportFlags.highDistress) actions.unshift(action("Stay with me"));
  return uniq(actions).filter(Boolean).slice(0, 4);
}
function buildBridgeLine(context) {
  if (context.domain === "psychology") return context.emotion.supportFlags.highDistress || context.emotion.intensity >= 0.75 ? "We can go one step at a time." : "You do not have to explain it perfectly.";
  if (["recovery", "acute_regulation"].includes(context.requestedMode)) return "Let’s tighten the next move and keep it clean.";
  return context.evidenceCount > 0 ? "Nyx keeps chat concise and opens heavier detail separately." : "";
}
function resolveReply(result, packet, context) {
  const synthesis = isObj(packet && packet.synthesis) ? packet.synthesis : {};
  const rawReply = firstNonEmpty(result && result.reply, result && result.text, synthesis.answer, synthesis.reply, synthesis.interpretation, "");
  const sanitized = sanitizeUserFacingReply(rawReply);
  return sanitized || buildFallbackReply(context);
}
function buildUi(result, packet) {
  const context = normalizeContext(result, packet);
  const state = inferState(context.domain, context.emotion, context.requestedMode);
  const actions = buildSuggestedActions(context);
  const text = resolveReply(result, packet, context);
  const bridgeLine = buildBridgeLine(context);
  return { text, chips: actions.map((x) => x.label), allowMic: true, mode: state, state, emotionalState: state, domain: context.domain, intent: context.intent, placeholder: domainPlaceholder(context.domain), bridgeLine, actions, replace: false, clearStale: false };
}
function buildEmotionalTurn(result, packet, ui) {
  const context = normalizeContext(result, packet);
  const reply = resolveReply(result, packet, context);
  const parts = splitReply(reply);
  const bridge = safeStr(ui && ui.bridgeLine).trim();
  const stitchedText = [parts.lead, parts.body].filter(Boolean).join("\n").trim() || reply;
  return { primaryState: safeStr((ui && ui.state) || "focused").toLowerCase(), secondaryState: context.emotion.intensity >= 0.7 ? "intense" : "steady", continuityScore: context.emotion.intensity >= 0.8 ? 0.86 : 0.74, continuityLevel: context.emotion.intensity >= 0.8 ? "high" : "steady", placeholder: (ui && ui.placeholder) || domainPlaceholder(context.domain), bridgeLine: bridge, response: { lead: parts.lead, body: parts.body, bridge }, actions: arr(ui && ui.actions).slice(0, 4), lane: context.domain, replyText: stitchedText, responseText: stitchedText, text: stitchedText, spokenText: [parts.lead, parts.body, bridge].filter(Boolean).join(" ").trim() || reply, emotion: context.emotion };
}
function buildResponseContract(result = {}, packet = {}) {
  const context = normalizeContext(result, packet);
  const ui = buildUi(result, packet);
  const emotionalTurn = buildEmotionalTurn(result, packet, ui);
  const reply = resolveReply(result, packet, context);
  const followUps = arr(ui.actions).slice(0, 4);
  return { version: VERSION, reply, ui, emotionalTurn, followUps, followUpsStrings: followUps.map((x) => safeStr(x && x.label).trim()).filter(Boolean), payload: { reply, text: reply, message: reply, output: reply } };
}

module.exports = { VERSION, buildResponseContract, buildUi, buildEmotionalTurn, sanitizeUserFacingReply };
