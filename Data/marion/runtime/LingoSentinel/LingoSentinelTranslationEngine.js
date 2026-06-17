"use strict";

/**
 * LingoSentinelTranslationEngine
 * Dynamic translation orchestrator for spontaneous multilingual dialogue.
 */

const Registry = require("./LingoSentinelLanguageRegistry");
const { detectLanguage, normalizeLanguage, clampText } = require("./LingoSentinelLanguageDetector");
const { inferTone, buildProviderInstruction } = require("./LingoSentinelToneAdapter");
const { createContextMemory } = require("./LingoSentinelContextMemory");
const Provider = require("./LingoSentinelTranslationProvider");
const { normalizeTranslationResponse, normalizeError } = require("./LingoSentinelResponseNormalizer");

const VERSION = "2.2.0-spontaneity-50plus-translation-engine";
const memory = createContextMemory({
  maxTurns: Number(process.env.LINGOSENTINEL_CONTEXT_TURNS) || 12,
  ttlMs: Number(process.env.LINGOSENTINEL_CONTEXT_TTL_MS) || 30 * 60 * 1000,
  maxSessions: Number(process.env.LINGOSENTINEL_CONTEXT_MAX_SESSIONS) || 1000
});

function safeString(value, fallback = "") { if (typeof value === "string") return value.trim(); if (value === null || value === undefined) return fallback; return String(value).trim(); }
function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function nowIso() { return new Date().toISOString(); }
function createId(prefix = "lst") { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function resolveText(input = {}) { if (typeof input === "string") return input; const payload = safeObject(input); return safeString(payload.text || payload.message || payload.body || payload.input || payload.prompt || payload.originalText || ""); }
function resolveSessionId(input = {}) { const payload = safeObject(input); return safeString(payload.sessionId || payload.roomId || payload.conversationId || payload.channelId || "lingosentinel-main"); }
function resolveSpeaker(input = {}) { const payload = safeObject(input); const sender = safeObject(payload.sender || payload.from); return { id: safeString(sender.id || payload.senderId || payload.userId || "guest"), name: safeString(sender.name || payload.senderName || payload.name || "Guest"), role: safeString(sender.role || payload.role || "participant"), preferredLanguage: normalizeLanguage(sender.preferredLanguage || payload.sourceLanguage || payload.lang || "auto", "auto") }; }
function resolveTargetLanguage(input = {}) { const payload = safeObject(input); const recipient = safeObject(payload.recipient || payload.to); return Registry.coerceTargetLanguage(payload.targetLanguage || payload.targetLang || payload.recipientLanguage || payload.toLanguage || recipient.preferredLanguage || payload.publicLanguage || payload.languageOut || "en"); }
function isSameLanguage(sourceLanguage, targetLanguage) { const src = normalizeLanguage(sourceLanguage || "auto", "auto"); const tgt = normalizeLanguage(targetLanguage || "en", "en"); return src !== "auto" && src !== "mixed" && src !== "unknown" && src === tgt; }

async function translateTurn(input = {}, options = {}) {
  const text = clampText(resolveText(input), Number(options.maxTextChars || process.env.LINGOSENTINEL_MAX_TEXT_CHARS) || 6000);
  const sessionId = resolveSessionId(input);
  const speaker = resolveSpeaker(input);
  const turnId = safeString(input.turnId || input.id || createId("turn"));
  const sourceHint = normalizeLanguage(input.sourceLanguage || input.language || input.lang || speaker.preferredLanguage || "auto", "auto");
  const detection = detectLanguage(text, { sourceLanguage: sourceHint });
  const sourceLanguage = Registry.normalizeLanguageCode(detection.detectedLanguage || detection.language || sourceHint, "auto");
  const targetLanguage = resolveTargetLanguage(input);
  const pair = Registry.validateLanguagePair(sourceLanguage, targetLanguage, { allowAutoSource: true, provider: options.provider || process.env.LINGOSENTINEL_TRANSLATE_PROVIDER || "libre" });
  const tone = inferTone(text, input);
  const context = memory.snapshot(sessionId, Number(options.contextTurns || process.env.LINGOSENTINEL_CONTEXT_TURNS) || 12);
  const contextSummary = memory.summarize(sessionId, Number(options.contextTurns || process.env.LINGOSENTINEL_CONTEXT_TURNS) || 12);

  const base = {
    text, originalText: text, sourceLanguage: pair.source, detectedLanguage: detection.detectedLanguage || detection.language || pair.source, targetLanguage: pair.target,
    providerSourceLanguage: pair.providerSource, providerTargetLanguage: pair.providerTarget,
    sourceRtl: pair.sourceRtl, targetRtl: pair.targetRtl,
    sessionId, turnId, speaker, tone, context, contextUsed: context.length > 0,
    providerInstruction: buildProviderInstruction(tone), createdAt: nowIso(), engineVersion: VERSION,
    supportedLanguageCount: Registry.getSupportedLanguageCodes().length,
    publicSurface: "Nyx", finalAuthority: "Marion", marionAuthority: true, lingoSentinelAdvisoryOnly: false
  };

  if (!text) return { ...normalizeTranslationResponse({ ok: false, error: "empty_text" }, base), ...base, ok: false, stage: "empty_text" };
  if (pair.warnings.some(w => w.startsWith("UNSUPPORTED_TARGET_LANGUAGE"))) return { ...normalizeTranslationResponse({ ok: false, error: "unsupported_target_language", fallback: true }, base), ...base, ok: false, stage: "unsupported_target_language", warnings: pair.warnings };

  if (isSameLanguage(pair.source, pair.target)) {
    const result = normalizeTranslationResponse({ ok: true, translatedText: text, provider: "same-language-bypass" }, base);
    memory.addTurn(sessionId, { id: turnId, roomId: input.roomId, role: speaker.role, speakerId: speaker.id, speakerName: speaker.name, text, translatedText: text, sourceLanguage: pair.source, targetLanguage: pair.target, tone: tone.tone, intent: tone.intent });
    return { ...base, ...result, ok: true, stage: "same_language_bypass", provider: "same-language-bypass", detection, warnings: pair.warnings };
  }

  try {
    const providerResult = await Provider.translate({ text, sourceLanguage: pair.source, targetLanguage: pair.target, providerSourceLanguage: pair.providerSource, providerTargetLanguage: pair.providerTarget, context, contextSummary, tone, instruction: base.providerInstruction }, options.providerOptions || options);
    const normalized = normalizeTranslationResponse(providerResult, base);
    memory.addTurn(sessionId, { id: turnId, roomId: input.roomId, role: speaker.role, speakerId: speaker.id, speakerName: speaker.name, text, translatedText: normalized.translatedText, sourceLanguage: normalized.detectedLanguage || pair.source, targetLanguage: pair.target, tone: tone.tone, intent: tone.intent });
    return { ...base, ...normalized, ok: normalized.ok, stage: normalized.ok ? "translated" : "provider_fallback", detection, warnings: pair.warnings, contextUsed: context.length > 0, diagnosticsRedacted: true };
  } catch (error) {
    const normalized = normalizeError(error, base);
    memory.addTurn(sessionId, { id: turnId, roomId: input.roomId, role: speaker.role, speakerId: speaker.id, speakerName: speaker.name, text, translatedText: normalized.translatedText, sourceLanguage: pair.source, targetLanguage: pair.target, tone: tone.tone, intent: tone.intent });
    return { ...base, ...normalized, ok: false, stage: "translation_failed", diagnosticsRedacted: true };
  }
}

function detect(input = {}, options = {}) { return detectLanguage(resolveText(input), options || input || {}); }
function languages() { return { ok: true, service: "LingoSentinelLanguages", version: Registry.VERSION, count: Registry.getSupportedLanguageCodes().length, languages: Registry.publicLanguageList(), diagnosticsRedacted: true }; }
function health(options = {}) { return { ok: true, service: "LingoSentinelTranslationEngine", version: VERSION, provider: Provider.health(options.providerOptions || options), contextMemory: memory.status(), languageRegistry: { version: Registry.VERSION, count: Registry.getSupportedLanguageCodes().length, defaultTarget: Registry.getDefaultTargetLanguage() }, spontaneousTranslation: true, controlledPhraseFallbackOnly: false, publicSurface: "Nyx", finalAuthority: "Marion", diagnosticsRedacted: true, timestamp: nowIso() }; }

module.exports = { VERSION, translateTurn, detect, languages, health, memory };
