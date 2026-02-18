"use strict";

/**
 * Utils/knowledgeRegistry.js
 *
 * KnowledgeRegistry — manifest-driven knowledge loader + lightweight retrieval
 *
 * Goals:
 * - Load domain manifests + docs at boot (or on demand)
 * - Provide small, bounded "knowledge bundles" to Marion/chatEngine
 * - Fail-open: missing manifests/docs never crash the server
 * - Zero external deps
 *
 * Expected structure:
 *   /knowledge/<domain>/manifest.json
 *   /knowledge/<domain>/<doc>.json
 *
 * Manifest minimal shape (flexible):
 * {
 *   "domain": "english",
 *   "domainVersion": "1.0.0",
 *   "updatedAt": "2026-02-12",
 *   "defaultLoadOrder": ["eng_foundations_v1.json", "..."]
 * }
 *
 * Docs: any JSON. This loader will extract text from common keys:
 * - title / name / topic
 * - sections[] (title + bullets + text)
 * - bullets[] / examples[] / content / body / summary
 *
 * v1.1.0 (MARION⇄NYX BRIDGE++++: lane normalize + domain aliases + tag boosts + reload + safe bundles)
 * ✅ Lane normalization aligned with marionSO normalizeLaneRaw allowlist
 * ✅ Domain aliases (psy -> psychology, cyber -> cybersecurity, etc.)
 * ✅ Doc lane tags: lanes/tags/lane (string|array) captured + boosted
 * ✅ Query returns Marion-ready bundle: {knowledgeFacts, knowledgeHints, sources, meta}
 * ✅ Reload hooks + stats + bounded indexing
 * ✅ Fail-open preserved everywhere
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_ROOT = path.join(process.cwd(), "knowledge");

// -------------------------
// Small helpers
// -------------------------
function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}

function clampInt(n, lo, hi, dflt) {
  n = Number(n);
  if (!Number.isFinite(n)) return dflt;
  n = Math.floor(n);
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function safeLower(x) {
  return safeStr(x).toLowerCase().trim();
}

function tryReadJson(absPath) {
  try {
    const raw = fs.readFileSync(absPath, "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function listDirs(absRoot) {
  try {
    return fs
      .readdirSync(absRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (_) {
    return [];
  }
}

function fileExists(absPath) {
  try {
    fs.accessSync(absPath, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function tokenize(text) {
  const s = safeStr(text).toLowerCase();
  const parts = s.split(/[^a-z0-9]+/g).filter(Boolean);

  // tiny stoplist to keep scoring sane
  const stop = new Set([
    "the","a","an","and","or","to","of","in","on","for","with","at","by","from",
    "is","are","was","were","be","been","being","it","this","that","these","those",
    "as","if","then","than","but","so","we","you","i","they","he","she","them","us",
    "not","no","yes","do","does","did","done","can","could","would","should","will",
    "your","our","their","his","her","its"
  ]);

  const out = [];
  for (const p of parts) {
    if (p.length < 2) continue;
    if (stop.has(p)) continue;
    out.push(p);
  }
  return out;
}

function unique(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = safeStr(x);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function addToMapSet(map, key, val) {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(val);
}

// -------------------------
// Lane normalization (Marion-aligned)
// -------------------------
const LANE_ALLOW = new Set([
  "general",
  "music",
  "roku",
  "radio",
  "schedule",
  "news-canada",
  "news",
  "ai",
  "cyber",
  "security",
  "law",
  "finance",
  "english",
  "psychology",
]);

function normalizeLane(laneRaw) {
  const s = safeLower(laneRaw);
  if (!s) return "general";

  // common aliases
  if (s === "cybersecurity") return "cyber";
  if (s === "sec") return "security";
  if (s === "infosec") return "security";
  if (s === "canada-news") return "news-canada";
  if (s === "newscanada") return "news-canada";
  if (s === "news_canada") return "news-canada";
  if (s === "ro" || s === "rokuos") return "roku";

  // accept if allowlisted
  if (LANE_ALLOW.has(s)) return s;

  // allow prefix-ish for safety (tight)
  if (s.startsWith("news")) return "news";
  return "general";
}

// -------------------------
// Domain normalization / aliases
// -------------------------
const DOMAIN_ALIASES = {
  psy: "psychology",
  psych: "psychology",
  psychology: "psychology",

  cyber: "cyber",
  cybersecurity: "cyber",
  security: "cyber",

  eng: "english",
  english: "english",

  ai: "ai",
  llm: "ai",

  law: "law",
  legal: "law",

  finance: "finance",
  money: "finance",

  news: "news",
  "news-canada": "news-canada",
  newscanada: "news-canada",
};

function normalizeDomain(domainRaw) {
  const s = safeLower(domainRaw);
  if (!s) return "";
  return DOMAIN_ALIASES[s] || s;
}

// -------------------------
// Extract text from arbitrary JSON doc into a compact string
// -------------------------
function flattenDocText(doc) {
  if (!doc || typeof doc !== "object") return "";

  const chunks = [];
  const push = (v) => {
    const s = safeStr(v).trim();
    if (s) chunks.push(s);
  };

  // common top-level keys
  push(doc.title);
  push(doc.name);
  push(doc.topic);
  push(doc.summary);

  // content/body fields
  push(doc.content);
  push(doc.body);
  push(doc.description);

  // arrays: bullets/examples/notes
  const absorbArray = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const it of arr) {
      if (typeof it === "string") push(it);
      else if (it && typeof it === "object") {
        push(it.title);
        push(it.text);
        push(it.body);
        push(it.summary);
        if (Array.isArray(it.bullets)) absorbArray(it.bullets);
        if (Array.isArray(it.examples)) absorbArray(it.examples);
        if (Array.isArray(it.notes)) absorbArray(it.notes);
      }
    }
  };

  absorbArray(doc.bullets);
  absorbArray(doc.examples);
  absorbArray(doc.notes);

  // sections[]
  if (Array.isArray(doc.sections)) {
    for (const s of doc.sections) {
      if (!s || typeof s !== "object") continue;
      push(s.title);
      push(s.heading);
      push(s.text);
      push(s.content);
      absorbArray(s.bullets);
      absorbArray(s.examples);
      absorbArray(s.notes);
    }
  }

  // “cards” / “entries” patterns
  if (Array.isArray(doc.entries)) absorbArray(doc.entries);
  if (Array.isArray(doc.cards)) absorbArray(doc.cards);

  // fallback: shallow stringify some key fields (bounded)
  if (chunks.length === 0) {
    try {
      const raw = JSON.stringify(doc);
      push(raw.slice(0, 1200));
    } catch (_) {}
  }

  // keep it reasonable
  return chunks.join("\n").slice(0, 24000);
}

// -------------------------
// Lane tags extraction from doc
// Supports:
// - doc.lanes: ["music","roku"] or "music"
// - doc.tags: ["lane:music", "radio"] etc.
// - doc.lane: "music"
// -------------------------
function extractLaneTags(doc) {
  const tags = [];

  const addLane = (v) => {
    const n = normalizeLane(v);
    if (n) tags.push(n);
  };

  if (!doc || typeof doc !== "object") return [];

  // lanes (string|array)
  if (Array.isArray(doc.lanes)) {
    for (const x of doc.lanes) addLane(x);
  } else if (typeof doc.lanes === "string") {
    addLane(doc.lanes);
  }

  // lane (string)
  if (typeof doc.lane === "string") addLane(doc.lane);

  // tags (array|string): accept "lane:music" and raw lane tokens
  if (Array.isArray(doc.tags)) {
    for (const t of doc.tags) {
      const s = safeLower(t);
      if (!s) continue;
      if (s.startsWith("lane:")) addLane(s.slice(5));
      else addLane(s);
    }
  } else if (typeof doc.tags === "string") {
    const s = safeLower(doc.tags);
    if (s.startsWith("lane:")) addLane(s.slice(5));
    else addLane(s);
  }

  // unique
  return unique(tags);
}

// -------------------------
// Build “facts” and “hints” from text: tiny heuristic chunking
// -------------------------
function textToFactsAndHints(text, opts) {
  opts = opts && typeof opts === "object" ? opts : {};
  const factsMax = clampInt(opts.factsMax, 1, 30, 10);
  const hintsMax = clampInt(opts.hintsMax, 1, 30, 8);

  const lines = safeStr(text)
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);

  const facts = [];
  const hints = [];

  // Prefer short declarative lines/bullets
  for (const ln of lines) {
    if (facts.length >= factsMax) break;
    const clean = ln.replace(/^[\-\*\u2022]\s*/g, "").trim();
    if (!clean) continue;
    const clipped = clean.length > 220 ? clean.slice(0, 217) + "…" : clean;
    facts.push(clipped);
  }

  // Hints: keywords from the strongest lines
  const tokens = tokenize(lines.slice(0, 50).join(" "));
  const top = unique(tokens).slice(0, hintsMax);
  for (const t of top) hints.push(t);

  return { facts, hints };
}

