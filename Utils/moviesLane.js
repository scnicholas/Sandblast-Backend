"use strict";

/**
 * Utils/moviesLane.js
 *
 * Phase 0 Movies Lane (Acquisition Shortlist + Feasibility Filter)
 * + Phase 0 PD Database Lookup (Internet Archive + curated listings)
 *
 * Collect minimal fields:
 *  - format: movie | series
 *  - era: 1970s | 1980s | late 1970s–late 1980s etc.
 *  - genres: comma list
 *  - budgetModel: "rev-share/no-MG" | "MG"
 *  - territory: Canada | United States | Worldwide
 *  - distribution: FAST | AVOD | FAST+AVOD | etc.
 *  - sources: Filmhub | Bitmax | other (optional)
 *
 * PD/Metadata mode:
 *  - Recognizes archive.org URLs and identifiers
 *  - Recognizes known titles from a local Phase0 DB JSON file
 *  - Returns safe rights language (candidate/verified/unknown)
 *
 * Adds:
 *  - "add this" ingestion:
 *      - when lastIdentifier/lastUrl exists in session.movies.catalog,
 *        create a normalized record (candidate only) and persist to JSON DB
 *  - "list phase 0" quick sanity view
 *
 * Returns:
 *  - reply (tight, forward-moving)
 *  - followUps (array of {label,send}) ALWAYS
 *  - sessionPatch (lane + movies.phase0 + optional movies.catalog)
 */

const fs = require("fs");
const path = require("path");

/* =========================
   Basics
========================= */

function cleanText(s) {
  return String(s || "").replace(/\u200B/g, "").replace(/\s+/g, " ").trim();
}

function lc(s) {
  return cleanText(s).toLowerCase();
}

function hasAny(text, arr) {
  const t = lc(text);
  return arr.some((k) => t.includes(String(k).toLowerCase()));
}

function nowIso() {
  return new Date().toISOString();
}

/* =========================
   Phase 0 DB (local JSON)
   - optional
========================= */

const DB_REL_DEFAULT = "Data/movies/movies_phase0.json";
let DB_CACHE = null;
let DB_META = { loaded: false, rel: DB_REL_DEFAULT, abs: null, error: null, mtimeMs: 0 };

