"use strict";

/**
 * Scripts/build_top10_by_year_from_wiki_cache_1950_2025.js
 *
 * Build Top10 store from Wikipedia per-year cache:
 *   Data/wikipedia/charts/year_end_hot100_<YEAR>.json
 *
 * Output:
 *   Data/top10_by_year_v1.json
 *
 * Baseline: Top 10 = first 10 VALID song rows from each year cache.
 * Canonical rule: pos is ALWAYS 1–10 by order (index-based) AFTER cleaning/filtering.
 * Optional overlay: if Data/top10_input_rows.json contains rows for a year,
 * it can overwrite those entries (higher authority).
 *
 * NEW: Per-year anomaly/diff logger to spot Wikipedia cache issues automatically:
 *   Data/top10_wiki_anomalies.json
 *   Data/top10_wiki_anomalies_summary.txt
 *
 * Usage:
 *   node Scripts/build_top10_by_year_from_wiki_cache_1950_2025.js
 */

const fs = require("fs");
const path = require("path");

const YEAR_START = 1950;
const YEAR_END = 2025;

const DATA_DIR = path.resolve(__dirname, "..", "Data");
const WIKI_DIR = path.join(DATA_DIR, "wikipedia", "charts");
const OUT_FILE = path.join(DATA_DIR, "top10_by_year_v1.json");

const TOP10_INPUT_ROWS = path.join(DATA_DIR, "top10_input_rows.json"); // optional overlay

// anomaly outputs
const ANOMALY_JSON = path.join(DATA_DIR, "top10_wiki_anomalies.json");
const ANOMALY_TXT = path.join(DATA_DIR, "top10_wiki_anomalies_summary.txt");

const CHART_NAME = "Billboard Year-End Hot 100 (Wikipedia cache)";

function readJson(fp) {
  return JSON.parse(fs.readFileSync(fp, "utf8"));
}
function writeJson(fp, obj) {
  fs.writeFileSync(fp, JSON.stringify(obj, null, 2), "utf8");
}
function writeText(fp, txt) {
  fs.writeFileSync(fp, String(txt || ""), "utf8");
}

function isNonEmptyString(x) {
  return typeof x === "string" && x.trim().length > 0;
}

