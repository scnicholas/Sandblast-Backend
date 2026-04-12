"use strict";

const fs = require("fs");
const path = require("path");

const RUNTIME_ROOT = __dirname;
const MARION_ROOT = path.resolve(RUNTIME_ROOT, "..");

const DATASET_ROOTS = [
  path.join(MARION_ROOT, "datasets"),
  path.join(MARION_ROOT, "data"),
  path.join(MARION_ROOT, "emotion"),
  path.join(MARION_ROOT, "psychology")
];

const _cache = new Map();
let _indexedFiles = null;
const MAX_WALK_DEPTH = 6;

function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _trim(v) { return v == null ? "" : String(v).trim(); }
function _lower(v) { return _trim(v).toLowerCase(); }

function _exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function _mtime(p) { try { return fs.statSync(p).mtimeMs || 0; } catch { return 0; } }
function _readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

function _normalizeText(text) {
  return _lower(text)
    .replace(/[^a-z0-9\s'_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function _tokenize(text) { return _normalizeText(text).split(" ").filter((t) => t.length > 2); }
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
function _uniqStrings(arr) { return [...new Set(_safeArray(arr).map((x) => _trim(x)).filter(Boolean))]; }

function _discoverJsonFiles() {
  if (_indexedFiles) return _indexedFiles;
  const files = [];
  function walk(dir, depth = 0) {
    if (!_exists(dir) || depth > MAX_WALK_DEPTH) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.toLowerCase() === "node_modules") continue;
        walk(full, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) files.push(full);
    }
  }
  for (const root of DATASET_ROOTS) walk(root, 0);
  _indexedFiles = [...new Set(files)];
  return _indexedFiles;
}

function _extractItems(payload, datasetName, file) {
  const items = [];
  if (Array.isArray(payload)) {
    payload.forEach((item) => items.push({ datasetName, file, item }));
    return items;
  }
  if (payload && Array.isArray(payload.records)) {
    payload.records.forEach((item) => items.push({ datasetName, file, item }));
    return items;
  }
  if (payload && Array.isArray(payload.items)) {
    payload.items.forEach((item) => items.push({ datasetName, file, item }));
    return items;
  }
  if (payload && payload.supportModes && typeof payload.supportModes === "object") {
    for (const [name, item] of Object.entries(payload.supportModes)) {
      items.push({ datasetName, file, item: { id: name, topic: name, title: name, ..._safeObj(item) } });
    }
    return items;
  }
  if (payload && payload.routingRules && Array.isArray(payload.routingRules)) {
    payload.routingRules.forEach((item) => items.push({ datasetName, file, item }));
    return items;
  }
  if (payload && typeof payload === "object") items.push({ datasetName, file, item: payload });
  return items;
}

function _loadAllDatasetItems() {
  const files = _discoverJsonFiles();
  const items = [];
  for (const file of files) {
    const currentMtime = _mtime(file);
    const cached = _cache.get(file);
    let payload;
    if (cached && cached.mtime === currentMtime) payload = cached.payload;
    else {
      try {
        payload = _readJson(file);
        _cache.set(file, { mtime: currentMtime, payload });
      } catch {
        continue;
      }
    }
    const datasetName = path.basename(file, ".json");
    items.push(..._extractItems(payload, datasetName, file));
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
    item.domain,
    item.summary,
    item.description,
    item.supportMode,
    item.routeBias,
    ..._flattenStrings(item.keywords),
    ..._flattenStrings(item.signals),
    ..._flattenStrings(item.tags),
    ..._flattenStrings(item.aliases),
    ..._flattenStrings(item.examples),
    ..._flattenStrings(item.triggers),
    ..._flattenStrings(item.responseShape),
    ..._flattenStrings(item.transitionTargets)
  ]);
}