function safeReadJson(abs) {
  try {
    if (!fs.existsSync(abs)) return null;
    const raw = fs.readFileSync(abs, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function ensureDirForFile(absPath) {
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeJson(abs, obj) {
  ensureDirForFile(abs);
  fs.writeFileSync(abs, JSON.stringify(obj, null, 2), "utf8");
}

function loadDbOnce(relOverride) {
  if (DB_CACHE) return DB_CACHE;

  const rel = String(relOverride || process.env.MOVIES_PHASE0_DB_REL || DB_REL_DEFAULT);
  const abs = path.resolve(process.cwd(), rel);
  DB_META = { loaded: false, rel, abs, error: null, mtimeMs: 0 };

  try {
    if (!fs.existsSync(abs)) {
      DB_META.error = "FILE_MISSING";
      return null;
    }
    const stat = fs.statSync(abs);
    DB_META.mtimeMs = Number(stat && stat.mtimeMs ? stat.mtimeMs : 0);

    const json = safeReadJson(abs);
    if (!json || typeof json !== "object") {
      DB_META.error = "INVALID_JSON";
      return null;
    }

    // Expect { items: [...] }
    const items = Array.isArray(json.items) ? json.items : [];
    DB_CACHE = {
      version: json.version || "movies_phase0",
      last_updated: json.last_updated || null,
      items,
    };
    DB_META.loaded = true;
    return DB_CACHE;
  } catch (e) {
    DB_META.error = String(e && e.message ? e.message : e);
    return null;
  }
}

function persistDb(db) {
  const rel = String(process.env.MOVIES_PHASE0_DB_REL || DB_REL_DEFAULT);
  const abs = path.resolve(process.cwd(), rel);

  try {
    const payload = {
      version: (db && db.version) || "movies_phase0_v1",
      last_updated: nowIso(),
      items: Array.isArray(db && db.items) ? db.items : [],
    };

    writeJson(abs, payload);

    // Refresh cache/meta
    DB_CACHE = payload;
    DB_META = { loaded: true, rel, abs, error: null, mtimeMs: Date.now() };

    return { ok: true, rel, abs, count: payload.items.length };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e), rel, abs };
  }
}

function normalizeTitleKey(title) {
  return lc(title)
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractArchiveIdentifierFromUrl(url) {
  const u = cleanText(url);
  if (!u) return null;
  const m = u.match(/archive\.org\/details\/([^/?#]+)/i);
  return m ? cleanText(decodeURIComponent(m[1])) : null;
}

function looksLikeArchiveIdentifier(token) {
  const t = cleanText(token);
  if (!t) return false;
  if (t.length < 3 || t.length > 120) return false;
  return /^[a-z0-9][a-z0-9._-]+$/i.test(t);
}

function findItemInDbByIdentifier(db, identifier) {
  if (!db || !Array.isArray(db.items) || !identifier) return null;
  const id = cleanText(identifier);

  for (const it of db.items) {
    const sources = Array.isArray(it.sources) ? it.sources : [];
    for (const s of sources) {
      if (!s) continue;
      const ident = cleanText(s.identifier || "");
      if (ident && ident.toLowerCase() === id.toLowerCase()) return it;

      const url = cleanText(s.url || "");
      const urlIdent = extractArchiveIdentifierFromUrl(url);
      if (urlIdent && urlIdent.toLowerCase() === id.toLowerCase()) return it;
    }
  }
  return null;
}

function findItemInDbByTitle(db, title) {
  if (!db || !Array.isArray(db.items) || !title) return null;
  const key = normalizeTitleKey(title);

  for (const it of db.items) {
    const k2 = normalizeTitleKey(it.title || "");
    if (k2 && k2 === key) return it;
  }
  return null;
}

/* =========================
   Ingest helpers ("add this")
========================= */

function isAddThis(text) {
  const t = lc(text);
  return /^(add this|add it|save this|ingest this|add to db|add record)\b/.test(t);
}

function titleFromIdentifier(identifier) {
  const id = cleanText(identifier);
  if (!id) return "";
  return id
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function makePhase0Id(seed) {
  const raw = cleanText(seed);
  const slug = raw
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `PH0-${slug || "item"}`;
}

function buildCandidateItemFromIa(identifier, url) {
  const ident = cleanText(identifier);
  const srcUrl = cleanText(url) || (ident ? `https://archive.org/details/${encodeURIComponent(ident)}` : "");
  const titleGuess = titleFromIdentifier(ident) || ident || "Unknown title";

  return {
    id: makePhase0Id(`ia-${ident || titleGuess}`),
    title: titleGuess,
    year: null,
    type: "unknown",
    genres: [],
    summary: "",
    rights: {
      status: "candidate_public_domain",
      verified: false,
      confidence: "unknown",
      basis: "unverified_source_listing",
      notes: "Candidate only. Verify via Sandblast PD Kit before distribution.",
    },
    sources: [
      {
        provider: "internet_archive",
        identifier: ident || "",
        url: srcUrl || "",
      },
    ],
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

function ingestLastSeen(session, db) {
  const sess = session || {};
  const cat = sess.movies && sess.movies.catalog ? sess.movies.catalog : {};

  const lastIdentifier = cleanText(cat.lastIdentifier || "");
  const lastUrl = cleanText(cat.lastUrl || "");
  const lastTitle = cleanText(cat.lastTitle || "");

  const key = lastIdentifier || lastTitle;
  if (!key) return { ok: false, error: "NO_LAST_SEEN" };

  const existing = lastIdentifier
    ? findItemInDbByIdentifier(db, lastIdentifier)
    : findItemInDbByTitle(db, lastTitle || key);

  if (existing) return { ok: true, already: true, item: existing };

  const newItem = lastIdentifier
    ? buildCandidateItemFromIa(lastIdentifier, lastUrl)
    : {
        id: makePhase0Id(`title-${key}`),
        title: key,
        year: null,
        type: "unknown",
        genres: [],
        summary: "",
        rights: {
          status: "candidate_public_domain",
          verified: false,
          confidence: "unknown",
          basis: "unverified_source_listing",
          notes: "Candidate only. Verify via Sandblast PD Kit before distribution.",
        },
        sources: [],
        created_at: nowIso(),
        updated_at: nowIso(),
      };

  const items = Array.isArray(db && db.items) ? db.items : [];
  items.push(newItem);

  const out = persistDb({ version: (db && db.version) || "movies_phase0_v1", items });
  if (!out.ok) return { ok: false, error: out.error || "WRITE_FAILED" };

  return { ok: true, already: false, item: newItem, write: out };
}

function listPhase0Reply(db, limit = 12) {
  const items = db && Array.isArray(db.items) ? db.items : [];
  if (!items.length) return "Phase 0 DB is empty. Paste an archive.org/details link, then say “add this”.";

  const n = Math.max(1, Math.min(50, Number(limit) || 12));
  const tail = items.slice(-n);

  const lines = [];
  lines.push(`Phase 0 DB (latest ${tail.length}):`);
  tail.forEach((it, idx) => {
    const title = cleanText(it.title || "Untitled");
    const year = it.year != null ? String(it.year) : "—";
    const src = Array.isArray(it.sources) ? it.sources[0] : null;
    const ident = src && src.identifier ? cleanText(src.identifier) : "";
    lines.push(`${idx + 1}. ${title} (${year})${ident ? ` — IA:${ident}` : ""}`);
  });
  lines.push("");
  lines.push("Next: paste another archive.org link, or say “search title” / “search ia id”.");
  return lines.join("\n");
}

/* =========================
   Intent detection
========================= */

function detectMoviesIntent(text) {
  const t = lc(text);
  if (!t) return { hit: false, confidence: 0 };

  const strong = [
    "license",
    "licensing",
    "rights",
    "rightsholder",
    "acquire",
    "acquisition",
    "catalog",
    "distributor",
    "sales agent",
    "minimum guarantee",
    "mg",
    "rev share",
    "revenue share",
    "avod",
    "fast",
    "tvod",
    "svod",
    "roku",
    "ott",
    "territory",
    "term",
    "deliverables",
    "filmhub",
    "bitmax",
    "public domain",
    "pd",
    "archive.org",
    "internet archive",
  ];

  const typeSignals = ["movie", "movies", "film", "films", "series", "tv show", "tv shows", "episodes", "season"];
  const musicSignals = ["top 10", "top10", "story moment", "micro moment", "billboard", "hot 100", "rpm", "song", "artist"];

  const isMovieish = hasAny(t, strong) || hasAny(t, typeSignals);
  const isMusicish = hasAny(t, musicSignals);

  if (isMusicish && !hasAny(t, strong)) return { hit: false, confidence: 0 };
  if (isMovieish) return { hit: true, confidence: hasAny(t, strong) ? 0.9 : 0.7 };

  return { hit: false, confidence: 0 };
}

/* =========================
   FollowUps safety
========================= */

function normalizeFollowUps(followUps) {
  const safe = Array.isArray(followUps) ? followUps : [];
  const cleaned = safe
    .filter((x) => x && typeof x === "object")
    .map((x) => ({ label: cleanText(x.label), send: cleanText(x.send) }))
    .filter((x) => x.label && x.send);

  if (cleaned.length) return cleaned;

  return [
    { label: "Add this", send: "add this" },
    { label: "List Phase 0", send: "list phase 0" },
    { label: "Search by title", send: "search title" },
    { label: "Search by IA ID", send: "search ia id" },
    { label: "Movie", send: "movie" },
    { label: "Series", send: "series" },
    { label: "Filmhub", send: "filmhub" },
    { label: "Bitmax", send: "bitmax" },
  ];
}

/* =========================
   Acquisition fields (Phase 0)
========================= */

function pickMissing(fields) {
  const required = ["format", "era", "genres", "budgetModel", "territory", "distribution"];
  return required.filter((k) => !fields[k]);
}

function extractFields(text, prevFields) {
  const t = lc(text);
  const fields = Object.assign({}, prevFields || {});

  if (!fields.format) {
    if (t.includes("series") || t.includes("tv show") || t.includes("episodes") || t.includes("season")) fields.format = "series";
    else if (t.includes("movie") || t.includes("film")) fields.format = "movie";
  }

  if (!fields.era) {
    if (t.includes("late 70") || t.includes("late-70")) fields.era = "late 1970s";
    else if (t.includes("late 80") || t.includes("late-80")) fields.era = "late 1980s";
    else if (t.includes("70s") || t.includes("1970")) fields.era = "1970s";
    else if (t.includes("80s") || t.includes("1980")) fields.era = "1980s";
    else if (t.includes("late 70s") && t.includes("late 80s")) fields.era = "late 1970s–late 1980s";
  }

  if (!fields.genres) {
    const g = [];
    if (t.includes("crime")) g.push("crime");
    if (t.includes("detective")) g.push("detective");
    if (t.includes("comedy")) g.push("comedy");
    if (t.includes("thriller")) g.push("thriller");
    if (t.includes("action")) g.push("action");
    if (t.includes("horror")) g.push("horror");
    if (t.includes("sci-fi") || t.includes("scifi") || t.includes("science fiction")) g.push("sci-fi");
    if (g.length) fields.genres = g.join(", ");
  }

  if (!fields.budgetModel) {
    if (t.includes("no mg") || t.includes("no minimum guarantee") || t.includes("rev share") || t.includes("revenue share")) {
      fields.budgetModel = "rev-share/no-MG";
    } else if (t.includes("mg") || t.includes("minimum guarantee")) {
      fields.budgetModel = "MG";
    }
  }

  if (!fields.territory) {
    if (t.includes("worldwide") || t.includes("ww")) fields.territory = "Worldwide";
    else if (t.includes("canada") || /\bca\b/.test(t)) fields.territory = "Canada";
    else if (t.includes("united states") || /\busa\b/.test(t) || /\bus\b/.test(t)) fields.territory = "United States";
  }

  if (!fields.distribution) {
    const d = [];
    if (t.includes("fast")) d.push("FAST");
    if (t.includes("avod")) d.push("AVOD");
    if (t.includes("tvod")) d.push("TVOD");
    if (t.includes("svod")) d.push("SVOD");
    if (d.length) fields.distribution = d.join("+");
  }

  if (!fields.sources) {
    const s = [];
    if (t.includes("filmhub")) s.push("Filmhub");
    if (t.includes("bitmax")) s.push("Bitmax");
    if (s.length) fields.sources = s.join(", ");
  }

  return fields;
}

/* =========================
   Phase 0 numeric picker
========================= */

function parseNumericChoice(text) {
  const t = lc(text);
  const m = t.match(/\b(option\s*)?([1-4])[\.\)\:]?\b/);
  if (!m) return null;
  const n = Number(m[2]);
  return Number.isFinite(n) ? n : null;
}

function choiceToAction(n) {
  if (n === 1) return { label: "Filmhub only", send: "filmhub only", plan: "filmhub_only" };
  if (n === 2) return { label: "Bitmax only", send: "bitmax only", plan: "bitmax_only" };
  if (n === 3) return { label: "Mix sources", send: "mix sources", plan: "mix_sources" };
  if (n === 4) return { label: "UK focus", send: "uk focus", plan: "uk_focus" };
  return null;
}

/* =========================
   PD / Catalog reply builder
========================= */

function formatRightsLine(rights) {
  const r = rights && typeof rights === "object" ? rights : {};
  const status = cleanText(r.status || "unknown");
  const conf = cleanText(r.confidence || "unknown");
  const basis = cleanText(r.basis || "unknown");
  return `Rights: ${status} (confidence: ${conf}; basis: ${basis})`;
}

function buildCatalogReply(item) {
  if (!item || typeof item !== "object") return null;

  const title = cleanText(item.title || "Unknown title");
  const year = item.year != null ? String(item.year) : "Unknown year";
  const type = cleanText(item.type || "unknown_type");
  const genres = Array.isArray(item.genres) ? item.genres.filter(Boolean).join(", ") : cleanText(item.genres || "");
  const sum = cleanText(item.summary || "");
  const rightsLine = formatRightsLine(item.rights);

  const src = Array.isArray(item.sources) ? item.sources[0] : null;
  const srcUrl = src && src.url ? cleanText(src.url) : "";
  const srcIdent = src && src.identifier ? cleanText(src.identifier) : "";

  const lines = [];
  lines.push("Public-domain catalog (Phase 0) — match found.");
  lines.push(`• Title: ${title} (${year})`);
  lines.push(`• Type: ${type}`);
  if (genres) lines.push(`• Genres: ${genres}`);
  if (sum) lines.push(`• Summary: ${sum}`);
  lines.push(`• ${rightsLine}`);
  if (srcIdent) lines.push(`• IA Identifier: ${srcIdent}`);
  if (srcUrl) lines.push(`• Source: ${srcUrl}`);
  lines.push("");
  lines.push("Next step: say “verify rights” (PD Kit), or “add 5 more” to expand the Phase 0 catalog.");

  return lines.join("\n");
}

function buildCatalogFollowUps() {
  return normalizeFollowUps([
    { label: "Add this", send: "add this" },
    { label: "Verify rights", send: "verify rights" },
    { label: "Add 5 more", send: "add 5 more" },
    { label: "List Phase 0", send: "list phase 0" },
    { label: "Search by title", send: "search title" },
    { label: "Search by IA ID", send: "search ia id" },
    { label: "Movie", send: "movie" },
    { label: "Series", send: "series" },
  ]);
}

/* =========================
   Phase 0 acquisition reply builder
========================= */

function buildReply(fields, missing, plan) {
  if (!missing.length) {
    return [
      "Movies Phase 0 locked.",
      `• Format: ${fields.format}`,
      `• Era: ${fields.era}`,
      `• Genres: ${fields.genres}`,
      `• Budget model: ${fields.budgetModel}`,
      `• Territory: ${fields.territory}`,
      `• Distribution: ${fields.distribution}`,
      fields.sources ? `• Sources: ${fields.sources}` : null,
      plan ? `• Shortlist plan: ${plan.replace(/_/g, " ")}` : null,
      "",
      "Next: pick one so I generate a 10–15 title shortlist:",
      "1) Filmhub only  2) Bitmax only  3) Mix sources  4) UK focus",
      "Or paste an archive.org/details link/title to switch into PD catalog lookup.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const ask = [];
  if (missing.includes("format")) ask.push("Format: movie or series?");
  if (missing.includes("era")) ask.push("Era: 1970s or 1980s (or late 70s–late 80s)?");
  if (missing.includes("genres")) ask.push("Genres: crime/detective/comedy (pick 1–3)?");
  if (missing.includes("budgetModel")) ask.push("Budget model: rev-share/no-MG, or MG?");
  if (missing.includes("territory")) ask.push("Territory: Canada, US, or Worldwide?");
  if (missing.includes("distribution")) ask.push("Distribution: FAST, AVOD, or both?");

  return [
    "Movies Phase 0 — quick lock-in.",
    ...ask,
    "",
    "Reply in one line like:",
    "“series | late 70s–80s | crime, detective | rev-share/no-MG | Canada | FAST+AVOD”",
    "Or paste an archive.org/details link/title to pull Phase 0 metadata.",
  ].join("\n");
}

function buildFollowUps(fields, missing, locked) {
  if (missing.length) {
    return normalizeFollowUps([
      { label: "Movie", send: "movie" },
      { label: "Series", send: "series" },
      { label: "1970s", send: "1970s" },
      { label: "1980s", send: "1980s" },
      { label: "Crime/Detective", send: "crime detective" },
      { label: "Comedy", send: "comedy" },
      { label: "Rev-share (No MG)", send: "rev share no mg" },
      { label: "Canada", send: "Canada" },
      { label: "FAST+AVOD", send: "FAST AVOD" },
    ]);
  }

  return normalizeFollowUps([
    { label: "1) Filmhub only", send: "1" },
    { label: "2) Bitmax only", send: "2" },
    { label: "3) Mix sources", send: "3" },
    { label: "4) UK focus", send: "4" },
    { label: "Generate shortlist", send: "generate phase 0 shortlist" },
    { label: "List Phase 0", send: "list phase 0" },
    { label: "Search IA ID", send: "search ia id" },
    { label: "Search title", send: "search title" },
  ]);
}

/* =========================
   Main handler
========================= */

function handleChat({ text, session }) {
  const input = cleanText(text);
  const sess = session || {};
  const prevPhase0 = sess.movies && sess.movies.phase0 ? sess.movies.phase0 : {};
  const prevCatalog = sess.movies && sess.movies.catalog ? sess.movies.catalog : {};

  // Load DB (or create in-memory empty db if missing)
  const db = loadDbOnce() || { version: "movies_phase0_v1", items: [] };

  // Quick commands
  if (/^list\s+phase\s*0\b/i.test(input) || /^list\b/i.test(input)) {
    const reply = listPhase0Reply(db, 12);
    const followUps = buildCatalogFollowUps();
    const sessionPatch = {
      lane: "movies",
      movies: {
        phase0: { ...prevPhase0 },
        catalog: {
          ...prevCatalog,
          dbLoaded: !!(DB_META && DB_META.loaded),
          dbRel: DB_META ? DB_META.rel : DB_REL_DEFAULT,
          dbError: DB_META ? DB_META.error : null,
        },
      },
    };
    return { reply, followUps, sessionPatch };
  }

  // Ingest flow
  if (isAddThis(input)) {
    const ing = ingestLastSeen(sess, db);

    const reply = ing.ok
      ? ing.already
        ? [
            "Phase 0 DB — already stored.",
            `• Title: ${cleanText(ing.item && ing.item.title) || "Unknown"}`,
            "",
            "Next: paste the next archive.org link and say “add this”, or say “list phase 0”.",
          ].join("\n")
        : [
            "Phase 0 DB — added.",
            `• Title: ${cleanText(ing.item && ing.item.title) || "Unknown"}`,
            "• Rights: candidate_public_domain (unverified)",
            "",
            "Next: paste the next archive.org link and say “add this”, or say “list phase 0”.",
          ].join("\n")
      : ing.error === "NO_LAST_SEEN"
      ? "I don’t have a last-seen archive.org item yet. Paste an archive.org/details link first."
      : `Phase 0 DB ingest failed: ${cleanText(ing.error) || "unknown error"}`;

    const followUps = buildCatalogFollowUps();
    const sessionPatch = {
      lane: "movies",
      movies: {
        phase0: { ...prevPhase0 },
        catalog: {
          ...prevCatalog,
          lastMatched: !!(ing.ok && ing.item),
          dbLoaded: !!(DB_META && DB_META.loaded),
          dbRel: DB_META ? DB_META.rel : DB_REL_DEFAULT,
          dbError: DB_META ? DB_META.error : null,
        },
      },
    };
    return { reply, followUps, sessionPatch };
  }

  // --- Catalog lookup triggers ---
  // 1) archive.org URL
  const urlIdent = extractArchiveIdentifierFromUrl(input);
  if (urlIdent) {
    const item = findItemInDbByIdentifier(db, urlIdent);

    const reply = item
      ? buildCatalogReply(item)
      : [
          "Public-domain catalog (Phase 0) — I can see the archive.org identifier, but it’s not in our local Phase 0 DB yet.",
          `• IA Identifier: ${urlIdent}`,
          "",
          "Next: say “add this” and I’ll create a normalized record, or “search title” if you have the exact name/year.",
        ].join("\n");

    const followUps = buildCatalogFollowUps();
    const sessionPatch = {
      lane: "movies",
      movies: {
        phase0: { ...prevPhase0 },
        catalog: {
          lastQuery: input,
          lastUrl: input,
          lastIdentifier: urlIdent,
          lastTitle: item ? item.title : titleFromIdentifier(urlIdent),
          lastMatched: !!item,
          dbLoaded: !!(DB_META && DB_META.loaded),
        },
      },
    };

    return { reply, followUps, sessionPatch };
  }

  // 2) direct identifier token (BehindGreenLights)
  if (looksLikeArchiveIdentifier(input) && input.length <= 80 && !input.includes(" ")) {
    const item = findItemInDbByIdentifier(db, input);

    const reply = item
      ? buildCatalogReply(item)
      : [
          "Public-domain catalog (Phase 0) — identifier received, but not found in the local DB yet.",
          `• IA Identifier: ${input}`,
          "",
          "Next: paste the full archive.org/details/ link so I can capture richer metadata, or say “add this”.",
        ].join("\n");

    const followUps = buildCatalogFollowUps();
    const sessionPatch = {
      lane: "movies",
      movies: {
        phase0: { ...prevPhase0 },
        catalog: {
          lastQuery: input,
          lastUrl: `https://archive.org/details/${encodeURIComponent(input)}`,
          lastIdentifier: input,
          lastTitle: item ? item.title : titleFromIdentifier(input),
          lastMatched: !!item,
          dbLoaded: !!(DB_META && DB_META.loaded),
        },
      },
    };

    return { reply, followUps, sessionPatch };
  }

  // 3) title lookup (best-effort) if DB exists and user asks about a known title
  if (db && db.items && /[a-z]/i.test(input) && input.length >= 4) {
    const maybeTitle = input
      .replace(/is\s+this\s+in\s+public\s+domain\??/i, "")
      .replace(/is\s+this\s+public\s+domain\??/i, "")
      .trim();

    const item = findItemInDbByTitle(db, maybeTitle) || findItemInDbByTitle(db, input);
    if (item) {
      const reply = buildCatalogReply(item);
      const followUps = buildCatalogFollowUps();
      const sessionPatch = {
        lane: "movies",
        movies: {
          phase0: { ...prevPhase0 },
          catalog: {
            lastQuery: input,
            lastUrl: "",
            lastIdentifier: "",
            lastTitle: item.title || "",
            lastMatched: true,
            dbLoaded: !!(DB_META && DB_META.loaded),
          },
        },
      };
      return { reply, followUps, sessionPatch };
    }
  }

  // --- Acquisition Phase 0 flow ---
  const fields = extractFields(input, prevPhase0);
  const missing = pickMissing(fields);
  const locked = missing.length === 0;

  // Handle numeric selection once locked (your “1.” message)
  let plan = cleanText(prevPhase0.plan || "");
  const n = parseNumericChoice(input);
  if (locked && n) {
    const action = choiceToAction(n);
    if (action) plan = action.plan;
  }

  const reply = buildReply(fields, missing, plan);
  const followUps = buildFollowUps(fields, missing, locked);

  const sessionPatch = {
    lane: "movies",
    movies: {
      phase0: {
        ...fields,
        missing,
        plan: plan || "",
      },
      catalog: {
        dbLoaded: !!(DB_META && DB_META.loaded),
        dbRel: DB_META ? DB_META.rel : DB_REL_DEFAULT,
        dbError: DB_META ? DB_META.error : null,
      },
    },
  };

  return { reply, followUps, sessionPatch };
}

module.exports = {
  detectMoviesIntent,
  handleChat,
};
