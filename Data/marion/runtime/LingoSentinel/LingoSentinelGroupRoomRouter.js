"use strict";

/**
 * Data/marion/runtime/LingoSentinel/LingoSentinelGroupRoomRouter.js
 *
 * Phase 3C:
 * Group-room translation router.
 *
 * Handles multiple speakers, different source languages,
 * and one governed target language through Marion/LingoSentinel.
 */

const {
  routeTranslationRequest,
} = require("./LingoSentinelTranslationOrchestrator");

const {
  getSessionTranslationMemory,
} = require("./LingoSentinelTranslationMemory");

const {
  normalizeLanguageCode,
  getDefaultTargetLanguage,
} = require("./LingoSentinelLanguageRegistry");

function normalizeMessages(input = {}) {
  if (Array.isArray(input)) return input;

  if (Array.isArray(input.messages)) return input.messages;
  if (Array.isArray(input.speakers)) return input.speakers;
  if (Array.isArray(input.turns)) return input.turns;

  return [];
}

function extractMessageText(message = {}) {
  return (
    message.text ||
    message.message ||
    message.transcript ||
    message.userText ||
    message.input ||
    ""
  );
}

function normalizeGroupRoomInput(input = {}) {
  const sessionId =
    input.sessionId ||
    input.conversationId ||
    input.roomId ||
    "group-room-default";

  const target = normalizeLanguageCode(
    input.target ||
      input.to ||
      input.targetLanguage ||
      input.groupTarget ||
      getDefaultTargetLanguage()
  );

  const preserve = Array.isArray(input.preserve) ? input.preserve : [];

  return {
    sessionId,
    target,
    mode: input.mode || "lingosentinel-group-room",
    preserve,
    messages: normalizeMessages(input),
    raw: input,
  };
}

async function routeLingoSentinelGroupRoom(input = {}) {
  const group = normalizeGroupRoomInput(input);

  if (!group.messages.length) {
    return {
      ok: false,
      handled: true,
      mode: "lingosentinel-group-room",
      sessionId: group.sessionId,
      target: group.target,
      translatedMessages: [],
      warnings: ["EMPTY_GROUP_ROOM_MESSAGES"],
      error: "EMPTY_GROUP_ROOM_MESSAGES",
    };
  }

  const translatedMessages = [];
  const warnings = [];

  for (let index = 0; index < group.messages.length; index += 1) {
    const message = group.messages[index] || {};
    const text = extractMessageText(message);

    const speakerId =
      message.speakerId ||
      message.userId ||
      message.id ||
      `speaker-${index + 1}`;

    const result = await routeTranslationRequest({
      text,
      source:
        message.source ||
        message.from ||
        message.sourceLanguage ||
        message.language ||
        "auto",
      target:
        message.target ||
        message.to ||
        message.targetLanguage ||
        group.target,
      translate: true,
      sessionId: group.sessionId,
      speakerId,
      mode: group.mode,
      preserve: Array.from(
        new Set([
          ...group.preserve,
          ...(Array.isArray(message.preserve) ? message.preserve : []),
        ])
      ),
    });

    if (Array.isArray(result.warnings)) {
      warnings.push(...result.warnings.map((warning) => `${speakerId}:${warning}`));
    }

    translatedMessages.push({
      index,
      speakerId,
      ok: result.ok,
      source: result.source,
      target: result.target,
      originalText: result.originalText,
      translatedText: result.translatedText,
      responseText: result.responseText,
      voiceText: result.voiceText,
      provider: result.provider,
      confidence: result.confidence,
      warnings: result.warnings || [],
      error: result.error || null,
      translationMeta: result.translationMeta || {},
    });
  }

  const memory = getSessionTranslationMemory(group.sessionId);
  const allSafe = translatedMessages.every((item) => item.ok === true);

  return {
    ok: allSafe,
    handled: true,
    mode: "lingosentinel-group-room",
    sessionId: group.sessionId,
    target: group.target,
    messageCount: translatedMessages.length,
    translatedMessages,
    warnings: Array.from(new Set(warnings)),
    error: allSafe ? null : "GROUP_ROOM_PARTIAL_OR_BLOCKED",
    memory: {
      lastSourceLanguage: memory.lastSourceLanguage,
      lastTargetLanguage: memory.lastTargetLanguage,
      preferredTargetLanguage: memory.preferredTargetLanguage,
      speakerLanguages: memory.speakerLanguages,
      phraseMemoryCount: memory.phraseMemory.length,
    },
  };
}

module.exports = {
  normalizeMessages,
  normalizeGroupRoomInput,
  routeLingoSentinelGroupRoom,
};