function _scoreDatasetItem(query, item, context = {}) {
  const reasons = [];
  let score = 0;

  const domain = _lower(context.domain || "general");
  const primaryEmotion = _lower(_safeObj(context.emotion).primaryEmotion || _safeObj(_safeObj(context.emotion).primary).emotion || "");
  const supportMode = _lower(_safeObj(context.psychology).supportMode || "");
  const queryTokens = _tokenize(query);

  for (const term of _candidateTerms(item)) {
    if (_containsPhrase(query, term)) {
      score += 4;
      reasons.push({ type: "term", value: term, weight: 4 });
    }
  }

  const itemTokens = new Set(_tokenize(JSON.stringify(item)));
  const hasMeaningfulText = !!_trim(item.summary || item.description || item.content || item.text || item.body);
  let overlap = 0;
  for (const token of queryTokens) if (itemTokens.has(token)) overlap += 1;
  if (overlap > 0) {
    const weight = Math.min(5, overlap);
    score += weight;
    reasons.push({ type: "token_overlap", value: overlap, weight });
  }

  const itemDomain = _lower(item.domain || item.category || item.subdomain || "");
  if (itemDomain && domain !== "general" && itemDomain.includes(domain)) {
    score += 3;
    reasons.push({ type: "domain", value: itemDomain, weight: 3 });
  }

  if (primaryEmotion) {
    const emotionFields = _uniqStrings([item.label, item.emotion, item.topic, ..._flattenStrings(item.tags), ..._flattenStrings(item.keywords), ..._flattenStrings(item.signals)]).map(_lower);
    if (emotionFields.some((value) => value.includes(primaryEmotion))) {
      score += 2;
      reasons.push({ type: "emotion", value: primaryEmotion, weight: 2 });
    }
  }

  if (supportMode) {
    const modeFields = _uniqStrings([item.supportMode, item.routeBias, ..._flattenStrings(item.transitionTargets)]).map(_lower);
    if (modeFields.some((value) => value.includes(supportMode))) {
      score += 2;
      reasons.push({ type: "support_mode", value: supportMode, weight: 2 });
    }
  }

  if (!hasMeaningfulText && overlap < 2) {
    score = Math.max(0, score - 1);
    reasons.push({ type: "thin_record_penalty", value: "limited_text", weight: -1 });
  }

  return { score, reasons };
}

function _normalizeEvidence(item, datasetName, file, score, reasons, rank, input) {
  const src = _safeObj(item);
  const content = _trim(src.content || src.text || src.body || src.summary || src.description || JSON.stringify(src));
  return {
    id: src.id || `${datasetName}:${rank}`,
    source: "datasetRetriever",
    dataset: datasetName,
    file,
    domain: _lower(src.domain || src.category || input.domain || "general"),
    title: src.title || src.label || src.topic || src.name || datasetName,
    summary: _trim(src.summary || src.description || content.slice(0, 220)),
    content,
    score,
    confidence: Math.min(0.98, 0.55 + (score * 0.04)),
    reasons,
    tags: _uniqStrings([].concat(_safeArray(src.tags)).concat(_safeArray(src.keywords)).concat([datasetName])),
    metadata: {
      supportMode: src.supportMode || null,
      routeBias: src.routeBias || null,
      subdomain: src.subdomain || null
    },
    originalItem: src
  };
}

async function retrieveDataset(input = {}) {
  const query = _trim(input.query || input.text || input.userQuery);
  const maxMatches = Math.max(1, Number(input.maxMatches) || 8);
  const allowedDatasets = _safeArray(input.datasets).map(_lower).filter(Boolean);
  if (!query) return [];

  const allItems = _loadAllDatasetItems();
  const filtered = allItems.filter(({ datasetName }) => !allowedDatasets.length || allowedDatasets.includes(_lower(datasetName)));

  const scored = filtered
    .map(({ datasetName, file, item }) => {
      const normalizedItem = _safeObj(item);
      const { score, reasons } = _scoreDatasetItem(query, normalizedItem, input);
      return { datasetName, file, item: normalizedItem, score, reasons };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxMatches);

  return scored.map((entry, idx) => _normalizeEvidence(entry.item, entry.datasetName, entry.file, entry.score, entry.reasons, idx, input));
}

module.exports = {
  retrieveDataset,
  retrieve: retrieveDataset
};
