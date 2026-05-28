"use strict";

/**
 * TranslationMemoryStore.js
 * Lightweight file-backed translation memory for Marion/Nyx Universal Translator.
 *
 * Hardened Phase-1/Phase-2 memory boundary.
 *
 * Purpose:
 * - Reuse repeated translations.
 * - Reduce translation cost once a real provider is added.
 * - Preserve consistent terminology across Sandblast/Nyx/Marion/Synapse.
 *
 * Design rules:
 * - No remote API.
 * - No database dependency.
 * - Fail-closed: memory failure must never crash Marion.
 * - No stale/sticky reuse across language pairs, domains, providers, or protected-term contexts.
 * - Atomic writes to reduce corruption risk.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION = "0.2.1";

const DEFAULT_MEMORY_PATH = path.resolve(
  process.cwd(),
  "Data/translation/memory/translation_memory.json"
);

const DEFAULT_MAX_ENTRIES = 25000;
const DEFAULT_MAX_TEXT_CHARACTERS = 4500;
const DEFAULT_MIN_CONFIDENCE = 0.5;

/**
 * Entries older than this are treated as stale unless a store instance overrides ttlMs.
 * 30 days is conservative for early LanguageSphere/Nyx/Marion work.
 */
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const SUPPORTED_LANGUAGES = new Set(["en", "fr", "es", "auto", "unknown"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nowIso() {
  return new Date().toISOString();
}

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function normalizeLanguageCode(lang, fallback = "unknown") {
  if (!lang || typeof lang !== "string") return fallback;

  const value = lang.trim().toLowerCase();

  if (!value) return fallback;
  if (value === "auto") return "auto";
  if (value === "unknown") return "unknown";
  if (value.startsWith("en")) return "en";
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("es")) return "es";

  return fallback;
}

function normalizeDomain(domain) {
  if (!domain || typeof domain !== "string") return "general";

  const normalized = domain
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

  return normalized || "general";
}

function normalizeProvider(provider) {
  if (!provider || typeof provider !== "string") return "unknown";

  return provider
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_.:-]+/g, "")
    .slice(0, 80) || "unknown";
}

function normalizeText(text) {
  if (!text || typeof text !== "string") return "";

  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/www\.\S+/gi, " ")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function countCharacters(text) {
  return typeof text === "string" ? Array.from(text).length : 0;
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function stableArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.normalize("NFC").trim().toLowerCase())
    .sort();
}

function makeContextFingerprint(params = {}) {
  const protectedTerms = stableArray(params.protectedTerms || params.terms);
  const glossaryVersion = params.glossaryVersion || null;
  const tone = params.tone || params.emotion || null;

  return hashValue(
    JSON.stringify({
      protectedTerms,
      glossaryVersion,
      tone: typeof tone === "string" ? tone.toLowerCase().trim() : null
    })
  ).slice(0, 24);
}

function makeMemoryKey(params = {}) {
  const sourceLanguage = normalizeLanguageCode(params.sourceLanguage || "auto", "auto");
  const targetLanguage = normalizeLanguageCode(params.targetLanguage || "unknown", "unknown");
  const normalizedSource = normalizeText(params.sourceText);
  const domainKey = normalizeDomain(params.domain);
  const contextFingerprint = makeContextFingerprint(params);

  return hashValue(
    [
      "tm-v2",
      sourceLanguage,
      targetLanguage,
      domainKey,
      contextFingerprint,
      normalizedSource
    ].join("::")
  );
}

function createEmptyMemory() {
  const now = nowIso();

  return {
    version: VERSION,
    createdAt: now,
    updatedAt: now,
    schema: {
      keyVersion: "tm-v2",
      supportedLanguages: ["en", "fr", "es"]
    },
    entries: {},
    quarantine: {}
  };
}

function cloneEntry(entry) {
  return JSON.parse(JSON.stringify(entry));
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch (error) {
    return {
      __corrupt: true,
      error: error && error.message ? error.message : "unknown"
    };
  }
}

