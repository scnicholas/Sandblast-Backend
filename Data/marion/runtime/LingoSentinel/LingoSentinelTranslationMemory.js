"use strict";

/**
 * Data/marion/runtime/LingoSentinel/LingoSentinelTranslationMemory.js
 *
 * Lightweight in-process translation memory.
 * This is session memory only unless later wired to persistent storage.
 */

const DEFAULT_SESSION_ID = "default";
const MAX_SESSIONS = 250;

const sessions = new Map();

function nowIso() {
  return new Date().toISOString();
}

function normalizeSessionId(sessionId) {
  return String(sessionId || DEFAULT_SESSION_ID);
}

function createSessionMemory(sessionId) {
  return {
    sessionId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastSourceLanguage: null,
    lastTargetLanguage: null,
    preferredTargetLanguage: null,
    lastTranslation: null,
    phraseMemory: [],
    speakerLanguages: {},
    glossary: {},
  };
}

function enforceSessionLimit() {
  if (sessions.size <= MAX_SESSIONS) return;

  const oldestKey = sessions.keys().next().value;
  if (oldestKey) sessions.delete(oldestKey);
}

function getSessionTranslationMemory(sessionId = DEFAULT_SESSION_ID) {
  const key = normalizeSessionId(sessionId);

  if (!sessions.has(key)) {
    sessions.set(key, createSessionMemory(key));
    enforceSessionLimit();
  }

  return sessions.get(key);
}

function updateSessionTranslationMemory(sessionId = DEFAULT_SESSION_ID, patch = {}) {
  const memory = getSessionTranslationMemory(sessionId);

  if (patch.source) memory.lastSourceLanguage = patch.source;
  if (patch.target) {
    memory.lastTargetLanguage = patch.target;
    memory.preferredTargetLanguage = patch.target;
  }

  if (patch.speakerId && patch.source) {
    memory.speakerLanguages[String(patch.speakerId)] = patch.source;
  }

  if (patch.originalText || patch.translatedText) {
    memory.lastTranslation = {
      originalText: patch.originalText || "",
      translatedText: patch.translatedText || "",
      source: patch.source || memory.lastSourceLanguage,
      target: patch.target || memory.lastTargetLanguage,
      at: nowIso(),
    };

    memory.phraseMemory.push(memory.lastTranslation);

    if (memory.phraseMemory.length > 25) {
      memory.phraseMemory.shift();
    }
  }

  memory.updatedAt = nowIso();
  return memory;
}

function rememberGlossaryPair(sessionId = DEFAULT_SESSION_ID, sourcePhrase, targetPhrase) {
  const memory = getSessionTranslationMemory(sessionId);
  const key = String(sourcePhrase || "").trim();

  if (!key) return memory;

  memory.glossary[key] = {
    sourcePhrase: key,
    targetPhrase: String(targetPhrase || "").trim(),
    updatedAt: nowIso(),
  };

  memory.updatedAt = nowIso();
  return memory;
}

function resetSessionTranslationMemory(sessionId = DEFAULT_SESSION_ID) {
  sessions.delete(normalizeSessionId(sessionId));
  return true;
}

function clearAllTranslationMemory() {
  sessions.clear();
  return true;
}

module.exports = {
  DEFAULT_SESSION_ID,
  getSessionTranslationMemory,
  updateSessionTranslationMemory,
  rememberGlossaryPair,
  resetSessionTranslationMemory,
  clearAllTranslationMemory,
};
