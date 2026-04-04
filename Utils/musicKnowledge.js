"use strict";

/**
 * Utils/musicKnowledge.js
 *
 * v1.5.1
 * SOURCE-EXPLICIT + CAPABILITY SNAPSHOT + MOMENTS DELEGATION + FAIL-OPEN HARDEN + WIKIPEDIA-CHARTS-PATH
 */

const fs = require("fs");
const path = require("path");

let _musicMomentsMod = undefined;
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

function firstExistingFile(candidates) {
  for (const file of candidates) {
    try {
      const st = fs.statSync(file);
      if (st && st.isFile()) return file;
    } catch (_) {}
  }
  return candidates[0];
}

function resolveDataFile(filename) {
  const explicitRoot = cleanText(
    process.env.SB_MUSIC_DATA_ROOT ||
    process.env.SB_WIKIPEDIA_CHARTS_DIR ||
    process.env.SB_MUSIC_WIKIPEDIA_CHARTS_DIR ||
    ""
  );

  const dirs = [
    explicitRoot,
    path.resolve(__dirname, "Data", "wikipedia", "charts"),
    path.resolve(__dirname, "..", "Data", "wikipedia", "charts"),
    path.resolve(process.cwd(), "Data", "wikipedia", "charts"),
    path.resolve(process.cwd(), "src", "Data", "wikipedia", "charts"),
    path.resolve(process.cwd(), "utils", "Data", "wikipedia", "charts"),
    path.resolve(__dirname, "Data"),
    path.resolve(__dirname, "..", "Data"),
    path.resolve(process.cwd(), "Data"),
    path.resolve(process.cwd(), "src", "Data"),
    path.resolve(process.cwd(), "utils", "Data"),
  ].filter(Boolean);

  return firstExistingFile(dirs.map((dir) => path.join(dir, filename)));
}

function resolveYearEndFileForYear(year) {
  const y = normalizeYear(year);
  if (!y) return "";
  return resolveDataFile(`year_end_hot100_${y}.json`);
}

function discoverAvailableYearEndFiles() {
  const roots = [
    cleanText(
      process.env.SB_MUSIC_DATA_ROOT ||
      process.env.SB_WIKIPEDIA_CHARTS_DIR ||
      process.env.SB_MUSIC_WIKIPEDIA_CHARTS_DIR ||
      ""
    ),
    path.resolve(__dirname, "Data", "wikipedia", "charts"),
    path.resolve(__dirname, "..", "Data", "wikipedia", "charts"),
    path.resolve(process.cwd(), "Data", "wikipedia", "charts"),
    path.resolve(process.cwd(), "src", "Data", "wikipedia", "charts"),
    path.resolve(process.cwd(), "utils", "Data", "wikipedia", "charts"),
  ].filter(Boolean);

  const years = [];
  const seen = new Set();
  for (const root of roots) {
    try {
      for (const name of fs.readdirSync(root)) {
        const m = String(name).match(/^year_end_hot100_(19[5-9]\d|20[0-2]\d|2025)\.json$/);
        if (!m) continue;
        const y = Number(m[1]);
        if (Number.isFinite(y) && !seen.has(y)) {
          seen.add(y);
          years.push(y);
        }
      }
    } catch (_) {}
  }
  years.sort((a, b) => a - b);
  return years;
}

const TOP10_FILE = resolveDataFile("top10_by_year_v1.json");
const TOP10_REQUIRED_COUNT = 10;
const DEFAULT_PUBLIC_MIN_YEAR = 1950;
const DEFAULT_PUBLIC_MAX_YEAR = 2025;
const YEAREND_MODE = "excerpt";

let _cache = {
  mtimeMs: 0,
  store: null,
  file: TOP10_FILE,
};

function isObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}
function safeStr(x) {
  return x === undefined || x === null ? "" : String(x);
}
function cleanText(v) {
  return safeStr(v).replace(/\s+/g, " ").trim();
}
function safeStat(file) {
  try { return fs.statSync(file); } catch (_) { return null; }
}
function safeReadJSON(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const clean = raw && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    return JSON.parse(clean);
  } catch (_) { return null; }
}
function normalizeYear(year) {
  const digits = String(year ?? "").replace(/[^\d]/g, "");
  if (digits.length !== 4) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 1800 || n > 3000) return null;
  return String(n);
}
function toIntYear(year) {
  const y = normalizeYear(year);
  if (!y) return null;
  const n = Number(y);
  return Number.isFinite(n) ? n : null;
}
function cleanTitleArtifacts(s) {
  const t = cleanText(s);
  if (!t) return "";
  let out = t.replace(/\\"/g, '"');
  out = out.replace(/\s*"\s*\/\s*"\s*/g, " / ");
  out = out.replace(/\s*“\s*\/\s*”\s*/g, " / ");
  return out.replace(/\s+/g, " ").trim();
}
function cleanArtistArtifacts(s) {
  const t = cleanText(s);
  if (!t) return "";
  return t.replace(/\\"/g, '"').replace(/\s+/g, " ").trim();
}
function coercePos(rawPos, fallback) {
  const n = Number(rawPos);
  if (Number.isFinite(n) && n >= 1 && n <= 1000) return Math.trunc(n);
  return fallback;
}
function normalizeItem(raw, index) {
  const r = isObject(raw) ? raw : {};
  return {
    pos: coercePos(r.pos ?? r.rank, index + 1),
    title: cleanTitleArtifacts(r.title),
    artist: cleanArtistArtifacts(r.artist ?? r.artists),
  };
}
function makePlaceholder(pos) { return { pos, title: "—", artist: "" }; }
function keySong(title, artist) {
  return `${cleanText(title).toLowerCase()}||${cleanText(artist).toLowerCase()}`;
}
function dedupeExactSongs(items, meta) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = keySong(it.title, it.artist);
    if (!k || k === "||") { out.push(it); continue; }
    if (seen.has(k)) {
      if (meta && Array.isArray(meta.warnings)) meta.warnings.push({ code: "DUPLICATE_SONG_IGNORED", title: it.title || "", artist: it.artist || "" });
      continue;
    }
    seen.add(k);
    out.push(it);
  }
  return out;
}
function buildTop10(rawItems, meta) {
  const normalized = Array.isArray(rawItems) ? rawItems.map(normalizeItem) : [];
  const cleaned = dedupeExactSongs(normalized, meta);
  const byPos = new Map();
  for (let i = 0; i < cleaned.length; i++) {
    const it = cleaned[i];
    const p = coercePos(it.pos, i + 1);
    if (!byPos.has(p)) byPos.set(p, { pos: p, title: it.title || "", artist: it.artist || "" });
    else if (meta && Array.isArray(meta.warnings)) meta.warnings.push({ code: "DUPLICATE_POSITION", pos: p });
  }
  const items = [];
  for (let pos = 1; pos <= TOP10_REQUIRED_COUNT; pos++) {
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
function loadStore() {
  const st = safeStat(TOP10_FILE);
  if (!st || !st.isFile()) { _cache = { mtimeMs: 0, store: null, file: TOP10_FILE }; return null; }
  const mtimeMs = Number(st.mtimeMs || 0);
  if (_cache.store && _cache.mtimeMs === mtimeMs) return _cache.store;
  const store = safeReadJSON(TOP10_FILE);
  _cache = { mtimeMs, store: store || null, file: TOP10_FILE };
  return _cache.store;
}
function getYearBucket(store, y) {
  if (!store || !isObject(store) || !isObject(store.years)) return null;
  const bucket = store.years[y];
  if (!bucket) return null;
  if (isObject(bucket) && Array.isArray(bucket.items)) return bucket;
  if (Array.isArray(bucket)) return { year: Number(y), chart: "", items: bucket };
  return null;
}
function top10StoreSnapshot() {
  const st = safeStat(TOP10_FILE);
  const store = loadStore();
  const years = isObject(store && store.years) ? Object.keys(store.years) : [];
  const intYears = years.map((y) => Number(y)).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    exists: !!(st && st.isFile()),
    file: TOP10_FILE,
    mtimeMs: Number((st && st.mtimeMs) || 0),
    chart: cleanText(store && store.chart) || "Billboard Year-End Hot 100",
    version: cleanText(store && store.version),
    yearsCount: intYears.length,
    minYear: intYears.length ? intYears[0] : null,
    maxYear: intYears.length ? intYears[intYears.length - 1] : null,
  };
}
function getCapabilities() {
  const top10 = top10StoreSnapshot();
  const availableYearEndYears = discoverAvailableYearEndFiles();
  const momentsAvailable = !!(getMusicMomentsMod() && typeof getMusicMomentsMod().getMoment === "function");
  return {
    ok: true,
    lane: "music",
    sources: {
      top10: { truthType: "top10_by_year_v1_json", loaded: top10.exists && top10.yearsCount > 0, file: top10.file, chart: top10.chart, version: top10.version || "", yearsCount: top10.yearsCount, minYear: top10.minYear, maxYear: top10.maxYear },
      number1: { truthType: "derived_from_top10", loaded: top10.exists && top10.yearsCount > 0, dependsOn: "top10" },
      storyMoment: { truthType: momentsAvailable ? "musicMoments.getMoment" : "template_fallback", loaded: true, dependsOn: momentsAvailable ? "musicMoments" : "top10" },
      microMoment: { truthType: momentsAvailable ? "musicMoments.getMoment" : "template_fallback", loaded: true, dependsOn: momentsAvailable ? "musicMoments" : "top10" },
      yearendHot100: { truthType: availableYearEndYears.length ? "Data/wikipedia/charts/year_end_hot100_YYYY.json" : "top10_excerpt_from_top10_by_year_v1_json", loaded: availableYearEndYears.length > 0 || (top10.exists && top10.yearsCount > 0), mode: availableYearEndYears.length ? "full" : YEAREND_MODE, dependsOn: availableYearEndYears.length ? "wikipedia/charts" : "top10", yearsCount: availableYearEndYears.length, minYear: availableYearEndYears.length ? availableYearEndYears[0] : null, maxYear: availableYearEndYears.length ? availableYearEndYears[availableYearEndYears.length - 1] : null },
    },
    routes: {
      top10: { executable: top10.exists && top10.yearsCount > 0 },
      number1: { executable: top10.exists && top10.yearsCount > 0 },
      story_moment: { executable: top10.exists && top10.yearsCount > 0, delegated: momentsAvailable },
      micro_moment: { executable: top10.exists && top10.yearsCount > 0, delegated: momentsAvailable },
      yearend_hot100: { executable: availableYearEndYears.length > 0 || (top10.exists && top10.yearsCount > 0), mode: availableYearEndYears.length ? "full" : YEAREND_MODE },
    },
    provenance: {
      sourceOfMusicTruth: availableYearEndYears.length ? "Data/wikipedia/charts/year_end_hot100_YYYY.json + top10_by_year_v1.json" : "top10_by_year_v1.json",
      storyMomentSource: momentsAvailable ? "musicMoments.getMoment" : "musicKnowledge template fallback",
      microMomentSource: momentsAvailable ? "musicMoments.getMoment" : "musicKnowledge template fallback",
    },
  };
}
function getYearEndHot100ByYear(year, opts) {
  try {
    const y = normalizeYear(year);
    if (!y) return null;
    const file = resolveYearEndFileForYear(y);
    const doc = safeReadJSON(file);
    if (!doc || !Array.isArray(doc.rows)) return null;

    const wantMeta = !!(opts && opts.meta === true);
    const meta = wantMeta ? {
      sourceFile: file,
      sourceTruth: "Data/wikipedia/charts/year_end_hot100_YYYY.json",
      year: y,
      warnings: [],
    } : null;

    const filtered = doc.rows
      .filter((r) => isObject(r))
      .filter((r) => {
        const pos = Number(r.pos);
        const title = cleanText(r.title);
        const artist = cleanText(r.artist);
        if (!Number.isFinite(pos)) return false;
        if (title.toLowerCase() === "title") return false;
        if (artist.toLowerCase() === "artist(s)") return false;
        return true;
      });

    const items = filtered.map(normalizeItem);
    return {
      year: y,
      chart: cleanText(doc.chart) || "Billboard Year-End (Wikipedia)",
      count: items.length,
      items,
      ...(wantMeta ? { meta } : {}),
    };
  } catch (_) {
    return null;
  }
}

function getTop10ByYear(year, opts) {
  try {
    const y = normalizeYear(year);
    if (!y) return null;
    const store = loadStore();
    const bucket = getYearBucket(store, y);
    if (!bucket) return null;
    const wantMeta = !!(opts && opts.meta === true);
    const meta = wantMeta ? { sourceFile: TOP10_FILE, sourceTruth: "top10_by_year_v1.json", storeVersion: cleanText(store && store.version) || "", storeChart: cleanText(store && store.chart) || "", year: y, warnings: [], extrasIgnored: [] } : null;
    const items = buildTop10(bucket.items, meta);
    const resolvedChart = cleanText(bucket.chart) || cleanText(store && store.chart) || "Billboard Year-End Hot 100";
    return { year: y, chart: resolvedChart, count: TOP10_REQUIRED_COUNT, items, ...(wantMeta ? { meta } : {}) };
  } catch (_) { return null; }
}
function getNumberOneByYear(year, opts) {
  const top10 = getTop10ByYear(year, opts);
  if (!top10 || !Array.isArray(top10.items) || !top10.items.length) return null;
  const first = top10.items[0] || null;
  if (!first) return null;
  return { year: top10.year, chart: top10.chart, pos: Number.isFinite(first.pos) ? first.pos : 1, title: cleanText(first.title) || "—", artist: cleanText(first.artist) || "", ...(opts && opts.meta === true && top10.meta ? { meta: top10.meta } : {}) };
}
function renderTop10Text(top10) {
  try {
    if (!top10 || !Array.isArray(top10.items)) return "";
    return top10.items.map((it, i) => `${Number.isFinite(it && it.pos) ? it.pos : i + 1}. "${cleanText(it && it.title) || "—"}"${cleanText(it && it.artist) ? " — " + cleanText(it && it.artist) : ""}`).join("\n");
  } catch (_) { return ""; }
}
function yearFollowUps(baseAction, year) {
  const y = toIntYear(year) || 1988;
  const prev = Math.max(DEFAULT_PUBLIC_MIN_YEAR, y - 1);
  const next = Math.min(DEFAULT_PUBLIC_MAX_YEAR, y + 1);
  const make = (yy) => ({ id: `fu_${baseAction}_${yy}`, type: "chip", label: String(yy), payload: { lane: "music", action: baseAction, year: yy, route: baseAction } });
  return [make(prev), make(y), make(next)];
}
function modeFollowUps(year) {
  const y = toIntYear(year) || 1988;
  return [
    { id: `fu_top10_${y}`, type: "chip", label: "Top 10", payload: { lane: "music", action: "top10", year: y, route: "top10" } },
    { id: `fu_story_${y}`, type: "chip", label: "Story moment", payload: { lane: "music", action: "story_moment", year: y, route: "story_moment" } },
    { id: `fu_micro_${y}`, type: "chip", label: "Micro moment", payload: { lane: "music", action: "micro_moment", year: y, route: "micro_moment" } },
    { id: `fu_yearend_${y}`, type: "chip", label: "Year-End Hot 100", payload: { lane: "music", action: "yearend_hot100", year: y, route: "yearend_hot100" } },
  ];
}
function pendingAskObj(id, type, prompt, required) { return { id: safeStr(id || ""), type: safeStr(type || "clarify"), prompt: safeStr(prompt || ""), required: required !== false }; }
function baseSessionPatch(year, mode, chart) { return { activeLane: "music", lane: "music", year: Number(year), lastYear: Number(year), lastMusicYear: Number(year), mode, activeMusicMode: mode, lastMode: mode, lastAction: mode, activeMusicChart: cleanText(chart) || "", lastMusicChart: cleanText(chart) || "", knowledgeSource: "top10_by_year_v1.json" }; }
function delegatedMoment(kind, y, top10) {
  const mod = getMusicMomentsMod();
  if (!mod || typeof mod.getMoment !== "function") return "";
  try { return cleanText(mod.getMoment({ year: Number(y), chart: cleanText(top10.chart) || "", kind })); } catch (_) { return ""; }
}
function handleTop10(year, opts) {
  const y = normalizeYear(year);
  if (!y) { const fu = yearFollowUps("top10", 1988); return { ok: false, replyRaw: "Give me a valid year (YYYY).", route: "top10", actionTaken: "need_year", pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "BAD_YEAR", provenance: { sourceTruth: "top10_by_year_v1.json" } } }; }
  const wantMeta = !!(opts && opts.meta === true);
  const top10 = getTop10ByYear(y, { meta: wantMeta });
  if (!top10) { const fu = yearFollowUps("top10", y); return { ok: false, replyRaw: `I don’t have Top 10 data loaded for ${y}.`, route: "top10", actionTaken: "year_not_found", pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "YEAR_NOT_FOUND", year: y, provenance: { sourceTruth: "top10_by_year_v1.json" } } }; }
  const replyRaw = `Top 10 — ${y}\n\n${renderTop10Text(top10) || "No chart rows available."}`;
  const sessionPatch = baseSessionPatch(y, "top10", top10.chart);
  const fu = modeFollowUps(y);
  return { ok: true, replyRaw, route: "top10", actionTaken: "served_top10", topic: "music", spineStage: "deliver", sessionPatch, pendingAsk: null, followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { ...(wantMeta ? { top10Meta: top10.meta || null } : {}), provenance: { sourceTruth: "top10_by_year_v1.json", sourceFile: TOP10_FILE, routeSource: "top10" } } };
}
function handleNumberOne(year, opts) {
  const y = normalizeYear(year);
  if (!y) { const fu = yearFollowUps("top10", 1988); return { ok: false, replyRaw: "Give me a year (YYYY) for the #1 song.", route: "number1", actionTaken: "need_year", pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "BAD_YEAR", provenance: { sourceTruth: "derived_from_top10" } } }; }
  const top = getNumberOneByYear(y, { meta: !!(opts && opts.meta) });
  if (!top) { const fu = yearFollowUps("top10", y); return { ok: false, replyRaw: `I don’t have #1 data loaded for ${y}. Pick another year.`, route: "number1", actionTaken: "year_not_found", pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "YEAR_NOT_FOUND", year: y, provenance: { sourceTruth: "derived_from_top10" } } }; }
  const replyRaw = `#1 song — ${y}\n\n1. "${cleanText(top.title) || "—"}"${cleanText(top.artist) ? " — " + cleanText(top.artist) : ""}`;
  const sessionPatch = baseSessionPatch(y, "number1", top.chart);
  const fu = modeFollowUps(y);
  return { ok: true, replyRaw, route: "number1", actionTaken: "served_number1", topic: "music", spineStage: "deliver", sessionPatch, pendingAsk: null, followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { ...(opts && opts.meta === true && top.meta ? { top10Meta: top.meta } : {}), provenance: { sourceTruth: "derived_from_top10", sourceFile: TOP10_FILE, routeSource: "number1" } } };
}
function handleStoryMoment(year) {
  const y = normalizeYear(year);
  if (!y) { const fu = yearFollowUps("story_moment", 1988); return { ok: false, replyRaw: "Give me a year (YYYY) for the story moment.", route: "story_moment", actionTaken: "need_year", pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "BAD_YEAR" } }; }
  const top10 = getTop10ByYear(y, { meta: false });
  if (!top10) { const fu = yearFollowUps("story_moment", y); return { ok: false, replyRaw: `I don’t have chart data loaded for ${y}. Pick another year.`, route: "story_moment", actionTaken: "year_not_found", pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "YEAR_NOT_FOUND", year: y } }; }
  const delegated = delegatedMoment("story", y, top10);
  const top = top10.items && top10.items[0] ? top10.items[0] : { title: "—", artist: "" };
  const replyRaw = delegated || (`Story moment — ${y}\n\nStart on "${cleanText(top.title) || "—"}"${cleanText(top.artist) ? " — " + cleanText(top.artist) : ""}. Use the chart truth as the anchor, then widen into the texture of the year. This route is running from chart context because a curated delegated moment was not returned.`);
  const sessionPatch = baseSessionPatch(y, "story_moment", top10.chart);
  const fu = modeFollowUps(y);
  return { ok: true, replyRaw, route: "story_moment", actionTaken: delegated ? "served_story_moment_delegated" : "served_story_moment_template", topic: "music", spineStage: "deliver", sessionPatch, pendingAsk: null, followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { provenance: { sourceTruth: delegated ? "musicMoments.getMoment" : "top10_chart_template_fallback", sourceFile: delegated ? "musicMoments.getMoment" : TOP10_FILE, routeSource: "story_moment" } } };
}
function handleMicroMoment(year) {
  const y = normalizeYear(year);
  if (!y) { const fu = yearFollowUps("micro_moment", 1988); return { ok: false, replyRaw: "Give me a year (YYYY) for the micro moment.", route: "micro_moment", actionTaken: "need_year", pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "BAD_YEAR" } }; }
  const top10 = getTop10ByYear(y, { meta: false });
  if (!top10) { const fu = yearFollowUps("micro_moment", y); return { ok: false, replyRaw: `I don’t have chart data loaded for ${y}. Pick another year.`, route: "micro_moment", actionTaken: "year_not_found", pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "YEAR_NOT_FOUND", year: y } }; }
  const delegated = delegatedMoment("micro", y, top10);
  const top = top10.items && top10.items[0] ? top10.items[0] : { title: "—", artist: "" };
  const replyRaw = delegated || (`Micro moment — ${y}\n\nA quick pulse from ${y}: "${cleanText(top.title) || "—"}"${cleanText(top.artist) ? " — " + cleanText(top.artist) : ""}. This route is using chart-context fallback because no curated micro moment was returned.`);
  const sessionPatch = baseSessionPatch(y, "micro_moment", top10.chart);
  const fu = modeFollowUps(y);
  return { ok: true, replyRaw, route: "micro_moment", actionTaken: delegated ? "served_micro_moment_delegated" : "served_micro_moment_template", topic: "music", spineStage: "deliver", sessionPatch, pendingAsk: null, followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { provenance: { sourceTruth: delegated ? "musicMoments.getMoment" : "top10_chart_template_fallback", sourceFile: delegated ? "musicMoments.getMoment" : TOP10_FILE, routeSource: "micro_moment" } } };
}
function handleYearEndHot100(year) {
  const y = normalizeYear(year);
  if (!y) { const fu = yearFollowUps("yearend_hot100", 1988); return { ok: false, replyRaw: "Give me a year (YYYY) for the year-end Hot 100 view.", route: "yearend_hot100", actionTaken: "need_year", pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "BAD_YEAR", mode: YEAREND_MODE } }; }
  const top10 = getTop10ByYear(y, { meta: false });
  if (!top10) { const fu = yearFollowUps("yearend_hot100", y); return { ok: false, replyRaw: `I don’t have year-end chart data loaded for ${y}. Pick another year.`, route: "yearend_hot100", actionTaken: "year_not_found", pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true), followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { code: "YEAR_NOT_FOUND", year: y, mode: YEAREND_MODE } }; }
  const replyRaw = `Year-End Hot 100 — ${y}\n\nMode: excerpt\nThis route is currently backed by the Top 10 excerpt from top10_by_year_v1.json.\n\n${renderTop10Text(top10)}`;
  const sessionPatch = baseSessionPatch(y, "yearend_hot100", top10.chart);
  const fu = modeFollowUps(y);
  return { ok: true, replyRaw, route: "yearend_hot100", actionTaken: "served_yearend_hot100_excerpt", topic: "music", spineStage: "deliver", sessionPatch, pendingAsk: null, followUps: fu, followUpsStrings: fu.map((x) => x.label), meta: { mode: YEAREND_MODE, provenance: { sourceTruth: "top10_excerpt_from_top10_by_year_v1.json", sourceFile: TOP10_FILE, routeSource: "yearend_hot100" } } };
}
function inferActionFromText(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return null;
  if (/(^|\s)(#\s*1|number\s*1|number\s*one|no\.?\s*1)(\s|$)/i.test(t)) return "number1";
  if (/\byear[-\s]*end\s*hot\s*100\b|\btop\s*100\b|\bhot\s*100\b/.test(t)) return "yearend_hot100";
  if (/\bstory\s*moment\b|\bstory\b|\bmoment\b/.test(t)) return "story_moment";
  if (/\bmicro\s*moment\b|\bmicro\b/.test(t)) return "micro_moment";
  if (/\btop\s*10\b|\btop\s*ten\b/.test(t)) return "top10";
  return null;
}
function inferYearFromText(text, session) {
  const m = String(text || "").match(/\b(19[5-9]\d|20[0-2]\d|2025)\b/);
  if (m) return Number(m[1]);
  return toIntYear(session && (session.lastMusicYear || session.year || session.lockedYear));
}
function handleMusicTurn(input = {}) {
  try {
    const action = cleanText(input.action || (input.norm && input.norm.action) || "").toLowerCase() || inferActionFromText(input.text || "");
    const year = input.year != null ? Number(input.year) : inferYearFromText(input.text || "", input.session || {});
    const opts = input.opts || {};
    if (action === "top10") return handleTop10(year, opts);
    if (action === "number1") return handleNumberOne(year, opts);
    if (action === "story_moment") return handleStoryMoment(year);
    if (action === "micro_moment") return handleMicroMoment(year);
    if (action === "yearend_hot100") return handleYearEndHot100(year);
    return { ok: false, replyRaw: "Give me the music action and year and I will run it.", route: "clarify", actionTaken: "clarify", pendingAsk: pendingAskObj("need_action", "clarify", "Give me the music action and year.", true), followUps: modeFollowUps(year || 1988), followUpsStrings: modeFollowUps(year || 1988).map((x) => x.label), meta: { capabilities: getCapabilities() } };
  } catch (e) {
    return { ok: false, replyRaw: "Music knowledge hit a snag. Give me a year and try again.", route: "error", actionTaken: "exception", pendingAsk: pendingAskObj("retry", "clarify", "Give me a year and try again.", true), followUps: yearFollowUps("top10", 1988), followUpsStrings: yearFollowUps("top10", 1988).map((x) => x.label), meta: { error: safeStr(e && e.message ? e.message : e) } };
  }
}
async function handleChat({ text, session, visitorId, debug } = {}) {
  const action = inferActionFromText(text || "");
  const year = inferYearFromText(text || "", session || {});
  const out = handleMusicTurn({ text, session, visitorId, year, action, opts: { meta: !!debug } });
  return { ok: !!out.ok, reply: out.replyRaw, replyRaw: out.replyRaw, followUps: out.followUps || [], followUpsStrings: out.followUpsStrings || [], sessionPatch: out.sessionPatch || {}, meta: { route: out.route || "", actionTaken: out.actionTaken || "", capabilities: getCapabilities(), ...(isObject(out.meta) ? out.meta : {}) } };
}
module.exports = { getCapabilities, getTop10ByYear, getNumberOneByYear, handleMusicTurn, handleChat };
