"use strict";

/**
 * Utils/musicKnowledge.js
 *
 * v2.0.0
 * PATH-LOCKED + DATA-DIAGNOSTICS + EXECUTION-STABLE + FAIL-OPEN-NORMALIZED
 */

const fs = require("fs");
const path = require("path");

const KNOWLEDGE_VERSION = "musicKnowledge v2.0.0";
const LANE = "music";
const YEAR_MIN = 1950;
const YEAR_MAX = 2025;
const TOP10_REQUIRED_COUNT = 10;
const YEAREND_MODE = "excerpt";
const CHART_DEFAULT = "Billboard Year-End Hot 100";

let _musicMomentsMod;
let _resolvedRootsCache = null;
let _top10FileCache = null;
let _cache = { mtimeMs: 0, store: null, file: "" };

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

function safeStr(v) {
  return v == null ? "" : String(v);
}

function cleanText(v) {
  return safeStr(v).replace(/\s+/g, " ").trim();
}

function lower(v) {
  return cleanText(v).toLowerCase();
}

function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function uniq(items) {
  return Array.from(new Set((Array.isArray(items) ? items : []).filter(Boolean)));
}

function safeStat(file) {
  try {
    return fs.statSync(file);
  } catch (_) {
    return null;
  }
}

function safeReadJSON(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const clean = raw && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    return JSON.parse(clean);
  } catch (_) {
    return null;
  }
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
  return y == null ? "that year" : String(y);
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
    pos: coercePos(row.pos ?? row.rank ?? row.position, index + 1),
    title: cleanTitleArtifacts(row.title ?? row.song ?? row.name),
    artist: cleanArtistArtifacts(row.artist ?? row.artists ?? row.performer ?? row.by),
  };
}

function makePlaceholder(pos) {
  return { pos, title: "—", artist: "" };
}

function keySong(title, artist) {
  return `${lower(title)}||${lower(artist)}`;
}

