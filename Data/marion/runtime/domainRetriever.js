"use strict";

/**
 * runtime/domainRetriever.js
 * domainRetriever v1.4.0 REGISTRY-PATH-ALIGNMENT + DATA-DOMAINS-ROOT-LOCK + DOMAIN-ISOLATION-GUARD
 *
 * Purpose:
 * - Retrieve evidence only from the requested canonical domain.
 * - Align retriever paths with the active MarionDomainRegistry layout.
 * - Prefer registry-discovered manifest roots, then Data/Domains/<domain>, then legacy Data/marion/<domain>.
 * - Verify every resolved path stays inside the selected domain root.
 * - Prefer compiled packs, then scan only the same domain tree.
 * - Fail closed for unsupported/unloaded domains unless allowGeneralFallback is explicitly true.
 *
 * Architectural rules:
 * - Domain retriever does not route intent.
 * - Domain retriever does not compose final replies.
 * - Domain retriever does not cross-load another domain when a requested domain is degraded.
 * - Registry health is treated as the preferred source of path truth when available.
 */

const fs = require("fs");
const path = require("path");

const VERSION = "domainRetriever v1.5.0 PRIORITY2-RETRIEVER-COHESION-HARDENING + BUSINESS-STRATEGY-ALIAS-COMPAT + INDEX-COHESION + REGISTRY-PATH-ALIGNMENT + DATA-DOMAINS-ROOT-LOCK + DOMAIN-ISOLATION-GUARD";
const RUNTIME_ROOT = __dirname;
const MARION_ROOT = path.resolve(RUNTIME_ROOT, "..");
const DATA_ROOT = path.resolve(MARION_ROOT, "..");
const PROJECT_ROOT = path.resolve(DATA_ROOT, "..");
const DOMAINS_ROOT = path.join(DATA_ROOT, "Domains");

const MAX_WALK_DEPTH = 5;
const MAX_CACHE_ENTRIES = 120;
const MAX_JSON_BYTES = 2 * 1024 * 1024;

const DOMAIN_ALIASES = Object.freeze({
  core: "general",
  general: "general",
  chat: "general",
  reasoning: "general",
  general_reasoning: "general",

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
  grammar: "english",

  cyber: "cyber",
  cybersecurity: "cyber",
  security: "cyber",

  ai: "ai",
  artificial_intelligence: "ai",
  artificialintelligence: "ai",

  marketing: "marketing",
  mkt: "marketing",
  advertising: "marketing",
  sponsorship: "marketing",
  media_kit: "marketing",

  business: "strategy",
  business_strategy: "strategy",
  operations_strategy: "strategy",
  strategy: "strategy",
  strat: "strategy",

  technical: "general",
  command_routing: "general",
  guardian_pipeline: "general",
  domain_concierge: "general",
  domain_registry: "general",
  domain_retriever: "general",
  protective_escalation: "general",
  defensive_boundary: "general"
});

const CANONICAL_DOMAINS = Object.freeze([
  "psychology",
  "finance",
  "law",
  "english",
  "cyber",
  "ai",
  "marketing",
  "strategy",
  "general"
]);

const REQUIRED_HEALTH_DOMAINS = Object.freeze([
  "psychology",
  "finance",
  "law",
  "english",
  "cyber",
  "ai"
]);

const OPTIONAL_HEALTH_DOMAINS = Object.freeze([
  "marketing",
  "strategy",
  "general"
]);

const DOMAIN_FOLDER_CANDIDATES = Object.freeze({
  psychology: Object.freeze(["psychology", "Psychology"]),
  finance: Object.freeze(["finance", "Finance"]),
  law: Object.freeze(["law", "Law", "legal", "Legal"]),
  english: Object.freeze(["english", "English"]),
  cyber: Object.freeze(["Cyber", "cyber", "cybersecurity", "Cybersecurity"]),
  ai: Object.freeze(["ai", "AI"]),
  marketing: Object.freeze(["marketing", "Marketing"]),
  strategy: Object.freeze(["strategy", "Strategy"]),
  general: Object.freeze(["general", "General", "core", "Core"])
});

const CACHE = new Map();

