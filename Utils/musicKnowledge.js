"use strict";

/**
 * Utils/musicKnowledge.js
 *
 * v2.3.0
 * CHART-ROOT-SINGLE-SOURCE + FLEXIBLE-YEAR-FILE-RESOLUTION + TOP10-FROM-TOP100 + FORENSIC-NORMALIZATION
 */

const fs = require("fs");
const path = require("path");

const KNOWLEDGE_VERSION = "musicKnowledge v2.3.1";
const LANE = "music";
const YEAR_MIN = 1950;
const YEAR_MAX = 2025;
const TOP10_REQUIRED_COUNT = 10;
const YEAREND_MODE = "excerpt";
const CHART_DEFAULT = "Billboard Year-End Hot 100";
const DEFAULT_WINDOWS_CHART_ROOT = String.raw`C:\Users\User\Desktop\sandblast backend\Data\chart`;

let _musicMomentsMod;
let _chartRootsCache = null;
let _top10FileMetaCache = null;
let _top10StoreCache = { mtimeMs: 0, store: null, file: "" };

function getMusicMomentsMod() {
  if (_musicMomentsMod !== undefined) return _musicMomentsMod;
  try {
    const mod = require("./musicMoments");
    _musicMomentsMod = mod && typeof mod.getMoment === "function" ? mod : null;
  } catch (_) {
    _musicMomentsMod = null;
  }
  return _musicMomentsMod;
}

function safeStr(v) { return v == null ? "" : String(v); }
function cleanText(v) { return safeStr(v).replace(/\s+/g, " ").trim(); }
function lower(v) { return cleanText(v).toLowerCase(); }
function isObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function uniq(arr) { return Array.from(new Set((Array.isArray(arr) ? arr : []).filter(Boolean))); }
function safeStat(file) { try { return fs.statSync(file); } catch (_) { return null; } }
function safeReadJSON(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const clean = raw && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    return JSON.parse(clean);
  } catch (_) { return null; }
}

function normalizeYear(year) {
  const digits = safeStr(year).replace(/[^\d]/g, "");
  if (digits.length !== 4) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < YEAR_MIN || n > YEAR_MAX) return null;
  return String(n);
}

function toIntYear(year) {
  const y = normalizeYear(year);
  if (!y) return null;
  const n = Number(y);
  return Number.isFinite(n) ? n : null;
}

function spokenYear(year) {
  const y = toIntYear(year);
  if (y == null) return "that year";
  if (y >= 1900 && y <= 1999) {
    const tail = y % 100;
    const head = 19;
    return tail === 0 ? "nineteen hundred" : `nineteen ${numberBelow100ToWords(tail)}`;
  }
  if (y >= 2000 && y <= 2009) {
    const tail = y % 2000;
    return tail === 0 ? "two thousand" : `two thousand ${numberBelow100ToWords(tail)}`;
  }
  if (y >= 2010 && y <= 2099) {
    const tail = y % 100;
    return tail === 0 ? "twenty hundred" : `twenty ${numberBelow100ToWords(tail)}`;
  }
  return String(y);
}

function numberBelow100ToWords(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return safeStr(n);
  const ones = ["zero","one","two","three","four","five","six","seven","eight","nine"];
  const teens = ["ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  if (num < 10) return ones[num];
  if (num < 20) return teens[num - 10];
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? `-${ones[num % 10]}` : "");
  return safeStr(num);
}

