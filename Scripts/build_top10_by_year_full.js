"use strict";

/**
 * Scripts/build_top10_by_year_full.js
 *
 * Builds Data/top10_by_year_v1.json with ALL years present 1950–2024.
 * - Tries to populate Top 10 per year from multiple input packs in Data/
 * - Supports common shapes:
 *    1) { years: { "1960": { items:[{pos,title,artist}] } } }
 *    2) { byYear: { "1960": [...] } } or { "1960": [...] }
 *    3) { rows: [ {year, rank/pos, title, artist} ] }
 *    4) [ {year, rank/pos, title, artist} ]  (array of rows)
 * - Avoids bad fallback: if a pack looks year-indexed and year missing => returns null (no decade bleed)
 *
 * Usage:
 *   node Scripts/build_top10_by_year_full.js
 *   node Scripts/build_top10_by_year_full.js --out Data/top10_by_year_v1.json
 *   node Scripts/build_top10_by_year_full.js --in Data/top10_input_rows.json --in Data/some_pack.json
 *   node Scripts/build_top10_by_year_full.js --auto   (default) scans Data/ for likely packs
 *
 * Output shape matches your existing pack:
 *  {
 *    version, chart, source, generatedAt, meta:{...},
 *    years: { "1950":{year,chart,items:[{pos,title,artist}], available, provenance?...}, ... }
 *  }
 */

const fs = require("fs");
const path = require("path");

const YEAR_MIN = 1950;
const YEAR_MAX = 2024;

const DEFAULT_OUT = path.join(process.cwd(), "Data", "top10_by_year_v1.json");
const DATA_DIR = path.join(process.cwd(), "Data");

function nowISO() {
  return new Date().toISOString();
}

function isPlainObject(x) {
  return (
    !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null)
  );
}

function isArray(x) {
  return Array.isArray(x);
}

function normText(v) {
  return String(v == null ? "" : v).trim();
}

function clampYear(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const y = Math.trunc(n);
  if (y < YEAR_MIN || y > YEAR_MAX) return null;
  return y;
}

function parseArgs(argv) {
  const out = { in: [], out: DEFAULT_OUT, auto: true, chart: "Billboard Year-End Hot 100" };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out" && argv[i + 1]) {
      out.out = argv[++i];
      continue;
    }
    if (a === "--in" && argv[i + 1]) {
      out.in.push(argv[++i]);
      out.auto = false;
      continue;
    }
    if (a === "--auto") {
      out.auto = true;
      continue;
    }
    if (a === "--chart" && argv[i + 1]) {
      out.chart = argv[++i];
      continue;
    }
  }
  return out;
}

function safeReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return { ok: true, json: parsed, rawBytes: Buffer.byteLength(raw, "utf8") };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

function listJsonFilesRecursive(dir, cap = 2000) {
  const out = [];
  const stack = [dir];

  while (stack.length && out.length < cap) {
    const d = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const ent of entries) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) stack.push(p);
      else if (ent.isFile() && ent.name.toLowerCase().endsWith(".json")) out.push(p);
      if (out.length >= cap) break;
    }
  }
  return out;
}

function looksLikeCandidateFile(fp) {
  const n = path.basename(fp).toLowerCase();
  // include your known file + likely year-end packs
  if (n.includes("top10_by_year")) return true;
  if (n.includes("top10_input")) return true;
  if (n.includes("yearend") || n.includes("year-end")) return true;
  if (n.includes("hot100") || n.includes("hot_100")) return true;
  if (n.includes("billboard") && (n.includes("singles") || n.includes("year"))) return true;
  if (n.includes("wikipedia") && (n.includes("yearend") || n.includes("year-end") || n.includes("hot"))) return true;
  return false;
}

function unwrapPackValue(v, depth = 0) {
  if (depth > 3) return v;
  if (!v) return v;
  if (isArray(v)) return v;
  if (!isPlainObject(v)) return v;

  const cands = ["data", "json", "value", "content", "pack", "parsed", "payload", "blob"];
  for (const k of cands) {
    if (Object.prototype.hasOwnProperty.call(v, k) && v[k] != null) {
      return unwrapPackValue(v[k], depth + 1);
    }
  }
  return v;
}

