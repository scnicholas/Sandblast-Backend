"use strict";

/**
 * LingoSentinelContextMemory
 * Bounded in-memory context for spontaneous multilingual dialogue.
 *
 * Stores recent turns only. No secrets, no raw tokens, no private Marion state.
 */

const VERSION = "2.2.0-spontaneity-context-memory";
const DEFAULT_MAX_TURNS = 12;
const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_TEXT_CHARS = 1200;
const DEFAULT_MAX_SESSIONS = 1000;

function safeString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function now() { return Date.now(); }
function nowIso() { return new Date().toISOString(); }

function clamp(value, max = DEFAULT_MAX_TEXT_CHARS) {
  const text = safeString(value).replace(/\u0000/g, "").trim();
  return text.length > max ? text.slice(0, max) : text;
}

function createId(prefix = "lsctx") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

class LingoSentinelContextMemory {
  constructor(options = {}) {
    this.maxTurns = Number(options.maxTurns) > 0 ? Number(options.maxTurns) : DEFAULT_MAX_TURNS;
    this.ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : DEFAULT_TTL_MS;
    this.maxTextChars = Number(options.maxTextChars) > 0 ? Number(options.maxTextChars) : DEFAULT_MAX_TEXT_CHARS;
    this.maxSessions = Number(options.maxSessions) > 0 ? Number(options.maxSessions) : DEFAULT_MAX_SESSIONS;
    this.sessions = new Map();
  }

  normalizeSessionId(sessionId) {
    const value = clamp(sessionId || "default", 160).replace(/[^a-z0-9_.:-]/gi, "_");
    return value || "default";
  }

  prune() {
    const cutoff = now() - this.ttlMs;
    for (const [sessionId, entry] of this.sessions.entries()) {
      if (!entry || entry.updatedAt < cutoff) this.sessions.delete(sessionId);
    }
    while (this.sessions.size > this.maxSessions) {
      let oldestKey = null;
      let oldestAt = Infinity;
      for (const [key, entry] of this.sessions.entries()) {
        const updatedAt = entry && entry.updatedAt ? entry.updatedAt : 0;
        if (updatedAt < oldestAt) { oldestKey = key; oldestAt = updatedAt; }
      }
      if (!oldestKey) break;
      this.sessions.delete(oldestKey);
    }
  }

  getSession(sessionId) {
    this.prune();
    const id = this.normalizeSessionId(sessionId);
    if (!this.sessions.has(id)) {
      this.sessions.set(id, { id, createdAt: now(), updatedAt: now(), turns: [] });
    }
    return this.sessions.get(id);
  }

  addTurn(sessionId, turn = {}) {
    const session = this.getSession(sessionId);
    const entry = {
      id: clamp(turn.id || createId("turn"), 128),
      roomId: clamp(turn.roomId || turn.channelId || "", 128),
      role: clamp(turn.role || "participant", 64),
      speakerId: clamp(turn.speakerId || turn.senderId || "", 128),
      speakerName: clamp(turn.speakerName || turn.senderName || "", 160),
      text: clamp(turn.text || turn.originalText || "", this.maxTextChars),
      translatedText: clamp(turn.translatedText || "", this.maxTextChars),
      sourceLanguage: clamp(turn.sourceLanguage || turn.detectedLanguage || "auto", 32),
      targetLanguage: clamp(turn.targetLanguage || "", 32),
      tone: clamp(turn.tone || "", 64),
      intent: clamp(turn.intent || "", 96),
      createdAt: turn.createdAt || nowIso()
    };
    session.turns.push(entry);
    session.turns = session.turns.slice(-this.maxTurns);
    session.updatedAt = now();
    return { ...entry };
  }

  snapshot(sessionId, maxTurns = this.maxTurns) {
    const session = this.getSession(sessionId);
    return session.turns.slice(-Math.max(1, Number(maxTurns) || this.maxTurns)).map(turn => ({ ...turn }));
  }

  summarize(sessionId, maxTurns = this.maxTurns) {
    return this.snapshot(sessionId, maxTurns).map(turn => {
      const from = turn.speakerName || turn.role || "participant";
      const src = turn.sourceLanguage || "auto";
      const tgt = turn.targetLanguage || "target";
      const text = turn.translatedText || turn.text || "";
      const tone = turn.tone ? ` tone=${turn.tone}` : "";
      return `${from} [${src}->${tgt}${tone}]: ${text}`;
    }).join("\n");
  }

  clear(sessionId) {
    const id = this.normalizeSessionId(sessionId);
    return this.sessions.delete(id);
  }

  status() {
    this.prune();
    return { ok: true, version: VERSION, sessions: this.sessions.size, maxSessions: this.maxSessions, maxTurns: this.maxTurns, ttlMs: this.ttlMs };
  }
}

module.exports = {
  VERSION,
  LingoSentinelContextMemory,
  createContextMemory: options => new LingoSentinelContextMemory(options)
};
