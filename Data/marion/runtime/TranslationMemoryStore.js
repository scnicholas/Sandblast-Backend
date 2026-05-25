"use strict";

/**
 * TranslationMemoryStore.js
 * Lightweight file-backed translation memory for Marion/Nyx Universal Translator.
 *
 * Purpose:
 * - Reuse repeated translations.
 * - Reduce translation cost once a real provider is added.
 * - Preserve consistent terminology across Sandblast/Nyx/Marion/Synapse.
 *
 * Phase 1:
 * - Local JSON memory.
 * - Exact and normalized lookup.
 *
 * No remote API.
 * No database dependency.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_MEMORY_PATH = path.resolve(
  process.cwd(),
  "Data/translation/memory/translation_memory.json"
);

const DEFAULT_MAX_ENTRIES = 25000;

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function normalizeText(text) {
  if (!text || typeof text !== "string") return "";

  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function makeMemoryKey({ sourceLanguage, targetLanguage, sourceText, domain }) {
  const normalizedSource = normalizeText(sourceText);
  const domainKey = domain || "general";

  return hashValue(
    [
      sourceLanguage || "auto",
      targetLanguage || "unknown",
      domainKey,
      normalizedSource
    ].join("::")
  );
}

function createEmptyMemory() {
  return {
    version: "0.1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    entries: {}
  };
}

class TranslationMemoryStore {
  constructor(options = {}) {
    this.filePath = options.filePath
      ? path.resolve(options.filePath)
      : DEFAULT_MEMORY_PATH;

    this.maxEntries = Number.isFinite(options.maxEntries)
      ? options.maxEntries
      : DEFAULT_MAX_ENTRIES;

    this.memory = createEmptyMemory();
    this.loaded = false;
  }

  load() {
    if (this.loaded) return this.memory;

    ensureDirectory(this.filePath);

    if (!fs.existsSync(this.filePath)) {
      this.memory = createEmptyMemory();
      this.save();
      this.loaded = true;
      return this.memory;
    }

    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);

      this.memory = {
        ...createEmptyMemory(),
        ...parsed,
        entries:
          parsed && parsed.entries && typeof parsed.entries === "object"
            ? parsed.entries
            : {}
      };

      this.loaded = true;
      return this.memory;
    } catch (_) {
      /**
       * Fail closed:
       * If memory file is corrupted, do not crash Marion.
       * Start clean and allow the old file to be replaced.
       */
      this.memory = createEmptyMemory();
      this.save();
      this.loaded = true;
      return this.memory;
    }
  }

  save() {
    ensureDirectory(this.filePath);

    this.memory.updatedAt = new Date().toISOString();

    fs.writeFileSync(
      this.filePath,
      JSON.stringify(this.memory, null, 2),
      "utf8"
    );

    return true;
  }

  pruneIfNeeded() {
    const entries = this.memory.entries || {};
    const keys = Object.keys(entries);

    if (keys.length <= this.maxEntries) return 0;

    const sorted = keys.sort((a, b) => {
      const aTime = Date.parse(entries[a].lastUsedAt || entries[a].createdAt || 0);
      const bTime = Date.parse(entries[b].lastUsedAt || entries[b].createdAt || 0);

      return aTime - bTime;
    });

    const removeCount = keys.length - this.maxEntries;

    for (let i = 0; i < removeCount; i += 1) {
      delete entries[sorted[i]];
    }

    return removeCount;
  }

  get(params = {}) {
    this.load();

    const key = makeMemoryKey(params);
    const entry = this.memory.entries[key];

    if (!entry) {
      return {
        hit: false,
        key,
        entry: null
      };
    }

    entry.lastUsedAt = new Date().toISOString();
    entry.hitCount = Number(entry.hitCount || 0) + 1;

    this.save();

    return {
      hit: true,
      key,
      entry: { ...entry }
    };
  }

  set(params = {}) {
    this.load();

    const {
      sourceLanguage,
      targetLanguage,
      sourceText,
      translatedText,
      domain,
      provider,
      confidence,
      emotion
    } = params;

    if (!sourceText || typeof sourceText !== "string") {
      return {
        stored: false,
        reason: "missing-source-text"
      };
    }

    if (!translatedText || typeof translatedText !== "string") {
      return {
        stored: false,
        reason: "missing-translated-text"
      };
    }

    if (!targetLanguage) {
      return {
        stored: false,
        reason: "missing-target-language"
      };
    }

    const key = makeMemoryKey({
      sourceLanguage,
      targetLanguage,
      sourceText,
      domain
    });

    const now = new Date().toISOString();

    this.memory.entries[key] = {
      key,
      sourceLanguage: sourceLanguage || "auto",
      targetLanguage,
      domain: domain || "general",
      sourceText,
      normalizedSourceText: normalizeText(sourceText),
      translatedText,
      provider: provider || "unknown",
      confidence: Number.isFinite(confidence) ? confidence : null,
      emotion: emotion || null,
      createdAt: this.memory.entries[key]
        ? this.memory.entries[key].createdAt
        : now,
      updatedAt: now,
      lastUsedAt: now,
      hitCount: this.memory.entries[key]
        ? Number(this.memory.entries[key].hitCount || 0)
        : 0
    };

    const pruned = this.pruneIfNeeded();
    this.save();

    return {
      stored: true,
      key,
      pruned
    };
  }

  delete(params = {}) {
    this.load();

    const key = params.key || makeMemoryKey(params);

    if (!this.memory.entries[key]) {
      return {
        deleted: false,
        key
      };
    }

    delete this.memory.entries[key];
    this.save();

    return {
      deleted: true,
      key
    };
  }

  clear() {
    this.memory = createEmptyMemory();
    this.save();

    return {
      cleared: true
    };
  }

  stats() {
    this.load();

    const entries = Object.values(this.memory.entries || {});
    const byPair = {};
    const byDomain = {};

    for (const entry of entries) {
      const pair = `${entry.sourceLanguage || "auto"}-${entry.targetLanguage || "unknown"}`;
      const domain = entry.domain || "general";

      byPair[pair] = (byPair[pair] || 0) + 1;
      byDomain[domain] = (byDomain[domain] || 0) + 1;
    }

    return {
      version: this.memory.version,
      filePath: this.filePath,
      totalEntries: entries.length,
      maxEntries: this.maxEntries,
      byPair,
      byDomain,
      updatedAt: this.memory.updatedAt
    };
  }
}

function createTranslationMemoryStore(options = {}) {
  return new TranslationMemoryStore(options);
}

const defaultStore = createTranslationMemoryStore();

module.exports = {
  VERSION: "0.1.0",
  DEFAULT_MEMORY_PATH,
  normalizeText,
  makeMemoryKey,
  createTranslationMemoryStore,
  TranslationMemoryStore,
  defaultStore
};