function cleanTitleArtifacts(v) {
  let out = cleanText(v);
  if (!out) return "";
  out = out.replace(/\\"/g, '"');
  out = out.replace(/\s*"\s*\/\s*"\s*/g, " / ");
  out = out.replace(/\s*“\s*\/\s*”\s*/g, " / ");
  return out.replace(/\s+/g, " ").trim();
}

function cleanArtistArtifacts(v) {
  return cleanText(v).replace(/\\"/g, '"').replace(/\s+/g, " ").trim();
}

function coercePos(rawPos, fallback) {
  const n = Number(rawPos);
  if (Number.isFinite(n) && n >= 1 && n <= 1000) return Math.trunc(n);
  return fallback;
}

function normalizeItem(raw, index) {
  const row = isObject(raw) ? raw : {};
  return {
    pos: coercePos(row.pos ?? row.rank ?? row.position ?? row.number ?? row.index, index + 1),
    title: cleanTitleArtifacts(row.title ?? row.song ?? row.name ?? row.track ?? row.label),
    artist: cleanArtistArtifacts(row.artist ?? row.artists ?? row.performer ?? row.by ?? row.band ?? row.act),
  };
}

function makePlaceholder(pos) { return { pos, title: "—", artist: "" }; }
function keySong(title, artist) { return `${lower(title)}||${lower(artist)}`; }

function dedupeExactSongs(items, meta) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    const key = keySong(item && item.title, item && item.artist);
    if (!key || key === "||") { out.push(item); continue; }
    if (seen.has(key)) {
      if (meta && Array.isArray(meta.warnings)) meta.warnings.push({ code: "DUPLICATE_SONG_IGNORED", title: item.title || "", artist: item.artist || "" });
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}

function buildTop10(rawItems, meta) {
  const normalized = Array.isArray(rawItems) ? rawItems.map(normalizeItem) : [];
  const cleaned = dedupeExactSongs(normalized, meta);
  const byPos = new Map();
  for (let i = 0; i < cleaned.length; i += 1) {
    const item = cleaned[i];
    const pos = coercePos(item.pos, i + 1);
    if (!byPos.has(pos)) byPos.set(pos, { pos, title: item.title || "", artist: item.artist || "" });
    else if (meta && Array.isArray(meta.warnings)) meta.warnings.push({ code: "DUPLICATE_POSITION", pos });
  }
  const items = [];
  for (let pos = 1; pos <= TOP10_REQUIRED_COUNT; pos += 1) {
    const found = byPos.get(pos);
    if (!found) {
      if (meta && Array.isArray(meta.warnings)) meta.warnings.push({ code: "MISSING_POSITION", pos });
      items.push(makePlaceholder(pos));
      continue;
    }
    items.push({ pos, title: found.title || "—", artist: found.artist || "" });
  }
  return items;
}

function preferredChartRoot() {
  const raw = cleanText(process.env.SB_MUSIC_CHART_ROOT || process.env.SB_MUSIC_DATA_ROOT || DEFAULT_WINDOWS_CHART_ROOT);
  if (!raw) return DEFAULT_WINDOWS_CHART_ROOT;
  if (/[\\/]Data$/i.test(raw)) return path.join(raw, "chart");
  return raw;
}

function chartRoots() {
  if (_chartRootsCache) return _chartRootsCache.slice();
  const cwd = process.cwd();
  const local = __dirname;
  const preferred = preferredChartRoot();
  const preferredDataRoot = /[\\/]chart$/i.test(preferred) ? path.resolve(preferred, "..") : preferred;
  const roots = uniq([
    preferred,
    path.join(preferredDataRoot, "chart"),
    preferredDataRoot,
    path.resolve(cwd, "Data", "chart"),
    path.resolve(local, "Data", "chart"),
    path.resolve(local, "..", "Data", "chart"),
    path.resolve(cwd, "src", "Data", "chart"),
    path.resolve(cwd, "utils", "Data", "chart"),
    path.resolve(cwd, "Data"),
    path.resolve(local, "Data"),
    path.resolve(local, "..", "Data")
  ]);
  _chartRootsCache = roots;
  return roots.slice();
}

function findExistingFile(filename) {
  const checked = [];
  for (const root of chartRoots()) {
    const file = path.join(root, filename);
    checked.push(file);
    try {
      const st = fs.statSync(file);
      if (st && st.isFile()) return { file, checked, root };
    } catch (_) {}
  }
  return { file: checked[0] || "", checked, root: "" };
}

function resolveTop10FileMeta() {
  if (_top10FileMetaCache) return _top10FileMetaCache;
  _top10FileMetaCache = findExistingFile("top10_by_year_v1.json");
  return _top10FileMetaCache;
}

function resolveTop10File() {
  return resolveTop10FileMeta().file;
}

function rankedYearFileCandidates(year) {
  const y = normalizeYear(year);
  if (!y) return [];
  return [
    `year_end_hot100_${y}.json`,
    `yearend_hot100_${y}.json`,
    `hot100_${y}.json`,
    `top100_${y}.json`,
    `billboard_${y}.json`,
    `${y}.json`
  ];
}

function resolveYearEndFileMetaForYear(year) {
  const y = normalizeYear(year);
  if (!y) return { file: "", checked: [], root: "", matchedName: "" };
  const checked = [];
  for (const root of chartRoots()) {
    let names = [];
    try {
      const st = fs.statSync(root);
      if (!st || !st.isDirectory()) continue;
      names = fs.readdirSync(root);
    } catch (_) { continue; }
    for (const candidate of rankedYearFileCandidates(y)) {
      const full = path.join(root, candidate);
      checked.push(full);
      if (names.includes(candidate)) return { file: full, checked, root, matchedName: candidate };
    }
    const dynamic = names
      .filter((name) => /\.json$/i.test(name))
      .filter((name) => name.includes(y))
      .sort((a, b) => a.length - b.length)[0];
    if (dynamic) {
      const full = path.join(root, dynamic);
      checked.push(full);
      return { file: full, checked, root, matchedName: dynamic };
    }
  }
  return { file: "", checked, root: "", matchedName: "" };
}

function resolveYearEndFileForYear(year) {
  return resolveYearEndFileMetaForYear(year).file;
}

function discoverAvailableYearEndFiles() {
  const years = [];
  const seen = new Set();
  for (const root of chartRoots()) {
    try {
      const st = fs.statSync(root);
      if (!st || !st.isDirectory()) continue;
      for (const name of fs.readdirSync(root)) {
        const m = String(name).match(/(19[5-9]\d|20[0-2]\d|2025)/);
        if (!m || !/\.json$/i.test(name)) continue;
        const y = Number(m[1]);
        if (Number.isFinite(y) && !seen.has(y)) { seen.add(y); years.push(y); }
      }
    } catch (_) {}
  }
  years.sort((a,b)=>a-b);
  return years;
}

function loadTop10Store() {
  const file = resolveTop10File();
  const st = safeStat(file);
  if (!st || !st.isFile()) {
    _top10StoreCache = { mtimeMs: 0, store: null, file };
    return null;
  }
  const mtimeMs = Number(st.mtimeMs || 0);
  if (_top10StoreCache.store && _top10StoreCache.mtimeMs === mtimeMs && _top10StoreCache.file === file) return _top10StoreCache.store;
  const store = safeReadJSON(file);
  _top10StoreCache = { mtimeMs, store: store || null, file };
  return _top10StoreCache.store;
}

function getYearBucket(store, y) {
  if (!store || !isObject(store) || !isObject(store.years)) return null;
  const bucket = store.years[y];
  if (!bucket) return null;
  if (isObject(bucket) && Array.isArray(bucket.items)) return bucket;
  if (Array.isArray(bucket)) return { year: Number(y), chart: "", items: bucket };
  return null;
}

function extractYearEndRows(doc) {
  if (Array.isArray(doc)) return doc;
  const pools = [
    doc && doc.rows,
    doc && doc.items,
    doc && doc.data,
    doc && doc.songs,
    doc && doc.results,
    doc && doc.payload && doc.payload.rows,
    doc && doc.payload && doc.payload.items,
    doc && doc.data && doc.data.rows,
    doc && doc.data && doc.data.items,
    doc && doc.data && doc.data.results
  ];
  for (const pool of pools) if (Array.isArray(pool)) return pool;
  return [];
}

function diagnostics() {
  const top10Meta = resolveTop10FileMeta();
  const top10Stat = safeStat(top10Meta.file);
  const store = loadTop10Store();
  const years = isObject(store && store.years) ? Object.keys(store.years).map(Number).filter(Number.isFinite).sort((a,b)=>a-b) : [];
  const yearEndYears = discoverAvailableYearEndFiles();
  return {
    version: KNOWLEDGE_VERSION,
    lane: LANE,
    preferredChartRoot: preferredChartRoot(),
    chartRoots: chartRoots(),
    top10: {
      file: top10Meta.file,
      exists: !!(top10Stat && top10Stat.isFile()),
      checked: top10Meta.checked,
      yearsCount: years.length,
      minYear: years.length ? years[0] : null,
      maxYear: years.length ? years[years.length - 1] : null,
    },
    yearEnd: {
      yearsCount: yearEndYears.length,
      minYear: yearEndYears.length ? yearEndYears[0] : null,
      maxYear: yearEndYears.length ? yearEndYears[yearEndYears.length - 1] : null,
    }
  };
}

function getCapabilities() {
  const diag = diagnostics();
  const momentsAvailable = !!(getMusicMomentsMod() && typeof getMusicMomentsMod().getMoment === "function");
  const top10Loaded = diag.top10.exists || diag.yearEnd.yearsCount > 0;
  return {
    ok: true,
    lane: LANE,
    routes: {
      top10: { executable: top10Loaded, mode: diag.top10.exists ? "full" : "derived_from_yearend" },
      number1: { executable: top10Loaded, mode: diag.top10.exists ? "full" : "derived_from_yearend" },
      story_moment: { executable: top10Loaded, delegated: momentsAvailable, mode: momentsAvailable ? "delegated" : "template" },
      micro_moment: { executable: top10Loaded, delegated: momentsAvailable, mode: momentsAvailable ? "delegated" : "template" },
      yearend_hot100: { executable: diag.yearEnd.yearsCount > 0 || diag.top10.exists, mode: diag.yearEnd.yearsCount > 0 ? "full" : YEAREND_MODE },
    },
    provenance: {
      sourceOfMusicTruth: diag.yearEnd.yearsCount > 0 ? "Data/chart/year_end_hot100_YYYY.json" : "top10_by_year_v1.json",
      storyMomentSource: momentsAvailable ? "musicMoments.getMoment" : "musicKnowledge template fallback",
      microMomentSource: momentsAvailable ? "musicMoments.getMoment" : "musicKnowledge template fallback",
    },
    diagnostics: diag,
  };
}

function getYearEndHot100ByYear(year, opts = {}) {
  try {
    const y = normalizeYear(year);
    if (!y) return null;
    const metaFile = resolveYearEndFileMetaForYear(y);
    const doc = safeReadJSON(metaFile.file);
    const rows = extractYearEndRows(doc).filter((row) => isObject(row));
    if (!rows.length) return null;
    const wantMeta = !!opts.meta;
    const meta = wantMeta ? {
      sourceFile: metaFile.file,
      sourceTruth: "Data/chart/year_end_hot100_YYYY.json",
      matchedName: metaFile.matchedName || path.basename(metaFile.file || ""),
      year: y,
      warnings: [],
    } : null;
    const filtered = rows.filter((row) => {
      const pos = Number(row.pos ?? row.rank ?? row.position ?? row.number ?? row.index);
      const title = cleanText(row.title ?? row.song ?? row.name ?? row.track);
      const artist = cleanText(row.artist ?? row.artists ?? row.performer ?? row.by);
      if (!Number.isFinite(pos)) return false;
      if (lower(title) === "title") return false;
      if (lower(artist) === "artist(s)") return false;
      return true;
    });
    const items = filtered.map(normalizeItem);
    return {
      year: y,
      chart: cleanText(doc && doc.chart) || CHART_DEFAULT,
      count: items.length,
      items,
      ...(wantMeta ? { meta } : {}),
    };
  } catch (_) {
    return null;
  }
}

function getTop10ByYear(year, opts = {}) {
  try {
    const y = normalizeYear(year);
    if (!y) return null;
    const store = loadTop10Store();
    const bucket = getYearBucket(store, y);
    const wantMeta = !!opts.meta;
    if (bucket) {
      const meta = wantMeta ? {
        sourceFile: resolveTop10File(),
        sourceTruth: "top10_by_year_v1.json",
        storeVersion: cleanText(store && store.version) || "",
        storeChart: cleanText(store && store.chart) || "",
        year: y,
        warnings: [],
        extrasIgnored: [],
      } : null;
      const items = buildTop10(bucket.items, meta);
      const resolvedChart = cleanText(bucket.chart) || cleanText(store && store.chart) || CHART_DEFAULT;
      return { year: y, chart: resolvedChart, count: TOP10_REQUIRED_COUNT, items, ...(wantMeta ? { meta } : {}) };
    }
    const yearEnd = getYearEndHot100ByYear(y, { meta: wantMeta });
    if (!yearEnd || !Array.isArray(yearEnd.items) || !yearEnd.items.length) return null;
    const items = buildTop10(yearEnd.items.slice(0, TOP10_REQUIRED_COUNT), wantMeta ? (yearEnd.meta || { warnings: [] }) : null);
    const meta = wantMeta ? {
      sourceFile: (yearEnd.meta && yearEnd.meta.sourceFile) || resolveYearEndFileForYear(y),
      sourceTruth: "Data/chart/year_end_hot100_YYYY.json",
      storeVersion: "",
      storeChart: cleanText(yearEnd.chart) || CHART_DEFAULT,
      year: y,
      warnings: (yearEnd.meta && Array.isArray(yearEnd.meta.warnings) ? yearEnd.meta.warnings : []),
      derivedFromYearEnd: true,
    } : null;
    return { year: y, chart: cleanText(yearEnd.chart) || CHART_DEFAULT, count: TOP10_REQUIRED_COUNT, items, ...(wantMeta ? { meta } : {}) };
  } catch (_) {
    return null;
  }
}

function getNumberOneByYear(year, opts = {}) {
  const top10 = getTop10ByYear(year, opts);
  if (!top10 || !Array.isArray(top10.items) || !top10.items.length) return null;
  const first = top10.items[0] || null;
  if (!first) return null;
  return {
    year: top10.year,
    chart: top10.chart,
    pos: Number.isFinite(first.pos) ? first.pos : 1,
    title: cleanText(first.title) || "—",
    artist: cleanText(first.artist) || "",
    ...(opts.meta === true && top10.meta ? { meta: top10.meta } : {}),
  };
}

function renderTop10Text(top10) {
  try {
    if (!top10 || !Array.isArray(top10.items)) return "";
    return top10.items.map((item, i) => `${Number.isFinite(item && item.pos) ? item.pos : i + 1}. \"${cleanText(item && item.title) || "—"}\"${cleanText(item && item.artist) ? " — " + cleanText(item && item.artist) : ""}`).join("\n");
  } catch (_) { return ""; }
}

function yearFollowUps(baseAction, year) {
  const y = toIntYear(year) || 1988;
  const prev = Math.max(YEAR_MIN, y - 1);
  const next = Math.min(YEAR_MAX, y + 1);
  const make = (yy) => ({ id: `fu_${baseAction}_${yy}`, type: "chip", label: String(yy), payload: { lane: LANE, action: baseAction, year: yy, route: baseAction } });
  return [make(prev), make(y), make(next)];
}

function modeFollowUps(year) {
  const y = toIntYear(year) || 1988;
  return [
    { id: `fu_top10_${y}`, type: "chip", label: "Top 10", payload: { lane: LANE, action: "top10", year: y, route: "top10" } },
    { id: `fu_story_${y}`, type: "chip", label: "Story moment", payload: { lane: LANE, action: "story_moment", year: y, route: "story_moment" } },
    { id: `fu_micro_${y}`, type: "chip", label: "Micro moment", payload: { lane: LANE, action: "micro_moment", year: y, route: "micro_moment" } },
    { id: `fu_yearend_${y}`, type: "chip", label: "Year-End Hot 100", payload: { lane: LANE, action: "yearend_hot100", year: y, route: "yearend_hot100" } },
  ];
}

function pendingAskObj(id, type, prompt, required) {
  return { id: safeStr(id || ""), type: safeStr(type || "clarify"), prompt: safeStr(prompt || ""), required: required !== false };
}

function baseSessionPatch(year, mode, chart, sourceFile) {
  return {
    activeLane: LANE,
    lane: LANE,
    year: Number(year),
    lastYear: Number(year),
    lastMusicYear: Number(year),
    mode,
    activeMusicMode: mode,
    lastMode: mode,
    lastAction: mode,
    activeMusicChart: cleanText(chart) || CHART_DEFAULT,
    lastMusicChart: cleanText(chart) || CHART_DEFAULT,
    knowledgeSource: cleanText(sourceFile || ""),
  };
}

function delegatedMoment(kind, y, top10) {
  const mod = getMusicMomentsMod();
  if (!mod || typeof mod.getMoment !== "function") return "";
  try { return cleanText(mod.getMoment({ year: Number(y), chart: cleanText(top10 && top10.chart) || CHART_DEFAULT, kind, top10 })); } catch (_) { return ""; }
}

function defaultMomentText(kind, year, top10) {
  const y = spokenYear(year);
  const first = top10 && Array.isArray(top10.items) ? top10.items[0] : null;
  const anchor = first && cleanText(first.title)
    ? `The chart leader was \"${cleanText(first.title)}\"${cleanText(first.artist) ? ` by ${cleanText(first.artist)}` : ""}.`
    : "The chart data is loaded.";
  if (kind === "micro") return `Micro moment — ${y}\n\n${anchor} That year carries a compact snapshot of the music mood, chart energy, and cultural pull.`;
  return `Story moment — ${y}\n\n${anchor} This year sits inside a wider story about what listeners were choosing, repeating, and carrying forward.`;
}

function inferActionFromText(text) {
  const t = lower(text);
  if (!t) return null;
  if (/\byear[-\s]*end\s*hot\s*100\b|\btop\s*100\b|\bhot\s*100\b/.test(t)) return "yearend_hot100";
  if (/\b#\s*1\b|\bnumber\s*one\b|\bnumber\s*1\b|\bno\.?\s*1\b/.test(t)) return "number1";
  if (/\bmicro\s*moment\b|\bmicro\b/.test(t)) return "micro_moment";
  if (/\bstory\s*moment\b|\bstory\b|\bmoment\b/.test(t)) return "story_moment";
  if (/\btop\s*10\b|\btop\s*ten\b/.test(t)) return "top10";
  return null;
}

function inferYearFromText(text, session) {
  const digits = safeStr(text).replace(/[^\d]/g, " ");
  const m = digits.match(/\b(19[5-9]\d|20[0-2]\d|2025)\b/);
  if (m) return Number(m[1]);
  return toIntYear(session && (session.lastMusicYear || session.year || session.lockedYear));
}

function handleTop10(year, opts = {}) {
  const y = normalizeYear(year);
  if (!y) {
    const fu = yearFollowUps("top10", 1988);
    return { ok: false, replyRaw: "Give me a valid year (YYYY).", route: "top10", actionTaken: "need_year", pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "BAD_YEAR" } };
  }
  const top10 = getTop10ByYear(y, { meta: !!opts.meta });
  if (!top10) {
    const fu = yearFollowUps("top10", y);
    return { ok: false, replyRaw: `I don’t have Top 10 data loaded for ${y}.`, route: "top10", actionTaken: "year_not_found", pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "YEAR_NOT_FOUND", year: y, diagnostics: diagnostics() } };
  }
  const replyRaw = `Top 10 — ${y}\n\n${renderTop10Text(top10) || "No chart rows available."}`;
  const sessionPatch = baseSessionPatch(y, "top10", top10.chart, top10.meta && top10.meta.sourceFile);
  const fu = modeFollowUps(y);
  return { ok: true, replyRaw, route: "top10", actionTaken: "served_top10", topic: LANE, spineStage: "deliver", sessionPatch, pendingAsk: null, followUps: fu, followUpsStrings: fu.map((x) => x.label), data: top10, meta: { provenance: { sourceTruth: top10.meta && top10.meta.derivedFromYearEnd ? "Data/chart/year_end_hot100_YYYY.json" : "top10_by_year_v1.json", sourceFile: (top10.meta && top10.meta.sourceFile) || "", routeSource: "top10" } } };
}

function handleNumberOne(year, opts = {}) {
  const y = normalizeYear(year);
  if (!y) {
    const fu = yearFollowUps("top10", 1988);
    return { ok: false, replyRaw: "Give me a year (YYYY) for the #1 song.", route: "number1", actionTaken: "need_year", pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "BAD_YEAR" } };
  }
  const top = getNumberOneByYear(y, { meta: !!opts.meta });
  if (!top) {
    const fu = yearFollowUps("top10", y);
    return { ok: false, replyRaw: `I don’t have #1 data loaded for ${y}. Pick another year.`, route: "number1", actionTaken: "year_not_found", pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "YEAR_NOT_FOUND", year: y } };
  }
  const replyRaw = `#1 song — ${y}\n\n1. \"${cleanText(top.title) || "—"}\"${cleanText(top.artist) ? " — " + cleanText(top.artist) : ""}`;
  const sessionPatch = baseSessionPatch(y, "number1", top.chart, top.meta && top.meta.sourceFile);
  const fu = modeFollowUps(y);
  return { ok: true, replyRaw, route: "number1", actionTaken: "served_number1", topic: LANE, spineStage: "deliver", sessionPatch, pendingAsk: null, followUps: fu, followUpsStrings: fu.map((x) => x.label), data: top, meta: { provenance: { sourceTruth: "derived_from_top10", sourceFile: (top.meta && top.meta.sourceFile) || "", routeSource: "number1" } } };
}

