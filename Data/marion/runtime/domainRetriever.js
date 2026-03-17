"use strict";

// runtime/domainRetriever.js

const fs = require("fs");
const path = require("path");

const RUNTIME_ROOT = __dirname;
const MARION_ROOT = path.resolve(RUNTIME_ROOT, "..");

const DOMAIN_CONFIGS = {
  psychology: {
    root: path.join(MARION_ROOT, "psychology"),
    compiled: [
      path.join(MARION_ROOT, "psychology", "compiled", "psychology_compiled.json")
    ]
  },
  finance: {
    root: path.join(MARION_ROOT, "finance"),
    compiled: [
      path.join(MARION_ROOT, "finance", "compiled", "finance_compiled.json")
    ]
  },
  law: {
    root: path.join(MARION_ROOT, "law"),
    compiled: [
      path.join(MARION_ROOT, "law", "compiled", "law_compiled.json")
    ]
  },
  english: {
    root: path.join(MARION_ROOT, "english"),
    compiled: [
      path.join(MARION_ROOT, "english", "compiled", "english_compiled.json")
    ]
  },
  cybersecurity: {
    root: path.join(MARION_ROOT, "cybersecurity"),
    compiled: [
      path.join(MARION_ROOT, "cybersecurity", "compiled", "cybersecurity_compiled.json")
    ]
  },
  marketing: {
    root: path.join(MARION_ROOT, "marketing"),
    compiled: [
      path.join(MARION_ROOT, "marketing", "compiled", "marketing_compiled.json")
    ]
  },
  general: {
    root: path.join(MARION_ROOT, "general"),
    compiled: [
      path.join(MARION_ROOT, "general", "compiled", "general_compiled.json")
    ]
  }
};

const CACHE = new Map();
const MAX_WALK_DEPTH = 4;

function _safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function _safeObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function _trim(value) {
  return value == null ? "" : String(value).trim();
}

function _lower(value) {
  return _trim(value).toLowerCase();
}

function _clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function _uniqStrings(values) {
  return [...new Set(_safeArray(values).map(_trim).filter(Boolean))];
}

function _exists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function _mtime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs || 0;
  } catch {
    return 0;
  }
}

function _readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function _normalizeText(text) {
  return _lower(text)
    .replace(/[^a-z0-9\s'_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function _tokenize(text) {
  return _normalizeText(text).split(" ").filter((token) => token.length > 2);
}

function _containsPhrase(haystack, phrase) {
  const h = _normalizeText(haystack);
  const p = _normalizeText(phrase);
  return !!p && h.includes(p);
}

function _flattenStrings(value, out = []) {
  if (typeof value === "string") {
    const s = _trim(value);
    if (s) out.push(s);
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) _flattenStrings(item, out);
    return out;
  }

  if (value && typeof value === "object") {
    for (const v of Object.values(value)) _flattenStrings(v, out);
    return out;
  }

  return out;
}

function _domainConfig(domain) {
  return DOMAIN_CONFIGS[domain] || DOMAIN_CONFIGS.general;
}

function _walkJsonFiles(dir, depth = 0, files = []) {
  if (!_exists(dir) || depth > MAX_WALK_DEPTH) return files;

  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() === "node_modules") continue;
      _walkJsonFiles(fullPath, depth + 1, files);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".json")) continue;

    files.push(fullPath);
  }

  return files;
}

function _loadPayloadFromFile(filePath) {
  const currentMtime = _mtime(filePath);
  const cached = CACHE.get(filePath);

  if (cached && cached.mtime === currentMtime) {
    return cached.payload;
  }

  const payload = _readJson(filePath);
  CACHE.set(filePath, { mtime: currentMtime, payload });
  return payload;
}

function _extractRecordsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.records)) return payload.records;
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (payload && typeof payload === "object") return [payload];
  return [];
}

