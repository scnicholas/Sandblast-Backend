"use strict";

/**
 * Utils/psychologyKnowledge.js
 *
 * v1.3.0 (SYNERGY BRIDGE++++ + DETERMINISM++++ + NYX PSYCHE PROFILE++++ + SAFETY TIER++++)
 *
 * Psychology Knowledge Retrieval Layer
 *
 * Responsibilities:
 *  - Load domain packs from /Data/Domains/psychology/packs
 *  - Cache packs (mtime-based)
 *  - Provide deterministic retrieval functions
 *  - Detect safety escalation signals (legacy text-based)
 *  - Return structured knowledge objects
 *  - Provide Marion-safe hints API (NO RAW USER TEXT)
 *  - Provide Nyx-ready psyche profile (derived from Marion-safe hints only)
 *
 * NOT responsible for:
 *  - Tone composition (beyond providing cues)
 *  - Reply composition
 *  - Session mutation
 *  - Express/server logic
 *
 * MarionSO queries this module using getMarionHints({features,tokens,queryKey}).
 * Nyx can consume getNyxPsycheProfile({features,tokens,queryKey}).
 */

const fs = require("fs");
const path = require("path");

// =========================
// CONFIG
// =========================

const DOMAIN_DIR = path.resolve(__dirname, "..", "Data", "Domains", "psychology", "packs");

// Pack weights let you bias retrieval across packs (domain-level calibration).
// Higher weight = more likely to surface when scores tie.
const PACK_WEIGHTS = Object.freeze({
  "psy_clinical_safety_v1.json": 4.0,
  "psy_foundations_v1.json": 2.0,
  "psy_cognitive_v1.json": 2.2,
  "psy_development_v1.json": 1.8,
  "psy_social_v1.json": 1.8,
  "psy_research_methods_v1.json": 1.4,
  "psy_interventions_skills_v1.json": 2.4,
  "psy_biases_and_fallacies_v1.json": 1.7,
  "psy_dialogue_snippets_v1.json": 1.2,
  "psy_face_examples_v1.json": 1.0,
});

// Item-type weights (within-pack calibration).
const TYPE_WEIGHTS = Object.freeze({
  theory: 1.0,
  bias: 0.9,
  framework: 1.1,
  skill: 1.1,
  intervention: 1.1,
  method: 0.8,
  snippet: 0.7,
  example: 0.7,
  rule: 0.8,
  guardrail: 1.2,
});

// Deterministic caps (keep payload bounded for Marion/Nyx).
const LIMITS = Object.freeze({
  topItems: 6,
  topTheories: 3,
  topBiases: 3,
  topFrameworks: 4,
  topSkills: 4,
  topMethods: 3,
  topSnippets: 3,
  topExamples: 3,
  principles: 8,
  guardrails: 6,
  responseCues: 10,
  hits: 10,

  // Nyx psyche profile caps
  microSteps: 4,
  doDont: 6,
  uiCues: 8,
  primer: 6,
});

// =========================
// INTERNAL CACHE
// =========================

let _packCache = {
  mtimeMap: {},
  packs: {},
  index: null, // built lazily
  indexSig: "", // signature for change detection
};

// =========================
// HELPERS
// =========================

function isObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function safeReadJSON(file) {
  try {
    const txt = fs.readFileSync(file, "utf8");
    const clean = txt.charCodeAt(0) === 0xfeff ? txt.slice(1) : txt;
    return JSON.parse(clean);
  } catch (_e) {
    return null;
  }
}

function safeStat(file) {
  try {
    return fs.statSync(file);
  } catch (_e) {
    return null;
  }
}