function handleStoryMoment(year, opts = {}) {
  const y = normalizeYear(year);
  if (!y) {
    const fu = yearFollowUps("story_moment", 1988);
    return { ok: false, replyRaw: "Give me a year (YYYY) for the story moment.", route: "story_moment", actionTaken: "need_year", pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "BAD_YEAR" } };
  }
  const top10 = getTop10ByYear(y, { meta: !!opts.meta });
  if (!top10) {
    const fu = yearFollowUps("story_moment", y);
    return { ok: false, replyRaw: `I don’t have chart data loaded for ${y}. Pick another year.`, route: "story_moment", actionTaken: "year_not_found", pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "YEAR_NOT_FOUND", year: y } };
  }
  const delegated = delegatedMoment("story", y, top10);
  const replyRaw = delegated || defaultMomentText("story", y, top10);
  const sessionPatch = baseSessionPatch(y, "story_moment", top10.chart, top10.meta && top10.meta.sourceFile);
  const fu = modeFollowUps(y);
  return { ok: true, replyRaw, route: "story_moment", actionTaken: delegated ? "served_story_moment_delegated" : "served_story_moment_template", topic: LANE, spineStage: "deliver", sessionPatch, pendingAsk: null, followUps: fu, followUpsStrings: fu.map((x) => x.label), data: { year: y, kind: "story", top10 }, meta: { provenance: { sourceTruth: delegated ? "musicMoments.getMoment" : "top10_chart_template_fallback", sourceFile: delegated ? "musicMoments.getMoment" : ((top10.meta && top10.meta.sourceFile) || ""), routeSource: "story_moment" } } };
}