function writeFileAtomic(filePath, content) {
  ensureDirectory(filePath);

  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmp = path.join(
    dir,
    `.${base}.${process.pid}.${Date.now()}.tmp`
  );

  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, filePath);
}

function backupCorruptFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;

    const backupPath = `${filePath}.corrupt.${Date.now()}.bak`;
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
  } catch (_) {
    return null;
  }
}

function validateStoredParams(params = {}, options = {}) {
  const sourceText = params.sourceText;
  const translatedText = params.translatedText;
  const sourceLanguage = normalizeLanguageCode(params.sourceLanguage || "auto", "auto");
  const targetLanguage = normalizeLanguageCode(params.targetLanguage || "unknown", "unknown");
  const maxTextCharacters = Number.isFinite(options.maxTextCharacters)
    ? options.maxTextCharacters
    : DEFAULT_MAX_TEXT_CHARACTERS;

  if (!sourceText || typeof sourceText !== "string") {
    return { ok: false, reason: "missing-source-text" };
  }

  if (!translatedText || typeof translatedText !== "string") {
    return { ok: false, reason: "missing-translated-text" };
  }

  if (countCharacters(sourceText) > maxTextCharacters) {
    return { ok: false, reason: "source-text-too-large" };
  }

  if (countCharacters(translatedText) > maxTextCharacters * 2) {
    return { ok: false, reason: "translated-text-too-large" };
  }

  if (targetLanguage === "unknown" || targetLanguage === "auto") {
    return { ok: false, reason: "invalid-target-language" };
  }

  if (!SUPPORTED_LANGUAGES.has(sourceLanguage) || !SUPPORTED_LANGUAGES.has(targetLanguage)) {
    return { ok: false, reason: "unsupported-language" };
  }

  if (sourceLanguage !== "auto" && sourceLanguage !== "unknown" && sourceLanguage === targetLanguage) {
    return { ok: false, reason: "same-language-memory-entry" };
  }

  if (normalizeText(sourceText) === normalizeText(translatedText)) {
    return { ok: false, reason: "identity-translation-not-stored" };
  }

  return {
    ok: true,
    sourceLanguage,
    targetLanguage
  };
}

function isEntryExpired(entry, ttlMs) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return false;

  const timestamp = Date.parse(entry.updatedAt || entry.createdAt || 0);

  if (!Number.isFinite(timestamp) || timestamp <= 0) return true;

  return Date.now() - timestamp > ttlMs;
}

function entryMatchesRequest(entry, params = {}) {
  if (!entry || !isPlainObject(entry)) return false;

  const requestSourceLanguage = normalizeLanguageCode(params.sourceLanguage || "auto", "auto");
  const requestTargetLanguage = normalizeLanguageCode(params.targetLanguage || "unknown", "unknown");
  const requestDomain = normalizeDomain(params.domain);

  if (normalizeLanguageCode(entry.targetLanguage || "unknown", "unknown") !== requestTargetLanguage) {
    return false;
  }

  /**
   * Source language is part of the key, but keep a second guard here so a legacy
   * entry cannot leak into a wrong-language request after schema upgrades.
   */
  const entrySourceLanguage = normalizeLanguageCode(entry.sourceLanguage || "auto", "auto");
  if (entrySourceLanguage !== requestSourceLanguage) {
    return false;
  }

  if (normalizeDomain(entry.domain) !== requestDomain) {
    return false;
  }

  if (entry.normalizedSourceText !== normalizeText(params.sourceText)) {
    return false;
  }

  const entryFingerprint = entry.contextFingerprint || makeContextFingerprint(entry);
  const requestFingerprint = makeContextFingerprint(params);
  if (entryFingerprint !== requestFingerprint) {
    return false;
  }

  return true;
}