function normStr(x) {
  return String(x || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripWrappingQuotes(s) {
  let x = normStr(s);
  // Remove outer quotes repeatedly ("..."), (‘...’), (“...”)
  for (let i = 0; i < 3; i++) {
    const m = x.match(/^["'“”‘’](.*)["'“”‘’]$/);
    if (!m) break;
    x = normStr(m[1]);
  }
  return x;
}

function stripCitations(s) {
  // Remove common wiki footnote markers like [1], [a], [12]
  return normStr(String(s || "").replace(/\[[^\]]*?\]/g, ""));
}

function toInt(x) {
  const n = parseInt(String(x || "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function getField(row, keys) {
  if (!row || typeof row !== "object") return "";
  for (const k of keys) {
    if (row[k] != null) return row[k];
  }
  return "";
}

function normalizeTitleArtist(rawTitle, rawArtist) {
  const originalTitle = normStr(rawTitle);
  const originalArtist = normStr(rawArtist);

  let title = stripWrappingQuotes(stripCitations(rawTitle));
  let artist = stripWrappingQuotes(stripCitations(rawArtist));

  // Final normalize
  title = normStr(title);
  artist = normStr(artist);

  return {
    title,
    artist,
    originalTitle,
    originalArtist,
  };
}

function isHeaderLikeToken(x) {
  const t = normStr(x).toLowerCase();
  return (
    t === "title" ||
    t === "song" ||
    t === "single" ||
    t === "track" ||
    t === "artist" ||
    t === "artist(s)" ||
    t === "artists" ||
    t === "performer" ||
    t === "№" ||
    t === "no" ||
    t === "no." ||
    t === "rank" ||
    t === "pos" ||
    t === "position"
  );
}

function isHeaderRow(title, artist) {
  const t = normStr(title).toLowerCase();
  const a = normStr(artist).toLowerCase();
  if (!t && !a) return true;

  // Exact header pairs
  if (isHeaderLikeToken(t) && isHeaderLikeToken(a)) return true;

  // Common “Title / Artist(s)” pattern
  const tIsTitle = t === "title" || t === "song" || t === "single" || t === "track";
  const aIsArtist = a === "artist" || a === "artist(s)" || a === "artists" || a === "performer";
  if (tIsTitle && (aIsArtist || !a)) return true;
  if (aIsArtist && (!t || tIsTitle)) return true;

  return false;
}

function isJunkRow(title, artist) {
  const t = normStr(title);
  const a = normStr(artist);
  if (!t && !a) return true;
  if (isHeaderRow(t, a)) return true;

  // Kill obvious corrupted rows where artist == title
  if (t && a && t.toLowerCase() === a.toLowerCase()) return true;

  // Too-short junk that’s not plausible content
  if (t.length < 2 || a.length < 2) return true;

  return false;
}

function loadWikiYear(year) {
  const fp = path.join(WIKI_DIR, `year_end_hot100_${year}.json`);
  if (!fs.existsSync(fp)) return { rows: null, filePath: fp };

  let j;
  try {
    j = readJson(fp);
  } catch (e) {
    return { rows: [], filePath: fp, parseError: safeErr(e) };
  }
  return { rows: Array.isArray(j.rows) ? j.rows : [], filePath: fp };
}

function safeErr(e) {
  const msg = e && e.message ? String(e.message) : String(e || "");
  return msg.slice(0, 400);
}

// ---------------------------------------
// anomaly logger (per-year diff telemetry)
// ---------------------------------------
function initYearAnom(year, filePath) {
  return {
    year,
    filePathRel: path.relative(process.cwd(), filePath),
    ok: false,

    // counts
    rowCount: 0,
    scanned: 0,
    picked: 0,

    // reasons
    headersDropped: 0,
    emptyDropped: 0,
    junkDropped: 0,
    titleEqArtistDropped: 0,
    dupDropped: 0,

    // normalization impact
    quoteStripHits: 0,
    citationStripHits: 0,
    heavyStripHits: 0,

    // rank / pos observations
    sourcePosPresent: 0,
    sourcePosMismatchTop10: 0,

    // structural issues
    parseError: "",
    missingFile: false,

    // top10 preview for debugging (kept small)
    top10: [],
    droppedSamples: [], // small sample list
    notes: [],
  };
}

function addDroppedSample(anom, kind, rawTitle, rawArtist, normTitle, normArtist, sourcePos) {
  if (anom.droppedSamples.length >= 8) return;
  anom.droppedSamples.push({
    kind,
    rawTitle: trunc(rawTitle, 90),
    rawArtist: trunc(rawArtist, 90),
    title: trunc(normTitle, 90),
    artist: trunc(normArtist, 90),
    sourcePos: sourcePos || undefined,
  });
}

function trunc(s, n) {
  const x = normStr(s);
  if (x.length <= n) return x;
  return x.slice(0, n - 1) + "…";
}

function stripScore(original, normalized) {
  // how much was removed by normalization (rough)
  const o = normStr(original);
  const z = normStr(normalized);
  if (!o) return 0;
  const diff = Math.max(0, o.length - z.length);
  return diff / Math.max(1, o.length);
}

// returns { top10, anom }
function buildTop10FromRowsWithAnoms(year, rows, filePath) {
  const anom = initYearAnom(year, filePath);

  if (!Array.isArray(rows)) rows = [];
  anom.rowCount = rows.length;

  if (rows.length < 10) {
    anom.notes.push("rows<10");
    return { top10: null, anom };
  }

  const picked = [];
  const seen = new Set();

  for (const r of rows) {
    anom.scanned++;

    const rawTitle = getField(r, ["title", "Title", "song", "Song", "single", "Single", "track", "Track"]);
    const rawArtist = getField(r, [
      "artist",
      "Artist",
      "artist(s)",
      "Artist(s)",
      "artists",
      "Artists",
      "performer",
      "Performer",
    ]);

    const { title, artist, originalTitle, originalArtist } = normalizeTitleArtist(rawTitle, rawArtist);

    // provenance only
    const sourcePos = toInt(getField(r, ["pos", "Pos", "position", "Position", "rank", "Rank", "№", "No.", "no"]));

    // normalization impact counters
    if (originalTitle !== title || originalArtist !== artist) {
      // detect which transform likely happened
      const hadQuote = /^[\s"'“”‘’]/.test(originalTitle) || /["'“”‘’]\s*$/.test(originalTitle);
      const hadCite = /\[[^\]]*?\]/.test(originalTitle) || /\[[^\]]*?\]/.test(originalArtist);
      if (hadQuote) anom.quoteStripHits++;
      if (hadCite) anom.citationStripHits++;

      const scoreT = stripScore(originalTitle, title);
      const scoreA = stripScore(originalArtist, artist);
      if (scoreT > 0.22 || scoreA > 0.22) anom.heavyStripHits++;
    }

    // empty
    if (!isNonEmptyString(title) || !isNonEmptyString(artist)) {
      anom.emptyDropped++;
      addDroppedSample(anom, "empty", rawTitle, rawArtist, title, artist, sourcePos);
      continue;
    }

    // header/junk
    if (isHeaderRow(title, artist)) {
      anom.headersDropped++;
      addDroppedSample(anom, "header", rawTitle, rawArtist, title, artist, sourcePos);
      continue;
    }

    if (title.toLowerCase() === artist.toLowerCase()) {
      anom.titleEqArtistDropped++;
      addDroppedSample(anom, "title_eq_artist", rawTitle, rawArtist, title, artist, sourcePos);
      continue;
    }

    if (isJunkRow(title, artist)) {
      anom.junkDropped++;
      addDroppedSample(anom, "junk", rawTitle, rawArtist, title, artist, sourcePos);
      continue;
    }

    // dedupe
    const key = `${title.toLowerCase()}@@${artist.toLowerCase()}`;
    if (seen.has(key)) {
      anom.dupDropped++;
      addDroppedSample(anom, "dupe", rawTitle, rawArtist, title, artist, sourcePos);
      continue;
    }
    seen.add(key);

    if (sourcePos) anom.sourcePosPresent++;

    picked.push({
      title,
      artist,
      ...(sourcePos ? { sourcePos } : {}),
    });

    if (picked.length >= 10) break;
  }

  anom.picked = picked.length;

  if (picked.length < 10) {
    anom.notes.push("picked<10_after_filter");
    return { top10: null, anom };
  }

  const top10 = picked.slice(0, 10).map((r, idx) => ({
    pos: idx + 1,
    title: r.title,
    artist: r.artist,
    ...(r.sourcePos ? { sourcePos: r.sourcePos } : {}),
  }));

  // rank mismatch observation (not fatal)
  for (let i = 0; i < top10.length; i++) {
    const it = top10[i];
    if (it.sourcePos && it.sourcePos !== it.pos) anom.sourcePosMismatchTop10++;
  }

  // Validate hard
  for (let i = 0; i < 10; i++) {
    const it = top10[i];
    if (it.pos !== i + 1) {
      anom.notes.push("pos_integrity_fail");
      return { top10: null, anom };
    }
    if (!isNonEmptyString(it.title) || !isNonEmptyString(it.artist)) {
      anom.notes.push("empty_in_top10");
      return { top10: null, anom };
    }
    if (isHeaderRow(it.title, it.artist)) {
      anom.notes.push("header_leaked_into_top10");
      return { top10: null, anom };
    }
    if (it.title.toLowerCase() === it.artist.toLowerCase()) {
      anom.notes.push("title_eq_artist_in_top10");
      return { top10: null, anom };
    }
  }

  anom.ok = true;
  anom.top10 = top10.map((x) => ({
    pos: x.pos,
    title: trunc(x.title, 80),
    artist: trunc(x.artist, 80),
    ...(x.sourcePos ? { sourcePos: x.sourcePos } : {}),
  }));

  return { top10, anom };
}

function buildOverlayMapFromInputRows() {
  if (!fs.existsSync(TOP10_INPUT_ROWS)) return new Map();

  let j;
  try {
    j = readJson(TOP10_INPUT_ROWS);
  } catch {
    return new Map();
  }

  const rows = Array.isArray(j) ? j : Array.isArray(j.rows) ? j.rows : [];
  const byYear = new Map();

  for (const r of rows) {
    const y = toInt(r.year);
    const pos = toInt(r.pos ?? r.position ?? r.rank);
    const rawTitle = r.title ?? r.song ?? r.single ?? r.track ?? r.Title ?? r.Song;
    const rawArtist =
      r.artist ?? r["artist(s)"] ?? r["Artist(s)"] ?? r.artists ?? r.performer ?? r.Artist;

    const { title, artist } = normalizeTitleArtist(rawTitle, rawArtist);

    if (!y || !pos || !isNonEmptyString(title) || !isNonEmptyString(artist)) continue;
    if (isHeaderRow(title, artist)) continue;
    if (title.toLowerCase() === artist.toLowerCase()) continue;

    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push({ pos, title, artist });
  }

  const out = new Map();
  for (const [y, items] of byYear.entries()) {
    const sorted = items
      .filter((it) => it.pos >= 1 && it.pos <= 10)
      .sort((a, b) => a.pos - b.pos);

    if (sorted.length >= 10) {
      out.set(
        y,
        sorted.slice(0, 10).map((it, idx) => ({
          pos: idx + 1,
          title: it.title,
          artist: it.artist,
          sourcePos: it.pos,
        }))
      );
    }
  }
  return out;
}

function formatSummaryTxt(anoms, meta) {
  const lines = [];
  lines.push("Top10 Wiki Cache Anomaly Summary");
  lines.push("=".repeat(34));
  lines.push(`GeneratedAt: ${meta.generatedAt}`);
  lines.push(`Years: ${meta.yearStart}-${meta.yearEnd}`);
  lines.push("");

  lines.push(`Missing files: ${meta.missingYears.length}`);
  if (meta.missingYears.length) lines.push(`  ${meta.missingYears.join(", ")}`);

  lines.push(`Weak years (couldn't build Top10): ${meta.weakYears.length}`);
  if (meta.weakYears.length) lines.push(`  ${meta.weakYears.join(", ")}`);

  lines.push(`Overlay overrides: ${meta.overlayUsedYears.length}`);
  if (meta.overlayUsedYears.length) lines.push(`  ${meta.overlayUsedYears.join(", ")}`);

  lines.push("");

  // top anomaly list
  const scored = anoms
    .filter((a) => a && a.year)
    .map((a) => {
      // heuristic severity score
      let s = 0;
      if (a.missingFile) s += 1000;
      if (a.parseError) s += 900;
      if (!a.ok) s += 500;
      s += a.headersDropped * 2;
      s += a.emptyDropped * 3;
      s += a.titleEqArtistDropped * 5;
      s += a.dupDropped * 1;
      s += a.heavyStripHits * 1;
      if (a.rowCount && a.rowCount < 50) s += 10; // suspiciously short tables
      return { a, score: s };
    })
    .sort((x, y) => y.score - x.score);

  lines.push("Most suspicious years (top 15):");
  const top = scored.slice(0, 15).map(({ a, score }) => {
    const tags = [];
    if (a.missingFile) tags.push("MISSING");
    if (a.parseError) tags.push("PARSE_ERR");
    if (!a.ok && !a.missingFile && !a.parseError) tags.push("WEAK");
    if (a.titleEqArtistDropped) tags.push("T=A");
    if (a.headersDropped) tags.push("HDR");
    if (a.emptyDropped) tags.push("EMPTY");
    if (a.dupDropped) tags.push("DUPE");
    if (a.heavyStripHits) tags.push("STRIP");
    return `  ${a.year}  score=${score}  rows=${a.rowCount}  picked=${a.picked}  drop(H:${a.headersDropped} E:${a.emptyDropped} T=A:${a.titleEqArtistDropped} D:${a.dupDropped})  ${tags.join("|")}`;
  });
  if (top.length) lines.push(...top);
  else lines.push("  (none)");

  lines.push("");
  lines.push("Tip: open Data/top10_wiki_anomalies.json for full per-year diff details.");
  lines.push("");

  return lines.join("\n");
}

function main() {
  if (!fs.existsSync(WIKI_DIR)) {
    console.error(`❌ Missing wiki cache dir: ${WIKI_DIR}`);
    process.exitCode = 1;
    return;
  }

  const overlay = buildOverlayMapFromInputRows();
  const years = {};
  const missing = [];
  const weak = [];

  const anoms = [];

  for (let y = YEAR_START; y <= YEAR_END; y++) {
    const yKey = String(y);

    // Always create a year key, even if empty (continuous 1950–2025)
    // Overlay wins (and we still log that override)
    if (overlay.has(y)) {
      years[yKey] = { year: y, chart: CHART_NAME, items: overlay.get(y) };
      const a = initYearAnom(y, path.join(WIKI_DIR, `year_end_hot100_${y}.json`));
      a.ok = true;
      a.notes.push("overlay_override_used");
      a.top10 = overlay.get(y).map((it) => ({
        pos: it.pos,
        title: trunc(it.title, 80),
        artist: trunc(it.artist, 80),
        ...(it.sourcePos ? { sourcePos: it.sourcePos } : {}),
      }));
      anoms.push(a);
      continue;
    }

    const loaded = loadWikiYear(y);

    if (loaded.rows === null) {
      missing.push(y);
      years[yKey] = { year: y, chart: CHART_NAME, items: [] };

      const a = initYearAnom(y, loaded.filePath);
      a.missingFile = true;
      a.ok = false;
      a.rowCount = 0;
      a.notes.push("missing_file");
      anoms.push(a);
      continue;
    }

    if (loaded.parseError) {
      weak.push(y);
      years[yKey] = { year: y, chart: CHART_NAME, items: [] };

      const a = initYearAnom(y, loaded.filePath);
      a.parseError = loaded.parseError;
      a.ok = false;
      a.rowCount = Array.isArray(loaded.rows) ? loaded.rows.length : 0;
      a.notes.push("parse_error");
      anoms.push(a);
      continue;
    }

    const { top10, anom } = buildTop10FromRowsWithAnoms(y, loaded.rows, loaded.filePath);

    if (!top10) {
      weak.push(y);
      years[yKey] = { year: y, chart: CHART_NAME, items: [] };
      anom.ok = false;
      anoms.push(anom);
      continue;
    }

    years[yKey] = { year: y, chart: CHART_NAME, items: top10 };
    anoms.push(anom);
  }

  const payload = {
    version: "top10_by_year_v1",
    chart: "Billboard Year-End Hot 100",
    source: "Wikipedia per-year cache (Data/wikipedia/charts) + optional overlay",
    generatedAt: new Date().toISOString(),
    meta: {
      yearStart: YEAR_START,
      yearEnd: YEAR_END,
      wikiDir: path.relative(process.cwd(), WIKI_DIR),
      overlayUsedYears: Array.from(overlay.keys()).sort((a, b) => a - b),
      missingYears: missing,
      weakYears: weak,
    },
    years,
  };

  // write Top10 output
  writeJson(OUT_FILE, payload);

  // write anomaly outputs
  const anomalyPayload = {
    generatedAt: payload.generatedAt,
    yearStart: YEAR_START,
    yearEnd: YEAR_END,
    wikiDir: payload.meta.wikiDir,
    overlayUsedYears: payload.meta.overlayUsedYears,
    missingYears: payload.meta.missingYears,
    weakYears: payload.meta.weakYears,
    notes: [
      "ok=true means a Top10 was successfully built for that year (or overlay used).",
      "Dropped counts are during scan/clean before collecting the first 10 valid rows.",
      "heavyStripHits indicates large title/artist normalization deltas (often citations/quotes/odd chars).",
    ],
    years: anoms,
  };

  writeJson(ANOMALY_JSON, anomalyPayload);
  writeText(ANOMALY_TXT, formatSummaryTxt(anoms, payload.meta));

  // console summary
  console.log("✅ Wrote:", path.relative(process.cwd(), OUT_FILE));
  console.log("✅ Anomalies:", path.relative(process.cwd(), ANOMALY_JSON));
  console.log("✅ Summary :", path.relative(process.cwd(), ANOMALY_TXT));

  console.log(
    "Years:",
    Object.keys(years).length,
    "Missing:",
    missing.length,
    "Weak:",
    weak.length,
    "Overlay:",
    payload.meta.overlayUsedYears.length
  );

  if (missing.length) console.log("Missing:", missing.join(", "));
  if (weak.length) console.log("Weak:", weak.join(", "));

  // show top 8 suspicious on console
  const scored = anoms
    .map((a) => {
      let s = 0;
      if (a.missingFile) s += 1000;
      if (a.parseError) s += 900;
      if (!a.ok) s += 500;
      s += a.titleEqArtistDropped * 5;
      s += a.emptyDropped * 3;
      s += a.headersDropped * 2;
      s += a.dupDropped * 1;
      s += a.heavyStripHits * 1;
      if (a.rowCount && a.rowCount < 50) s += 10;
      return { a, s };
    })
    .sort((x, y) => y.s - x.s)
    .slice(0, 8);

  console.log("Most suspicious years:");
  for (const { a, s } of scored) {
    const tags = [];
    if (a.missingFile) tags.push("MISSING");
    if (a.parseError) tags.push("PARSE_ERR");
    if (!a.ok && !a.missingFile && !a.parseError) tags.push("WEAK");
    if (a.titleEqArtistDropped) tags.push("T=A");
    if (a.headersDropped) tags.push("HDR");
    if (a.emptyDropped) tags.push("EMPTY");
    if (a.dupDropped) tags.push("DUPE");
    if (a.heavyStripHits) tags.push("STRIP");
    console.log(
      `  ${a.year} score=${s} rows=${a.rowCount} picked=${a.picked} drop(H:${a.headersDropped} E:${a.emptyDropped} T=A:${a.titleEqArtistDropped} D:${a.dupDropped}) ${tags.join("|")}`
    );
  }
}

main();