function handleMicroMoment(year, opts = {}) {
  const y = normalizeYear(year);
  if (!y) {
    const fu = yearFollowUps("micro_moment", 1988);
    return { ok: false, replyRaw: "Give me a year (YYYY) for the micro moment.", route: "micro_moment", actionTaken: "need_year", pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "BAD_YEAR" } };
  }
  const top10 = getTop10ByYear(y, { meta: !!opts.meta });
  if (!top10) {
    const fu = yearFollowUps("micro_moment", y);
    return { ok: false, replyRaw: `I don’t have chart data loaded for ${y}. Pick another year.`, route: "micro_moment", actionTaken: "year_not_found", pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "YEAR_NOT_FOUND", year: y } };
  }
  const delegated = delegatedMoment("micro", y, top10);
  const replyRaw = delegated || defaultMomentText("micro", y, top10);
  const sessionPatch = baseSessionPatch(y, "micro_moment", top10.chart, top10.meta && top10.meta.sourceFile);
  const fu = modeFollowUps(y);
  return { ok: true, replyRaw, route: "micro_moment", actionTaken: delegated ? "served_micro_moment_delegated" : "served_micro_moment_template", topic: LANE, spineStage: "deliver", sessionPatch, pendingAsk: null, followUps: fu, followUpsStrings: fu.map((x) => x.label), data: { year: y, kind: "micro", top10 }, meta: { provenance: { sourceTruth: delegated ? "musicMoments.getMoment" : "top10_chart_template_fallback", sourceFile: delegated ? "musicMoments.getMoment" : ((top10.meta && top10.meta.sourceFile) || ""), routeSource: "micro_moment" } } };
}