function _safeArray(value) { return Array.isArray(value) ? value : []; }
function _safeObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function _trim(value) { return value == null ? "" : String(value).trim(); }
function _oneLine(value) { return _trim(value).replace(/\s+/g, " "); }
function _lower(value) { return _trim(value).toLowerCase(); }
function _clamp(value, min = 0, max = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}
function _uniqStrings(values) {
  return [...new Set(_safeArray(values).map(_trim).filter(Boolean))];
}

function _canonicalDomain(value) {
  const raw = _lower(value || "general").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return DOMAIN_ALIASES[raw] || raw || "general";
}

function _exists(filePath) {
  try { return !!(filePath && fs.existsSync(filePath)); } catch (_) { return false; }
}

function _stat(filePath) {
  try { return fs.statSync(filePath); } catch (_) { return null; }
}

function _isDir(filePath) {
  const stat = _stat(filePath);
  return !!(stat && stat.isDirectory());
}

function _isFile(filePath) {
  const stat = _stat(filePath);
  return !!(stat && stat.isFile());
}

function _isInsideRoot(filePath, rootPath) {
  try {
    const file = path.resolve(filePath);
    const root = path.resolve(rootPath);
    const rel = path.relative(root, file);
    return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
  } catch (_) {
    return false;
  }
}

function _safeResolveUnderRoot(rootPath, candidate) {
  const root = path.resolve(rootPath || "");
  const resolved = path.resolve(candidate || "");
  if (!root || !resolved || !_isInsideRoot(resolved, root)) return "";
  return resolved;
}

function _tryRequireMany(paths) {
  for (const candidate of _safeArray(paths)) {
    try {
      const resolved = require.resolve(candidate);
      const mod = require(resolved);
      if (mod) return { ok: true, mod, resolvedPath: resolved, requested: candidate };
    } catch (_) {}
  }
  return { ok: false, mod: null, resolvedPath: "", requested: "" };
}

const REGISTRY_REQUIRE_CANDIDATES = Object.freeze([
  path.join(RUNTIME_ROOT, "marionDomainRegistry.js"),
  path.join(RUNTIME_ROOT, "marionDomainRegistry"),
  path.join(PROJECT_ROOT, "Data", "marion", "runtime", "marionDomainRegistry.js"),
  path.join(PROJECT_ROOT, "Data", "marion", "runtime", "marionDomainRegistry"),
  "./marionDomainRegistry.js",
  "./marionDomainRegistry",
  "./Data/marion/runtime/marionDomainRegistry.js",
  "./Data/marion/runtime/marionDomainRegistry",
  "../runtime/marionDomainRegistry.js",
  "../runtime/marionDomainRegistry"
]);

const registryLoaded = _tryRequireMany(REGISTRY_REQUIRE_CANDIDATES);
const registryMod = registryLoaded.mod;

function _normalizeRegistryPath(value) {
  const raw = _trim(value);
  if (!raw) return "";
  if (path.isAbsolute(raw)) return path.normalize(raw);

  const candidates = [
    path.resolve(PROJECT_ROOT, raw),
    path.resolve(process.cwd(), raw),
    path.resolve(RUNTIME_ROOT, raw)
  ];

  for (const candidate of candidates) {
    if (_exists(candidate)) return candidate;
  }

  return candidates[0];
}

function _registryWiringStatus(domain) {
  if (!registryMod || typeof registryMod.getDomainWiringStatus !== "function") return {};
  try {
    return _safeObj(registryMod.getDomainWiringStatus(domain, { includePack: false }));
  } catch (_) {
    return {};
  }
}

function _registryManifest(domain) {
  if (!registryMod || typeof registryMod.getDomainManifest !== "function") return {};
  try {
    return _safeObj(registryMod.getDomainManifest(domain, { maxBytes: MAX_JSON_BYTES }));
  } catch (_) {
    return {};
  }
}

function _registryKnowledgePack(domain) {
  if (!registryMod || typeof registryMod.getDomainKnowledgePack !== "function") return {};
  try {
    return _safeObj(registryMod.getDomainKnowledgePack(domain, {
      maxBytes: MAX_JSON_BYTES,
      maxFiles: 120,
      maxDepth: MAX_WALK_DEPTH
    }));
  } catch (_) {
    return {};
  }
}

