
"use strict";

const { getDomainConfig } = require("./marionDomainRegistry");

const VERSION = "marionIntentRouter v1.0.2 FORWARD-DEEP-MOVEMENT + LOOP-SAFE-CANONICAL-INTENT";

const INTENT_TO_DOMAIN = Object.freeze({ simple_chat: "general", domain_question: "general_reasoning", technical_debug: "technical", emotional_support: "emotional", business_strategy: "business", music_query: "music", news_query: "news", roku_query: "roku", identity_or_memory: "memory" });
const INTENT_ALIASES = Object.freeze({ chat: "simple_chat", smalltalk: "simple_chat", small_talk: "simple_chat", greeting: "simple_chat", general: "domain_question", question: "domain_question", technical: "technical_debug", debug: "technical_debug", diagnostic: "technical_debug", diagnostics: "technical_debug", autopsy: "technical_debug", audit: "technical_debug", repair: "technical_debug", fix: "technical_debug", loop: "technical_debug", emotional: "emotional_support", emotion: "emotional_support", support: "emotional_support", wellbeing: "emotional_support", business: "business_strategy", strategy: "business_strategy", sales: "business_strategy", music: "music_query", news: "news_query", newscanada: "news_query", roku: "roku_query", memory: "identity_or_memory", identity: "identity_or_memory", continuity: "identity_or_memory" });