function dedupeExactSongs(items, meta) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    const key = keySong(item && item.title, item && item.artist);
    if (!key || key === "||") {
      out.push(item);
      continue;
    }
    if (seen.has(key)) {
      if (meta && Array.isArray(meta.warnings)) {
        meta.warnings.push({ code: "DUPLICATE_SONG_IGNORED", title: item.title || "", artist: item.artist || "" });
      }
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
    if (!byPos.has(pos)) {
      byPos.set(pos, { pos, title: item.title || "", artist: item.artist || "" });
    } else if (meta && Array.isArray(meta.warnings)) {
      meta.warnings.push({ code: "DUPLICATE_POSITION", pos });
    }
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

function envRoots() {
  return uniq([
    cleanText(process.env.SB_MUSIC_DATA_ROOT),
    cleanText(process.env.SB_WIKIPEDIA_CHARTS_DIR),
    cleanText(process.env.SB_MUSIC_WIKIPEDIA_CHARTS_DIR),
    cleanText(process.env.SB_MUSIC_DATA_DIR),
  ]);
}

function candidateRoots() {
  if (_resolvedRootsCache) return _resolvedRootsCache.slice();
  const cwd = process.cwd();
  const local = __dirname;
  const roots = uniq([
    ...envRoots(),
    path.resolve(local, "Data", "wikipedia", "charts"),
    path.resolve(local, "..", "Data", "wikipedia", "charts"),
    path.resolve(cwd, "Data", "wikipedia", "charts"),
    path.resolve(cwd, "src", "Data", "wikipedia", "charts"),
    path.resolve(cwd, "utils", "Data", "wikipedia", "charts"),
    path.resolve(local, "Data"),
    path.resolve(local, "..", "Data"),
    path.resolve(cwd, "Data"),
    path.resolve(cwd, "src", "Data"),
    path.resolve(cwd, "utils", "Data"),
  ]);
  _resolvedRootsCache = roots;
  return roots.slice();
}

function findExistingFile(filename) {
  const checked = [];
  for (const root of candidateRoots()) {
    const file = path.join(root, filename);
    checked.push(file);
    try {
      const st = fs.statSync(file);
      if (st && st.isFile()) {
        return { file, checked };
      }
    } catch (_) {}
  }
  return { file: checked[0] || "", checked };
}

function resolveDataFile(filename) {
  return findExistingFile(filename).file;
}

function resolveTop10File() {
  if (_top10FileCache) return _top10FileCache;
  _top10FileCache = findExistingFile("top10_by_year_v1.json");
  return _top10FileCache;
}

function resolveYearEndFileForYear(year) {
  const y = normalizeYear(year);
  if (!y) return "";
  return resolveDataFile(`year_end_hot100_${y}.json`);
}

function discoverAvailableYearEndFiles() {
  const years = [];
  const seen = new Set();
  for (const root of candidateRoots()) {
    try {
      const st = fs.statSync(root);
      if (!st || !st.isDirectory()) continue;
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

function diagnostics() {
  const top10Resolved = resolveTop10File();
  const top10Stat = safeStat(top10Resolved.file);
  const store = loadStore();
  const years = isObject(store && store.years) ? Object.keys(store.years).map((y) => Number(y)).filter(Number.isFinite).sort((a, b) => a - b) : [];
  const yearEndYears = discoverAvailableYearEndFiles();
  return {
    version: KNOWLEDGE_VERSION,
    lane: LANE,
    top10: {
      file: top10Resolved.file,
      exists: !!(top10Stat && top10Stat.isFile()),
      mtimeMs: Number((top10Stat && top10Stat.mtimeMs) || 0),
      checkedPaths: top10Resolved.checked,
      yearsCount: years.length,
      minYear: years.length ? years[0] : null,
      maxYear: years.length ? years[years.length - 1] : null,
    },
    yearEnd: {
      yearsCount: yearEndYears.length,
      minYear: yearEndYears.length ? yearEndYears[0] : null,
      maxYear: yearEndYears.length ? yearEndYears[yearEndYears.length - 1] : null,
    },
    roots: candidateRoots(),
  };
}

function loadStore() {
  const top10Resolved = resolveTop10File();
  const file = top10Resolved.file;
  const st = safeStat(file);
  if (!st || !st.isFile()) {
    _cache = { mtimeMs: 0, store: null, file };
    return null;
  }
  const mtimeMs = Number(st.mtimeMs || 0);
  if (_cache.store && _cache.file === file && _cache.mtimeMs === mtimeMs) return _cache.store;
  const store = safeReadJSON(file);
  _cache = { mtimeMs, store: store || null, file };
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
  const top10Resolved = resolveTop10File();
  const st = safeStat(top10Resolved.file);
  const store = loadStore();
  const years = isObject(store && store.years) ? Object.keys(store.years) : [];
  const intYears = years.map((y) => Number(y)).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    exists: !!(st && st.isFile()),
    file: top10Resolved.file,
    checkedPaths: top10Resolved.checked,
    mtimeMs: Number((st && st.mtimeMs) || 0),
    chart: cleanText(store && store.chart) || CHART_DEFAULT,
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
    lane: LANE,
    version: KNOWLEDGE_VERSION,
    sources: {
      top10: {
        truthType: "top10_by_year_v1_json",
        loaded: top10.exists && top10.yearsCount > 0,
        file: top10.file,
        checkedPaths: top10.checkedPaths,
        chart: top10.chart,
        version: top10.version || "",
        yearsCount: top10.yearsCount,
        minYear: top10.minYear,
        maxYear: top10.maxYear,
      },
      number1: {
        truthType: "derived_from_top10",
        loaded: top10.exists && top10.yearsCount > 0,
        dependsOn: "top10",
      },
      storyMoment: {
        truthType: momentsAvailable ? "musicMoments.getMoment" : "template_fallback",
        loaded: top10.exists && top10.yearsCount > 0,
        dependsOn: momentsAvailable ? "musicMoments" : "top10",
      },
      microMoment: {
        truthType: momentsAvailable ? "musicMoments.getMoment" : "template_fallback",
        loaded: top10.exists && top10.yearsCount > 0,
        dependsOn: momentsAvailable ? "musicMoments" : "top10",
      },
      yearendHot100: {
        truthType: availableYearEndYears.length ? "Data/wikipedia/charts/year_end_hot100_YYYY.json" : "top10_excerpt_from_top10_by_year_v1_json",
        loaded: availableYearEndYears.length > 0 || (top10.exists && top10.yearsCount > 0),
        mode: availableYearEndYears.length ? "full" : YEAREND_MODE,
        dependsOn: availableYearEndYears.length ? "wikipedia/charts" : "top10",
        yearsCount: availableYearEndYears.length,
        minYear: availableYearEndYears.length ? availableYearEndYears[0] : null,
        maxYear: availableYearEndYears.length ? availableYearEndYears[availableYearEndYears.length - 1] : null,
      },
    },
    routes: {
      top10: { executable: top10.exists && top10.yearsCount > 0, mode: "full" },
      number1: { executable: top10.exists && top10.yearsCount > 0, mode: "full" },
      story_moment: { executable: top10.exists && top10.yearsCount > 0, delegated: momentsAvailable, mode: momentsAvailable ? "delegated" : "template" },
      micro_moment: { executable: top10.exists && top10.yearsCount > 0, delegated: momentsAvailable, mode: momentsAvailable ? "delegated" : "template" },
      yearend_hot100: { executable: availableYearEndYears.length > 0 || (top10.exists && top10.yearsCount > 0), mode: availableYearEndYears.length ? "full" : YEAREND_MODE },
    },
    provenance: {
      sourceOfMusicTruth: availableYearEndYears.length ? "Data/wikipedia/charts/year_end_hot100_YYYY.json + top10_by_year_v1.json" : "top10_by_year_v1.json",
      storyMomentSource: momentsAvailable ? "musicMoments.getMoment" : "musicKnowledge template fallback",
      microMomentSource: momentsAvailable ? "musicMoments.getMoment" : "musicKnowledge template fallback",
    },
    diagnostics: diagnostics(),
  };
}

function getYearEndHot100ByYear(year, opts = {}) {
  try {
    const y = normalizeYear(year);
    if (!y) return null;
    const file = resolveYearEndFileForYear(y);
    const doc = safeReadJSON(file);
    if (!doc || !Array.isArray(doc.rows)) return null;
    const wantMeta = !!opts.meta;
    const meta = wantMeta ? {
      sourceFile: file,
      sourceTruth: "Data/wikipedia/charts/year_end_hot100_YYYY.json",
      year: y,
      warnings: [],
    } : null;

    const filtered = doc.rows
      .filter((row) => isObject(row))
      .filter((row) => {
        const pos = Number(row.pos);
        const title = cleanText(row.title);
        const artist = cleanText(row.artist);
        if (!Number.isFinite(pos)) return false;
        if (lower(title) === "title") return false;
        if (lower(artist) === "artist(s)") return false;
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

function getTop10ByYear(year, opts = {}) {
  try {
    const y = normalizeYear(year);
    if (!y) return null;
    const store = loadStore();
    const bucket = getYearBucket(store, y);
    if (!bucket) return null;
    const wantMeta = !!opts.meta;
    const top10Resolved = resolveTop10File();
    const meta = wantMeta ? {
      sourceFile: top10Resolved.file,
      sourceTruth: "top10_by_year_v1.json",
      storeVersion: cleanText(store && store.version) || "",
      storeChart: cleanText(store && store.chart) || "",
      year: y,
      warnings: [],
      extrasIgnored: [],
    } : null;
    const items = buildTop10(bucket.items, meta);
    const resolvedChart = cleanText(bucket.chart) || cleanText(store && store.chart) || CHART_DEFAULT;
    return {
      year: y,
      chart: resolvedChart,
      count: TOP10_REQUIRED_COUNT,
      items,
      ...(wantMeta ? { meta } : {}),
    };
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
    return top10.items
      .map((item, i) => `${Number.isFinite(item && item.pos) ? item.pos : i + 1}. \"${cleanText(item && item.title) || "—"}\"${cleanText(item && item.artist) ? " — " + cleanText(item && item.artist) : ""}`)
      .join("\n");
  } catch (_) {
    return "";
  }
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
  return {
    id: safeStr(id || ""),
    type: safeStr(type || "clarify"),
    prompt: safeStr(prompt || ""),
    required: required !== false,
  };
}

function baseSessionPatch(year, mode, chart, sourceFile) {
  const y = toIntYear(year);
  return {
    activeLane: LANE,
    lane: LANE,
    year: y,
    lastYear: y,
    lastMusicYear: y,
    lockedYear: y,
    mode,
    activeMusicMode: mode,
    lastMode: mode,
    lastAction: mode,
    activeMusicChart: cleanText(chart) || "",
    lastMusicChart: cleanText(chart) || "",
    knowledgeSource: cleanText(sourceFile) || "",
    knowledgeVersion: KNOWLEDGE_VERSION,
  };
}

function delegatedMoment(kind, year, top10) {
  const mod = getMusicMomentsMod();
  if (!mod || typeof mod.getMoment !== "function") return "";
  try {
    return cleanText(mod.getMoment({
      year: Number(year),
      chart: cleanText(top10 && top10.chart) || "",
      kind,
      top10,
    }));
  } catch (_) {
    return "";
  }
}

function defaultMomentText(kind, year, top10) {
  const y = spokenYear(year);
  const first = top10 && Array.isArray(top10.items) ? top10.items[0] : null;
  const anchor = first && cleanText(first.title) ? `The chart leader was \"${cleanText(first.title)}\"${cleanText(first.artist) ? ` by ${cleanText(first.artist)}` : ""}.` : "The chart data is loaded.";
  if (kind === "micro") {
    return `Micro moment — ${y}\n\n${anchor} That year carries a compact snapshot of the music mood, chart energy, and cultural pull.`;
  }
  return `Story moment — ${y}\n\n${anchor} This year sits inside a wider story about what listeners were choosing, repeating, and carrying forward.`;
}

function normalizeKnowledgeResponse(base) {
  const raw = isObject(base) ? base : {};
  const route = cleanText(raw.route || raw.actionTaken || raw.mode || "");
  const year = toIntYear(raw.year || raw.sessionPatch && raw.sessionPatch.lastMusicYear || raw.sessionPatch && raw.sessionPatch.year);
  const replyRaw = cleanText(raw.replyRaw || raw.reply || raw.text || raw.message || "");
  const sessionPatch = isObject(raw.sessionPatch) ? raw.sessionPatch : {};
  const followUps = Array.isArray(raw.followUps) ? raw.followUps : [];
  const followUpsStrings = Array.isArray(raw.followUpsStrings) ? raw.followUpsStrings : followUps.map((x) => cleanText(x && x.label)).filter(Boolean);
  const meta = isObject(raw.meta) ? raw.meta : {};
  const data = raw.data;
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
    data,
    meta: {
      source: "musicKnowledge",
      version: KNOWLEDGE_VERSION,
      ...(meta || {}),
    },
  };
}

function handleTop10(year, opts = {}) {
  const y = normalizeYear(year);
  if (!y) {
    const fu = yearFollowUps("top10", 1988);
    return {
      ok: false,
      replyRaw: "Give me a valid year (YYYY).",
      route: "top10",
      actionTaken: "need_year",
      pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true),
      followUps: fu,
      followUpsStrings: fu.map((x) => x.label),
      meta: { code: "BAD_YEAR", provenance: { sourceTruth: "top10_by_year_v1.json" } },
    };
  }
  const top10 = getTop10ByYear(y, { meta: !!opts.meta });
  if (!top10) {
    const fu = yearFollowUps("top10", y);
    return {
      ok: false,
      replyRaw: `I do not have Top 10 data loaded for ${spokenYear(y)}.`,
      route: "top10",
      actionTaken: "year_not_found",
      pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true),
      followUps: fu,
      followUpsStrings: fu.map((x) => x.label),
      meta: { code: "YEAR_NOT_FOUND", year: y, provenance: { sourceTruth: "top10_by_year_v1.json" } },
    };
  }
  const replyRaw = `Top 10 — ${spokenYear(y)}\n\n${renderTop10Text(top10) || "No chart rows available."}`;
  const sessionPatch = baseSessionPatch(y, "top10", top10.chart, top10.meta && top10.meta.sourceFile);
  const fu = modeFollowUps(y);
  return {
    ok: true,
    replyRaw,
    route: "top10",
    actionTaken: "served_top10",
    topic: LANE,
    spineStage: "deliver",
    sessionPatch,
    pendingAsk: null,
    followUps: fu,
    followUpsStrings: fu.map((x) => x.label),
    data: top10,
    meta: {
      ...(opts.meta === true ? { top10Meta: top10.meta || null } : {}),
      provenance: {
        sourceTruth: "top10_by_year_v1.json",
        sourceFile: (top10.meta && top10.meta.sourceFile) || resolveTop10File().file,
        routeSource: "top10",
      },
    },
  };
}

function handleNumberOne(year, opts = {}) {
  const y = normalizeYear(year);
  if (!y) {
    const fu = yearFollowUps("number1", 1988);
    return {
      ok: false,
      replyRaw: "Give me a year (YYYY) for the #1 song.",
      route: "number1",
      actionTaken: "need_year",
      pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true),
      followUps: fu,
      followUpsStrings: fu.map((x) => x.label),
      meta: { code: "BAD_YEAR", provenance: { sourceTruth: "derived_from_top10" } },
    };
  }
  const numberOne = getNumberOneByYear(y, { meta: !!opts.meta });
  if (!numberOne) {
    const fu = yearFollowUps("number1", y);
    return {
      ok: false,
      replyRaw: `I do not have #1 data loaded for ${spokenYear(y)}. Pick another year.`,
      route: "number1",
      actionTaken: "year_not_found",
      pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true),
      followUps: fu,
      followUpsStrings: fu.map((x) => x.label),
      meta: { code: "YEAR_NOT_FOUND", year: y, provenance: { sourceTruth: "derived_from_top10" } },
    };
  }
  const replyRaw = `#1 song — ${spokenYear(y)}\n\n1. \"${cleanText(numberOne.title) || "—"}\"${cleanText(numberOne.artist) ? ` — ${cleanText(numberOne.artist)}` : ""}`;
  const sessionPatch = baseSessionPatch(y, "number1", numberOne.chart, numberOne.meta && numberOne.meta.sourceFile);
  const fu = modeFollowUps(y);
  return {
    ok: true,
    replyRaw,
    route: "number1",
    actionTaken: "served_number1",
    topic: LANE,
    spineStage: "deliver",
    sessionPatch,
    pendingAsk: null,
    followUps: fu,
    followUpsStrings: fu.map((x) => x.label),
    data: numberOne,
    meta: {
      ...(opts.meta === true && numberOne.meta ? { top10Meta: numberOne.meta } : {}),
      provenance: {
        sourceTruth: "derived_from_top10",
        sourceFile: (numberOne.meta && numberOne.meta.sourceFile) || resolveTop10File().file,
        routeSource: "number1",
      },
    },
  };
}

function handleStoryMoment(year, opts = {}) {
  const y = normalizeYear(year);
  if (!y) {
    const fu = yearFollowUps("story_moment", 1988);
    return {
      ok: false,
      replyRaw: "Give me a year (YYYY) for the story moment.",
      route: "story_moment",
      actionTaken: "need_year",
      pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true),
      followUps: fu,
      followUpsStrings: fu.map((x) => x.label),
      meta: { code: "BAD_YEAR" },
    };
  }
  const top10 = getTop10ByYear(y, { meta: !!opts.meta });
  if (!top10) {
    const fu = yearFollowUps("story_moment", y);
    return {
      ok: false,
      replyRaw: `I do not have chart data loaded for ${spokenYear(y)}. Pick another year.`,
      route: "story_moment",
      actionTaken: "year_not_found",
      pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true),
      followUps: fu,
      followUpsStrings: fu.map((x) => x.label),
      meta: { code: "YEAR_NOT_FOUND", year: y },
    };
  }
  const delegated = delegatedMoment("story", y, top10);
  const replyRaw = delegated || defaultMomentText("story", y, top10);
  const sessionPatch = baseSessionPatch(y, "story_moment", top10.chart, top10.meta && top10.meta.sourceFile);
  const fu = modeFollowUps(y);
  return {
    ok: true,
    replyRaw,
    route: "story_moment",
    actionTaken: delegated ? "served_story_moment_delegated" : "served_story_moment_template",
    topic: LANE,
    spineStage: "deliver",
    sessionPatch,
    pendingAsk: null,
    followUps: fu,
    followUpsStrings: fu.map((x) => x.label),
    data: { year: y, chart: top10.chart, type: "story_moment", text: replyRaw, anchor: top10.items && top10.items[0] ? top10.items[0] : null },
    meta: {
      delegated: !!delegated,
      provenance: {
        sourceTruth: delegated ? "musicMoments.getMoment" : "musicKnowledge template fallback",
        sourceFile: (top10.meta && top10.meta.sourceFile) || resolveTop10File().file,
        routeSource: "story_moment",
      },
    },
  };
}

