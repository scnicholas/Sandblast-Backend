\
"use strict";

/**
 * runtime/conversationalResponseSystem.js
 *
 * PURPOSE
 * - Convert routed intelligence into a stable UI contract
 * - Keep user-facing language out of system-log territory
 * - Preserve emotional continuity and action cohesion
 */

const VERSION = "conversationalResponseSystem v1.0.0 SURGICAL-COHESION";

function safeStr(v) { return v == null ? "" : String(v); }
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function arr(v) { return Array.isArray(v) ? v : []; }
function uniq(items) {
  const out = [];
  const seen = new Set();
  for (const item of arr(items)) {
    const key = typeof item === "string"
      ? item.trim().toLowerCase()
      : JSON.stringify(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
function clamp01(v, d = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.max(0, Math.min(1, n));
}
function firstNonEmpty() {
  for (const value of arguments) {
    const s = safeStr(value).trim();
    if (s) return s;
  }
  return "";
}
function normalizeEmotion(raw) {
  const src = isObj(raw) ? raw : {};
  const supportFlags = isObj(src.supportFlags) ? src.supportFlags : {};
  return {
    primaryEmotion: firstNonEmpty(src.primaryEmotion, src.emotion, "neutral").toLowerCase(),
    secondaryEmotion: firstNonEmpty(src.secondaryEmotion, "").toLowerCase(),
    intensity: clamp01(src.intensity, 0),
    valence: Math.max(-1, Math.min(1, Number(src.valence) || 0)),
    supportFlags
  };
}

function inferState(domain, emotion, mode) {
  const d = safeStr(domain || "general").toLowerCase();
  const m = safeStr(mode || "").toLowerCase();
  if (d === "psychology") return "supportive";
  if (m === "recovery") return "clarifying";
  if (emotion.supportFlags.highDistress || emotion.supportFlags.needsContainment) return "supportive";
  if (emotion.primaryEmotion === "sad" || emotion.primaryEmotion === "anxious") return "supportive";
  return "focused";
}

function splitReply(reply) {
  const text = safeStr(reply).trim();
  if (!text) return { lead: "", body: "", bridge: "" };
  const parts = text.split(/\n{2,}|\n/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return { lead: text, body: "", bridge: "" };
  return {
    lead: parts[0],
    body: parts.slice(1).join("\n").trim(),
    bridge: ""
  };
}

function sanitizeUserFacingReply(reply) {
  let out = safeStr(reply).trim();
  if (!out) return "";
  const banned = [
    /\b(shell is active|guiding properly)\b/ig,
    /\broute[_ ]?guard\b/ig,
    /\bturn lifecycle\b/ig,
    /\bphase \d+\b/ig,
    /\bfallback packet\b/ig,
    /\btelemetry\b/ig
  ];
  for (const rx of banned) out = out.replace(rx, "");
  out = out.replace(/\s{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return out;
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

function buildSuggestedActions(domain, emotion, evidenceCount) {
  const actions = [];
  if (domain === "psychology") {
    actions.push(action("Keep talking"));
    actions.push(action("What happened?"));
    actions.push(action("What do you need right now?"));
  } else if (domain === "finance") {
    actions.push(action("Break it down"));
    actions.push(action("Risk view"));
  } else if (domain === "law") {
    actions.push(action("What applies?"));
    actions.push(action("Key risk"));
  } else {
    actions.push(action("Tell me more"));
    actions.push(action("Next step"));
  }
  if (evidenceCount > 0) actions.push(action("Evidence"));
  if (emotion.primaryEmotion === "sad" || emotion.primaryEmotion === "anxious") {
    actions.unshift(action("Stay with me"));
  }
  return uniq(actions).filter(Boolean).slice(0, 4);
}

function buildBridgeLine(domain, emotion, mode) {
  if (safeStr(domain).toLowerCase() === "psychology") {
    if (emotion.supportFlags.highDistress || emotion.intensity >= 0.75) return "We can go one step at a time.";
    return "You do not have to explain it perfectly.";
  }
  if (safeStr(mode).toLowerCase() === "recovery") return "Let’s tighten the next move and keep it clean.";
  return "";
}

function buildUi(result, packet) {
  const domain = firstNonEmpty(result.domain, packet.routing && packet.routing.domain, "general").toLowerCase();
  const mode = firstNonEmpty(result.mode, packet.synthesis && packet.synthesis.mode, "balanced").toLowerCase();
  const emotion = normalizeEmotion(result.emotion || (packet.emotion && packet.emotion.lockedEmotion) || {});
  const evidenceCount = Number(packet.evidence && packet.evidence.count) || 0;
  const chips = buildSuggestedActions(domain, emotion, evidenceCount).map((x) => x.label);
  return {
    text: sanitizeUserFacingReply(firstNonEmpty(result.reply, packet.synthesis && packet.synthesis.answer)),
    chips,
    allowMic: true,
    mode: inferState(domain, emotion, mode),
    state: inferState(domain, emotion, mode),
    domain,
    intent: firstNonEmpty(result.intent, packet.routing && packet.routing.intent, "general").toLowerCase(),
    placeholder: domainPlaceholder(domain),
    bridgeLine: buildBridgeLine(domain, emotion, mode),
    actions: buildSuggestedActions(domain, emotion, evidenceCount)
  };
}

function buildEmotionalTurn(result, packet, ui) {
  const emotion = normalizeEmotion(result.emotion || (packet.emotion && packet.emotion.lockedEmotion) || {});
  const reply = sanitizeUserFacingReply(firstNonEmpty(result.reply, packet.synthesis && packet.synthesis.answer));
  const parts = splitReply(reply);
  return {
    primaryState: safeStr(ui.state || "focused").toLowerCase(),
    secondaryState: emotion.intensity >= 0.7 ? "intense" : "steady",
    continuityScore: emotion.intensity >= 0.8 ? 0.86 : 0.74,
    continuityLevel: emotion.intensity >= 0.8 ? "high" : "steady",
    placeholder: ui.placeholder,
    bridgeLine: ui.bridgeLine,
    response: {
      lead: parts.lead,
      body: parts.body,
      bridge: ui.bridgeLine
    },
    actions: arr(ui.actions).slice(0, 4),
    lane: firstNonEmpty(result.domain, "general").toLowerCase(),
    replyText: [parts.lead, parts.body].filter(Boolean).join("\n").trim() || reply,
    responseText: [parts.lead, parts.body].filter(Boolean).join("\n").trim() || reply,
    text: [parts.lead, parts.body].filter(Boolean).join("\n").trim() || reply,
    spokenText: [parts.lead, parts.body, ui.bridgeLine].filter(Boolean).join(" ").trim() || reply,
    emotion
  };
}

function buildResponseContract(result = {}, packet = {}) {
  const ui = buildUi(result, packet);
  const emotionalTurn = buildEmotionalTurn(result, packet, ui);
  const reply = sanitizeUserFacingReply(firstNonEmpty(result.reply, emotionalTurn.replyText, packet.synthesis && packet.synthesis.answer));
  const followUps = arr(ui.actions).slice(0, 4);
  return {
    version: VERSION,
    reply,
    ui,
    emotionalTurn,
    followUps,
    followUpsStrings: followUps.map((x) => safeStr(x.label || "").trim()).filter(Boolean),
    payload: {
      reply,
      text: reply,
      message: reply,
      output: reply
    }
  };
}

module.exports = {
  VERSION,
  buildResponseContract,
  buildUi,
  buildEmotionalTurn,
  sanitizeUserFacingReply
};