// -------------------------
// KnowledgeRegistry
// -------------------------
class KnowledgeRegistry {
  constructor(rootDir) {
    this.rootDir = rootDir || DEFAULT_ROOT;

    // domain -> { manifest, docs:[], index: Map(token -> Set(docId)), stats:{} }
    this.domains = {};

    // global token index (optional speed-up when searching "all")
    this.globalIndex = new Map(); // token -> Set(docId)

    this.loadedAt = 0;
    this.loadErrors = [];

    this.stats = {
      domains: 0,
      docs: 0,
      tokens: 0,
      globalTokens: 0,
    };
  }

  // Load all domains found under rootDir
  loadAll() {
    this.domains = {};
    this.globalIndex = new Map();
    this.loadErrors = [];
    this.stats = { domains: 0, docs: 0, tokens: 0, globalTokens: 0 };

    const domainDirs = listDirs(this.rootDir);
    for (const dirName of domainDirs) {
      this._loadDomain(dirName);
    }

    this.loadedAt = Date.now();
    this.stats.domains = Object.keys(this.domains).length;
    this.stats.globalTokens = this.globalIndex.size;

    return {
      ok: true,
      rootDir: this.rootDir,
      domains: Object.keys(this.domains),
      loadedAt: this.loadedAt,
      stats: Object.assign({}, this.stats),
      errors: this.loadErrors.slice(0, 80),
    };
  }