function handleYearEndHot100(year, opts = {}) {
  const y = normalizeYear(year);
  if (!y) {
    const fu = yearFollowUps("yearend_hot100", 1988);
    return { ok: false, replyRaw: "Give me a year (YYYY) for the Year-End Hot 100.", route: "yearend_hot100", actionTaken: "need_year", pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "BAD_YEAR", mode: YEAREND_MODE } };
  }
  const yearEnd = getYearEndHot100ByYear(y, { meta: !!opts.meta });
  if (!yearEnd) {
    const top10 = getTop10ByYear(y, { meta: !!opts.meta });
    if (!top10) {
      const fu = yearFollowUps("yearend_hot100", y);
      return { ok: false, replyRaw: `I don’t have year-end chart data loaded for ${y}. Pick another year.`, route: "yearend_hot100", actionTaken: "year_not_found", pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "YEAR_NOT_FOUND", year: y, mode: YEAREND_MODE } };
    }
    const previewItems = top10.items.slice(0, TOP10_REQUIRED_COUNT);
    const replyRaw = `Year-End Hot 100 — ${y} (excerpt)\n\n${renderTop10Text({ items: previewItems }) || "No chart rows available."}`;
    const sessionPatch = baseSessionPatch(y, "yearend_hot100", top10.chart, top10.meta && top10.meta.sourceFile);
    const fu = modeFollowUps(y);
    return { ok: true, replyRaw, route: "yearend_hot100", actionTaken: "served_yearend_excerpt", topic: LANE, spineStage: "deliver", sessionPatch, pendingAsk: null, followUps: fu, followUpsStrings: fu.map((x) => x.label), data: { ...top10, mode: YEAREND_MODE }, meta: { yearendMode: YEAREND_MODE, provenance: { sourceTruth: "top10_excerpt_from_top100_json", sourceFile: (top10.meta && top10.meta.sourceFile) || "", routeSource: "yearend_hot100" } } };
  }
  const mode = yearEnd.count > TOP10_REQUIRED_COUNT ? "full" : YEAREND_MODE;
  const previewItems = yearEnd.items.slice(0, TOP10_REQUIRED_COUNT);
  const replyRaw = `Year-End Hot 100 — ${y}${mode === YEAREND_MODE ? " (excerpt)" : ""}\n\n${renderTop10Text({ items: previewItems }) || "No chart rows available."}`;
  const sessionPatch = baseSessionPatch(y, "yearend_hot100", yearEnd.chart, yearEnd.meta && yearEnd.meta.sourceFile);
  const fu = modeFollowUps(y);
  return { ok: true, replyRaw, route: "yearend_hot100", actionTaken: mode === YEAREND_MODE ? "served_yearend_excerpt" : "served_yearend_full", topic: LANE, spineStage: "deliver", sessionPatch, pendingAsk: null, followUps: fu, followUpsStrings: fu.map((x) => x.label), data: { ...yearEnd, mode }, meta: { yearendMode: mode, provenance: { sourceTruth: "Data/chart/year_end_hot100_YYYY.json", sourceFile: (yearEnd.meta && yearEnd.meta.sourceFile) || resolveYearEndFileForYear(y), routeSource: "yearend_hot100" } } };
}

