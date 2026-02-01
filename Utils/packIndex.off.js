"use strict";

/**
 * Utils/packIndex.off.js
 * Unified Pack Index (UPI) — one authoritative registry of available packs.
 *
 * Goals:
 * ✅ Detect packs from JSON files / folders (best-effort)
 * ✅ Normalize into a single index Nyx can reason about
 * ✅ Cache results + provide refresh for hot reload / debugging
 */

const fs = require("fs");
const path = require("path");

let _CACHE = null;
let _CACHE_TS = 0;
const CACHE_TTL_MS = 60_000; // 60s (safe; adjust anytime)

function safeReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const obj = JSON.parse(raw);
    return { ok: true, obj };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function statFile(p) {
  try { return fs.statSync(p); } catch { return null; }
}

function listJsonFiles(dir) {
  try {
    if (!exists(dir)) return [];
    const items = fs.readdirSync(dir);
    return items
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

/**
 * Adjust these candidates to match your repo.
 * I included common patterns you've used: Data/Nyx, Data, Data/Packs, etc.
 */
const CANDIDATES = [
  // Top 10 candidates
  { id: "top10_music", kind: "top10", domain: "music", paths: ["Data/top10_music.json", "Data/Nyx/top10_music.json", "Data/Packs/top10_music.json"] },
  { id: "top10_movies", kind: "top10", domain: "movies", paths: ["Data/top10_movies.json", "Data/Nyx/top10_movies.json", "Data/Packs/top10_movies.json"] },

  // Movie packs candidates (collections / playlists / bundles)
  { id: "movie_packs", kind: "packs", domain: "movies", dirPaths: ["Data/Movies", "Data/Nyx/Movies", "Data/Packs/Movies", "Data/movie_packs"] },

  // Sponsor packs candidates
  { id: "sponsor_packs", kind: "packs", domain: "sponsors", dirPaths: ["Data/Sponsors", "Data/Nyx/Sponsors", "Data/Packs/Sponsors", "Data/sponsor_packs"] },

  // General packs directory (catch-all)
  { id: "packs_generic", kind: "packs", domain: "generic", dirPaths: ["Data/Packs", "Data/Nyx/Packs"] },
];

function normalizePackMeta({ id, kind, domain, sourcePath, obj, count, note }) {
  return {
    id,
    kind,              // "top10" | "packs" | "generic"
    domain,            // "music" | "movies" | "sponsors" | "generic"
    available: true,
    sourcePath,
    count: typeof count === "number" ? count : null,
    meta: {
      title: (obj && (obj.title || obj.name)) ? String(obj.title || obj.name) : null,
      updatedAt: (() => {
        const st = statFile(sourcePath);
        return st ? st.mtime.toISOString() : null;
      })(),
      note: note || null,
    }
  };
}

function buildPackIndex() {
  const now = Date.now();

  const index = {
    ok: true,
    builtAt: new Date(now).toISOString(),
    ttlMs: CACHE_TTL_MS,
    packs: {},          // by id
    groups: {           // convenience groupings for UI/logic
      top10: [],
      movies: [],
      sponsors: [],
      generic: [],
    },
    errors: [],
  };

  // 1) explicit file candidates
  for (const c of CANDIDATES) {
    if (c.paths && c.paths.length) {
      let found = null;
      for (const rel of c.paths) {
        const p = path.resolve(process.cwd(), rel);
        if (exists(p)) { found = p; break; }
      }
      if (found) {
        const r = safeReadJson(found);
        if (!r.ok) {
          index.errors.push({ id: c.id, path: found, error: r.error });
          continue;
        }
        const obj = r.obj;
        const count = Array.isArray(obj) ? obj.length
          : Array.isArray(obj.items) ? obj.items.length
          : Array.isArray(obj.packs) ? obj.packs.length
          : Array.isArray(obj.top10) ? obj.top10.length
          : null;

        const meta = normalizePackMeta({
          id: c.id, kind: c.kind, domain: c.domain,
          sourcePath: found, obj, count
        });
        index.packs[c.id] = meta;
      }
    }

    // 2) directory candidates
    if (c.dirPaths && c.dirPaths.length) {
      let foundDir = null;
      for (const rel of c.dirPaths) {
        const p = path.resolve(process.cwd(), rel);
        if (exists(p) && statFile(p) && statFile(p).isDirectory()) { foundDir = p; break; }
      }
      if (foundDir) {
        const jsonFiles = listJsonFiles(foundDir);

        // represent a directory as a pack “container”
        const meta = {
          id: c.id,
          kind: c.kind,
          domain: c.domain,
          available: true,
          sourcePath: foundDir,
          count: jsonFiles.length,
          meta: {
            title: c.id,
            updatedAt: (() => {
              const st = statFile(foundDir);
              return st ? st.mtime.toISOString() : null;
            })(),
            note: "directory container",
          },
          children: jsonFiles.map((fp) => ({
            file: fp,
            name: path.basename(fp),
            mtime: (() => {
              const st = statFile(fp);
              return st ? st.mtime.toISOString() : null;
            })()
          }))
        };

        index.packs[c.id] = meta;
      }
    }
  }

  // groupings
  for (const [id, p] of Object.entries(index.packs)) {
    if (!p || !p.available) continue;

    if (p.kind === "top10") index.groups.top10.push(id);
    if (p.domain === "movies") index.groups.movies.push(id);
    if (p.domain === "sponsors") index.groups.sponsors.push(id);
    if (p.domain === "generic") index.groups.generic.push(id);
  }

  // stable ordering
  for (const k of Object.keys(index.groups)) index.groups[k].sort();

  return index;
}

function getPackIndex({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && _CACHE && (now - _CACHE_TS) < CACHE_TTL_MS) return _CACHE;

  _CACHE = buildPackIndex();
  _CACHE_TS = now;
  return _CACHE;
}

function refreshPackIndex() {
  return getPackIndex({ forceRefresh: true });
}

module.exports = {
  getPackIndex,
  refreshPackIndex,
};