function handleMicroMoment(year, opts = {}) {
  const y = normalizeYear(year);
  if (!y) {
    const fu = yearFollowUps("micro_moment", 1988);
    return {
      ok: false,
      replyRaw: "Give me a year (YYYY) for the micro moment.",
      route: "micro_moment",
      actionTaken: "need_year",
      pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true),
      followUps: fu,
      followUpsStrings: fu.map((x) => x.label),
      meta: { code: "BAD_YEAR" },
    };
  }
  const top10 = getTop10ByYear(y, { meta: !!opts.meta });
  if (!top10) {
    const fu = yearFollowUps("micro_moment", y);
    return {
      ok: false,
      replyRaw: `I do not have chart data loaded for ${spokenYear(y)}. Pick another year.`,
      route: "micro_moment",
      actionTaken: "year_not_found",
      pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true),
      followUps: fu,
      followUpsStrings: fu.map((x) => x.label),
      meta: { code: "YEAR_NOT_FOUND", year: y },
    };
  }
  const delegated = delegatedMoment("micro", y, top10);
  const replyRaw = delegated || defaultMomentText("micro", y, top10);
  const sessionPatch = baseSessionPatch(y, "micro_moment", top10.chart, top10.meta && top10.meta.sourceFile);
  const fu = modeFollowUps(y);
  return {
    ok: true,
    replyRaw,
    route: "micro_moment",
    actionTaken: delegated ? "served_micro_moment_delegated" : "served_micro_moment_template",
    topic: LANE,
    spineStage: "deliver",
    sessionPatch,
    pendingAsk: null,
    followUps: fu,
    followUpsStrings: fu.map((x) => x.label),
    data: { year: y, chart: top10.chart, type: "micro_moment", text: replyRaw, anchor: top10.items && top10.items[0] ? top10.items[0] : null },
    meta: {
      delegated: !!delegated,
      provenance: {
        sourceTruth: delegated ? "musicMoments.getMoment" : "musicKnowledge template fallback",
        sourceFile: (top10.meta && top10.meta.sourceFile) || resolveTop10File().file,
        routeSource: "micro_moment",
      },
    },
  };
}

