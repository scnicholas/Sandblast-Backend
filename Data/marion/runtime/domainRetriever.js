"use strict";

/**
 * runtime/domainRetriever.js
 * domainRetriever v1.2.0 LOAD-PATH-VERIFY + DOMAIN-ISOLATION-GUARD
 *
 * Purpose:
 * - Retrieve evidence only from the requested canonical domain.
 * - Verify every resolved path stays inside that domain root.
 * - Prefer compiled packs, then scan only the same domain tree.
 * - Fail closed for unsupported domains unless allowGeneralFallback is explicitly true.
 */

const fs = require("fs");
const path = require("path");

const VERSION = "domainRetriever v1.2.0 LOAD-PATH-VERIFY + DOMAIN-ISOLATION-GUARD";
const RUNTIME_ROOT = __dirname;
const MARION_ROOT = path.resolve(RUNTIME_ROOT, "..");
const MAX_WALK_DEPTH = 4;
const MAX_CACHE_ENTRIES = 80;
const MAX_JSON_BYTES = 2 * 1024 * 1024;

const DOMAIN_ALIASES = Object.freeze({
  core: "general",
  general: "general",
  chat: "general",
  reasoning: "general",
  psychology: "psychology",
  psych: "psychology",
  emotion: "psychology",
  emotional: "psychology",
  finance: "finance",
  fin: "finance",
  financial: "finance",
  law: "law",
  legal: "law",
  english: "english",
  en: "english",
  writing: "english",
  cyber: "cybersecurity",
  cybersecurity: "cybersecurity",
  security: "cybersecurity",
  ai: "ai",
  artificial_intelligence: "ai",
  marketing: "marketing",
  mkt: "marketing",
  strategy: "strategy",
  strat: "strategy"
});

const DOMAIN_CONFIGS = Object.freeze({
  psychology: cfg("psychology"),
  finance: cfg("finance"),
  law: cfg("law"),
  english: cfg("english"),
  cybersecurity: cfg("cybersecurity"),
  ai: cfg("ai"),
  marketing: cfg("marketing"),
  strategy: cfg("strategy"),
  general: cfg("general")
});

const CACHE = new Map();

function cfg(domain) {
  const root = path.join(MARION_ROOT, domain);
  return Object.freeze({
    domain,
    root,
    compiled: Object.freeze([
      path.join(root, "compiled", `${domain}_compiled.json`),
      path.join(root, `${domain}_compiled.json`),
      path.join(root, "knowledge.json"),
      path.join(root, "domain.json")
    ])
  });
}

function _safeArray(value) { return Array.isArray(value) ? value : []; }
function _safeObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function _trim(value) { return value == null ? "" : String(value).trim(); }
function _lower(value) { return _trim(value).toLowerCase(); }
function _clamp(value, min = 0, max = 1) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min; }
function _uniqStrings(values) { return [...new Set(_safeArray(values).map(_trim).filter(Boolean))]; }

function _canonicalDomain(value) {
  const raw = _lower(value || "general").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return DOMAIN_ALIASES[raw] || raw || "general";
}

function _domainConfig(domain, allowGeneralFallback = false) {
  const key = _canonicalDomain(domain);
  if (DOMAIN_CONFIGS[key]) return DOMAIN_CONFIGS[key];
  return allowGeneralFallback ? DOMAIN_CONFIGS.general : null;
}

function _isInsideRoot(filePath, rootPath) {
  try {
    const file = path.resolve(filePath);
    const root = path.resolve(rootPath);
    const rel = path.relative(root, file);
    return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
  } catch (_) { return false; }
}

function _safeResolveUnderRoot(rootPath, candidate) {
  const root = path.resolve(rootPath || "");
  const resolved = path.resolve(candidate || "");
  if (!root || !resolved || !_isInsideRoot(resolved, root)) return "";
  return resolved;
}

function _exists(filePath) {
  try { return !!(filePath && fs.existsSync(filePath)); } catch (_) { return false; }
}

function _stat(filePath) {
  try { return fs.statSync(filePath); } catch (_) { return null; }
}

function _readJson(filePath, rootPath) {
  const safePath = _safeResolveUnderRoot(rootPath, filePath);
  if (!safePath) throw new Error("path_outside_domain_root");
  const stat = _stat(safePath);
  if (!stat || !stat.isFile()) throw new Error("json_file_missing");
  if (stat.size > MAX_JSON_BYTES) throw new Error("json_file_too_large");
  const cacheKey = `${safePath}:${stat.mtimeMs}:${stat.size}`;
  const cached = CACHE.get(cacheKey);
  if (cached) return cached;
  const payload = JSON.parse(fs.readFileSync(safePath, "utf8"));
  CACHE.set(cacheKey, payload);
  while (CACHE.size > MAX_CACHE_ENTRIES) CACHE.delete(CACHE.keys().next().value);
  return payload;
}