function parseRank(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = normText(v);
  const m = s.match(/^\s*(\d{1,3})\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

function splitTitleArtist(s) {
  const t = normText(s);
  const seps = [" — ", " – ", " - ", ": "];
  for (const sep of seps) {
    const idx = t.indexOf(sep);
    if (idx > 0 && idx < t.length - sep.length) {
      return { title: t.slice(0, idx).trim(), artist: t.slice(idx + sep.length).trim(), split: true };
    }
  }
  return { title: t, artist: "", split: false };
}

function rowHasYearLikeField(r) {
  if (!isPlainObject(r)) return false;
  const y = r.year ?? r.Year ?? r.y ?? r.yr ?? r.Y ?? r.dateYear ?? r.releaseYear;
  return !!clampYear(y);
}

function normalizeItemFromAny(r) {
  // returns {pos,title,artist} or null
  if (!r) return null;

  if (typeof r === "string") {
    // "1. Song — Artist" or "Song — Artist"
    const s = r.trim().replace(/^\s*#?\s*/, "");
    const m = s.match(/^(\d{1,3})\s*[\.\)]\s*(.+)$/);
    const pos = m ? parseInt(m[1], 10) : null;
    const rest = m ? m[2] : s;
    const ta = splitTitleArtist(rest);
    const title = normText(ta.title);
    const artist = normText(ta.artist);
    if (!title) return null;
    return { pos, title, artist };
  }

  if (isPlainObject(r)) {
    const pos = parseRank(r.pos ?? r.position ?? r.rank ?? r.Rank ?? r["#"] ?? r.no ?? r.number);
    let title = normText(r.title ?? r.song ?? r.Song ?? r.track ?? r.name);
    let artist = normText(r.artist ?? r.Artist ?? r.by ?? r.performer ?? r.performerName);

    if (!title) title = normText(r.entry ?? r.Item ?? r.single ?? r.value ?? r.text ?? r.line);
    if (title && !artist) {
      const ta = splitTitleArtist(title);
      if (ta.split && ta.artist) {
        title = ta.title;
        artist = ta.artist;
      }
    }
    if (!title) return null;

    return { pos, title, artist };
  }

  return null;
}

function normalizeTop10FromList(list) {
  if (!isArray(list)) return null;

  const items = [];
  for (const r of list) {
    const it = normalizeItemFromAny(r);
    if (!it) continue;
    items.push(it);
  }

  // Keep only ranks 1..10 if ranks exist
  const ranked = items.filter((x) => typeof x.pos === "number" && x.pos >= 1 && x.pos <= 10);
  if (ranked.length >= 10) {
    ranked.sort((a, b) => a.pos - b.pos);
    const byPos = new Map();
    for (const it of ranked) if (!byPos.has(it.pos)) byPos.set(it.pos, it);
    const top10 = [];
    for (let i = 1; i <= 10; i++) {
      if (!byPos.has(i)) return null;
      top10.push(byPos.get(i));
    }
    return top10;
  }

  // If no usable rank field, accept first 10 as-is (but only if list is clearly a single-year list)
  const unranked = items.filter((x) => x && x.title);
  if (unranked.length >= 10) {
    const top10 = unranked.slice(0, 10).map((x, i) => ({
      pos: i + 1,
      title: x.title,
      artist: x.artist || "",
    }));
    return top10;
  }

  return null;
}

function extractYearListFromPack(pack, year) {
  const y = clampYear(year);
  if (!y) return null;

  const p = unwrapPackValue(pack);

  // Shape 1: {years:{ "1960": {items:[...] } } }
  if (isPlainObject(p) && isPlainObject(p.years)) {
    const yk = String(y);
    const slot = p.years[yk] || p.years[y];
    if (slot && isPlainObject(slot)) {
      const items = slot.items || slot.top10 || slot.list || slot.entries || slot.songs;
      if (isArray(items)) return items;
    }
  }

  // Shape 2: {byYear:{ "1960":[...] }} or { "1960":[...] }
  if (isPlainObject(p)) {
    const yk = String(y);

    if (isArray(p[yk]) || isArray(p[y])) return p[yk] || p[y];

    const byYear = p.byYear || p.years || p.data;
    if (isPlainObject(byYear) && (isArray(byYear[yk]) || isArray(byYear[y]))) return byYear[yk] || byYear[y];
  }

  // Shape 3: {rows:[{year,...}]} or {data:[{year,...}]}
  if (isPlainObject(p)) {
    const rows = p.rows || p.data || p.items;
    if (isArray(rows)) {
      const hasYearish = rows.some(rowHasYearLikeField);
      const filtered = rows.filter((r) => {
        if (!isPlainObject(r)) return false;
        const ry = clampYear(r.year ?? r.Year ?? r.y ?? r.yr ?? r.Y);
        return ry === y;
      });
      if (filtered.length) return filtered;
      if (hasYearish) return null; // IMPORTANT: no fallback if it looks multi-year
    }
  }

  // Shape 4: raw array of rows
  if (isArray(p)) {
    const hasYearish = p.some(rowHasYearLikeField);
    const filtered = p.filter((r) => {
      if (!isPlainObject(r)) return false;
      const ry = clampYear(r.year ?? r.Year ?? r.y ?? r.yr ?? r.Y);
      return ry === y;
    });
    if (filtered.length) return filtered;
    if (hasYearish) return null;
    // If it's a plain list (no year fields), caller can decide whether to accept it (we won’t by default)
  }

  return null;
}

function extractTop10ForYearFromPack(pack, year) {
  const rowsOrList = extractYearListFromPack(pack, year);
  if (!rowsOrList) return null;

  // If we got rows with year fields, those rows might be rank/title/artist rows
  // Or they might be a wrapper row with nested list under top10/songs/etc.
  if (isArray(rowsOrList) && rowsOrList.length && isPlainObject(rowsOrList[0])) {
    // If each row is already an item (rank/title/artist), normalize directly
    const top10A = normalizeTop10FromList(rowsOrList);
    if (top10A) return top10A;

    // Otherwise, try to find nested list in first matching row
    for (const r of rowsOrList) {
      if (!isPlainObject(r)) continue;
      const nested =
        r.items || r.top10 || r.top_10 || r.list || r.entries || r.songs || r.chart || r.lines;
      if (isArray(nested)) {
        const top10B = normalizeTop10FromList(nested);
        if (top10B) return top10B;
      }
    }
  }

  // If list of strings/items
  const top10 = normalizeTop10FromList(rowsOrList);
  if (top10) return top10;

  return null;
}

function ensureAllYearsSkeleton(chart) {
  const years = Object.create(null);
  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
    years[String(y)] = {
      year: y,
      chart,
      items: [],
      available: false,
    };
  }
  return years;
}

function mergeTop10IntoYearSlot(slot, top10, provenance) {
  if (!slot || !isPlainObject(slot)) return;

  // only accept clean 10
  if (!isArray(top10) || top10.length !== 10) return;

  slot.items = top10.map((x) => ({
    pos: x.pos,
    title: normText(x.title),
    artist: normText(x.artist),
  }));
  slot.available = true;
  slot.provenance = provenance || null;
}

function autoDiscoverInputs() {
  if (!fs.existsSync(DATA_DIR)) return [];
  const all = listJsonFilesRecursive(DATA_DIR, 2500);
  const cand = all.filter(looksLikeCandidateFile);

  // Prefer “source”/input first, then larger yearend packs
  cand.sort((a, b) => {
    const an = path.basename(a).toLowerCase();
    const bn = path.basename(b).toLowerCase();

    const aBoost =
      (an.includes("top10_input") ? -30 : 0) +
      (an.includes("top10_by_year") ? -20 : 0) +
      (an.includes("wikipedia") ? -10 : 0);

    const bBoost =
      (bn.includes("top10_input") ? -30 : 0) +
      (bn.includes("top10_by_year") ? -20 : 0) +
      (bn.includes("wikipedia") ? -10 : 0);

    if (aBoost !== bBoost) return aBoost - bBoost;

    // bigger files later (often more complete year-end tables)
    const as = safeStatSize(a);
    const bs = safeStatSize(b);
    return bs - as;
  });

  return cand;
}

function safeStatSize(fp) {
  try {
    return fs.statSync(fp).size || 0;
  } catch (_) {
    return 0;
  }
}

function main() {
  const args = parseArgs(process.argv);

  const inputs = args.auto ? autoDiscoverInputs() : args.in.slice();
  if (!inputs.length) {
    console.error("[build_top10] No input files found. Put packs in Data/ or pass --in <file>.");
    process.exit(1);
  }

  const chart = args.chart;

  const outYears = ensureAllYearsSkeleton(chart);

  const meta = {
    inputFiles: inputs.map((p) => path.relative(process.cwd(), p)),
    filesTried: 0,
    filesReadOk: 0,
    filesReadFail: 0,
    readErrors: [],
    yearsBuilt: 0,
    yearsComplete10: 0,
    yearsMissing: 0,
    provenanceCounts: Object.create(null),
  };

  // For each year, walk inputs in priority order and take the first clean Top 10
  for (let year = YEAR_MIN; year <= YEAR_MAX; year++) {
    let filled = false;

    for (const fp of inputs) {
      meta.filesTried++;

      const r = safeReadJson(fp);
      if (!r.ok) {
        meta.filesReadFail++;
        meta.readErrors.push({ file: path.relative(process.cwd(), fp), error: r.error });
        continue;
      }
      meta.filesReadOk++;

      const top10 = extractTop10ForYearFromPack(r.json, year);
      if (top10 && top10.length === 10) {
        const prov = {
          file: path.relative(process.cwd(), fp),
          method: "extractTop10ForYearFromPack",
        };
        mergeTop10IntoYearSlot(outYears[String(year)], top10, prov);
        filled = true;

        meta.provenanceCounts[prov.file] = (meta.provenanceCounts[prov.file] || 0) + 1;
        break;
      }
    }

    meta.yearsBuilt++;
    if (filled) meta.yearsComplete10++;
    else meta.yearsMissing++;
  }

  const output = {
    version: "top10_by_year_v1",
    chart,
    source: args.auto ? "auto-scan Data/ (candidate packs)" : "explicit --in inputs",
    generatedAt: nowISO(),
    meta,
    years: outYears,
  };

  // Write
  const outPath = path.isAbsolute(args.out) ? args.out : path.join(process.cwd(), args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");

  console.log(`[build_top10] Wrote: ${path.relative(process.cwd(), outPath)}`);
  console.log(
    `[build_top10] Years: ${YEAR_MIN}-${YEAR_MAX} | complete10=${meta.yearsComplete10} | missing=${meta.yearsMissing}`
  );
  console.log(`[build_top10] Inputs used: ${inputs.length}`);
}

main();
