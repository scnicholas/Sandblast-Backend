"use strict";

// runtime/domainRetriever.js

const fs = require("fs");
const path = require("path");

const RUNTIME_ROOT = __dirname;
const MARION_ROOT = path.resolve(RUNTIME_ROOT, "..");

const DOMAIN_CONFIGS = {
  psychology: {
    root: path.join(MARION_ROOT, "psychology"),
    compiled: [path.join(MARION_ROOT, "psychology", "compiled", "psychology_compiled.json")]
  },
  finance: {
    root: path.join(MARION_ROOT, "finance"),
    compiled: [path.join(MARION_ROOT, "finance", "compiled", "finance_compiled.json")]
  },
  law: {
    root: path.join(MARION_ROOT, "law"),
    compiled: [path.join(MARION_ROOT, "law", "compiled", "law_compiled.json")]
  },
  english: {
    root: path.join(MARION_ROOT, "english"),
    compiled: [path.join(MARION_ROOT, "english", "compiled", "english_compiled.json")]
  },
  cybersecurity: {
    root: path.join(MARION_ROOT, "cybersecurity"),
    compiled: [path.join(MARION_ROOT, "cybersecurity", "compiled", "cybersecurity_compiled.json")]
  },
  marketing: {
    root: path.join(MARION_ROOT, "marketing"),
    compiled: [path.join(MARION_ROOT, "marketing", "compiled", "marketing_compiled.json")]
  },
  general: {
    root: path.join(MARION_ROOT, "general"),
    compiled: [path.join(MARION_ROOT, "general", "compiled", "general_compiled.json")]
  }
};

const _cache = new Map();

function _exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function _mtime(p) {
  try {
    return fs.statSync(p).mtimeMs || 0;
  } catch {
    return 0;
  }
}

function _readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function _safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function _safeObj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function _trim(v) {
  return v == null ? "" : String(v).trim();
}

function _lower(v) {
  return _trim(v).toLowerCase();
}

function _normalizeText(text) {
  return _lower(text)
    .replace(/[^a-z0-9\s'_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function _uniqStrings(arr) {
  return [...new Set(_safeArray(arr).map((x) => _trim(x)).filter(Boolean))];
}

function _domainConfig(domain) {
  return DOMAIN_CONFIGS[domain] || DOMAIN_CONFIGS.general;
}

function _loadCompiledRecords(domain) {
  const config = _domainConfig(domain);
  const files = _safeArray(config.compiled).filter(_exists);
  const records = [];

  for (const file of files) {
    const cacheKey = `${domain}:${file}`;
    const currentMtime = _mtime(file);
    const cached = _cache.get(cacheKey);

    let payload;
    if (cached && cached.mtime === currentMtime) {
      payload = cached.payload;
    } else {
      payload = _readJson(file);
      _cache.set(cacheKey, { mtime: currentMtime, payload });
    }

    if (Array.isArray(payload)) {
      records.push(...payload);
    } else if (payload && Array.isArray(payload.records)) {
      records.push(...payload.records);
    } else if (payload && Array.isArray(payload.items)) {
      records.push(...payload.items);
    }
  }

  return records;
}

function _candidateTerms(record = {}) {
  return _uniqStrings([
    record.title,
    record.topic,
    record.subdomain,
    record.category,
    ..._flattenStrings(record.keywords),
    ..._flattenStrings(record.signals),
    ..._flattenStrings(record.tags),
    ..._flattenStrings(record.aliases),
    ..._flattenStrings(record.examples)
  ]);
}

function _scoreRecord(query, record, requestedDomain) {
  const terms = _candidateTerms(record);
  const reasons = [];
  let score = 0;

  for (const term of terms) {
    if (_containsPhrase(query, term)) {
      const weight =
        term === record.title ? 7 :
        term === record.topic ? 6 :
        term === record.subdomain ? 5 : 4;

      score += weight;
      reasons.push({ type: "term", value: term, weight });
    }
  }

  const recordDomain = _lower(record.domain || requestedDomain || "general");
  if (recordDomain && recordDomain === _lower(requestedDomain)) {
    score += 3;
    reasons.push({ type: "domain", value: recordDomain, weight: 3 });
  }

  const confidence = Number(record.confidence);
  if (Number.isFinite(confidence)) {
    score += Math.max(0, Math.min(2, confidence * 2));
  }

  return { score, reasons };
}

function _normalizeEvidence(record, domain, score, reasons, idx) {
  const rawScore = Number.isFinite(score) ? score : 0;
  const normalizedScore = Math.max(0, Math.min(1, Number((rawScore / 18).toFixed(4))));
  const confidence =
    Number.isFinite(Number(record.confidence))
      ? Math.max(0, Math.min(1, Number(record.confidence)))
      : normalizedScore;

  return {
    id: record.id || `domain-${domain}-${idx + 1}`,
    source: "domain",
    dataset: record.dataset || `${domain}_compiled`,
    domain: _trim(record.domain) || domain || "general",
    title: _trim(record.title) || _trim(record.topic) || _trim(record.subdomain) || `domain-${idx + 1}`,
    summary: _uniqStrings([
      _trim(record.topic),
      _trim(record.subdomain),
      _trim(record.category),
      ..._safeArray(reasons).map((r) => _trim(r.value))
    ]).join(" | "),
    content: typeof record.content === "string" ? record.content : JSON.stringify(record),
    score: normalizedScore,
    confidence,
    tags: _uniqStrings([
      domain,
      _trim(record.subdomain),
      _trim(record.topic),
      _trim(record.category),
      ..._flattenStrings(record.tags)
    ]),
    recency: Number.isFinite(Number(record.recency)) ? Number(record.recency) : 0,
    emotionalRelevance: Number.isFinite(Number(record.emotionalRelevance)) ? Number(record.emotionalRelevance) : 0.15,
    metadata: {
      reasons,
      originalRecord: record
    }
  };
}

async function retrieveDomain(input = {}) {
  const query = _trim(input.query || input.text || input.userQuery);
  const domain = _lower(input.domain || input.requestedDomain || "general") || "general";
  const maxMatches = Number(input.maxMatches) || 5;

  if (!query) {
    return [];
  }

  let records = [];
  try {
    records = _loadCompiledRecords(domain);
  } catch {
    return [];
  }

  const scored = records
    .map((record) => {
      const { score, reasons } = _scoreRecord(query, _safeObj(record), domain);
      return { record: _safeObj(record), score, reasons };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxMatches);

  return scored.map((item, idx) =>
    _normalizeEvidence(item.record, domain, item.score, item.reasons, idx)
  );
}

module.exports = {
  retrieveDomain,
  retrieve: retrieveDomain
};