class TranslationMemoryStore {
  constructor(options = {}) {
    this.filePath = options.filePath
      ? path.resolve(options.filePath)
      : DEFAULT_MEMORY_PATH;

    const maxEntries = Number(options.maxEntries);
    const maxTextCharacters = Number(options.maxTextCharacters);
    const ttlMs = Number(options.ttlMs);
    const minConfidence = Number(options.minConfidence);

    this.maxEntries = Number.isFinite(maxEntries)
      ? Math.max(0, Math.floor(maxEntries))
      : DEFAULT_MAX_ENTRIES;

    this.maxTextCharacters = Number.isFinite(maxTextCharacters)
      ? Math.max(1, Math.floor(maxTextCharacters))
      : DEFAULT_MAX_TEXT_CHARACTERS;

    this.ttlMs = Number.isFinite(ttlMs)
      ? Math.max(0, Math.floor(ttlMs))
      : DEFAULT_TTL_MS;

    this.minConfidence = Number.isFinite(minConfidence)
      ? Math.max(0, Math.min(1, minConfidence))
      : DEFAULT_MIN_CONFIDENCE;

    this.autoSaveOnHit = options.autoSaveOnHit !== false;

    this.memory = createEmptyMemory();
    this.loaded = false;
    this.lastError = null;
    this.corruptBackupPath = null;
  }

  load(forceReload = false) {
    if (this.loaded && !forceReload) return this.memory;

    ensureDirectory(this.filePath);

    const parsed = safeReadJson(this.filePath);

    if (!parsed) {
      this.memory = createEmptyMemory();
      this.loaded = true;
      this.save();
      return this.memory;
    }

    if (parsed.__corrupt) {
      this.corruptBackupPath = backupCorruptFile(this.filePath);
      this.lastError = parsed.error || "corrupt-memory-file";
      this.memory = createEmptyMemory();
      this.loaded = true;
      this.save();
      return this.memory;
    }

    const base = createEmptyMemory();

    this.memory = {
      ...base,
      ...parsed,
      version: VERSION,
      schema: {
        ...base.schema,
        ...(isPlainObject(parsed.schema) ? parsed.schema : {})
      },
      entries: isPlainObject(parsed.entries) ? parsed.entries : {},
      quarantine: isPlainObject(parsed.quarantine) ? parsed.quarantine : {}
    };

    this.loaded = true;
    return this.memory;
  }

  save() {
    try {
      ensureDirectory(this.filePath);

      this.memory.updatedAt = nowIso();

      writeFileAtomic(
        this.filePath,
        JSON.stringify(this.memory, null, 2)
      );

      return true;
    } catch (error) {
      this.lastError = error && error.message ? error.message : "memory-save-failed";
      return false;
    }
  }

  pruneIfNeeded() {
    this.load();

    const entries = this.memory.entries || {};
    const keys = Object.keys(entries);

    if (this.maxEntries <= 0) {
      const removed = keys.length;
      this.memory.entries = {};
      return removed;
    }

    if (keys.length <= this.maxEntries) return 0;

    const sorted = keys.sort((a, b) => {
      const aEntry = entries[a] || {};
      const bEntry = entries[b] || {};

      const aTime = Date.parse(aEntry.lastUsedAt || aEntry.updatedAt || aEntry.createdAt || 0) || 0;
      const bTime = Date.parse(bEntry.lastUsedAt || bEntry.updatedAt || bEntry.createdAt || 0) || 0;

      if (aTime !== bTime) return aTime - bTime;

      const aHits = Number(aEntry.hitCount || 0);
      const bHits = Number(bEntry.hitCount || 0);
      return aHits - bHits;
    });

    const removeCount = keys.length - this.maxEntries;

    for (let i = 0; i < removeCount; i += 1) {
      delete entries[sorted[i]];
    }

    return removeCount;
  }

  quarantineEntry(key, entry, reason) {
    if (!key || !entry) return false;

    this.memory.quarantine = this.memory.quarantine || {};
    this.memory.quarantine[key] = {
      ...cloneEntry(entry),
      quarantinedAt: nowIso(),
      reason: reason || "invalid-entry"
    };

    delete this.memory.entries[key];
    return true;
  }