function _registryDomainReady(domain) {
  if (!registryMod) return false;
  try {
    if (typeof registryMod.hasDomain === "function" && !registryMod.hasDomain(domain)) return false;
  } catch (_) {}

  const wiring = _registryWiringStatus(domain);
  if (Object.keys(wiring).length) {
    if (wiring.ready === true || wiring.ok === true || wiring.manifestFound === true || Number(wiring.packFilesFound || 0) > 0) return true;
    if (wiring.supported === false || wiring.ready === false) return false;
  }

  const manifest = _registryManifest(domain);
  if (Object.keys(manifest).length) {
    if (manifest.loaded === true || manifest.ok === true || manifest.manifest || manifest.path || manifest.manifestPath) return true;
  }

  return false;
}

function _candidateRoots(domain) {
  const key = _canonicalDomain(domain);
  const folderCandidates = DOMAIN_FOLDER_CANDIDATES[key] || [key];
  const roots = [];
  const seen = new Set();

  function addRoot(candidate, source) {
    const resolved = _normalizeRegistryPath(candidate);
    if (!resolved || seen.has(resolved)) return;
    seen.add(resolved);
    roots.push({ root: resolved, source });
  }

  const wiring = _registryWiringStatus(key);
  const manifest = _registryManifest(key);

  const registryManifestPaths = [
    wiring.manifestPath,
    wiring.path,
    wiring.resolvedPath && /manifest\.json$/i.test(wiring.resolvedPath) ? wiring.resolvedPath : "",
    manifest.manifestPath,
    manifest.path
  ].filter(Boolean);

  for (const manifestPath of registryManifestPaths) {
    const resolvedManifest = _normalizeRegistryPath(manifestPath);
    if (resolvedManifest) addRoot(path.dirname(resolvedManifest), "registry_manifest");
  }

  const registryRoots = [
    wiring.root,
    wiring.domainRoot,
    wiring.resolvedRoot,
    wiring.rootPath,
    manifest.root,
    manifest.domainRoot,
    manifest.resolvedRoot
  ].filter(Boolean);

  for (const root of registryRoots) addRoot(root, "registry_root");

  for (const folder of folderCandidates) addRoot(path.join(DOMAINS_ROOT, folder), "data_domains");
  for (const folder of folderCandidates) addRoot(path.join(PROJECT_ROOT, "domains", folder), "project_domains");
  for (const folder of folderCandidates) addRoot(path.join(DATA_ROOT, folder), "data_legacy");
  for (const folder of folderCandidates) addRoot(path.join(MARION_ROOT, folder), "marion_legacy");
  for (const folder of folderCandidates) addRoot(path.join(PROJECT_ROOT, "Data", "marion", "knowledge", folder), "marion_knowledge");

  return roots;
}

function _selectDomainRoot(domain) {
  const key = _canonicalDomain(domain);
  const candidates = _candidateRoots(key);
  for (const candidate of candidates) {
    if (_isDir(candidate.root)) {
      return {
        domain: key,
        root: path.resolve(candidate.root),
        source: candidate.source,
        candidates
      };
    }
  }

  const fallbackRoot = candidates[0] ? candidates[0].root : path.join(DOMAINS_ROOT, key);
  return {
    domain: key,
    root: path.resolve(fallbackRoot),
    source: "missing",
    candidates
  };
}

function _domainConfig(domain, allowGeneralFallback = false) {
  const key = _canonicalDomain(domain);
  if (!CANONICAL_DOMAINS.includes(key)) {
    if (!allowGeneralFallback) return null;
    return _domainConfig("general", false);
  }

  const selected = _selectDomainRoot(key);
  return Object.freeze({
    domain: key,
    root: selected.root,
    rootSource: selected.source,
    rootCandidates: selected.candidates,
    compiled: Object.freeze(_compiledCandidates(key, selected.root))
  });
}

function _compiledCandidates(domain, root) {
  const key = _canonicalDomain(domain);
  const names = _uniqStrings([key, ...(DOMAIN_FOLDER_CANDIDATES[key] || [])].map((x) => _lower(x).replace(/[^a-z0-9]+/g, "_")));
  const files = [];

  function add(fileName) {
    const candidate = path.join(root, fileName);
    if (!files.includes(candidate)) files.push(candidate);
  }

  for (const name of names) {
    add(path.join("compiled", `${name}_compiled.json`));
    add(`${name}_compiled.json`);
    add(`${name}.json`);
  }

  add("knowledge.json");
  add("domain.json");
  add("pack.json");
  add("data.json");

  return files;
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

function _tokenize(text) {
  return _normalizeText(text).split(" ").filter((token) => token.length > 2);
}

function _containsPhrase(haystack, phrase) {
  const p = _normalizeText(phrase);
  return !!p && _normalizeText(haystack).includes(p);
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
  }
  return out;
}

