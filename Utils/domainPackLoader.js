"use strict";

/**
 * Utils/domainPackLoader.js
 *
 * Domain Pack Loader (filesystem-backed)
 * Loads domain manifests + JSON packs from /Data/<domain>/...
 *
 * Goals:
 * - Centralize pack IO (fs only here; keep chatEngine/marionSO pure)
 * - Fail-open: never crash the app; return empty results on error
 * - Caching: avoid re-reading/parsing packs on every request
 * - Guardrails: size limits + basic schema validation
 *
 * Expected structure:
 *   Data/
 *     ai/
 *       manifest.json
 *       ai_foundations_v1.json
 *       ai_agents_systems_v1.json
 *       ...
 *     fin/
 *       manifest.json
 *       fin_macro_principles_v1.json
 *       ...
 *
 * manifest.json contract (recommended):
 * {
 *   "domain": "ai",
 *   "domainVersion": "1.0.0",
 *   "updatedAt": "2026-02-12",
 *   "defaultLoadOrder": ["ai_foundations_v1.json", ...]
 * }
 *
 * Exports:
 * - loadDomain(domain, opts) -> { ok, domain, manifest, packs, errors, stats }
 * - loadDomains(domains[], opts) -> { ok, results, errors }
 * - getCachedPack(domain, filename)
 * - listCachedDomains()
 * - clearCache(domain?)
 */

const fs = require("fs");
const path = require("path");

const LOADER_VERSION = "domainPackLoader v1.0.0";

// -------------------------
// Defaults + Guardrails
// -------------------------
const DEFAULTS = Object.freeze({
  dataRoot: path.join(__dirname, "..", "Data"), // adjust if your tree differs
  manifestName: "manifest.json",

  // caching
  cacheTtlMs: 10 * 60 * 1000, // 10 min
  maxCachedDomains: 12,

  // safety limits (avoid runaway packs)
  maxFileBytes: 2_500_000, // 2.5MB per pack
  maxManifestBytes: 200_000, // 200KB
  maxPacksPerDomain: 40,

  // if true, loads only manifest + defaultLoadOrder; otherwise load all .json in folder
  preferManifestLoadOrder: true,
});

// -------------------------
// Cache shape
// -------------------------
/**
 * cache[domain] = {
 *   at: ms,
 *   manifest: {...},
 *   packs: { "file.json": parsedObject, ... },
 *   stats: { filesRead, bytesRead, parseMs }
 * }
 */
const cache = Object.create(null);
const lru = []; // domain names, most-recent at end

// -------------------------
// Helpers
// -------------------------
function nowMs() {
  return Date.now();
}

function safeStr(x, max = 240) {
  if (x === null || x === undefined) return "";
  const s = String(x);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function isPlainObject(x) {
  return (
    !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null)
  );
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  const t = Math.trunc(x);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}

function normalizeDomainName(domain) {
  const d = safeStr(domain, 64).trim().toLowerCase();
  // Keep it conservative for filesystem safety
  if (!/^[a-z0-9_-]+$/.test(d)) return "";
  return d;
}