function _normalizeText(text) {
  return _lower(text).replace(/[^a-z0-9\s'_-]+/g, " ").replace(/\s+/g, " ").trim();
}
function _tokenize(text) { return _normalizeText(text).split(" ").filter((token) => token.length > 2); }
function _containsPhrase(haystack, phrase) { const p = _normalizeText(phrase); return !!p && _normalizeText(haystack).includes(p); }

function _flattenStrings(value, out = []) {
  if (typeof value === "string") { const s = _trim(value); if (s) out.push(s); return out; }
  if (Array.isArray(value)) { for (const item of value) _flattenStrings(item, out); return out; }
  if (value && typeof value === "object") { for (const v of Object.values(value)) _flattenStrings(v, out); }
  return out;
}

function _walkJsonFiles(rootPath, dir = rootPath, depth = 0, files = []) {
  const root = path.resolve(rootPath || "");
  const safeDir = _safeResolveUnderRoot(root, dir);
  if (!safeDir || depth > MAX_WALK_DEPTH) return files;
  let entries = [];
  try { entries = fs.readdirSync(safeDir, { withFileTypes: true }); } catch (_) { return files; }
  for (const entry of entries) {
    if (!entry || entry.name.startsWith(".")) continue;
    if (["node_modules", ".git", "dist", "build", "coverage"].includes(entry.name.toLowerCase())) continue;
    const fullPath = path.join(safeDir, entry.name);
    if (!_safeResolveUnderRoot(root, fullPath)) continue;
    if (entry.isDirectory()) _walkJsonFiles(root, fullPath, depth + 1, files);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) files.push(fullPath);
  }
  return files;
}

function _extractRecordsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.records)) return payload.records;
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (payload && Array.isArray(payload.entries)) return payload.entries;
  if (payload && typeof payload === "object") return [payload];
  return [];
}

function _loadDomainRecords(domain, options = {}) {
  const allowGeneralFallback = options.allowGeneralFallback === true;
  const config = _domainConfig(domain, allowGeneralFallback);
  if (!config) {
    return { records: [], diagnostics: { ok: false, domainKey: _canonicalDomain(domain), error: "unsupported_domain", failClosed: true } };
  }

  const root = path.resolve(config.root);
  const rootExists = _exists(root) && (_stat(root) || {}).isDirectory && _stat(root).isDirectory();
  if (!rootExists) {
    return { records: [], diagnostics: { ok: false, domainKey: config.domain, resolvedRoot: root, error: "domain_root_missing", failClosed: true } };
  }

  const compiledFiles = _safeArray(config.compiled).map((p) => _safeResolveUnderRoot(root, p)).filter((p) => p && _exists(p));
  let files = compiledFiles;
  let sourceMode = compiledFiles.length ? "compiled" : "scan";
  if (!files.length) {
    files = _walkJsonFiles(root).filter((filePath) => {
      const base = path.basename(filePath).toLowerCase();
      return !base.includes("manifest") && !base.includes("index");
    });
  }

  const records = [];
  const diagnostics = {
    ok: false,
    domainKey: config.domain,
    resolvedRoot: root,
    filesAttempted: files.length,
    filesLoaded: 0,
    compiledPreferred: !!compiledFiles.length,
    sourceMode,
    failClosed: false,
    crossDomainBlocked: false,
    errors: []
  };

  for (const filePath of files) {
    const safePath = _safeResolveUnderRoot(root, filePath);
    if (!safePath) { diagnostics.crossDomainBlocked = true; diagnostics.errors.push({ file: String(filePath), error: "outside_domain_root" }); continue; }
    try {
      const payload = _readJson(safePath, root);
      const extracted = _extractRecordsFromPayload(payload);
      diagnostics.filesLoaded += 1;
      extracted.forEach((record, idx) => {
        records.push({ __file: safePath, __index: idx, __sourceMode: sourceMode, __domainKey: config.domain, ..._safeObj(record) });
      });
    } catch (err) {
      diagnostics.errors.push({ file: safePath, error: _trim(err && err.message || err) });
    }
  }

  diagnostics.ok = records.length > 0;
  return { records, diagnostics };
}