function handleYearEndHot100(year, opts = {}) {
  const y = normalizeYear(year);
  if (!y) {
    const fu = yearFollowUps("yearend_hot100", 1988);
    return {
      ok: false,
      replyRaw: "Give me a year (YYYY) for the Year-End Hot 100.",
      route: "yearend_hot100",
      actionTaken: "need_year",
      pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true),
      followUps: fu,
      followUpsStrings: fu.map((x) => x.label),
      meta: { code: "BAD_YEAR" },
    };
  }
  let yearEnd = getYearEndHot100ByYear(y, { meta: !!opts.meta });
  let mode = "full";
  if (!yearEnd) {
    const top10 = getTop10ByYear(y, { meta: !!opts.meta });
    if (!top10) {
      const fu = yearFollowUps("yearend_hot100", y);
      return {
        ok: false,
        replyRaw: `I do not have Year-End Hot 100 data loaded for ${spokenYear(y)}. Pick another year.`,
        route: "yearend_hot100",
        actionTaken: "year_not_found",
        pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true),
        followUps: fu,
        followUpsStrings: fu.map((x) => x.label),
        meta: { code: "YEAR_NOT_FOUND", year: y },
      };
    }
    yearEnd = top10;
    mode = YEAREND_MODE;
  }
  const previewItems = Array.isArray(yearEnd.items) ? yearEnd.items.slice(0, Math.min(10, yearEnd.items.length)) : [];
  const replyRaw = `Year-End Hot 100 — ${spokenYear(y)}${mode === YEAREND_MODE ? " (excerpt)" : ""}\n\n${renderTop10Text({ items: previewItems }) || "No chart rows available."}`;
  const sessionPatch = baseSessionPatch(y, "yearend_hot100", yearEnd.chart, yearEnd.meta && yearEnd.meta.sourceFile);
  const fu = modeFollowUps(y);
  return {
    ok: true,
    replyRaw,
    route: "yearend_hot100",
    actionTaken: mode === YEAREND_MODE ? "served_yearend_excerpt" : "served_yearend_full",
    topic: LANE,
    spineStage: "deliver",
    sessionPatch,
    pendingAsk: null,
    followUps: fu,
    followUpsStrings: fu.map((x) => x.label),
    data: { ...yearEnd, mode },
    meta: {
      yearendMode: mode,
      provenance: {
        sourceTruth: mode === YEAREND_MODE ? "top10_excerpt_from_top10_by_year_v1_json" : "Data/wikipedia/charts/year_end_hot100_YYYY.json",
        sourceFile: (yearEnd.meta && yearEnd.meta.sourceFile) || (resolveYearEndFileForYear(y) || resolveTop10File().file),
        routeSource: "yearend_hot100",
      },
    },
  };
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
  const m = safeStr(text).match(/\b(19[5-9]\d|20[0-2]\d|2025)\b/);
  if (m) return Number(m[1]);
  return toIntYear(session && (session.lastMusicYear || session.year || session.lockedYear));
}