function _loadDomainRecords(domain) {
  const config = _domainConfig(domain);
  const compiledFiles = _safeArray(config.compiled).filter(_exists);

  let files = compiledFiles;

  // If compiled files are missing, fall back to scanning the domain tree.
  if (!files.length) {
    files = _walkJsonFiles(config.root).filter((filePath) => {
      const base = path.basename(filePath).toLowerCase();
      return !base.includes("manifest") && !base.includes("index");
    });
  }

  const records = [];
  const diagnostics = {
    filesAttempted: files.length,
    filesLoaded: 0,
    compiledPreferred: !!compiledFiles.length,
    sourceMode: compiledFiles.length ? "compiled" : "scan"
  };

  for (const filePath of files) {
    try {
      const payload = _loadPayloadFromFile(filePath);
      const extracted = _extractRecordsFromPayload(payload);
      diagnostics.filesLoaded += 1;

      extracted.forEach((record, idx) => {
        records.push({
          __file: filePath,
          __index: idx,
          __sourceMode: diagnostics.sourceMode,
          ..._safeObj(record)
        });
      });
    } catch {
      // Graceful skip; diagnostics still captures partial availability.
    }
  }

  return { records, diagnostics };
}

function _candidateTerms(record = {}) {
  return _uniqStrings([
    record.title,
    record.topic,
    record.subdomain,
    record.category,
    record.domain,
    ..._flattenStrings(record.keywords),
    ..._flattenStrings(record.signals),
    ..._flattenStrings(record.tags),
    ..._flattenStrings(record.aliases),
    ..._flattenStrings(record.examples)
  ]);
}

function _buildSearchBlob(record = {}) {
  return _uniqStrings([
    record.title,
    record.topic,
    record.subdomain,
    record.category,
    record.domain,
    record.summary,
    record.description,
    record.content,
    ..._flattenStrings(record.keywords),
    ..._flattenStrings(record.signals),
    ..._flattenStrings(record.tags),
    ..._flattenStrings(record.aliases),
    ..._flattenStrings(record.examples)
  ]).join(" ");
}

function _tokenOverlapScore(queryTokens = [], blobText = "") {
  const blobTokens = new Set(_tokenize(blobText));
  if (!queryTokens.length || !blobTokens.size) return { hits: 0, ratio: 0 };

  let hits = 0;
  for (const token of queryTokens) {
    if (blobTokens.has(token)) hits += 1;
  }

  return {
    hits,
    ratio: hits / queryTokens.length
  };
}

function _scoreRecord(query, record, requestedDomain, context = {}) {
  const normalizedRecord = _safeObj(record);
  const terms = _candidateTerms(normalizedRecord);
  const reasons = [];
  let score = 0;

  const queryTokens = _tokenize(query);
  const blob = _buildSearchBlob(normalizedRecord);
  const overlap = _tokenOverlapScore(queryTokens, blob);
  const recordDomain = _lower(normalizedRecord.domain || requestedDomain || "general");
  const recoveryMode = _lower(_safeObj(context.conversationState).recoveryMode || "normal");
  const continuityHealth = _lower(_safeObj(context.conversationState).continuityHealth || "watch");

  for (const term of terms) {
    if (!_containsPhrase(query, term)) continue;

    const weight =
      term === normalizedRecord.title ? 7 :
      term === normalizedRecord.topic ? 6 :
      term === normalizedRecord.subdomain ? 5 :
      term === normalizedRecord.category ? 4 :
      3;

    score += weight;
    reasons.push({ type: "phrase-hit", value: term, weight });
  }

  if (overlap.hits > 0) {
    const tokenWeight = Math.min(5, Math.max(1, Math.round(overlap.hits)));
    score += tokenWeight;
    reasons.push({
      type: "token-overlap",
      value: `${overlap.hits}/${queryTokens.length}`,
      weight: tokenWeight
    });
  }

  if (recordDomain && recordDomain === _lower(requestedDomain)) {
    score += 2;
    reasons.push({ type: "domain-alignment", value: recordDomain, weight: 2 });
  }

  const confidence = Number(normalizedRecord.confidence);
  if (Number.isFinite(confidence)) {
    const confidenceWeight = Number(Math.max(0, Math.min(2, confidence * 2)).toFixed(4));
    score += confidenceWeight;
    reasons.push({
      type: "confidence",
      value: Number(confidence.toFixed(4)),
      weight: confidenceWeight
    });
  }

  const recency = Number(normalizedRecord.recency);
  if (Number.isFinite(recency) && recency > 0) {
    const recencyWeight = Number(Math.max(0, Math.min(1.25, recency * 1.25)).toFixed(4));
    score += recencyWeight;
    reasons.push({
      type: "recency",
      value: Number(recency.toFixed(4)),
      weight: recencyWeight
    });
  }

  if (recoveryMode === "guided-recovery") {
    score += 0.75;
    reasons.push({ type: "recovery-bias", value: "guided-recovery", weight: 0.75 });
  }

  if (continuityHealth === "fragile" && overlap.hits > 0) {
    score += 0.5;
    reasons.push({ type: "continuity-bias", value: "fragile", weight: 0.5 });
  }

  // Penalize thin records that match only weakly.
  const hasMeaningfulText = !!_trim(normalizedRecord.summary || normalizedRecord.description || normalizedRecord.content);
  if (!hasMeaningfulText && overlap.hits < 2) {
    score -= 1;
    reasons.push({ type: "thin-record-penalty", value: "limited-text", weight: -1 });
  }

  return {
    score: Number(Math.max(0, score).toFixed(4)),
    reasons,
    overlap
  };
}

