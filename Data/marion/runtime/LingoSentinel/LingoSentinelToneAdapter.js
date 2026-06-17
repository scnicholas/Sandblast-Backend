"use strict";

/**
 * LingoSentinelToneAdapter
 * Tone and intent advisory layer for spontaneous translation.
 */

const VERSION = "2.2.0-spontaneity-tone-adapter";
function safeString(value, fallback = "") { if (typeof value === "string") return value; if (value === null || value === undefined) return fallback; return String(value); }
function clean(value) { return safeString(value).replace(/\s+/g, " ").trim(); }

const TONE_RULES = Object.freeze([
  { tone: "greeting", intent: "open_conversation", confidence: 0.88, rx: /\b(?:hello|hi|hey|bonjour|salut|hola|olá|ola|ciao|hallo|merhaba|namaste|salaam|مرحبا|שלום)\b/i },
  { tone: "question", intent: "request_answer", confidence: 0.82, rx: /\?|\b(?:how|what|why|when|where|who|comment|pourquoi|quand|où|ou|cómo|como|qué|que|por qué|porque|quando|was|wie|warum|dove|quando)\b/i },
  { tone: "clarifying", intent: "clarify_meaning", confidence: 0.86, rx: /\b(?:not what i meant|be clear|clarify|ce n(?:’|')?est pas|être clair|etre clair|no quise decir|quiero aclarar|nicht gemeint|chiarire)\b/i },
  { tone: "reassuring", intent: "reduce_tension", confidence: 0.84, rx: /\b(?:not angry|calm|it(?:’|')?s okay|je ne suis pas f[aâ]ch[ée]|no estoy enojad[oa]|não estou bravo|nao estou bravo|no estoy molesto)\b/i },
  { tone: "urgent", intent: "urgent_action", confidence: 0.83, rx: /\b(?:urgent|immediately|right now|asap|vite|tout de suite|immédiatement|inmediatamente|urgente|agora|subito|sofort)\b/i },
  { tone: "apologetic", intent: "repair_or_soften", confidence: 0.81, rx: /\b(?:sorry|apologize|pardon|désolé|desole|lo siento|perdón|perdon|desculpa|scusa|entschuldigung)\b/i },
  { tone: "business", intent: "coordinate_work", confidence: 0.76, rx: /\b(?:meeting|schedule|team|client|project|budget|réunion|reunion|équipe|equipe|reunión|equipo|proyecto|riunione|besprechung)\b/i },
  { tone: "emotional", intent: "express_feeling", confidence: 0.72, rx: /\b(?:feel|feeling|hurt|afraid|nervous|worried|je me sens|j'ai peur|inquiet|nervioso|preocupado|triste)\b/i }
]);

function inferTone(text, options = {}) {
  const source = clean(text);
  const explicitTone = clean(options.tone || options.intentTone || "").toLowerCase();
  const explicitIntent = clean(options.intent || "").toLowerCase();
  if (!source) return { ok: false, tone: explicitTone || "neutral", intent: explicitIntent || "unknown", confidence: explicitTone ? 0.9 : 0, markers: [], version: VERSION };
  const markers = [];
  TONE_RULES.forEach(rule => { if (rule.rx.test(source)) markers.push({ tone: rule.tone, intent: rule.intent, confidence: rule.confidence }); });
  if (explicitTone) markers.unshift({ tone: explicitTone, intent: explicitIntent || "explicit", confidence: 0.95 });
  if (!markers.length) return { ok: true, tone: "neutral", intent: explicitIntent || "conversational_dialogue", confidence: 0.55, markers: [], version: VERSION };
  const top = markers.sort((a, b) => b.confidence - a.confidence)[0];
  return { ok: true, tone: top.tone, intent: explicitIntent || top.intent, confidence: top.confidence, markers: markers.slice(0, 6), version: VERSION };
}

function buildProviderInstruction(toneMeta = {}) {
  const tone = clean(toneMeta.tone || "neutral");
  const intent = clean(toneMeta.intent || "conversational_dialogue");
  return [
    "Translate meaning, not literal word order.",
    `Preserve tone: ${tone}.`,
    `Preserve communicative intent: ${intent}.`,
    "Keep names, organizations, product names, and technical terms intact unless a conventional translation exists.",
    "Return only the translated utterance when the provider supports instructions."
  ].join(" ");
}

module.exports = { VERSION, inferTone, buildProviderInstruction };