function normalizeKnowledgeResponse(base) {
  const raw = isObject(base) ? base : {};
  const route = cleanText(raw.route || raw.actionTaken || raw.mode || "");
  const year = toIntYear(raw.year || (raw.sessionPatch && (raw.sessionPatch.lastMusicYear || raw.sessionPatch.year)));
  const replyRaw = cleanText(raw.replyRaw || raw.reply || raw.text || raw.message || "");
  const sessionPatch = isObject(raw.sessionPatch) ? raw.sessionPatch : {};
  const followUps = Array.isArray(raw.followUps) ? raw.followUps : [];
  const followUpsStrings = Array.isArray(raw.followUpsStrings) ? raw.followUpsStrings : followUps.map((x) => cleanText(x && x.label)).filter(Boolean);
  const meta = isObject(raw.meta) ? raw.meta : {};
  return {
    ok: raw.ok !== false,
    lane: LANE,
    route,
    actionTaken: cleanText(raw.actionTaken || route),
    year,
    replyRaw,
    reply: replyRaw,
    text: replyRaw,
    status: raw.ok === false ? "blocked" : "execute",
    executable: raw.ok !== false,
    needsYear: false,
    followUps,
    followUpsStrings,
    sessionPatch,
    pendingAsk: raw.pendingAsk || null,
    data: raw.data,
    meta: { source: "musicKnowledge", version: KNOWLEDGE_VERSION, ...(meta || {}) },
  };
}