function _walkJsonFiles(rootPath, dir = rootPath, depth = 0, files = []) {
  const root = path.resolve(rootPath || "");
  const safeDir = _safeResolveUnderRoot(root, dir);
  if (!safeDir || depth > MAX_WALK_DEPTH) return files;

  let entries = [];
  try {
    entries = fs.readdirSync(safeDir, { withFileTypes: true });
  } catch (_) {
    return files;
  }

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
  if (payload && Array.isArray(payload.knowledge)) return payload.knowledge;
  if (payload && Array.isArray(payload.concepts)) return payload.concepts;
  if (payload && typeof payload === "object") return [payload];
  return [];
}

function _manifestPathForRoot(root) {
  const direct = path.join(root, "manifest.json");
  if (_isFile(direct)) return direct;

  const matches = _walkJsonFiles(root, root, 1, []).filter((file) => /manifest\.json$/i.test(path.basename(file)));
  return matches[0] || "";
}

function _loadRegistryPackRecords(domain, root) {
  const pack = _registryKnowledgePack(domain);
  const records = [];
  const files = [];

  function pushPayload(payload, fileName) {
    const extracted = _extractRecordsFromPayload(payload);
    for (let idx = 0; idx < extracted.length; idx += 1) {
      records.push({
        __file: fileName || "registry_pack",
        __index: idx,
        __sourceMode: "registry_pack",
        __domainKey: domain,
        ..._safeObj(extracted[idx])
      });
    }
    if (fileName) files.push(fileName);
  }

  for (const item of _safeArray(pack.dataFiles)) {
    const obj = _safeObj(item);
    const fileName = _trim(obj.path || obj.file || obj.filename || "");
    const data = obj.data !== undefined ? obj.data : obj.payload;
    if (data !== undefined) pushPayload(data, fileName);
  }

  for (const item of _safeArray(pack.files)) {
    const obj = _safeObj(item);
    const fileName = _trim(obj.path || obj.file || obj.filename || "");
    const data = obj.data !== undefined ? obj.data : obj.payload !== undefined ? obj.payload : obj;
    if (Object.keys(obj).length) pushPayload(data, fileName);
  }

  if (pack.pack) pushPayload(pack.pack, "registry_pack.pack");
  if (pack.data) pushPayload(pack.data, "registry_pack.data");

  return {
    records,
    files: _uniqStrings(files.filter((file) => !file || !root || _isInsideRoot(_normalizeRegistryPath(file), root)))
  };
}