function _normalizeEvidence(record, domain, scoreBundle, idx) {
  const normalizedRecord = _safeObj(record);
  const rawScore = Number(scoreBundle.score || 0);

  // More honest normalization ceiling than the old arbitrary /18.
  const normalizedScore = _clamp(Number((rawScore / 20).toFixed(4)));
  const confidence =
    Number.isFinite(Number(normalizedRecord.confidence))
      ? _clamp(Number(normalizedRecord.confidence))
      : normalizedScore;

  return {
    id: normalizedRecord.id || `domain-${domain}-${idx + 1}`,
    source: "domain",
    dataset: normalizedRecord.dataset || `${domain}_compiled`,
    domain: _trim(normalizedRecord.domain) || domain || "general",
    title:
      _trim(normalizedRecord.title) ||
      _trim(normalizedRecord.topic) ||
      _trim(normalizedRecord.subdomain) ||
      `domain-${idx + 1}`,
    summary: _uniqStrings([
      _trim(normalizedRecord.topic),
      _trim(normalizedRecord.subdomain),
      _trim(normalizedRecord.category),
      ..._safeArray(scoreBundle.reasons).map((reason) => `${reason.type}:${_trim(reason.value)}`)
    ]).join(" | "),
    content:
      typeof normalizedRecord.content === "string"
        ? normalizedRecord.content
        : JSON.stringify(normalizedRecord),
    score: normalizedScore,
    confidence,
    tags: _uniqStrings([
      domain,
      _trim(normalizedRecord.subdomain),
      _trim(normalizedRecord.topic),
      _trim(normalizedRecord.category),
      ..._flattenStrings(normalizedRecord.tags)
    ]),
    recency: Number.isFinite(Number(normalizedRecord.recency))
      ? _clamp(Number(normalizedRecord.recency))
      : 0,
    emotionalRelevance: Number.isFinite(Number(normalizedRecord.emotionalRelevance))
      ? _clamp(Number(normalizedRecord.emotionalRelevance))
      : 0.15,
    metadata: {
      reasons: scoreBundle.reasons,
      overlap: scoreBundle.overlap,
      file: normalizedRecord.__file || null,
      fileIndex: Number.isFinite(Number(normalizedRecord.__index)) ? normalizedRecord.__index : null,
      sourceMode: normalizedRecord.__sourceMode || "compiled",
      originalRecord: normalizedRecord
    }
  };
}

async function retrieveDomain(input = {}) {
  const query = _trim(input.query || input.text || input.userQuery);
  const domain = _lower(input.domain || input.requestedDomain || "general") || "general";
  const maxMatches = Math.max(1, Number(input.maxMatches) || 5);

  if (!query) return [];

  let loaded;
  try {
    loaded = _loadDomainRecords(domain);
  } catch {
    return [];
  }

  const records = _safeArray(loaded.records);
  if (!records.length) return [];

  const scored = records
    .map((record) => {
      const normalizedRecord = _safeObj(record);
      const scoreBundle = _scoreRecord(query, normalizedRecord, domain, input);
      return { record: normalizedRecord, scoreBundle };
    })
    .filter((item) => item.scoreBundle.score > 0)
    .sort((a, b) => {
      const scoreDelta = b.scoreBundle.score - a.scoreBundle.score;
      if (scoreDelta !== 0) return scoreDelta;

      const confidenceA = Number(_safeObj(a.record).confidence || 0);
      const confidenceB = Number(_safeObj(b.record).confidence || 0);
      return confidenceB - confidenceA;
    })
    .slice(0, maxMatches);

  return scored.map((item, idx) =>
    _normalizeEvidence(item.record, domain, item.scoreBundle, idx)
  );
}

module.exports = {
  retrieveDomain,
  retrieve: retrieveDomain
};