function handleMusicTurn(input = {}) {
  try {
    const action = cleanText(input.action || (input.norm && input.norm.action) || "").toLowerCase() || inferActionFromText(input.text || "");
    const year = input.year != null ? Number(safeStr(input.year).replace(/[^\d]/g, "")) : inferYearFromText(input.text || "", input.session || {});
    const opts = input.opts || {};
    if (action === "top10") return handleTop10(year, opts);
    if (action === "number1") return handleNumberOne(year, opts);
    if (action === "story_moment") return handleStoryMoment(year, opts);
    if (action === "micro_moment") return handleMicroMoment(year, opts);
    if (action === "yearend_hot100") return handleYearEndHot100(year, opts);
    return { ok: false, replyRaw: "Give me the music action and year and I will run it.", route: "clarify", actionTaken: "clarify", pendingAsk: pendingAskObj("need_action", "clarify", "Give me the music action and year.", true), followUps: modeFollowUps(year || 1988), followUpsStrings: modeFollowUps(year || 1988).map((x) => x.label), meta: { capabilities: getCapabilities() } };
  } catch (e) {
    return { ok: false, replyRaw: "Music knowledge hit a snag. Give me a year and try again.", route: "error", actionTaken: "exception", pendingAsk: pendingAskObj("retry", "clarify", "Give me a year and try again.", true), followUps: yearFollowUps("top10", 1988), followUpsStrings: yearFollowUps("top10", 1988).map((x) => x.label), meta: { error: safeStr(e && e.message ? e.message : e), diagnostics: diagnostics() } };
  }
}

async function handleChat({ text, session, visitorId, debug } = {}) {
  const action = inferActionFromText(text || "");
  const year = inferYearFromText(text || "", session || {});
  const out = handleMusicTurn({ text, session, visitorId, year, action, opts: { meta: !!debug } });
  return { ok: !!out.ok, reply: out.replyRaw, replyRaw: out.replyRaw, followUps: out.followUps || [], followUpsStrings: out.followUpsStrings || [], sessionPatch: out.sessionPatch || {}, meta: { route: out.route || "", actionTaken: out.actionTaken || "", capabilities: getCapabilities(), ...(isObject(out.meta) ? out.meta : {}) } };
}

module.exports = {
  getCapabilities,
  diagnostics,
  preferredChartRoot,
  chartRoots,
  resolveYearEndFileForYear,
  resolveYearEndFileMetaForYear,
  getYearEndHot100ByYear,
  getTop10ByYear,
  getNumberOneByYear,
  handleTop10,
  handleNumberOne,
  handleStoryMoment,
  handleMicroMoment,
  handleYearEndHot100,
  handleMusicTurn,
  handleChat,
};