function _loadDomainRecords(domain, options = {}) {
  const allowGeneralFallback = options.allowGeneralFallback === true;
  const config = _domainConfig(domain, allowGeneralFallback);

  if (!config) {
    return {
      records: [],
      diagnostics: {
        ok: false,
        domainKey: _canonicalDomain(domain),
        supported: false,
        error: "unsupported_domain",
        failClosed: true,
        rootCandidates: []
      }
    };
  }

  const root = path.resolve(config.root);
  const rootExists = _isDir(root);
  const manifestPath = rootExists ? _manifestPathForRoot(root) : "";

  if (!rootExists) {
    return {
      records: [],
      diagnostics: {
        ok: false,
        domainKey: config.domain,
        supported: true,
        resolvedRoot: root,
        rootSource: config.rootSource,
        rootCandidates: _safeArray(config.rootCandidates).map((c) => ({ root: c.root, source: c.source, exists: _isDir(c.root) })),
        error: "domain_root_missing",
        failClosed: true,
        manifestLoaded: false,
        healthStatus: "degraded",
        filesAttempted: 0,
        filesLoaded: 0,
        sourceMode: "none",
        crossDomainBlocked: false,
        errors: []
      }
    };
  }

  const registryPack = _loadRegistryPackRecords(config.domain, root);
  const compiledFiles = _safeArray(config.compiled)
    .map((p) => _safeResolveUnderRoot(root, p))
    .filter((p) => p && _isFile(p));

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
    version: VERSION,
    domainKey: config.domain,
    supported: true,
    resolvedRoot: root,
    rootSource: config.rootSource,
    rootCandidates: _safeArray(config.rootCandidates).map((c) => ({ root: c.root, source: c.source, exists: _isDir(c.root) })),
    manifestLoaded: !!manifestPath,
    manifestPath,
    filesAttempted: files.length + registryPack.files.length,
    filesLoaded: 0,
    compiledPreferred: !!compiledFiles.length,
    registryPackLoaded: registryPack.records.length > 0,
    registryPackFiles: registryPack.files.length,
    sourceMode: registryPack.records.length ? "registry_pack" : sourceMode,
    failClosed: false,
    crossDomainBlocked: false,
    errors: []
  };

  if (registryPack.records.length) {
    for (const record of registryPack.records) records.push(record);
    diagnostics.filesLoaded += registryPack.files.length || 1;
  }

  for (const filePath of files) {
    const safePath = _safeResolveUnderRoot(root, filePath);
    if (!safePath) {
      diagnostics.crossDomainBlocked = true;
      diagnostics.errors.push({ file: String(filePath), error: "outside_domain_root" });
      continue;
    }

    try {
      const payload = _readJson(safePath, root);
      const extracted = _extractRecordsFromPayload(payload);
      diagnostics.filesLoaded += 1;
      extracted.forEach((record, idx) => {
        records.push({
          __file: safePath,
          __index: idx,
          __sourceMode: sourceMode,
          __domainKey: config.domain,
          ..._safeObj(record)
        });
      });
    } catch (err) {
      diagnostics.errors.push({ file: safePath, error: _trim(err && err.message || err) });
    }
  }

  diagnostics.ok = records.length > 0;
  diagnostics.healthStatus = diagnostics.ok ? "ready" : "degraded";
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
  const requestedKey = _canonicalDomain(requestedDomain);
  const recoveryMode = _lower(_safeObj(context.conversationState).recoveryMode || "normal");
  const continuityHealth = _lower(_safeObj(context.conversationState).continuityHealth || "watch");

  for (const term of terms) {
    if (!_containsPhrase(query, term)) continue;
    const weight = term === normalizedRecord.title ? 7 : term === normalizedRecord.topic ? 6 : term === normalizedRecord.subdomain ? 5 : term === normalizedRecord.category ? 4 : 3;
    score += weight;
    reasons.push({ type: "phrase-hit", value: term, weight });
  }

  if (overlap.hits > 0) {
    const tokenWeight = Math.min(5, Math.max(1, Math.round(overlap.hits)));
    score += tokenWeight;
    reasons.push({ type: "token-overlap", value: `${overlap.hits}/${queryTokens.length}`, weight: tokenWeight });
  }

  if (recordDomain === requestedKey) {
    score += 2;
    reasons.push({ type: "domain-alignment", value: recordDomain, weight: 2 });
  } else {
    score -= 5;
    reasons.push({ type: "domain-mismatch-penalty", value: `${recordDomain}->${requestedKey}`, weight: -5 });
  }

  const confidence = Number(normalizedRecord.confidence);
  if (Number.isFinite(confidence)) {
    const w = Number(Math.max(0, Math.min(2, confidence * 2)).toFixed(4));
    score += w;
    reasons.push({ type: "confidence", value: Number(confidence.toFixed(4)), weight: w });
  }

  const recency = Number(normalizedRecord.recency);
  if (Number.isFinite(recency) && recency > 0) {
    const w = Number(Math.max(0, Math.min(1.25, recency * 1.25)).toFixed(4));
    score += w;
    reasons.push({ type: "recency", value: Number(recency.toFixed(4)), weight: w });
  }

  if (recoveryMode === "guided-recovery") {
    score += 0.75;
    reasons.push({ type: "recovery-bias", value: "guided-recovery", weight: 0.75 });
  }

  if (continuityHealth === "fragile" && overlap.hits > 0) {
    score += 0.5;
    reasons.push({ type: "continuity-bias", value: "fragile", weight: 0.5 });
  }

  const hasMeaningfulText = !!_trim(normalizedRecord.summary || normalizedRecord.description || normalizedRecord.content);
  if (!hasMeaningfulText && overlap.hits < 2) {
    score -= 1;
    reasons.push({ type: "thin-record-penalty", value: "limited-text", weight: -1 });
  }

  return {
    score: Number(Math.max(0, score).toFixed(4)),
    reasons,
    overlap,
    diagnostics: { recordDomain, requestedDomain: requestedKey, recoveryMode, continuityHealth, hasMeaningfulText }
  };
}