function handleMusicTurn(input = {}) {
  try {
    const action = cleanText(input.action || input.norm && input.norm.action || "").toLowerCase() || inferActionFromText(input.text || "");
    const year = input.year != null ? Number(input.year) : inferYearFromText(input.text || "", input.session || {});
    const opts = input.opts || {};
    if (action === "top10") return normalizeKnowledgeResponse({ ...handleTop10(year, opts), year });
    if (action === "number1") return normalizeKnowledgeResponse({ ...handleNumberOne(year, opts), year });
    if (action === "story_moment") return normalizeKnowledgeResponse({ ...handleStoryMoment(year, opts), year });
    if (action === "micro_moment") return normalizeKnowledgeResponse({ ...handleMicroMoment(year, opts), year });
    if (action === "yearend_hot100") return normalizeKnowledgeResponse({ ...handleYearEndHot100(year, opts), year });

    const fallbackFollowUps = modeFollowUps(year || 1988);
    return {
      ok: false,
      replyRaw: "Give me the music action and year and I will run it.",
      route: "clarify",
      actionTaken: "clarify",
      pendingAsk: pendingAskObj("need_action", "clarify", "Give me the music action and year.", true),
      followUps: fallbackFollowUps,
      followUpsStrings: fallbackFollowUps.map((x) => x.label),
      meta: { capabilities: getCapabilities() },
    };
  } catch (e) {
    const retries = yearFollowUps("top10", 1988);
    return {
      ok: false,
      replyRaw: "Music knowledge hit a snag. Give me a year and try again.",
      route: "error",
      actionTaken: "exception",
      pendingAsk: pendingAskObj("retry", "clarify", "Give me a year and try again.", true),
      followUps: retries,
      followUpsStrings: retries.map((x) => x.label),
      meta: { error: safeStr(e && e.message ? e.message : e), diagnostics: diagnostics() },
    };
  }
}