function safeStr(v) { return v == null ? "" : String(v).trim(); }
function lower(v) { return safeStr(v).toLowerCase(); }
function cleanKey(v) { return lower(v).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function clampConfidence(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback; }
function asObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function textFromPacket(packet = {}) { const p = asObj(packet); return safeStr(p.text || p.userQuery || p.query || p.message || p.input || p.session?.lastUserText || ""); }
function highDistressText(text = "") { return /\b(kill myself|suicid(?:e|al)|self[-\s]?harm|do not want to live|don't want to live|panic attack|cannot breathe|can't breathe|depressed|hopeless|worthless|grief|heartbroken|overwhelmed|terrified|afraid|anxious|crying|hurt|hurting|alone|lonely)\b/i.test(lower(text)); }
function isSocialText(text = "") { const t = lower(text).replace(/[!?.,]+$/g, "").trim(); return /^(hi|hello|hey|yo|good morning|good afternoon|good evening)(\s+nyx)?$/.test(t) || /^(how are you|how are you doing|how's it going|what's up|you there|are you there)(\s+nyx)?$/.test(t); }
function inferIntentFromText(text = "") {
  const t = lower(text);
  if (!t) return { intent: "simple_chat", confidence: 0.4, reason: "empty_or_missing_text" };
  if (isSocialText(t)) return { intent: "simple_chat", confidence: 0.91, reason: "social_turn" };
  if (/\b(autopsy|audit|line\s*by\s*line|gap refinement|debug|diagnostic|syntax|script|file|index\.js|marion|bridge|packet|normalizer|router|route|endpoint|loop|handoff|fix|harden|download|zip|error|bug|broken)\b/i.test(t)) return { intent: "technical_debug", confidence: 0.9, reason: "technical_debug_terms" };
  if (highDistressText(t)) return { intent: "emotional_support", confidence: 0.86, reason: "high_distress_language" };
  if (/\b(price|pricing|sponsor|media kit|monetize|pitch|funding|investor|sales|proposal|revenue|business|strategy)\b/i.test(t)) return { intent: "business_strategy", confidence: 0.78, reason: "business_terms" };
  if (/\b(top\s*10|song|artist|album|chart|music|radio|playlist|billboard)\b/i.test(t)) return { intent: "music_query", confidence: 0.82, reason: "music_terms" };
  if (/\b(news|story|headline|article|rss|newscanada|for your life)\b/i.test(t)) return { intent: "news_query", confidence: 0.82, reason: "news_terms" };
  if (/\b(roku|tv app|channel|linear tv|streaming)\b/i.test(t)) return { intent: "roku_query", confidence: 0.8, reason: "roku_terms" };
  if (/\b(remember|last time|continue|state spine|memory|identity|continuity)\b/i.test(t)) return { intent: "identity_or_memory", confidence: 0.76, reason: "memory_terms" };
  if (t.length > 120 || /\?$/.test(t)) return { intent: "domain_question", confidence: 0.62, reason: "general_question" };
  return { intent: "simple_chat", confidence: 0.58, reason: "default_simple_chat" };
}
function normalizeIntent(rawInput = {}, packet = {}) {
  const src = asObj(rawInput), text = textFromPacket(packet) || safeStr(src.text || src.userQuery || src.query || "");
  const declaredRaw = cleanKey(src.intent || src.type || ""), declared = declaredRaw ? (INTENT_ALIASES[declaredRaw] || declaredRaw) : "";
  const inferred = inferIntentFromText(text);
  let intent = declared || inferred.intent, reason = safeStr(src.reason || src.source || inferred.reason || "intent_router") || "intent_router", confidence = clampConfidence(src.confidence, inferred.confidence || 0.4);
  if (intent === "emotional_support" && isSocialText(text) && !highDistressText(text)) { intent = "simple_chat"; confidence = Math.max(confidence, 0.9); reason = "social_turn_overrode_support_hold"; }
  if (inferred.intent === "technical_debug" && !/\b(kill myself|suicid(?:e|al)|self[-\s]?harm)\b/i.test(lower(text))) { intent = "technical_debug"; confidence = Math.max(confidence, inferred.confidence); reason = "technical_override"; }
  if (!INTENT_TO_DOMAIN[intent]) intent = "domain_question";
  const activate = typeof src.activate === "boolean" ? src.activate : intent !== "simple_chat";
  return { activate, intent, confidence: clampConfidence(confidence, activate ? 0.66 : 0.4), reason, source: safeStr(src.source || "intent_router") || "intent_router" };
}
function safeDomainConfig(domain) { try { const cfg = getDomainConfig(domain); if (cfg && typeof cfg === "object") return cfg; } catch (_e) {} return { domain, mode: domain === "general" ? "social_forward" : "balanced", depth: domain === "general" ? "light_forward" : "balanced", useMemory: domain !== "general", useDomainKnowledge: domain !== "general", preferredStyle: domain === "general" ? "warm_direct" : "direct" }; }
function routeMarionIntent(packet = {}) {
  const p = asObj(packet), intentPacket = p.marionIntent || p.intentPacket || p.session?.marionIntent || {}, marionIntent = normalizeIntent(intentPacket, p);
  const mappedDomain = INTENT_TO_DOMAIN[marionIntent.intent] || "general_reasoning", domainConfig = safeDomainConfig(mappedDomain);
  const supportPolicy = { allowSupportHold: marionIntent.intent === "emotional_support", releaseSupportHold: marionIntent.intent === "simple_chat" || marionIntent.intent === "technical_debug", forwardMovement: marionIntent.intent === "simple_chat" ? "social_forward" : "domain_forward", emotionalIntelligence: marionIntent.intent === "emotional_support" ? "contain_then_deepen" : "tone_only_no_support_dominance" };
  return { ok: true, routerVersion: VERSION, marionIntent, routing: { domain: domainConfig.domain || mappedDomain, intent: marionIntent.intent, mode: marionIntent.intent === "simple_chat" ? "social_forward" : (domainConfig.mode || "balanced"), depth: marionIntent.intent === "simple_chat" ? "forward_deep_invitation" : (domainConfig.depth || "balanced"), endpoint: "marion://routeMarion.primary", useMemory: marionIntent.intent !== "simple_chat" && !!domainConfig.useMemory, useDomainKnowledge: marionIntent.intent !== "simple_chat" && !!domainConfig.useDomainKnowledge, preferredStyle: marionIntent.intent === "simple_chat" ? "warm_direct" : (domainConfig.preferredStyle || "direct"), supportPolicy }, meta: { triggerSource: safeStr(p.source || p.ui?.source || "nyx_widget") || "nyx_widget", routedAt: new Date().toISOString(), confidence: marionIntent.confidence, supportPolicy } };
}
module.exports = { VERSION, routeMarionIntent, normalizeIntent };