function _evidenceConfidenceProfile(scoreBundle = {}, domain = "general") {
  const score = Number(scoreBundle.score || 0);
  const confidence = _clamp(score / 20);
  return {
    version: "nyx.domainEvidenceConfidence/1.0",
    domain: _canonicalDomain(domain),
    confidence,
    band: confidence >= 0.75 ? "high" : (confidence >= 0.42 ? "medium" : "low"),
    reasons: _safeArray(scoreBundle.reasons).slice(0, 6).map((r) => _trim(_safeObj(r).type || r))
  };
}

function _normalizeEvidence(record, domain, scoreBundle, idx) {
  const normalizedRecord = _safeObj(record);
  const rawScore = Number(scoreBundle.score || 0);
  const normalizedScore = _clamp(Number((rawScore / 20).toFixed(4)));
  const confidence = Number.isFinite(Number(normalizedRecord.confidence)) ? _clamp(Number(normalizedRecord.confidence)) : normalizedScore;
  const domainKey = _canonicalDomain(domain);

  return {
    id: normalizedRecord.id || `domain-${domainKey}-${idx + 1}`,
    source: "domain",
    dataset: normalizedRecord.dataset || `${domainKey}_compiled`,
    domain: _canonicalDomain(_trim(normalizedRecord.domain) || domainKey || "general"),
    title: _trim(normalizedRecord.title) || _trim(normalizedRecord.topic) || _trim(normalizedRecord.subdomain) || `domain-${idx + 1}`,
    summary: _uniqStrings([
      _trim(normalizedRecord.topic),
      _trim(normalizedRecord.subdomain),
      _trim(normalizedRecord.category),
      ..._safeArray(scoreBundle.reasons).map((reason) => `${reason.type}:${_trim(reason.value)}`)
    ]).join(" | "),
    content: typeof normalizedRecord.content === "string" ? normalizedRecord.content : JSON.stringify(normalizedRecord),
    score: normalizedScore,
    confidence,
    tags: _uniqStrings([domainKey, _trim(normalizedRecord.subdomain), _trim(normalizedRecord.topic), _trim(normalizedRecord.category), ..._flattenStrings(normalizedRecord.tags)]),
    recency: Number.isFinite(Number(normalizedRecord.recency)) ? _clamp(Number(normalizedRecord.recency)) : 0,
    emotionalRelevance: Number.isFinite(Number(normalizedRecord.emotionalRelevance)) ? _clamp(Number(normalizedRecord.emotionalRelevance)) : 0.15,
    metadata: {
      domainConfidence: _evidenceConfidenceProfile(scoreBundle, domainKey),
      reasons: scoreBundle.reasons,
      overlap: scoreBundle.overlap,
      file: normalizedRecord.__file || null,
      fileIndex: Number.isFinite(Number(normalizedRecord.__index)) ? normalizedRecord.__index : null,
      sourceMode: normalizedRecord.__sourceMode || "compiled",
      domainKey: normalizedRecord.__domainKey || domainKey,
      diagnostics: _safeObj(scoreBundle.diagnostics)
    }
  };
}

async function retrieveDomain(input = {}) {
  const query = _trim(input.query || input.text || input.userQuery);
  const domain = _canonicalDomain(input.domain || input.requestedDomain || input.knowledgeDomain || "general") || "general";
  const maxMatches = Math.max(1, Math.min(25, Number(input.maxMatches) || 5));

  if (!query) return [];

  const config = _domainConfig(domain, input.allowGeneralFallback === true);
  if (!config && input.returnDiagnostics === true) {
    return [{
      id: `domain-${domain}-unsupported`,
      source: "domain",
      dataset: "domain_retriever_diagnostic",
      domain,
      title: "Unsupported domain",
      summary: `Domain '${domain}' is not loaded for retrieval.`,
      content: "The retriever failed closed instead of crossing into another domain without explicit allowGeneralFallback.",
      score: 0,
      confidence: 0,
      tags: [domain, "unsupported_domain", "fail_closed"],
      recency: 0,
      emotionalRelevance: 0,
      metadata: { failClosed: true, noCrossDomainBleed: true, requestedDomain: input.domain || input.requestedDomain || input.knowledgeDomain || "" }
    }];
  }

  const loaded = _loadDomainRecords(domain, input);
  const records = _safeArray(loaded.records);
  if (!records.length) return [];

  return records
    .map((record) => ({ record: _safeObj(record), scoreBundle: _scoreRecord(query, _safeObj(record), domain, input) }))
    .filter((item) => item.scoreBundle.score > 0)
    .sort((a, b) => (b.scoreBundle.score - a.scoreBundle.score) || (Number(_safeObj(b.record).confidence || 0) - Number(_safeObj(a.record).confidence || 0)))
    .slice(0, maxMatches)
    .map((item, idx) => _normalizeEvidence(item.record, domain, item.scoreBundle, idx));
}

