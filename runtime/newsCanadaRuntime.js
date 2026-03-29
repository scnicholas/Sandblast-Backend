
"use strict";

const fs = require("fs");
const path = require("path");

function safeStr(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function cleanText(v) {
  return safeStr(v).replace(/\s+/g, " ").trim();
}

function uniq(arr) {
  return Array.from(new Set(Array.isArray(arr) ? arr.filter(Boolean) : []));
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function traceLifecycle(stage, payload) {
  try {
    console.log(`[Sandblast][NewsCanada][${cleanText(stage || "trace") || "trace"}]`, isObj(payload) ? payload : payload || {});
  } catch (_) {}
}

function normalizeCandidateList(ctx) {
  const env = isObj(ctx && ctx.env) ? ctx.env : {};
  const processCwd = cleanText(ctx && ctx.processCwd || process.cwd()) || process.cwd();
  const dirname = cleanText(ctx && ctx.dirname || process.cwd()) || process.cwd();
  const pinnedFile = cleanText(ctx && ctx.pinnedFile || "data/newscanada/editors-picks.v2.json") || "data/newscanada/editors-picks.v2.json";
  const rawCandidates = uniq([
    ...(Array.isArray(ctx && ctx.candidates) ? ctx.candidates : []),
    env.NEWS_CANADA_DATA_FILE,
    env.SB_NEWSCANADA_DATA_FILE,
    path.join(processCwd, pinnedFile),
    path.join(dirname, pinnedFile),
    path.join(processCwd, "data", "NewsCanada", "editors-picks.v2.json"),
    path.join(processCwd, "data", "newscanada", "editors-picks.v2.json"),
    path.join(dirname, "data", "NewsCanada", "editors-picks.v2.json"),
    path.join(dirname, "data", "newscanada", "editors-picks.v2.json"),
    path.join(processCwd, "src", "data", "NewsCanada", "editors-picks.v2.json"),
    path.join(processCwd, "src", "data", "newscanada", "editors-picks.v2.json"),
    path.join(dirname, "src", "data", "NewsCanada", "editors-picks.v2.json"),
    path.join(dirname, "src", "data", "newscanada", "editors-picks.v2.json"),
    path.join(processCwd, "jobs", "news-canada", "data", "NewsCanada", "editors-picks.v2.json"),
    path.join(processCwd, "jobs", "news-canada", "data", "newscanada", "editors-picks.v2.json"),
    path.join(dirname, "jobs", "news-canada", "data", "NewsCanada", "editors-picks.v2.json"),
    path.join(dirname, "jobs", "news-canada", "data", "newscanada", "editors-picks.v2.json")
  ].map(cleanText).filter(Boolean));
  return rawCandidates;
}

function resolveNewsCanadaPaths(ctx) {
  const candidates = normalizeCandidateList(ctx);
  const diagnostics = candidates.map((candidate) => {
    let exists = false;
    try { exists = !!fs.existsSync(candidate); } catch (_) { exists = false; }
    return { file: candidate, exists };
  });

  const foundFile = diagnostics.find((entry) => entry.exists && cleanText(entry.file));
  const file = cleanText(foundFile && foundFile.file || diagnostics[0] && diagnostics[0].file || "");
  const chosenDir = file ? path.dirname(file) : "";

  return {
    file,
    editorsPicksPath: file,
    chosenDir,
    candidates,
    attemptedFiles: diagnostics
  };
}

function ensureEditorsPicksFile(ctx) {
  const resolved = resolveNewsCanadaPaths(ctx);
  const file = cleanText(resolved.file || resolved.editorsPicksPath || "");
  const chosenDir = cleanText(resolved.chosenDir || "");
  const fallbackStories = Array.isArray(ctx && ctx.fallbackStories) ? ctx.fallbackStories : [];
  let createdFallback = false;

  if (chosenDir && !fs.existsSync(chosenDir)) {
    fs.mkdirSync(chosenDir, { recursive: true });
    traceLifecycle("directory_created", { chosenDir });
  }

  if (file && !fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallbackStories, null, 2), "utf8");
    createdFallback = true;
    traceLifecycle("fallback_file_created", { file, stories: fallbackStories.length });
  }

  return {
    ...resolved,
    createdFallback
  };
}

function readEditorsPicksFromDisk(ctx) {
  const ensured = ensureEditorsPicksFile(ctx);
  const file = cleanText(ensured.file || ensured.editorsPicksPath || "");
  const strict = cleanText(isObj(ctx && ctx.env) ? ctx.env.DEBUG_NEWS_CANADA_STRICT : "").toLowerCase() === "true";

  if (!file) {
    return {
      ok: false,
      file: "",
      parsed: undefined,
      attemptedFiles: ensured.attemptedFiles,
      error: "news_canada_data_file_missing"
    };
  }

  if (strict && !fs.existsSync(file)) {
    throw new Error(`STRICT MODE: editors-picks file missing at ${file}`);
  }

  const raw = fs.readFileSync(file, "utf8");
  const parsed = JSON.parse(raw);
  return {
    ok: true,
    file,
    editorsPicksPath: file,
    parsed,
    source: createdSourceLabel(parsed),
    attemptedFiles: ensured.attemptedFiles,
    createdFallback: ensured.createdFallback
  };
}

function createdSourceLabel(parsed) {
  if (Array.isArray(parsed)) return "runtime_array";
  if (parsed && typeof parsed === "object") return "runtime_object";
  return "runtime_unknown";
}

function writeEditorsPicksToDisk(ctx, stories, meta) {
  const ensured = ensureEditorsPicksFile(ctx);
  const file = cleanText(ensured.file || ensured.editorsPicksPath || "");
  const payload = Array.isArray(stories) ? stories : [];
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  traceLifecycle("write_success", {
    file,
    count: payload.length,
    source: cleanText(meta && meta.source || "unknown") || "unknown",
    firstStory: payload[0] ? { id: payload[0].id, title: payload[0].title } : null
  });
  return {
    ok: true,
    file,
    count: payload.length,
    attemptedFiles: ensured.attemptedFiles
  };
}

module.exports = {
  resolveNewsCanadaPaths,
  ensureEditorsPicksFile,
  readEditorsPicksFromDisk,
  writeEditorsPicksToDisk,
  traceLifecycle
};
