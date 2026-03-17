"use strict";

// runtime/datasetRetriever.js

const fs = require("fs");
const path = require("path");

const RUNTIME_ROOT = __dirname;
const MARION_ROOT = path.resolve(RUNTIME_ROOT, "..");

const DATASET_ROOTS = [
  path.join(MARION_ROOT, "datasets"),
  path.join(MARION_ROOT, "data"),
  path.join(MARION_ROOT, "emotion")
];

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

function _discoverJsonFiles() {
  const files = [];

  function walk(dir) {
    if (!_exists(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
        files.push(full);
      }
    }
  }

  for (const root of DATASET_ROOTS) {
    walk(root);
  }

  return files;
}

function _loadAllDatasetItems() {
  const files = _discoverJsonFiles();
  const items = [];

  for (const file of files) {
    const currentMtime = _mtime(file);
    const cached = _cache.get(file);

    let payload;
    if (cached && cached.mtime === currentMtime) {
      payload = cached.payload;
    } else {
      try {
        payload = _readJson(file);
        _cache.set(file, { mtime: currentMtime, payload });
      } catch {
        continue;
      }
    }

    const datasetName = path.basename(file, ".json");

    if (Array.isArray(payload)) {
      payload.forEach((item) => items.push({ datasetName, file, item }));
    } else if (payload && Array.isArray(payload.records)) {
      payload.records.forEach((item) => items.push({ datasetName, file, item }));
    } else if (payload && Array.isArray(payload.items)) {
      payload.items.forEach((item) => items.push({ datasetName, file, item }));
    } else if (payload && typeof payload === "object") {
      items.push({ datasetName, file, item: payload });
    }
  }

  return items;
}

function _candidateTerms(item = {}) {
  return _uniqStrings([
    item.title,
    item.label,
    item.topic,
    item.name,
    item.pattern,
    item.subdomain,
    item.category,
    ..._flattenStrings(item.keywords),
    ..._flattenStrings(item.signals),
    ..._flattenStrings(item.tags),
    ..._flattenStrings(item.aliases),
    ..._flattenStrings(item.examples),
    ..._flattenStrings(item.triggers)
  ]);
}

function _scoreDatasetItem(query, item, context = {}) {
  const reasons = [];
  let score = 0;

  const emotion = _safeObj(context.emotion);
  const psychology = _safeObj(context.psychology);
  const domain = _lower(context.domain || "general");

  for (const term of _candidateTerms(item)) {
    if (_containsPhrase(query, term)) {
      score += 4;
      reasons.push({ type: "term", value: term, weight: 4 });
    }
  }

  const itemDomain = _lower(item.domain || item.category || "");
  if (itemDomain && domain !== "general" && itemDomain === domain) {
    score += 3;
    reasons.push({ type: "domain", value: itemDomain, weight: 3 });
  }

  const primaryEmotion = _lower(emotion.primaryEmotion);
  if (primaryEmotion) {
    const emotionFields = _uniqStrings([
      item.label,
      item.emotion,
      ..._flattenStrings(item.tags),
      ..._flattenStrings(item.keywords),
      ..._flattenStrings(item.signals)
    ]).map(_lower);

    if (emotionFields.includes(primaryEmotion)) {
      score += 5;
      reasons.push({ type: "emotion", value: primaryEmotion, weight: 5 });
    }
  }

  for (const pattern of _safeArray(psychology.patterns)) {
    if (_containsPhrase(JSON.stringify(item), pattern)) {
      score += 3;
      reasons.push({ type: "psychology", value: pattern, weight: 3 });
    }
  }

  return { score, reasons };
}

function _normalizeEvidence(item, datasetName, file, score, reasons, idx, context = {}) {
  const normalizedScore = Math.max(0, Math.min(1, Number((score / 20).toFixed(4))));
  const inferredDomain =
    _trim(item.domain) ||
    _trim(item.category) ||
    _trim(context.domain) ||
    "general";

  return {
    id: item.id || `dataset-${datasetName}-${idx + 1}`,
    source: "dataset",
    dataset: datasetName,
    domain: _lower(inferredDomain),
    title: _trim(item.title) || _trim(item.label) || _trim(item.topic) || _trim(item.name) || datasetName,
    summary: _uniqStrings([
      _trim(item.topic),
      _trim(item.label),
      _trim(item.pattern),
      _trim(item.subdomain),
      ..._safeArray(reasons).map((r) => _trim(r.value))
    ]).join(" | "),
    content: typeof item.content === "string" ? item.content : JSON.stringify(item),
    score: normalizedScore,
    confidence: Number.isFinite(Number(item.confidence))
      ? Math.max(0, Math.min(1, Number(item.confidence)))
      : normalizedScore,
    tags: _uniqStrings([
      inferredDomain,
      datasetName,
      ..._flattenStrings(item.tags),
      ..._flattenStrings(item.keywords)
    ]),
    recency: Number.isFinite(Number(item.recency)) ? Number(item.recency) : 0,
    emotionalRelevance: Number.isFinite(Number(item.emotionalRelevance))
      ? Number(item.emotionalRelevance)
      : ((_lower(item.label || item.emotion) === _lower(_safeObj(context.emotion).primaryEmotion)) ? 0.9 : 0.2),
    metadata: {
      file,
      reasons,
      originalItem: item
    }
  };
}

async function retrieveDataset(input = {}) {
  const query = _trim(input.query || input.text || input.userQuery);
  const maxMatches = Number(input.maxMatches) || 6;
  const allowedDatasets = _safeArray(input.datasets).map(_lower).filter(Boolean);

  if (!query) {
    return [];
  }

  const allItems = _loadAllDatasetItems();

  const filtered = allItems.filter(({ datasetName }) => {
    if (!allowedDatasets.length) return true;
    return allowedDatasets.includes(_lower(datasetName));
  });

  const scored = filtered
    .map(({ datasetName, file, item }) => {
      const { score, reasons } = _scoreDatasetItem(query, _safeObj(item), input);
      return { datasetName, file, item: _safeObj(item), score, reasons };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxMatches);

  return scored.map((entry, idx) =>
    _normalizeEvidence(entry.item, entry.datasetName, entry.file, entry.score, entry.reasons, idx, input)
  );
}

module.exports = {
  retrieveDataset,
  retrieve: retrieveDataset
};