function stripBom(bufOrStr) {
  const s = Buffer.isBuffer(bufOrStr) ? bufOrStr.toString("utf8") : String(bufOrStr);
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function tryJsonParse(text, errors, label) {
  try {
    return JSON.parse(text);
  } catch (e) {
    errors.push(`${label}:json_parse_fail:${safeStr(e && (e.code || e.name) ? e.code || e.name : "ERR", 40)}`);
    return null;
  }
}

function fileExists(p) {
  try {
    fs.accessSync(p, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function statSafe(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function readFileSafe(p, maxBytes, errors, label) {
  const st = statSafe(p);
  if (!st) {
    errors.push(`${label}:missing`);
    return null;
  }
  if (st.size > maxBytes) {
    errors.push(`${label}:too_large:${st.size}`);
    return null;
  }
  try {
    const buf = fs.readFileSync(p);
    return buf;
  } catch (e) {
    errors.push(`${label}:read_fail:${safeStr(e && (e.code || e.name) ? e.code || e.name : "ERR", 40)}`);
    return null;
  }
}

function ensureLru(domain) {
  const idx = lru.indexOf(domain);
  if (idx >= 0) lru.splice(idx, 1);
  lru.push(domain);

  // evict if needed
  const max = DEFAULTS.maxCachedDomains;
  while (lru.length > max) {
    const victim = lru.shift();
    if (victim && cache[victim]) delete cache[victim];
  }
}

function isCacheFresh(entry, ttlMs) {
  if (!entry || typeof entry.at !== "number") return false;
  return nowMs() - entry.at <= ttlMs;
}

function validateManifest(m, errors) {
  if (!isPlainObject(m)) {
    errors.push("manifest:invalid_object");
    return { ok: false, manifest: null };
  }

  const domain = safeStr(m.domain || "", 64).trim().toLowerCase();
  const domainVersion = safeStr(m.domainVersion || "", 32).trim();
  const updatedAt = safeStr(m.updatedAt || "", 32).trim();

  const dlo = Array.isArray(m.defaultLoadOrder) ? m.defaultLoadOrder : [];
  const defaultLoadOrder = dlo
    .map((x) => safeStr(x, 120).trim())
    .filter((x) => x && x.endsWith(".json"))
    .slice(0, DEFAULTS.maxPacksPerDomain);

  return {
    ok: true,
    manifest: {
      ...m,
      domain,
      domainVersion,
      updatedAt,
      defaultLoadOrder,
    },
  };
}

function listJsonFilesInDir(dirPath, errors) {
  try {
    const files = fs.readdirSync(dirPath);
    return files
      .filter((f) => f && f.toLowerCase().endsWith(".json"))
      .filter((f) => f !== DEFAULTS.manifestName)
      .slice(0, DEFAULTS.maxPacksPerDomain);
  } catch (e) {
    errors.push(`dir:read_fail:${safeStr(e && (e.code || e.name) ? e.code || e.name : "ERR", 40)}`);
    return [];
  }
}

// -------------------------
// Core loaders
// -------------------------
function loadManifest(domainDir, errors, opts) {
  const manifestPath = path.join(domainDir, opts.manifestName || DEFAULTS.manifestName);
  if (!fileExists(manifestPath)) {
    errors.push("manifest:missing");
    return { manifest: null, manifestPath };
  }

  const buf = readFileSafe(manifestPath, opts.maxManifestBytes, errors, "manifest");
  if (!buf) return { manifest: null, manifestPath };

  const text = stripBom(buf);
  const parsed = tryJsonParse(text, errors, "manifest");
  if (!parsed) return { manifest: null, manifestPath };

  const v = validateManifest(parsed, errors);
  if (!v.ok) return { manifest: null, manifestPath };

  return { manifest: v.manifest, manifestPath };
}

function loadPackFile(domainDir, filename, errors, opts) {
  const file = safeStr(filename, 140).trim();
  if (!file || !file.endsWith(".json")) return null;

  // basic traversal protection
  if (file.includes("..") || file.includes("/") || file.includes("\\")) {
    errors.push(`pack:${file}:invalid_name`);
    return null;
  }

  const packPath = path.join(domainDir, file);
  const buf = readFileSafe(packPath, opts.maxFileBytes, errors, `pack:${file}`);
  if (!buf) return null;

  const text = stripBom(buf);
  const parsed = tryJsonParse(text, errors, `pack:${file}`);
  if (!parsed) return null;

  return parsed;
}

function pickLoadList(domainDir, manifest, errors, opts) {
  const prefer = !!opts.preferManifestLoadOrder;
  if (prefer && manifest && Array.isArray(manifest.defaultLoadOrder) && manifest.defaultLoadOrder.length) {
    return manifest.defaultLoadOrder.slice(0, opts.maxPacksPerDomain);
  }
  // fallback: load all JSON packs in folder
  return listJsonFilesInDir(domainDir, errors);
}

// -------------------------
// Public API
// -------------------------
function loadDomain(domain, opts = {}) {
  const o = {
    ...DEFAULTS,
    ...(isPlainObject(opts) ? opts : {}),
  };

  const d = normalizeDomainName(domain);
  if (!d) {
    return {
      ok: false,
      domain: safeStr(domain, 64),
      manifest: null,
      packs: {},
      errors: ["domain:invalid_name"],
      stats: { loaderVersion: LOADER_VERSION },
    };
  }

  // Cache hit
  const cached = cache[d];
  if (isCacheFresh(cached, o.cacheTtlMs)) {
    ensureLru(d);
    return {
      ok: true,
      domain: d,
      manifest: cached.manifest || null,
      packs: cached.packs || {},
      errors: [],
      stats: { ...cached.stats, cached: true, loaderVersion: LOADER_VERSION },
    };
  }

  const errors = [];
  const t0 = nowMs();
  const domainDir = path.join(o.dataRoot, d);

  if (!fileExists(domainDir)) {
    return {
      ok: false,
      domain: d,
      manifest: null,
      packs: {},
      errors: ["domain_dir:missing"],
      stats: { loaderVersion: LOADER_VERSION },
    };
  }

  const { manifest } = loadManifest(domainDir, errors, o);
  const loadList = pickLoadList(domainDir, manifest, errors, o);

  const packs = Object.create(null);
  let filesRead = 0;
  let bytesRead = 0;

  for (const file of loadList) {
    if (filesRead >= o.maxPacksPerDomain) break;
    const packPath = path.join(domainDir, file);
    const st = statSafe(packPath);
    if (st && st.size) bytesRead += st.size;

    const parsed = loadPackFile(domainDir, file, errors, o);
    if (parsed !== null) {
      packs[file] = parsed;
      filesRead += 1;
    }
  }

  const parseMs = clampInt(nowMs() - t0, 0, 60_000, 0);

  const entry = {
    at: nowMs(),
    manifest: manifest || null,
    packs,
    stats: { filesRead, bytesRead, parseMs, cached: false, loaderVersion: LOADER_VERSION },
  };

  cache[d] = entry;
  ensureLru(d);

  return {
    ok: true,
    domain: d,
    manifest: entry.manifest,
    packs: entry.packs,
    errors,
    stats: entry.stats,
  };
}

function loadDomains(domains, opts = {}) {
  const ds = Array.isArray(domains) ? domains : [];
  const results = [];
  const errors = [];

  for (const d of ds.slice(0, 24)) {
    const res = loadDomain(d, opts);
    results.push(res);
    if (!res.ok && Array.isArray(res.errors)) {
      for (const e of res.errors) errors.push(`${safeStr(d, 32)}:${safeStr(e, 80)}`);
    }
  }

  return {
    ok: true,
    results,
    errors: errors.slice(0, 60),
    stats: { loaderVersion: LOADER_VERSION },
  };
}

function getCachedPack(domain, filename) {
  const d = normalizeDomainName(domain);
  if (!d) return null;
  const entry = cache[d];
  if (!entry || !entry.packs) return null;
  const f = safeStr(filename, 140).trim();
  return entry.packs[f] || null;
}

function listCachedDomains() {
  return lru.slice();
}

function clearCache(domain) {
  if (!domain) {
    for (const k of Object.keys(cache)) delete cache[k];
    lru.splice(0, lru.length);
    return { ok: true, cleared: "all" };
  }
  const d = normalizeDomainName(domain);
  if (!d) return { ok: false, cleared: "none" };
  if (cache[d]) delete cache[d];
  const idx = lru.indexOf(d);
  if (idx >= 0) lru.splice(idx, 1);
  return { ok: true, cleared: d };
}

module.exports = {
  LOADER_VERSION,
  loadDomain,
  loadDomains,
  getCachedPack,
  listCachedDomains,
  clearCache,
};