  get(params = {}) {
    this.load();

    const key = makeMemoryKey(params);
    const entry = this.memory.entries[key];

    if (!entry) {
      return {
        hit: false,
        key,
        entry: null,
        reason: "miss"
      };
    }

    if (!entryMatchesRequest(entry, params)) {
      this.quarantineEntry(key, entry, "entry-request-mismatch");
      this.save();

      return {
        hit: false,
        key,
        entry: null,
        reason: "entry-request-mismatch"
      };
    }

    if (isEntryExpired(entry, this.ttlMs)) {
      this.quarantineEntry(key, entry, "entry-expired");
      this.save();

      return {
        hit: false,
        key,
        entry: null,
        reason: "entry-expired"
      };
    }

    const confidence = Number(entry.confidence);
    if (Number.isFinite(confidence) && confidence < this.minConfidence) {
      this.quarantineEntry(key, entry, "entry-confidence-too-low");
      this.save();

      return {
        hit: false,
        key,
        entry: null,
        reason: "entry-confidence-too-low"
      };
    }

    entry.lastUsedAt = nowIso();
    entry.hitCount = Number(entry.hitCount || 0) + 1;

    if (this.autoSaveOnHit) this.save();

    return {
      hit: true,
      key,
      entry: cloneEntry(entry),
      reason: "exact-context-hit"
    };
  }

  set(params = {}) {
    this.load();

    const validation = validateStoredParams(params, {
      maxTextCharacters: this.maxTextCharacters
    });

    if (!validation.ok) {
      return {
        stored: false,
        reason: validation.reason
      };
    }

    const {
      sourceText,
      translatedText,
      domain,
      provider,
      confidence,
      emotion,
      notes
    } = params;

    const sourceLanguage = validation.sourceLanguage;
    const targetLanguage = validation.targetLanguage;
    const normalizedSourceText = normalizeText(sourceText);
    const domainKey = normalizeDomain(domain);
    const providerKey = normalizeProvider(provider);
    const contextFingerprint = makeContextFingerprint(params);
    const key = makeMemoryKey({
      ...params,
      sourceLanguage,
      targetLanguage,
      domain: domainKey
    });

    const now = nowIso();
    const existing = this.memory.entries[key];

    this.memory.entries[key] = {
      key,
      keyVersion: "tm-v2",
      sourceLanguage,
      targetLanguage,
      domain: domainKey,
      sourceText,
      normalizedSourceText,
      translatedText,
      provider: providerKey,
      confidence: Number.isFinite(confidence) ? confidence : null,
      emotion: emotion || null,
      contextFingerprint,
      protectedTermsHash: hashValue(JSON.stringify(stableArray(params.protectedTerms || params.terms))).slice(0, 24),
      glossaryVersion: params.glossaryVersion || null,
      notes: typeof notes === "string" ? notes.slice(0, 500) : null,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      lastUsedAt: now,
      hitCount: existing ? Number(existing.hitCount || 0) : 0
    };

    const pruned = this.pruneIfNeeded();
    const saved = this.save();

    return {
      stored: saved,
      key,
      pruned,
      reason: saved ? "stored" : "save-failed"
    };
  }

  delete(params = {}) {
    this.load();

    const key = params.key || makeMemoryKey(params);

    if (!this.memory.entries[key]) {
      return {
        deleted: false,
        key,
        reason: "not-found"
      };
    }

    delete this.memory.entries[key];
    const saved = this.save();

    return {
      deleted: saved,
      key,
      reason: saved ? "deleted" : "save-failed"
    };
  }

  clear(options = {}) {
    this.memory = createEmptyMemory();

    if (options.keepQuarantine === true) {
      const current = this.load(true);
      this.memory.quarantine = current.quarantine || {};
    }

    const saved = this.save();
    this.loaded = true;

    return {
      cleared: saved,
      reason: saved ? "cleared" : "save-failed"
    };
  }