function safeStr(x, max = 180) {
  if (x === null || x === undefined) return "";
  const s = String(x);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqBounded(arr, max = 8, maxLen = 80) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(arr) ? arr : []) {
    const v = safeStr(it, maxLen).trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function stableKeyForItem(item) {
  // Deterministic tie-breaker key: prefer id -> key -> title -> label -> name
  if (!isObject(item)) return "";
  return (
    safeStr(item.id || "", 80) ||
    safeStr(item.key || "", 80) ||
    safeStr(item.title || "", 80) ||
    safeStr(item.label || "", 80) ||
    safeStr(item.name || "", 80) ||
    ""
  ).toLowerCase();
}

function num(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(x) {
  const n = num(x, 0);
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * safeTokens
 * - Bounded
 * - Normalized
 * - Deduped
 */
function safeTokens(tokens, max = 18) {
  const out = [];
  const seen = new Set();
  for (const t of Array.isArray(tokens) ? tokens : []) {
    const v = normalizeText(t).slice(0, 32);
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * expandTokens
 * - Adds cheap bigrams (token_i + "_" + token_{i+1})
 * - Helps retrieval without raw text (Marion can provide a token stream)
 */
function expandTokens(tokens, max = 28) {
  const base = safeTokens(tokens, 22);
  const out = base.slice();
  const seen = new Set(out);

  for (let i = 0; i < base.length - 1; i++) {
    const bi = `${base[i]}_${base[i + 1]}`.slice(0, 40);
    if (!seen.has(bi)) {
      seen.add(bi);
      out.push(bi);
      if (out.length >= max) break;
    }
  }
  return out.slice(0, max);
}

function packSignature(files) {
  // deterministic signature to detect changes (mtime + filename)
  // best-effort; avoids constant rebuild
  const parts = [];
  for (const f of files) {
    const st = safeStat(path.join(DOMAIN_DIR, f));
    const mt = st ? Number(st.mtimeMs || 0) : 0;
    parts.push(`${f}:${mt}`);
  }
  return parts.sort().join("|");
}

// =========================
// PACK LOADER
// =========================

function loadPack(fileName) {
  const fullPath = path.join(DOMAIN_DIR, fileName);
  const stat = safeStat(fullPath);
  if (!stat || !stat.isFile()) return null;

  const mtime = Number(stat.mtimeMs || 0);

  if (_packCache.packs[fileName] && _packCache.mtimeMap[fileName] === mtime) {
    return _packCache.packs[fileName];
  }

  const data = safeReadJSON(fullPath);
  if (!data) return null;

  _packCache.packs[fileName] = data;
  _packCache.mtimeMap[fileName] = mtime;

  // invalidate index on any pack refresh
  _packCache.index = null;
  _packCache.indexSig = "";

  return data;
}

function listPackFiles() {
  let files = [];
  try {
    files = fs.readdirSync(DOMAIN_DIR);
  } catch (_e) {
    return [];
  }
  return files.filter((f) => f.endsWith(".json"));
}

function loadAllPacks() {
  const files = listPackFiles();
  const packs = [];
  for (const file of files) {
    const pack = loadPack(file);
    if (pack) packs.push({ file, pack });
  }
  return packs;
}

// =========================
// INDEX BUILDER (for scoring across packs)
// =========================

function getPackId(pack, fallbackFile) {
  if (isObject(pack) && typeof pack.packId === "string" && pack.packId.trim()) return pack.packId.trim();
  return fallbackFile || "pack";
}

function getPackVersion(pack) {
  if (isObject(pack) && typeof pack.version === "string" && pack.version.trim()) return pack.version.trim();
  return "";
}

function extractItemsFromPack(file, pack) {
  // unified item list:
  // { type, id, title, tags[], keywords[], intentSignals[], needs[], frameworks[], principles[], guardrails[], stanceHints[], focusHints[], payload, packId, packFile }
  const packId = getPackId(pack, file);
  const out = [];

  function getHints(raw) {
    if (!isObject(raw)) return {};
    if (isObject(raw.retrievalHints)) return raw.retrievalHints;
    if (isObject(raw.hints)) return raw.hints;
    if (isObject(raw.meta) && isObject(raw.meta.retrievalHints)) return raw.meta.retrievalHints;
    return {};
  }

  function pushItem(type, raw) {
    if (!isObject(raw)) return;

    const hints = getHints(raw);

    const tags = Array.isArray(raw.tags) ? raw.tags : (Array.isArray(hints.tags) ? hints.tags : []);
    const keywords = Array.isArray(hints.keywords) ? hints.keywords : (Array.isArray(raw.keywords) ? raw.keywords : []);
    const intentSignals = Array.isArray(hints.intentSignals) ? hints.intentSignals : (Array.isArray(raw.intentSignals) ? raw.intentSignals : []);
    const needs = Array.isArray(hints.needs) ? hints.needs : (Array.isArray(raw.needs) ? raw.needs : []);
    const focusHints = Array.isArray(hints.focusHints) ? hints.focusHints : [];
    const stanceHints = Array.isArray(hints.stanceHints) ? hints.stanceHints : [];

    const id = raw.id || raw.key || raw.slug || raw.name || raw.title || raw.label || "";
    const title = raw.title || raw.label || raw.name || raw.id || "";

    out.push({
      type,
      id: safeStr(id, 120),
      title: safeStr(title, 140),
      tags: uniqBounded(tags, 10, 40),
      keywords: uniqBounded(keywords, 14, 40),
      intentSignals: uniqBounded(intentSignals, 12, 40),
      needs: uniqBounded(needs, 12, 40),
      focusHints: uniqBounded(focusHints, 6, 40),
      stanceHints: uniqBounded(stanceHints, 6, 40),

      // optional shaping fields (kept bounded)
      principles: uniqBounded(raw.principles || [], 6, 70),
      guardrails: uniqBounded(raw.guardrails || [], 6, 70),
      frameworks: uniqBounded(raw.frameworks || raw.framework || [], 6, 40),

      // raw payload kept, but never returned wholesale to Marion/Nyx (we only take atoms)
      payload: raw,

      packId,
      packFile: file,
      packVersion: getPackVersion(pack),
    });
  }

  // Known containers
  if (Array.isArray(pack.theories)) for (const t of pack.theories) pushItem("theory", t);
  if (Array.isArray(pack.biases)) for (const b of pack.biases) pushItem("bias", b);
  if (Array.isArray(pack.frameworks)) for (const f of pack.frameworks) pushItem("framework", f);
  if (Array.isArray(pack.skills)) for (const sk of pack.skills) pushItem("skill", sk);
  if (Array.isArray(pack.interventions)) for (const iv of pack.interventions) pushItem("intervention", iv);
  if (Array.isArray(pack.methods)) for (const m of pack.methods) pushItem("method", m);

  if (Array.isArray(pack.snippets)) for (const sn of pack.snippets) pushItem("snippet", sn);
  if (Array.isArray(pack.dialogueSnippets)) for (const sn of pack.dialogueSnippets) pushItem("snippet", sn);
  if (Array.isArray(pack.faceExamples)) for (const ex of pack.faceExamples) pushItem("example", ex);
  if (Array.isArray(pack.examples)) for (const ex of pack.examples) pushItem("example", ex);

  if (Array.isArray(pack.rules)) for (const r of pack.rules) pushItem("rule", r);
  if (Array.isArray(pack.guardrails)) for (const g of pack.guardrails) pushItem("guardrail", g);

  // Generic schemas (optional)
  if (Array.isArray(pack.items)) {
    for (const it of pack.items) {
      const t = safeStr(it?.type || "theory", 24).toLowerCase();
      pushItem(t, it);
    }
  }
  if (Array.isArray(pack.entries)) {
    for (const it of pack.entries) {
      const t = safeStr(it?.type || "theory", 24).toLowerCase();
      pushItem(t, it);
    }
  }

  return out;
}

function refreshIndexIfChanged() {
  const files = listPackFiles();
  const sig = packSignature(files);
  if (_packCache.index && _packCache.indexSig === sig) return _packCache.index;
  _packCache.index = null;
  _packCache.indexSig = "";
  return buildIndex();
}

function buildIndex() {
  if (_packCache.index) return _packCache.index;

  const loaded = loadAllPacks();
  const items = [];
  const packMeta = {};
  const files = listPackFiles();
  const sig = packSignature(files);

  for (const { file, pack } of loaded) {
    const packId = getPackId(pack, file);
    packMeta[file] = {
      file,
      packId,
      version: getPackVersion(pack),
      weight: num(PACK_WEIGHTS[file], 1.0),
    };
    const extracted = extractItemsFromPack(file, pack);
    for (const it of extracted) items.push(it);
  }

  // stable sort baseline for deterministic index ordering
  items.sort((a, b) => {
    if (a.type !== b.type) return String(a.type).localeCompare(String(b.type));
    if (a.packFile !== b.packFile) return String(a.packFile).localeCompare(String(b.packFile));
    return stableKeyForItem(a).localeCompare(stableKeyForItem(b));
  });

  _packCache.index = { items, packMeta };
  _packCache.indexSig = sig;
  return _packCache.index;
}

// =========================
// SAFETY DETECTION (text-based, for non-Marion callers only)
// =========================

function detectSafetySignals(text) {
  const input = normalizeText(text);
  const clinicalPack = loadPack("psy_clinical_safety_v1.json");
  if (!clinicalPack || !isObject(clinicalPack.riskSignals)) {
    return { detected: false, mode: "NON_CLINICAL", signal: null };
  }

  const signals = clinicalPack.riskSignals;
  let highest = null;

  for (const key of Object.keys(signals)) {
    const group = signals[key];
    const patterns = Array.isArray(group.patterns) ? group.patterns : [];

    for (const pattern of patterns) {
      const p = normalizeText(pattern);
      if (!p) continue;

      if (input.includes(p)) {
        if (!highest || num(group.priority, 0) > num(highest.priority, 0)) {
          highest = {
            id: key,
            label: group.label,
            mode: group.responseMode,
            priority: num(group.priority, 0),
          };
        }
      }
    }
  }

  if (!highest) return { detected: false, mode: "NON_CLINICAL", signal: null };
  return { detected: true, mode: highest.mode, signal: highest };
}

// =========================
// WEIGHTED SCORING (Marion-safe: uses tokens/features, not raw text)
// =========================

function scoreItemAgainstTokens(item, tokens, features) {
  const tset = new Set(expandTokens(tokens, 28));
  const f = isObject(features) ? features : {};

  let score = 0;

  // base: keyword hits
  for (const k of item.keywords || []) {
    const nk = normalizeText(k);
    if (nk && tset.has(nk)) score += 2.0;
  }

  // intent signals (higher value)
  for (const s of item.intentSignals || []) {
    const ns = normalizeText(s);
    if (ns && tset.has(ns)) score += 3.0;
  }

  // needs (medium-high)
  for (const n of item.needs || []) {
    const nn = normalizeText(n);
    if (nn && tset.has(nn)) score += 2.5;
  }

  // tags (lighter)
  for (const tag of item.tags || []) {
    const nt = normalizeText(tag);
    if (nt && tset.has(nt)) score += 1.0;
  }

  // feature alignment boosts (no text, only enums)
  const intent = safeStr(f.intent || "", 16).toUpperCase();
  const reg = safeStr(f.regulationState || "", 18).toLowerCase();
  const load = safeStr(f.cognitiveLoad || "", 12).toLowerCase();
  const desire = safeStr(f.desire || "", 16).toLowerCase();

  // If dysregulated / stabilize, prefer skills/interventions/guardrails
  if (intent === "STABILIZE" || reg === "dysregulated") {
    if (item.type === "skill" || item.type === "intervention" || item.type === "guardrail") score += 1.2;
    if (item.type === "theory" || item.type === "method") score -= 0.4;
  }

  // If high load, prefer concise tools (skills/snippets)
  if (load === "high") {
    if (item.type === "snippet" || item.type === "skill") score += 0.8;
    if (item.type === "method") score -= 0.3;
  }

  // Desire shaping
  if (desire === "mastery" && (item.type === "framework" || item.type === "theory" || item.type === "method")) score += 0.8;
  if (desire === "comfort" && (item.type === "skill" || item.type === "intervention" || item.type === "snippet")) score += 0.6;

  // pack + type weighting
  const packW = num(PACK_WEIGHTS[item.packFile], 1.0);
  const typeW = num(TYPE_WEIGHTS[item.type], 1.0);

  // Multiply signal by typeW, then add packW as tie-bias.
  score = score * typeW + packW * 0.35;

  return score;
}

function rankItems(tokens, features) {
  const idx = refreshIndexIfChanged();
  const items = idx.items || [];

  const scored = [];
  for (const it of items) {
    const s = scoreItemAgainstTokens(it, tokens, features);
    if (s > 0.75) {
      scored.push({
        item: it,
        score: s,
        tie: stableKeyForItem(it),
      });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.item.packFile !== b.item.packFile) return String(a.item.packFile).localeCompare(String(b.item.packFile));
    return String(a.tie).localeCompare(String(b.tie));
  });

  return scored;
}

function pickTopByType(scored, type, max) {
  const out = [];
  for (const s of scored) {
    if (s.item.type !== type) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

// =========================
// SNIPPET + EXAMPLE SELECTION (bounded atoms)
// =========================

function extractSnippetAtom(item) {
  // We do NOT return full scripts. Only a tiny “style cue” or “pattern” atom.
  const p = isObject(item.payload) ? item.payload : {};
  const atom = {
    id: safeStr(item.id || item.title || "", 64),
    pattern: safeStr(p.pattern || p.template || p.cue || p.label || item.title || "", 120),
    usage: safeStr(p.usage || p.when || "", 90),
  };
  if (!atom.pattern) atom.pattern = safeStr(item.title || item.id || "snippet", 120);
  return atom;
}

function extractFaceExampleAtom(item) {
  const p = isObject(item.payload) ? item.payload : {};
  return {
    id: safeStr(item.id || item.title || "", 64),
    scenario: safeStr(p.scenario || p.context || item.title || "", 120),
    note: safeStr(p.note || p.point || "", 90),
  };
}

// =========================
// PUBLIC (legacy) RETRIEVAL BY TEXT
// =========================

function scoreTheoryMatch(theory, text) {
  const input = normalizeText(text);
  const hints = isObject(theory.retrievalHints) ? theory.retrievalHints : {};
  const keywords = Array.isArray(hints.keywords) ? hints.keywords : [];
  const intentSignals = Array.isArray(hints.intentSignals) ? hints.intentSignals : [];

  let score = 0;
  for (const k of keywords) if (input.includes(normalizeText(k))) score += 2;
  for (const s of intentSignals) if (input.includes(normalizeText(s))) score += 3;
  return score;
}

function retrieveRelevantTheories(text) {
  const packs = loadAllPacks();
  const matches = [];

  for (const { pack } of packs) {
    if (!Array.isArray(pack.theories)) continue;
    for (const theory of pack.theories) {
      const score = scoreTheoryMatch(theory, text);
      if (score > 0) {
        matches.push({ theory, score, packId: pack.packId || "" });
      }
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, LIMITS.topTheories).map((m) => m.theory);
}

function retrieveRelevantBiases(text) {
  const pack = loadPack("psy_biases_and_fallacies_v1.json");
  if (!pack) return [];

  const input = normalizeText(text);
  const matches = [];

  for (const bias of pack.biases || []) {
    let score = 0;
    const hints = isObject(bias.retrievalHints) ? bias.retrievalHints : {};
    for (const k of hints.keywords || []) if (input.includes(normalizeText(k))) score += 2;
    for (const s of hints.intentSignals || []) if (input.includes(normalizeText(s))) score += 3;
    if (score > 0) matches.push({ bias, score });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, LIMITS.topBiases).map((m) => m.bias);
}

/**
 * queryPsychology(text)
 *
 * Returns:
 * {
 *   safety: { detected, mode, signal },
 *   theories: [...],
 *   biases: [...]
 * }
 */
function queryPsychology(text) {
  const safety = detectSafetySignals(text);
  const theories = retrieveRelevantTheories(text);
  const biases = retrieveRelevantBiases(text);
  return { safety, theories, biases };
}

// =========================
// MARION-SAFE API (NO RAW USER TEXT)
// =========================

function inferRiskTier(features, tokens) {
  // No raw text. Only features + derived tokens.
  const f = isObject(features) ? features : {};
  const reg = safeStr(f.regulationState || "", 18).toLowerCase();
  const intent = safeStr(f.intent || "", 16).toUpperCase();
  const t = new Set(safeTokens(tokens, 24));

  // caller can pass explicit riskTier if it is already computed upstream
  const upstream = safeStr(f.riskTier || "", 12).toLowerCase();
  if (upstream === "high" || upstream === "elevated" || upstream === "low") return upstream;

  // heuristic:
  if (intent === "STABILIZE" || reg === "dysregulated") return "elevated";
  if (t.has("self_harm") || t.has("suicide") || t.has("harm")) return "high"; // only if Marion already encoded this token safely
  return "low";
}

function computeFocusAndStance(features, top) {
  const f = isObject(features) ? features : {};
  const intent = safeStr(f.intent || "", 16).toUpperCase();
  const reg = safeStr(f.regulationState || "", 18).toLowerCase();
  const desire = safeStr(f.desire || "", 18).toLowerCase();

  let focus = "general_psych";
  let stance = "teach+verify";

  if (intent === "STABILIZE" || reg === "dysregulated") {
    focus = "emotion_regulation";
    stance = "contain+options";
  } else if (desire === "mastery") {
    focus = "framework_building";
    stance = "teach+structure";
  }

  const biasCount = top.filter((x) => x.item.type === "bias").length;
  const skillCount = top.filter((x) => x.item.type === "skill" || x.item.type === "intervention").length;
  const methodCount = top.filter((x) => x.item.type === "method").length;

  if (biasCount >= 2) focus = "cognitive_bias";
  if (skillCount >= 2 && (intent === "ADVANCE" || intent === "CLARIFY")) focus = "skill_building";
  if (methodCount >= 2) focus = "research_literacy";

  return { focus, stance };
}

function confidenceFromScores(scored) {
  if (!Array.isArray(scored) || !scored.length) return 0;
  const top = scored[0].score;
  const second = scored.length > 1 ? scored[1].score : 0;
  const spread = top - second;
  const base = Math.min(1, top / 10);
  const sep = Math.min(1, spread / 3);
  return clamp01(0.35 * base + 0.65 * (0.6 * base + 0.4 * sep));
}

/**
 * getMarionHints({ features, tokens, queryKey })
 *
 * IMPORTANT:
 *  - MUST NOT receive or use raw user text.
 *  - Operates only on tokens/features already derived by MarionSO.
 */
function getMarionHints(input) {
  const features = isObject(input?.features) ? input.features : {};
  const tokens = safeTokens(input?.tokens || [], 18);
  const queryKey = safeStr(input?.queryKey || "", 24);

  const idx = refreshIndexIfChanged();
  const scored = rankItems(tokens, features);

  const top = scored.slice(0, LIMITS.topItems);

  const topTheories = pickTopByType(scored, "theory", LIMITS.topTheories);
  const topBiases = pickTopByType(scored, "bias", LIMITS.topBiases);
  const topFrameworks = pickTopByType(scored, "framework", LIMITS.topFrameworks);

  const topSkillOnly = pickTopByType(scored, "skill", LIMITS.topSkills);
  const needMore = Math.max(0, LIMITS.topSkills - topSkillOnly.length);
  const topSkills = topSkillOnly.concat(pickTopByType(scored, "intervention", needMore));

  const topMethods = pickTopByType(scored, "method", LIMITS.topMethods);

  const snippetPicks = pickTopByType(scored, "snippet", LIMITS.topSnippets).map((x) => extractSnippetAtom(x.item));
  const examplePicks = pickTopByType(scored, "example", LIMITS.topExamples).map((x) => extractFaceExampleAtom(x.item));

  const { focus, stance } = computeFocusAndStance(features, top);

  const principles = [];
  const frameworks = [];
  const guardrails = [];
  const exampleTypes = [];
  const responseCues = [];

  for (const s of top) {
    const it = s.item;

    for (const p of it.principles || []) principles.push(p);
    for (const fw of it.frameworks || []) frameworks.push(fw);
    for (const g of it.guardrails || []) guardrails.push(g);

    if (it.type === "example") exampleTypes.push("everyday");
    if (it.type === "snippet") exampleTypes.push("dialogue");

    if (it.type === "skill" || it.type === "intervention") responseCues.push("offer_2_3_micro_steps");
    if (it.type === "bias") responseCues.push("name_bias_then_reframe");
    if (it.type === "method") responseCues.push("define_terms_then_check_assumptions");
    if (it.type === "theory" || it.type === "framework") responseCues.push("use_simple_model_then_apply");
  }

  const intent = safeStr(features.intent || "", 16).toUpperCase();
  const reg = safeStr(features.regulationState || "", 18).toLowerCase();
  const load = safeStr(features.cognitiveLoad || "", 12).toLowerCase();
  const agency = safeStr(features.agencyPreference || "", 18).toLowerCase();

  if (intent === "CLARIFY") responseCues.push("ask_1_clarifier");
  if (intent === "ADVANCE") responseCues.push("confirm_then_execute");
  if (intent === "STABILIZE" || reg === "dysregulated") responseCues.push("grounding_breath_10sec");
  if (load === "high") responseCues.push("keep_short");
  if (agency === "autonomous") responseCues.push("offer_options_not_orders");

  const hits = [];
  for (const s of top.slice(0, LIMITS.hits)) {
    const it = s.item;
    const id = safeStr(it.id || it.title || "", 90);
    if (!id) continue;
    hits.push(`${it.type}:${id}`);
  }

  const packs = {
    foundations: idx.packMeta["psy_foundations_v1.json"]?.packId || "psy_foundations_v1",
    clinicalSafety: idx.packMeta["psy_clinical_safety_v1.json"]?.packId || "psy_clinical_safety_v1",
    biases: idx.packMeta["psy_biases_and_fallacies_v1.json"]?.packId || "psy_biases_and_fallacies_v1",
    cognitive: idx.packMeta["psy_cognitive_v1.json"]?.packId || "psy_cognitive_v1",
    development: idx.packMeta["psy_development_v1.json"]?.packId || "psy_development_v1",
    social: idx.packMeta["psy_social_v1.json"]?.packId || "psy_social_v1",
    research: idx.packMeta["psy_research_methods_v1.json"]?.packId || "psy_research_methods_v1",
    interventions: idx.packMeta["psy_interventions_skills_v1.json"]?.packId || "psy_interventions_skills_v1",
    dialogue: idx.packMeta["psy_dialogue_snippets_v1.json"]?.packId || "psy_dialogue_snippets_v1",
    faceExamples: idx.packMeta["psy_face_examples_v1.json"]?.packId || "psy_face_examples_v1",
  };

  const conf = confidenceFromScores(scored);

  const frameworkNames = uniqBounded(
    []
      .concat(topFrameworks.map((x) => x.item.title))
      .concat(topTheories.map((x) => x.item.title))
      .concat(frameworks),
    LIMITS.topFrameworks,
    48
  );

  const principleAtoms = uniqBounded(principles, LIMITS.principles, 70);

  const guardrailAtoms = uniqBounded(
    []
      .concat(guardrails)
      .concat(["avoid_diagnosis", "avoid_therapy_claims", "encourage_professional_help_if_risk"]),
    LIMITS.guardrails,
    70
  );

  const exampleTypeAtoms = uniqBounded(exampleTypes.concat(["workplace", "relationships"]), 6, 24);
  const cueAtoms = uniqBounded(responseCues, LIMITS.responseCues, 40);

  if (snippetPicks.length) cueAtoms.unshift("use_dialogue_pattern_atom");
  if (examplePicks.length) cueAtoms.unshift("use_face_example_atom");

  return {
    enabled: true,
    queryKey,

    packs,

    focus: safeStr(focus, 32),
    stance: safeStr(stance, 32),

    principles: principleAtoms,
    frameworks: frameworkNames,
    guardrails: guardrailAtoms,
    exampleTypes: exampleTypeAtoms,
    responseCues: cueAtoms,

    snippets: snippetPicks.slice(0, LIMITS.topSnippets),
    faceExamples: examplePicks.slice(0, LIMITS.topExamples),

    hits: uniqBounded(hits, LIMITS.hits, 96),
    confidence: conf,
    riskTier: inferRiskTier(features, tokens),
    reason: scored.length ? "weighted_scoring" : "no_hits",
  };
}

// Alternate alias (so Marion can call PsychologyK.query(...) if you prefer)
function query(input) {
  return getMarionHints(input);
}

// =========================
// NYX PSYCHE PROFILE (Marion-safe -> Nyx-ready)
// =========================

function getNyxPsycheProfile(input) {
  // This is strictly derived from Marion-safe hints and features/tokens.
  const hints = getMarionHints(input);
  const f = isObject(input?.features) ? input.features : {};
  const intent = safeStr(f.intent || "", 16).toUpperCase();
  const reg = safeStr(f.regulationState || "", 18).toLowerCase();
  const load = safeStr(f.cognitiveLoad || "", 12).toLowerCase();

  const riskTier = safeStr(hints.riskTier || "low", 12).toLowerCase();

  // Regulation state mapping for Nyx “psyche”
  let regulation = "steady";
  if (riskTier === "high") regulation = "crisis";
  else if (intent === "STABILIZE" || reg === "dysregulated") regulation = "fragile";
  else if (load === "high") regulation = "strained";

  // Tone cues are not "tone writing" — these are control signals Nyx can interpret
  const tone = [];
  if (regulation === "crisis") tone.push("calm", "direct", "safety_first");
  else if (regulation === "fragile") tone.push("warm", "grounded", "short_sentences");
  else if (hints.focus === "framework_building") tone.push("structured", "coaching");
  else tone.push("clear", "supportive");

  // UI cues Nyx can use (chips/pills/animation choices etc.)
  const uiCues = [];
  if (regulation !== "steady") uiCues.push("minimize_choices", "show_grounding_chip");
  if ((hints.responseCues || []).includes("ask_1_clarifier")) uiCues.push("single_clarifier_prompt");
  if ((hints.responseCues || []).includes("keep_short")) uiCues.push("compact_reply");

  // Micro-steps: canonical actions (Nyx can map these to chips)
  const microSteps = [];
  if (regulation === "crisis" || regulation === "fragile") microSteps.push("grounding_10s", "name_feeling", "choose_next_step");
  if (hints.focus === "skill_building") microSteps.push("pick_skill", "practice_once", "reflect");
  if (hints.focus === "cognitive_bias") microSteps.push("name_bias", "test_assumption", "reframe");
  if (hints.focus === "research_literacy") microSteps.push("define_terms", "check_evidence", "state_uncertainty");

  const doDont = [];
  // always-on posture
  doDont.push("do:offer_options", "do:verify_assumptions", "dont:diagnose");
  if (riskTier === "high") {
    doDont.push("do:encourage_professional_help", "dont:provide_clinical_instructions");
  } else {
    doDont.push("dont:overwhelm_user");
  }

  // “Primer” is what Nyx can prime herself with internally (bounded atoms only)
  const primer = uniqBounded(
    []
      .concat(hints.principles || [])
      .concat(hints.frameworks || [])
      .concat(hints.guardrails || []),
    LIMITS.primer,
    80
  );

  return {
    enabled: true,
    queryKey: hints.queryKey,
    confidence: hints.confidence,
    riskTier,
    regulation,
    focus: hints.focus,
    stance: hints.stance,

    tone: uniqBounded(tone, 6, 24),
    uiCues: uniqBounded(uiCues, LIMITS.uiCues, 28),
    microSteps: uniqBounded(microSteps, LIMITS.microSteps, 24),
    doDont: uniqBounded(doDont, LIMITS.doDont, 42),

    // atoms
    primer,
    snippetAtoms: (hints.snippets || []).slice(0, LIMITS.topSnippets),
    faceExampleAtoms: (hints.faceExamples || []).slice(0, LIMITS.topExamples),

    // diagnostics
    hits: hints.hits,
    packs: hints.packs,
    reason: "derived_from_marion_hints",
  };
}

// =========================
// EXPORTS
// =========================

module.exports = {
  // Marion-safe API
  getMarionHints,
  query,

  // Nyx psyche profile (safe bridge)
  getNyxPsycheProfile,

  // Legacy (text-based) API
  queryPsychology,
  detectSafetySignals,
  retrieveRelevantTheories,
  retrieveRelevantBiases,

  // Diagnostics / tuning
  _internal: {
    refreshIndexIfChanged,
    buildIndex,
    rankItems,
    scoreItemAgainstTokens,
    PACK_WEIGHTS,
    TYPE_WEIGHTS,
  },
};
