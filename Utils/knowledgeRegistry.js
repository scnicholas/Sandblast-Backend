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
 * v1.0.0 (REGISTRY CORE++++: manifest load + compact retrieval + char budgets + fail-open)
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

function tokenize(text) {
  const s = safeStr(text).toLowerCase();
  // keep alnum + a few separators
  const parts = s.split(/[^a-z0-9]+/g).filter(Boolean);
  // tiny stoplist to keep scoring sane
  const stop = new Set([
    "the","a","an","and","or","to","of","in","on","for","with","at","by","from",
    "is","are","was","were","be","been","being","it","this","that","these","those",
    "as","if","then","than","but","so","we","you","i","they","he","she","them","us"
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

// Extract text from arbitrary JSON doc into a compact string
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
        if (Array.isArray(it.bullets)) absorbArray(it.bullets);
        if (Array.isArray(it.examples)) absorbArray(it.examples);
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
  return chunks.join("\n").slice(0, 20000);
}

// Build “facts” and “hints” from text: tiny heuristic chunking
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
    // avoid mega-lines
    const clipped = clean.length > 220 ? clean.slice(0, 217) + "…" : clean;
    facts.push(clipped);
  }

  // Hints: keywords from the strongest lines
  const tokens = tokenize(lines.slice(0, 40).join(" "));
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

    this.domains = {}; // domain -> { manifest, docs:[], index: Map(token -> Set(docId)) }
    this.loadedAt = 0;
    this.loadErrors = [];
  }

  // Load all domains found under rootDir
  loadAll() {
    this.domains = {};
    this.loadErrors = [];

    const domainDirs = listDirs(this.rootDir);
    for (const dirName of domainDirs) {
      this._loadDomain(dirName);
    }

    this.loadedAt = Date.now();
    return {
      ok: true,
      domains: Object.keys(this.domains),
      loadedAt: this.loadedAt,
      errors: this.loadErrors.slice(0, 50),
    };
  }

  // Load one domain (dirName == domain folder)
  _loadDomain(dirName) {
    try {
      const absDomain = path.join(this.rootDir, dirName);
      const manifestPath = path.join(absDomain, "manifest.json");
      const manifest = tryReadJson(manifestPath);

      if (!manifest || typeof manifest !== "object") {
        // fail-open: skip silently but record
        this.loadErrors.push({ domain: dirName, where: "manifest", error: "missing_or_bad_manifest" });
        return;
      }

      const domain = safeStr(manifest.domain || dirName).trim() || dirName;
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
        const laneTags = Array.isArray(doc.lanes) ? doc.lanes.map((x) => safeStr(x).toLowerCase()) : [];
        const text = flattenDocText(doc);

        const tok = unique(tokenize(title + " " + text));
        for (const t of tok) {
          let set = tokenToDocs.get(t);
          if (!set) tokenToDocs.set(t, (set = new Set()));
          set.add(id);
        }

        docs.push({
          id,
          domain,
          filename,
          title,
          laneTags,
          text,
          meta: {
            domainVersion: safeStr(manifest.domainVersion),
            updatedAt: safeStr(manifest.updatedAt),
          },
        });
      }

      this.domains[domain] = {
        manifest,
        docs,
        index: tokenToDocs,
      };
    } catch (e) {
      this.loadErrors.push({ domain: dirName, where: "_loadDomain", error: safeStr(e && e.message) || "error" });
    }
  }

  // Provide list of known domains
  listDomains() {
    return Object.keys(this.domains);
  }

  // Lightweight query:
  // - domain optional (if null => search all)
  // - lane optional (boost docs tagged for lane)
  // - text query (user text)
  // Returns a compact bundle with facts/hints/sources
  query(opts) {
    opts = opts && typeof opts === "object" ? opts : {};
    const qText = safeStr(opts.text).trim();
    const lane = safeStr(opts.lane).toLowerCase().trim();
    const domain = safeStr(opts.domain).trim(); // if empty => all
    const limit = clampInt(opts.limit, 1, 25, 8);
    const charMax = clampInt(opts.charMax, 400, 12000, 1800);

    const factsMax = clampInt(opts.factsMax, 1, 30, 10);
    const hintsMax = clampInt(opts.hintsMax, 1, 30, 8);

    const qTokens = unique(tokenize(qText));
    if (!qTokens.length) {
      // If no tokens, return lane hints only (if requested)
      return this.getHints({ domain, lane, hintsMax });
    }

    const domainKeys = domain ? [domain] : Object.keys(this.domains);
    const scored = new Map(); // docId -> score

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

    // Materialize doc objects and apply lane boosts
    const candidates = [];
    for (const [docId, baseScore] of scored.entries()) {
      const parts = docId.split(":");
      const d = parts[0];
      const bucket = this.domains[d];
      if (!bucket) continue;
      const doc = bucket.docs.find((x) => x.id === docId);
      if (!doc) continue;

      let s = baseScore;

      // Lane boost: if doc tags include lane
      if (lane && Array.isArray(doc.laneTags) && doc.laneTags.includes(lane)) s += 2;

      // Title boost if contains a query token
      const titleLower = doc.title.toLowerCase();
      for (const t of qTokens) {
        if (titleLower.includes(t)) { s += 1; break; }
      }

      candidates.push({ doc, score: s });
    }

    candidates.sort((a, b) => b.score - a.score);

    // Build bundle from top docs until char budget is reached
    const sources = [];
    const facts = [];
    const hints = new Set();

    let usedChars = 0;

    for (const item of candidates.slice(0, limit * 2)) {
      if (sources.length >= limit) break;

      const doc = item.doc;
      const snippet = doc.text.slice(0, 3000);

      const fh = textToFactsAndHints(snippet, { factsMax, hintsMax });

      // Add source
      sources.push({
        domain: doc.domain,
        title: doc.title,
        file: doc.filename,
        score: item.score,
      });

      // Add facts until budget
      for (const f of fh.facts) {
        if (facts.length >= factsMax) break;
        const addLen = f.length + 2;
        if (usedChars + addLen > charMax) break;
        facts.push(f);
        usedChars += addLen;
      }

      // Hints
      for (const h of fh.hints) {
        if (hints.size >= hintsMax) break;
        hints.add(h);
      }

      if (usedChars >= charMax || facts.length >= factsMax) break;
    }

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
      },
    };
  }

  // Hints-only (useful when no query text)
  getHints(opts) {
    opts = opts && typeof opts === "object" ? opts : {};
    const lane = safeStr(opts.lane).toLowerCase().trim();
    const domain = safeStr(opts.domain).trim();
    const hintsMax = clampInt(opts.hintsMax, 1, 30, 8);

    const domainKeys = domain ? [domain] : Object.keys(this.domains);

    const out = [];
    for (const d of domainKeys) {
      const bucket = this.domains[d];
      if (!bucket) continue;

      // pick first few docs, prefer lane-tagged docs
      const docs = bucket.docs.slice();
      if (lane) {
        docs.sort((a, b) => {
          const aa = a.laneTags && a.laneTags.includes(lane) ? 1 : 0;
          const bb = b.laneTags && b.laneTags.includes(lane) ? 1 : 0;
          return bb - aa;
        });
      }

      for (const doc of docs.slice(0, 6)) {
        const toks = unique(tokenize(doc.title + " " + doc.text.slice(0, 800)));
        for (const t of toks) {
          if (out.length >= hintsMax) break;
          if (!out.includes(t)) out.push(t);
        }
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
      sources: [],
      meta: {
        hintsMax,
        loadedAt: this.loadedAt,
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
  return r.loadAll();
}

module.exports = {
  KnowledgeRegistry,
  getRegistry,
  initKnowledgeRegistry,
};