  purgeExpired() {
    this.load();

    let purged = 0;

    for (const [key, entry] of Object.entries(this.memory.entries || {})) {
      if (isEntryExpired(entry, this.ttlMs)) {
        this.quarantineEntry(key, entry, "entry-expired");
        purged += 1;
      }
    }

    if (purged > 0) this.save();

    return {
      purged,
      quarantineTotal: Object.keys(this.memory.quarantine || {}).length
    };
  }

  list(options = {}) {
    this.load();

    const limit = Number.isFinite(options.limit) ? Math.max(0, options.limit) : 50;
    const domain = options.domain ? normalizeDomain(options.domain) : null;
    const sourceLanguage = options.sourceLanguage
      ? normalizeLanguageCode(options.sourceLanguage, "unknown")
      : null;
    const targetLanguage = options.targetLanguage
      ? normalizeLanguageCode(options.targetLanguage, "unknown")
      : null;

    let entries = Object.values(this.memory.entries || {});

    if (domain) entries = entries.filter((entry) => normalizeDomain(entry.domain) === domain);
    if (sourceLanguage) {
      entries = entries.filter(
        (entry) => normalizeLanguageCode(entry.sourceLanguage, "unknown") === sourceLanguage
      );
    }
    if (targetLanguage) {
      entries = entries.filter(
        (entry) => normalizeLanguageCode(entry.targetLanguage, "unknown") === targetLanguage
      );
    }

    entries.sort((a, b) => {
      const aTime = Date.parse(a.lastUsedAt || a.updatedAt || a.createdAt || 0) || 0;
      const bTime = Date.parse(b.lastUsedAt || b.updatedAt || b.createdAt || 0) || 0;
      return bTime - aTime;
    });

    return entries.slice(0, limit).map(cloneEntry);
  }

  stats() {
    this.load();

    const entries = Object.values(this.memory.entries || {});
    const quarantine = Object.values(this.memory.quarantine || {});
    const byPair = {};
    const byDomain = {};
    const byProvider = {};
    let expiredEntries = 0;

    for (const entry of entries) {
      const pair = `${normalizeLanguageCode(entry.sourceLanguage || "auto", "auto")}-${normalizeLanguageCode(entry.targetLanguage || "unknown", "unknown")}`;
      const domain = normalizeDomain(entry.domain);
      const provider = normalizeProvider(entry.provider);

      byPair[pair] = (byPair[pair] || 0) + 1;
      byDomain[domain] = (byDomain[domain] || 0) + 1;
      byProvider[provider] = (byProvider[provider] || 0) + 1;

      if (isEntryExpired(entry, this.ttlMs)) expiredEntries += 1;
    }

    return {
      version: this.memory.version || VERSION,
      filePath: this.filePath,
      totalEntries: entries.length,
      quarantineEntries: quarantine.length,
      expiredEntries,
      maxEntries: this.maxEntries,
      ttlMs: this.ttlMs,
      minConfidence: this.minConfidence,
      byPair,
      byDomain,
      byProvider,
      updatedAt: this.memory.updatedAt,
      lastError: this.lastError,
      corruptBackupPath: this.corruptBackupPath
    };
  }
}

function createTranslationMemoryStore(options = {}) {
  return new TranslationMemoryStore(options);
}

const defaultStore = createTranslationMemoryStore();

module.exports = {
  VERSION,
  DEFAULT_MEMORY_PATH,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_MAX_TEXT_CHARACTERS,
  DEFAULT_TTL_MS,
  SUPPORTED_LANGUAGES: Array.from(SUPPORTED_LANGUAGES),
  normalizeText,
  normalizeLanguageCode,
  normalizeDomain,
  normalizeProvider,
  hashValue,
  makeContextFingerprint,
  makeMemoryKey,
  createEmptyMemory,
  createTranslationMemoryStore,
  TranslationMemoryStore,
  defaultStore
};