  // Reload one domain by name (normalized)
  reloadDomain(domainRaw) {
    const domain = normalizeDomain(domainRaw);
    if (!domain) return { ok: false, error: "missing_domain" };

    // Remove old domain docs from global index (cheap but safe)
    const existing = this.domains[domain];
    if (existing && Array.isArray(existing.docs)) {
      for (const doc of existing.docs) {
        // Remove docId from any token sets in global index
        // (bounded scan: remove by re-tokenizing doc tokens stored on doc)
        if (Array.isArray(doc.__tokens)) {
          for (const t of doc.__tokens) {
            const set = this.globalIndex.get(t);
            if (set) {
              set.delete(doc.id);
              if (set.size === 0) this.globalIndex.delete(t);
            }
          }
        }
      }
    }

    // Attempt to load from disk again (dir may not match domain name)
    // Strategy:
    // - Try folder "domain"
    // - If not found, scan folders for manifest.domain match
    const directDir = path.join(this.rootDir, domain);
    if (fileExists(path.join(directDir, "manifest.json"))) {
      this._loadDomain(domain);
      this.loadedAt = Date.now();
      return { ok: true, domain, reloadedAt: this.loadedAt };
    }

    // fallback scan
    const dirs = listDirs(this.rootDir);
    for (const d of dirs) {
      const abs = path.join(this.rootDir, d);
      const man = tryReadJson(path.join(abs, "manifest.json"));
      if (man && typeof man === "object") {
        const md = normalizeDomain(man.domain || d);
        if (md === domain) {
          this._loadDomain(d);
          this.loadedAt = Date.now();
          return { ok: true, domain, reloadedAt: this.loadedAt, dir: d };
        }
      }
    }

    // If nothing found, keep it removed but fail-open
    delete this.domains[domain];
    this.loadedAt = Date.now();
    return { ok: false, domain, error: "domain_not_found_on_disk" };
  }

  // Load one domain (dirName == domain folder)
  _loadDomain(dirName) {
    try {
      const absDomain = path.join(this.rootDir, dirName);
      const manifestPath = path.join(absDomain, "manifest.json");
      const manifest = tryReadJson(manifestPath);

      if (!manifest || typeof manifest !== "object") {
        this.loadErrors.push({ domain: dirName, where: "manifest", error: "missing_or_bad_manifest" });
        return;
      }

      const domain = normalizeDomain(manifest.domain || dirName) || normalizeDomain(dirName) || dirName;
      const loadOrder = Array.isArray(manifest.defaultLoadOrder) ? manifest.defaultLoadOrder : [];

      const docs = [];
      const tokenToDocs = new Map(); // token -> Set(docId)

      // load docs in defaultLoadOrder first; then any other *.json (excluding manifest)
      const ordered = [];
      for (const f of loadOrder) ordered.push(f);

      // Add remaining json files
      try {
        const allFiles = fs.readdirSync(absDomain);
        for (const f of allFiles) {
          if (!/\.json$/i.test(f)) continue;
          if (f === "manifest.json") continue;
          if (ordered.includes(f)) continue;
          ordered.push(f);
        }
      } catch (_) {}

      let docIdSeq = 0;

      for (const filename of ordered) {
        const abs = path.join(absDomain, filename);
        const doc = tryReadJson(abs);
        if (!doc) {
          this.loadErrors.push({ domain, where: filename, error: "bad_json" });
          continue;
        }

        const id = `${domain}:${docIdSeq++}`;
        const title = safeStr(doc.title || doc.name || doc.topic || filename).trim() || filename;

        const laneTags = extractLaneTags(doc);

        const text = flattenDocText(doc);
        const tok = unique(tokenize(title + " " + text));

        // Cap per-doc token count to avoid pathological files
        const tokCapped = tok.slice(0, 1400);

        for (const t of tokCapped) {
          addToMapSet(tokenToDocs, t, id);
          addToMapSet(this.globalIndex, t, id);
        }

        docs.push({
          id,
          domain,
          filename,
          title,
          laneTags,
          text,
          __tokens: tokCapped, // used for safe removal on reload
          meta: {
            domainVersion: safeStr(manifest.domainVersion),
            updatedAt: safeStr(manifest.updatedAt),
          },
        });

        this.stats.docs += 1;
        this.stats.tokens += tokCapped.length;
      }

      this.domains[domain] = {
        manifest,
        docs,
        index: tokenToDocs,
        stats: {
          docs: docs.length,
          tokens: tokenToDocs.size,
          domainVersion: safeStr(manifest.domainVersion),
          updatedAt: safeStr(manifest.updatedAt),
        },
      };
    } catch (e) {
      this.loadErrors.push({ domain: dirName, where: "_loadDomain", error: safeStr(e && e.message) || "error" });
    }
  }