function getDomainHealth(domain = "general", options = {}) {
  const key = _canonicalDomain(domain);
  const config = _domainConfig(key, false);
  const loaded = _loadDomainRecords(key, { ..._safeObj(options), allowGeneralFallback: false });
  const d = _safeObj(loaded.diagnostics);

  return {
    ok: !!d.ok,
    version: VERSION,
    domainKey: key,
    supported: !!config,
    bootstrapGuard: !!(config && !d.crossDomainBlocked && d.error !== "unsupported_domain"),
    failClosed: d.failClosed === true || !config || d.ok !== true,
    resolvedPath: d.resolvedRoot || (config && config.root) || "",
    rootSource: d.rootSource || (config && config.rootSource) || "",
    rootCandidates: _safeArray(d.rootCandidates).slice(0, 12),
    manifestLoaded: !!d.manifestLoaded,
    manifestPath: d.manifestPath || "",
    healthStatus: d.ok ? "ready" : "degraded",
    filesAttempted: d.filesAttempted || 0,
    filesLoaded: d.filesLoaded || 0,
    compiledPreferred: !!d.compiledPreferred,
    registryLoaded: !!registryLoaded.ok,
    registryResolvedPath: registryLoaded.resolvedPath || "",
    registryReady: _registryDomainReady(key),
    registryPackLoaded: !!d.registryPackLoaded,
    registryPackFiles: d.registryPackFiles || 0,
    sourceMode: d.sourceMode || "none",
    crossDomainBlocked: !!d.crossDomainBlocked,
    errors: _safeArray(d.errors).slice(0, 8)
  };
}

function getHealth(options = {}) {
  const includeOptionalDomains = options.includeOptionalDomains === true;
  const domains = includeOptionalDomains
    ? REQUIRED_HEALTH_DOMAINS.concat(OPTIONAL_HEALTH_DOMAINS)
    : REQUIRED_HEALTH_DOMAINS.slice();

  const statuses = {};
  for (const domain of domains) statuses[domain] = getDomainHealth(domain, options);

  const failed = domains.filter((domain) => !statuses[domain].ok);
  const optionalStatuses = {};
  if (!includeOptionalDomains) {
    for (const domain of OPTIONAL_HEALTH_DOMAINS) optionalStatuses[domain] = getDomainHealth(domain, options);
  }

  return {
    ok: failed.length === 0,
    version: VERSION,
    failed,
    statuses,
    requiredDomains: REQUIRED_HEALTH_DOMAINS.slice(),
    optionalDomains: OPTIONAL_HEALTH_DOMAINS.slice(),
    optionalStatuses,
    aliases: {
      cybersecurity: "cyber",
      security: "cyber",
      business: "strategy",
      business_strategy: "strategy",
      advertising: "marketing",
      sponsorship: "marketing",
      technical: "general",
      command_routing: "general",
      protective_escalation: "general"
    },
    registry: {
      loaded: !!registryLoaded.ok,
      requested: registryLoaded.requested || "",
      resolvedPath: registryLoaded.resolvedPath || ""
    },
    pathModel: {
      runtimeRoot: RUNTIME_ROOT,
      marionRoot: MARION_ROOT,
      dataRoot: DATA_ROOT,
      domainsRoot: DOMAINS_ROOT,
      projectRoot: PROJECT_ROOT,
      preferred: "registry_manifest -> Data/Domains/<domain> -> legacy roots"
    }
  };
}