function _candidateTerms(record = {}) {
  return _uniqStrings([record.title, record.topic, record.subdomain, record.category, record.domain, ..._flattenStrings(record.keywords), ..._flattenStrings(record.signals), ..._flattenStrings(record.tags), ..._flattenStrings(record.aliases), ..._flattenStrings(record.examples)]);
}
function _buildSearchBlob(record = {}) {
  return _uniqStrings([record.title, record.topic, record.subdomain, record.category, record.domain, record.summary, record.description, record.content, ..._flattenStrings(record.keywords), ..._flattenStrings(record.signals), ..._flattenStrings(record.tags), ..._flattenStrings(record.aliases), ..._flattenStrings(record.examples)]).join(" ");
}
function _tokenOverlapScore(queryTokens = [], blobText = "") {
  const blobTokens = new Set(_tokenize(blobText));
  if (!queryTokens.length || !blobTokens.size) return { hits: 0, ratio: 0 };
  let hits = 0;
  for (const token of queryTokens) if (blobTokens.has(token)) hits += 1;
  return { hits, ratio: hits / queryTokens.length };
}

function _scoreRecord(query, record, requestedDomain, context = {}) {
  const normalizedRecord = _safeObj(record);
  const terms = _candidateTerms(normalizedRecord);
  const reasons = [];
  let score = 0;
  const queryTokens = _tokenize(query);
  const blob = _buildSearchBlob(normalizedRecord);
  const overlap = _tokenOverlapScore(queryTokens, blob);
  const recordDomain = _canonicalDomain(normalizedRecord.domain || normalizedRecord.__domainKey || requestedDomain || "general");
  const recoveryMode = _lower(_safeObj(context.conversationState).recoveryMode || "normal");
  const continuityHealth = _lower(_safeObj(context.conversationState).continuityHealth || "watch");

  for (const term of terms) {
    if (!_containsPhrase(query, term)) continue;
    const weight = term === normalizedRecord.title ? 7 : term === normalizedRecord.topic ? 6 : term === normalizedRecord.subdomain ? 5 : term === normalizedRecord.category ? 4 : 3;
    score += weight;
    reasons.push({ type: "phrase-hit", value: term, weight });
  }
  if (overlap.hits > 0) { const tokenWeight = Math.min(5, Math.max(1, Math.round(overlap.hits))); score += tokenWeight; reasons.push({ type: "token-overlap", value: `${overlap.hits}/${queryTokens.length}`, weight: tokenWeight }); }
  if (recordDomain === _canonicalDomain(requestedDomain)) { score += 2; reasons.push({ type: "domain-alignment", value: recordDomain, weight: 2 }); }
  const confidence = Number(normalizedRecord.confidence);
  if (Number.isFinite(confidence)) { const w = Number(Math.max(0, Math.min(2, confidence * 2)).toFixed(4)); score += w; reasons.push({ type: "confidence", value: Number(confidence.toFixed(4)), weight: w }); }
  const recency = Number(normalizedRecord.recency);
  if (Number.isFinite(recency) && recency > 0) { const w = Number(Math.max(0, Math.min(1.25, recency * 1.25)).toFixed(4)); score += w; reasons.push({ type: "recency", value: Number(recency.toFixed(4)), weight: w }); }
  if (recoveryMode === "guided-recovery") { score += 0.75; reasons.push({ type: "recovery-bias", value: "guided-recovery", weight: 0.75 }); }
  if (continuityHealth === "fragile" && overlap.hits > 0) { score += 0.5; reasons.push({ type: "continuity-bias", value: "fragile", weight: 0.5 }); }
  const hasMeaningfulText = !!_trim(normalizedRecord.summary || normalizedRecord.description || normalizedRecord.content);
  if (!hasMeaningfulText && overlap.hits < 2) { score -= 1; reasons.push({ type: "thin-record-penalty", value: "limited-text", weight: -1 }); }
  return { score: Number(Math.max(0, score).toFixed(4)), reasons, overlap, diagnostics: { recordDomain, recoveryMode, continuityHealth, hasMeaningfulText } };
}