  // Provide list of known domains
  listDomains() {
    return Object.keys(this.domains);
  }

  // Stats snapshot (safe for /diag)
  getStats() {
    const out = {
      ok: true,
      rootDir: this.rootDir,
      loadedAt: this.loadedAt,
      domains: {},
      totals: Object.assign({}, this.stats),
      errors: this.loadErrors.slice(0, 50),
    };

    for (const d of Object.keys(this.domains)) {
      const b = this.domains[d];
      out.domains[d] = b && b.stats ? Object.assign({}, b.stats) : { docs: 0, tokens: 0 };
    }

    return out;
  }

  // Lightweight query:
  // - domain optional (if null => search all)
  // - lane optional (boost docs tagged for lane)
  // - text query (user text)
  // Returns a compact bundle with facts/hints/sources (Marion-ready)
  query(opts) {
    opts = opts && typeof opts === "object" ? opts : {};

    const qText = safeStr(opts.text).trim();
    const lane = normalizeLane(opts.lane);
    const domain = normalizeDomain(opts.domain); // if empty => all

    const limit = clampInt(opts.limit, 1, 25, 8);
    const charMax = clampInt(opts.charMax, 400, 12000, 1800);

    const factsMax = clampInt(opts.factsMax, 1, 30, 10);
    const hintsMax = clampInt(opts.hintsMax, 1, 30, 8);

    const qTokens = unique(tokenize(qText)).slice(0, 32);

    // If no tokens, return hints-only (lane-aware)
    if (!qTokens.length) {
      return this.getHints({ domain, lane, hintsMax });
    }

    const domainKeys = domain ? [domain] : Object.keys(this.domains);

    // Score docId -> score
    const scored = new Map();

    // Choose index strategy
    if (!domain) {
      // global index faster for "all"
      for (const t of qTokens) {
        const set = this.globalIndex.get(t);
        if (!set) continue;
        for (const docId of set) {
          scored.set(docId, (scored.get(docId) || 0) + 1);
        }
      }
    } else {
      for (const d of domainKeys) {
        const bucket = this.domains[d];
        if (!bucket) continue;
        for (const t of qTokens) {
          const set = bucket.index.get(t);
          if (!set) continue;
          for (const docId of set) {
            scored.set(docId, (scored.get(docId) || 0) + 1);
          }
        }
      }
    }

    // Materialize doc objects and apply boosts
    const candidates = [];
    for (const [docId, baseScore] of scored.entries()) {
      const parts = docId.split(":");
      const d = parts[0];
      const bucket = this.domains[d];
      if (!bucket) continue;

      // docId format: domain:seq (find by id)
      // Build a quick map? We keep it simple; docs per domain are typically small.
      const doc = bucket.docs.find((x) => x.id === docId);
      if (!doc) continue;

      let s = baseScore;

      // Lane boost: if doc tags include lane
      if (lane && lane !== "general" && Array.isArray(doc.laneTags) && doc.laneTags.includes(lane)) s += 2;

      // Title boost if contains a query token
      const titleLower = doc.title.toLowerCase();
      for (const t of qTokens) {
        if (titleLower.includes(t)) { s += 1; break; }
      }

      // Light length penalty (prefer concise docs for small bundles)
      const len = safeStr(doc.text).length;
      if (len > 14000) s -= 1;

      candidates.push({ doc, score: s });
    }

    candidates.sort((a, b) => b.score - a.score);

    // Build bundle from top docs until char budget is reached
    const sources = [];
    const facts = [];
    const hints = new Set();

    let usedChars = 0;

    for (const item of candidates.slice(0, Math.max(limit * 3, 12))) {
      if (sources.length >= limit) break;

      const doc = item.doc;

      // Strong snippet: first N chars + a small middle sample if huge
      const head = doc.text.slice(0, 3200);
      const mid = doc.text.length > 9000 ? ("\n" + doc.text.slice(4500, 5200)) : "";
      const snippet = (head + mid).slice(0, 3600);

      const fh = textToFactsAndHints(snippet, { factsMax, hintsMax });

      sources.push({
        domain: doc.domain,
        title: doc.title,
        file: doc.filename,
        lanes: doc.laneTags.slice(0, 8),
        score: item.score,
      });

      for (const f of fh.facts) {
        if (facts.length >= factsMax) break;
        const addLen = f.length + 2;
        if (usedChars + addLen > charMax) break;
        facts.push(f);
        usedChars += addLen;
      }

      for (const h of fh.hints) {
        if (hints.size >= hintsMax) break;
        hints.add(h);
      }

      if (usedChars >= charMax || facts.length >= factsMax) break;
    }

    // Marion/chatEngine-friendly bundle
    return {
      ok: true,
      domain: domain || "all",
      lane: lane || null,
      queryTokens: qTokens.slice(0, 16),
      knowledgeFacts: facts,
      knowledgeHints: Array.from(hints),
      sources,
      meta: {
        charMax,
        factsMax,
        hintsMax,
        loadedAt: this.loadedAt,
        domainsLoaded: Object.keys(this.domains).length,
      },
    };
  }