module.exports = {
  VERSION,
  retrieveDomain,
  retrieve: retrieveDomain,
  getDomainHealth,
  getHealth,
  REQUIRED_HEALTH_DOMAINS,
  OPTIONAL_HEALTH_DOMAINS,
  CANONICAL_DOMAINS,
  _internal: {
    _canonicalDomain,
    _domainConfig,
    _candidateRoots,
    _selectDomainRoot,
    _loadDomainRecords,
    _safeResolveUnderRoot,
    _isInsideRoot,
    _evidenceConfidenceProfile,
    _registryDomainReady,
    _normalizeRegistryPath
  }
};

// R18AB_AI_CYBER_RETRIEVER_HARDENING_START
const R18AB_DOMAIN_RETRIEVER_VERSION = "nyx.marion.r18ab.domainRetriever.aiCyber/1.0";
function r18abRetStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function r18abRetObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function r18abRetDomain(value){
  const k=r18abRetStr(value).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  if(/^(artificial_intelligence|machine_learning|ai_integration|adaptive_ai)$/.test(k))return"ai";
  if(/^(security|cybersecurity|protective_protocol|identity_protection|access_control|least_privilege|secret_redaction)$/.test(k))return"cyber";
  return k||"general";
}
function buildR18ABRetrievalPolicy(domain="", text=""){
  const d=r18abRetDomain(domain);
  const t=r18abRetStr(text).toLowerCase();
  const ai=d==="ai"||/\b(ai|artificial intelligence|model|llm|agent|machine learning|adaptive intelligence|ai integration)\b/.test(t);
  const cyber=d==="cyber"||/\b(cyber|security|protective|least privilege|access control|secret|token|credential|identity|permission|threat|vulnerability)\b/.test(t);
  return {
    version:R18AB_DOMAIN_RETRIEVER_VERSION,
    active:ai||cyber,
    domain:ai?"ai":(cyber?"cyber":d),
    domainIsolationRequired:true,
    noCrossDomainBleed:true,
    aiAssessmentFrame:ai?["goal","context","data","risk","next_move"]:[],
    cyberProtocol:cyber?{
      macScoped:true,
      leastPrivilege:true,
      redactSecrets:true,
      explicitConfirmationRequired:true,
      noCovertMonitoring:true,
      noAutonomousEnforcement:true,
      noPunitiveAction:true
    }:{},
    failClosedOnPathEscape:true,
    baselinePreserved:"r16m-r17c",
    noUserFacingDiagnostics:true
  };
}
function r18abEnhanceRetrieverResult(result, domain, text){
  if(!result||typeof result!=="object")return result;
  const policy=buildR18ABRetrievalPolicy(domain||result.domain||result.knowledgeDomain,text||result.query||result.text);
  if(!policy.active)return result;
  const out=Array.isArray(result)?result.slice():Object.assign({},result);
  out.r18abRetrievalPolicy=policy;
  out.noCrossDomainBleed=true;
  out.domainIsolationRequired=true;
  out.baselinePreserved="r16m-r17c";
  out.noUserFacingDiagnostics=true;
  return out;
}
(function r18abPatchDomainRetrieverExports(){
  if(typeof module==="undefined"||!module.exports||typeof module.exports!=="object")return;
  const exp=module.exports;
  ["retrieveDomain","retrieve"].forEach(function(name){
    const fn=typeof exp[name]==="function"?exp[name]:null;
    if(!fn||fn.__r18abDomainRetrieverPatched)return;
    exp[name]=function r18abRetrieveDomainWrapped(){
      const domain=r18abRetDomain(arguments&&arguments[0]);
      const result=fn.apply(this,arguments);
      const text=arguments&&arguments.length>1?arguments[1]:"";
      if(result&&typeof result.then==="function")return result.then(function(v){return r18abEnhanceRetrieverResult(v,domain,text);});
      return r18abEnhanceRetrieverResult(result,domain,text);
    };
    exp[name].__r18abDomainRetrieverPatched=true;
  });
  exp.R18AB_DOMAIN_RETRIEVER_VERSION=R18AB_DOMAIN_RETRIEVER_VERSION;
  exp.buildR18ABRetrievalPolicy=buildR18ABRetrievalPolicy;
  exp.r18abEnhanceRetrieverResult=r18abEnhanceRetrieverResult;
  exp.R18AB_DOMAIN_RETRIEVER_PATCH=true;
})();
// R18AB_AI_CYBER_RETRIEVER_HARDENING_END