async function handleChat({ text, session, visitorId, debug } = {}) {
  const action = inferActionFromText(text || "");
  const year = inferYearFromText(text || "", session || {});
  const out = handleMusicTurn({ text, session, visitorId, year, action, opts: { meta: !!debug } });
  return {
    ok: !!out.ok,
    reply: out.replyRaw || out.reply || "",
    replyRaw: out.replyRaw || out.reply || "",
    text: out.replyRaw || out.reply || "",
    followUps: out.followUps || [],
    followUpsStrings: out.followUpsStrings || [],
    sessionPatch: out.sessionPatch || {},
    data: out.data,
    meta: {
      route: out.route || "",
      actionTaken: out.actionTaken || "",
      capabilities: getCapabilities(),
      ...(isObject(out.meta) ? out.meta : {}),
    },
  };
}

module.exports = {
  KNOWLEDGE_VERSION,
  diagnostics,
  getCapabilities,
  getTop10ByYear,
  getNumberOneByYear,
  getYearEndHot100ByYear,
  handleTop10,
  handleNumberOne,
  handleStoryMoment,
  handleMicroMoment,
  handleYearEndHot100,
  handleMusicTurn,
  handleChat,
  inferActionFromText,
  inferYearFromText,
  normalizeYear,
  resolveDataFile,
  resolveYearEndFileForYear,
};