  // Hints-only (useful when no query text)
  getHints(opts) {
    opts = opts && typeof opts === "object" ? opts : {};
    const lane = normalizeLane(opts.lane);
    const domain = normalizeDomain(opts.domain);
    const hintsMax = clampInt(opts.hintsMax, 1, 30, 8);

    const domainKeys = domain ? [domain] : Object.keys(this.domains);

    const out = [];
    const sources = [];

    for (const d of domainKeys) {
      const bucket = this.domains[d];
      if (!bucket) continue;

      // pick first few docs, prefer lane-tagged docs
      const docs = bucket.docs.slice();
      if (lane && lane !== "general") {
        docs.sort((a, b) => {
          const aa = a.laneTags && a.laneTags.includes(lane) ? 1 : 0;
          const bb = b.laneTags && b.laneTags.includes(lane) ? 1 : 0;
          return bb - aa;
        });
      }

      for (const doc of docs.slice(0, 6)) {
        const toks = unique(tokenize(doc.title + " " + doc.text.slice(0, 900)));
        for (const t of toks) {
          if (out.length >= hintsMax) break;
          if (!out.includes(t)) out.push(t);
        }
        sources.push({ domain: doc.domain, title: doc.title, file: doc.filename });
        if (out.length >= hintsMax) break;
      }
      if (out.length >= hintsMax) break;
    }

    return {
      ok: true,
      domain: domain || "all",
      lane: lane || null,
      knowledgeFacts: [],
      knowledgeHints: out.slice(0, hintsMax),
      sources: sources.slice(0, 6),
      meta: {
        hintsMax,
        loadedAt: this.loadedAt,
        domainsLoaded: Object.keys(this.domains).length,
      },
    };
  }
}

// -------------------------
// Singleton export helpers
// -------------------------
let _registry = null;

function getRegistry(rootDir) {
  if (!_registry) _registry = new KnowledgeRegistry(rootDir || DEFAULT_ROOT);
  return _registry;
}

// Initialize (recommended at server boot)
function initKnowledgeRegistry(opts) {
  opts = opts && typeof opts === "object" ? opts : {};
  const rootDir = opts.rootDir || DEFAULT_ROOT;
  const r = getRegistry(rootDir);

  // Allow optional eager load control
  const eager = opts.eager !== false; // default true
  if (eager) return r.loadAll();

  // Not loaded yet, but registry exists
  return { ok: true, rootDir: r.rootDir, loadedAt: r.loadedAt, domains: r.listDomains(), stats: r.getStats() };
}

module.exports = {
  KnowledgeRegistry,
  getRegistry,
  initKnowledgeRegistry,
  // exported for alignment + tests
  normalizeLane,
  normalizeDomain,
};