function _normalizeEvidence(record, domain, scoreBundle, idx) {
  const normalizedRecord = _safeObj(record);
  const rawScore = Number(scoreBundle.score || 0);
  const normalizedScore = _clamp(Number((rawScore / 20).toFixed(4)));
  const confidence = Number.isFinite(Number(normalizedRecord.confidence)) ? _clamp(Number(normalizedRecord.confidence)) : normalizedScore;
  return {
    id: normalizedRecord.id || `domain-${domain}-${idx + 1}`,
    source: "domain",
    dataset: normalizedRecord.dataset || `${domain}_compiled`,
    domain: _canonicalDomain(_trim(normalizedRecord.domain) || domain || "general"),
    title: _trim(normalizedRecord.title) || _trim(normalizedRecord.topic) || _trim(normalizedRecord.subdomain) || `domain-${idx + 1}`,
    summary: _uniqStrings([_trim(normalizedRecord.topic), _trim(normalizedRecord.subdomain), _trim(normalizedRecord.category), ..._safeArray(scoreBundle.reasons).map((reason) => `${reason.type}:${_trim(reason.value)}`)]).join(" | "),
    content: typeof normalizedRecord.content === "string" ? normalizedRecord.content : JSON.stringify(normalizedRecord),
    score: normalizedScore,
    confidence,
    tags: _uniqStrings([domain, _trim(normalizedRecord.subdomain), _trim(normalizedRecord.topic), _trim(normalizedRecord.category), ..._flattenStrings(normalizedRecord.tags)]),
    recency: Number.isFinite(Number(normalizedRecord.recency)) ? _clamp(Number(normalizedRecord.recency)) : 0,
    emotionalRelevance: Number.isFinite(Number(normalizedRecord.emotionalRelevance)) ? _clamp(Number(normalizedRecord.emotionalRelevance)) : 0.15,
    metadata: { reasons: scoreBundle.reasons, overlap: scoreBundle.overlap, file: normalizedRecord.__file || null, fileIndex: Number.isFinite(Number(normalizedRecord.__index)) ? normalizedRecord.__index : null, sourceMode: normalizedRecord.__sourceMode || "compiled", domainKey: normalizedRecord.__domainKey || domain, diagnostics: _safeObj(scoreBundle.diagnostics) }
  };
}

async function retrieveDomain(input = {}) {
  const query = _trim(input.query || input.text || input.userQuery);
  const domain = _canonicalDomain(input.domain || input.requestedDomain || "general") || "general";
  const maxMatches = Math.max(1, Math.min(25, Number(input.maxMatches) || 5));
  if (!query) return [];
  const loaded = _loadDomainRecords(domain, input);
  const records = _safeArray(loaded.records);
  if (!records.length) return [];
  return records.map((record) => ({ record: _safeObj(record), scoreBundle: _scoreRecord(query, _safeObj(record), domain, input) }))
    .filter((item) => item.scoreBundle.score > 0)
    .sort((a, b) => (b.scoreBundle.score - a.scoreBundle.score) || (Number(_safeObj(b.record).confidence || 0) - Number(_safeObj(a.record).confidence || 0)))
    .slice(0, maxMatches)
    .map((item, idx) => _normalizeEvidence(item.record, domain, item.scoreBundle, idx));
}

function getDomainHealth(domain = "general", options = {}) {
  const key = _canonicalDomain(domain);
  const loaded = _loadDomainRecords(key, { ..._safeObj(options), allowGeneralFallback: false });
  const d = _safeObj(loaded.diagnostics);
  return {
    ok: !!d.ok,
    version: VERSION,
    domainKey: key,
    supported: !!DOMAIN_CONFIGS[key],
    bootstrapGuard: !!(DOMAIN_CONFIGS[key] && !d.crossDomainBlocked && d.error !== "unsupported_domain"),
    failClosed: d.failClosed === true || !DOMAIN_CONFIGS[key],
    resolvedPath: d.resolvedRoot || "",
    manifestLoaded: false,
    healthStatus: d.ok ? "ready" : "degraded",
    filesAttempted: d.filesAttempted || 0,
    filesLoaded: d.filesLoaded || 0,
    sourceMode: d.sourceMode || "none",
    crossDomainBlocked: !!d.crossDomainBlocked,
    errors: _safeArray(d.errors).slice(0, 8)
  };
}

function getHealth(options = {}) {
  const domains = Object.keys(DOMAIN_CONFIGS);
  const statuses = {};
  for (const domain of domains) statuses[domain] = getDomainHealth(domain, options);
  const failed = domains.filter((domain) => !statuses[domain].ok);
  return { ok: failed.length === 0, version: VERSION, failed, statuses };
}

module.exports = {
  VERSION,
  retrieveDomain,
  retrieve: retrieveDomain,
  getDomainHealth,
  getHealth,
  _internal: { _canonicalDomain, _domainConfig, _loadDomainRecords, _safeResolveUnderRoot, _isInsideRoot }
};
