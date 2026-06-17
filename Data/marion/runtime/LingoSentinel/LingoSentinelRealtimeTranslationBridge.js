"use strict";

/**
 * LingoSentinelRealtimeTranslationBridge
 * Bridges spontaneous translation into the existing live/publish pathway.
 */

const TranslationEngine = require("./LingoSentinelTranslationEngine");
const Registry = require("./LingoSentinelLanguageRegistry");

const VERSION = "2.2.0-spontaneity-realtime-translation-bridge";
function safeString(value, fallback = "") { if (typeof value === "string") return value.trim(); if (value === null || value === undefined) return fallback; return String(value).trim(); }
function nowIso() { return new Date().toISOString(); }
function normalizeMode(value) { const raw = safeString(value || "one_to_one").toLowerCase(); if (["group", "group_room", "room"].includes(raw)) return "group_room"; if (["live", "live_translate", "translation"].includes(raw)) return "live_translate"; if (["delivered", "delivery", "sent"].includes(raw)) return "delivered"; return "one_to_one"; }
function readText(input = {}) { return safeString(input.text || input.message || input.body || input.originalText || ""); }
function recipientTarget(input = {}) { const recipient = input.recipient || input.to || {}; return Registry.coerceTargetLanguage(input.targetLanguage || input.recipientLanguage || recipient.preferredLanguage || input.publicLanguage || "en"); }

async function buildTranslatedPublishInput(input = {}, options = {}) {
  const mode = normalizeMode(input.mode || input.lane);
  const sender = input.sender || input.from || { id: safeString(input.senderId || input.userId || "guest"), name: safeString(input.senderName || input.name || "Guest"), preferredLanguage: safeString(input.sourceLanguage || input.lang || "auto") };
  const recipient = input.recipient || input.to || null;
  const targetLanguage = recipientTarget({ ...input, recipient });
  const translation = await TranslationEngine.translateTurn({ ...input, text: readText(input), sender, recipient, targetLanguage, sessionId: input.sessionId || input.roomId || input.conversationId || "lingosentinel-main", mode }, options.translationOptions || options);
  const message = { id: safeString(input.id || translation.turnId), originalText: translation.originalText || translation.text, text: translation.translatedText, translatedText: translation.translatedText, displayText: translation.translatedText, sourceLanguage: translation.detectedLanguage || translation.sourceLanguage, targetLanguage: translation.targetLanguage, provider: translation.provider, fallback: translation.fallback === true, tone: translation.tone, contextUsed: translation.contextUsed, rtl: { source: translation.sourceRtl === true, target: translation.targetRtl === true }, createdAt: nowIso() };
  return { ...input, mode, sender, recipient, targetLanguage, text: message.displayText, originalText: message.originalText, translatedText: message.translatedText, message, language: { sourceLanguage: message.sourceLanguage, targetLanguage: message.targetLanguage, detectedLanguage: translation.detectedLanguage }, translation, publicSurface: "Nyx", finalAuthority: "Marion", marionAuthority: true, translationBridgeVersion: VERSION };
}

async function buildTranslatedGroupInputs(input = {}, options = {}) {
  const recipients = Array.isArray(input.recipients) ? input.recipients : [];
  if (!recipients.length) return [await buildTranslatedPublishInput(input, options)];
  const results = [];
  for (const recipient of recipients) results.push(await buildTranslatedPublishInput({ ...input, recipient, targetLanguage: recipient.preferredLanguage || input.targetLanguage || "en" }, options));
  return results;
}

async function publishTranslatedMessage(input = {}, options = {}) {
  const translatedInput = await buildTranslatedPublishInput(input, options);
  const publisher = options.publisher || options.engine || options.realtimeBridge || null;
  if (publisher && typeof publisher.publishMessage === "function") return publisher.publishMessage(translatedInput, options.publishOptions || options);
  if (publisher && typeof publisher.publishRoomMessage === "function") {
    const ok = await publisher.publishRoomMessage(translatedInput.roomId || "lingosentinel-main", translatedInput.message, translatedInput.metadata || {});
    return { ok: !!ok, stage: ok ? "published" : "local_only", translatedInput };
  }
  return { ok: true, stage: "translated_not_published", translatedInput, diagnosticsRedacted: true, version: VERSION };
}

module.exports = { VERSION, buildTranslatedPublishInput, buildTranslatedGroupInputs, publishTranslatedMessage };
