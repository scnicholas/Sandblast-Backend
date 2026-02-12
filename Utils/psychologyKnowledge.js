"use strict";

/**
 * Utils/psychologyKnowledge.js
 *
 * Psychology Knowledge Retrieval Layer
 *
 * Responsibilities:
 *  - Load domain packs from /Data/Domains/psychology/packs
 *  - Cache packs (mtime-based)
 *  - Provide deterministic retrieval functions
 *  - Detect safety escalation signals
 *  - Return structured knowledge objects
 *  - Select dialogue snippets + face examples (weighted scoring between packs)
 *
 * NOT responsible for:
 *  - Tone
 *  - Reply composition
 *  - Session mutation
 *  - Express/server logic
 *
 * MarionSO queries this module.
 */

const fs = require("fs");
const path = require("path");

// =========================
// CONFIG
// =========================

const DOMAIN_DIR = path.resolve(__dirname, "..", "Data", "Domains", "psychology", "packs");

// Pack weighting (cross-pack arbitration).
// Higher weight => more likely to win ties / bubble up in top-K selection.
// You can tune these without changing pack JSON.
const PACK_WEIGHTS = Object.freeze({
  // safety is detection-only (not content retrieval), but kept for completeness:
  psy_clinical_safety_v1: 2.0,

  psy_foundations_v1: 1.15,
  psy_cognitive_v1: 1.15,
  psy_development_v1: 1.05,
  psy_social_v1: 1.10,
  psy_research_methods_v1: 0.95,
  psy_interventions_skills_v1: 1.05,

  psy_biases_and_fallacies_v1: 1.20,
  psy_dialogue_snippets_v1: 1.00,
  psy_face_examples_v1: 1.05
});

// Output caps (bounded, deterministic)
const MAX_THEORIES = 3;
const MAX_BIASES = 3;
const MAX_SNIPPETS = 3;
const MAX_FACE_EXAMPLES = 2;

// =========================
// INTERNAL CACHE
// =========================

let _packCache = {
  mtimeMap: {},
  packs: {}
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

function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}

function normalizeText(text) {
  return safeStr(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s:_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniq(arr, max = 64) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(arr) ? arr : []) {
    const v = safeStr(it).trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function tokenize(text) {
  const t = normalizeText(text);
  if (!t) return [];
  const parts = t.split(" ").filter(Boolean);
  // basic stopwords (tiny set, keep deterministic)
  const stop = new Set(["the", "and", "or", "a", "an", "to", "of", "in", "on", "for", "with", "is", "are", "be"]);
  const out = [];
  for (const p of parts) {
    if (p.length <= 2) continue;
    if (stop.has(p)) continue;
    out.push(p);
  }
  return uniq(out, 96);
}

function packWeight(pack) {
  const id = safeStr(pack && pack.packId ? pack.packId : "");
  const w0 = PACK_WEIGHTS[id];
  const w1 = isObject(pack && pack.meta) && Number.isFinite(Number(pack.meta.weight)) ? Number(pack.meta.weight) : null;
  const w = Number.isFinite(w1) ? w1 : Number.isFinite(w0) ? w0 : 1.0;
  // clamp to sane range
  if (w < 0.2) return 0.2;
  if (w > 3.0) return 3.0;
  return w;
}

function stableKeyForSort(obj) {
  // Deterministic tiebreak: by score desc, then packId, then item id/title
  const packId = safeStr(obj.packId || "");
  const id = safeStr(obj.id || obj.itemId || obj.title || "");
  return `${packId}::${id}`.toLowerCase();
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

  return data;
}

function loadAllPacks() {
  let files = [];
  try {
    files = fs.readdirSync(DOMAIN_DIR);
  } catch (_e) {
    return [];
  }

  const packs = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const pack = loadPack(file);
    if (pack) packs.push(pack);
  }

  return packs;
}

function loadPackById(packId) {
  // cheap helper: locate file by reading all packs once
  const packs = loadAllPacks();
  for (const p of packs) {
    if (safeStr(p.packId) === safeStr(packId)) return p;
  }
  return null;
}

// =========================
// SAFETY DETECTION
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
        const pri = Number(group.priority);
        const priority = Number.isFinite(pri) ? pri : 0;
        if (!highest || priority > highest.priority) {
          highest = {
            id: key,
            label: safeStr(group.label || key),
            mode: safeStr(group.responseMode || "NON_CLINICAL"),
            priority
          };
        }
      }
    }
  }

  if (!highest) {
    return { detected: false, mode: "NON_CLINICAL", signal: null };
  }

  return {
    detected: true,
    mode: highest.mode,
    signal: highest
  };
}

// =========================
// WEIGHTED SCORING CORE
// =========================

function scoreFromHints(hints, inputNorm) {
  const h = isObject(hints) ? hints : {};
  const keywords = Array.isArray(h.keywords) ? h.keywords : [];
  const intentSignals = Array.isArray(h.intentSignals) ? h.intentSignals : [];
  const phrases = Array.isArray(h.phrases) ? h.phrases : [];

  let score = 0;

  for (const k of keywords) {
    const kk = normalizeText(k);
    if (kk && inputNorm.includes(kk)) score += 2;
  }

  for (const s of intentSignals) {
    const ss = normalizeText(s);
    if (ss && inputNorm.includes(ss)) score += 3;
  }

  for (const p of phrases) {
    const pp = normalizeText(p);
    if (pp && inputNorm.includes(pp)) score += 4;
  }

  return score;
}

function scoreTagOverlap(tags, tokenSet) {
  const t = Array.isArray(tags) ? tags : [];
  if (!t.length || !tokenSet || !tokenSet.size) return 0;

  let score = 0;
  for (const raw of t) {
    const tag = normalizeText(raw);
    if (!tag) continue;

    // allow tags like "confirmation_bias" or "working_memory_limits"
    const parts = tag.split(/[_:-]+/g).filter(Boolean);
    // tag hit if any meaningful part appears in token set
    let hit = false;
    for (const part of parts) {
      if (part.length <= 2) continue;
      if (tokenSet.has(part)) {
        hit = true;
        break;
      }
    }
    if (hit) score += 2;
  }
  return score;
}

function scoreUseWhenOverlap(useWhen, inputNorm, tokenSet) {
  // useWhen is mostly non-textual (mode:intent etc), but it can also include plain cues.
  const uw = Array.isArray(useWhen) ? useWhen : [];
  if (!uw.length) return 0;

  let score = 0;
  for (const raw of uw) {
    const u = normalizeText(raw);
    if (!u) continue;

    // If useWhen contains free text tokens, allow weak match
    if (u.includes(" ") || u.length >= 10) {
      if (inputNorm.includes(u)) score += 2;
      continue;
    }
    // token-level weak match
    if (tokenSet && tokenSet.has(u)) score += 1;
  }
  return score;
}

function applyPackWeight(baseScore, pack) {
  const w = packWeight(pack);
  return baseScore * w;
}

// =========================
// THEORY RETRIEVAL (across packs, weighted)
// =========================

function scoreTheoryMatch(theory, inputNorm) {
  const hints = isObject(theory && theory.retrievalHints) ? theory.retrievalHints : {};
  return scoreFromHints(hints, inputNorm);
}

function retrieveRelevantTheories(text) {
  const inputNorm = normalizeText(text);
  const packs = loadAllPacks();
  const matches = [];

  for (const pack of packs) {
    if (!Array.isArray(pack.theories)) continue;

    for (const theory of pack.theories) {
      const s0 = scoreTheoryMatch(theory, inputNorm);
      if (s0 <= 0) continue;

      const weighted = applyPackWeight(s0, pack);

      matches.push({
        packId: safeStr(pack.packId),
        id: safeStr(theory.id || theory.name || theory.title || ""),
        theory,
        score: weighted
      });
    }
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ak = stableKeyForSort(a);
    const bk = stableKeyForSort(b);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });

  return matches.slice(0, MAX_THEORIES).map((m) => m.theory);
}

// =========================
// BIAS RETRIEVAL (single pack, weighted anyway)
// =========================

function scoreBiasMatch(bias, inputNorm) {
  const hints = isObject(bias && bias.retrievalHints) ? bias.retrievalHints : {};
  return scoreFromHints(hints, inputNorm);
}

function retrieveRelevantBiases(text) {
  const inputNorm = normalizeText(text);
  const pack = loadPack("psy_biases_and_fallacies_v1.json");
  if (!pack) return [];

  const w = packWeight(pack);
  const matches = [];

  for (const bias of Array.isArray(pack.biases) ? pack.biases : []) {
    const s0 = scoreBiasMatch(bias, inputNorm);
    if (s0 <= 0) continue;
    matches.push({
      packId: safeStr(pack.packId),
      id: safeStr(bias.id || bias.name || bias.title || ""),
      bias,
      score: s0 * w
    });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ak = stableKeyForSort(a);
    const bk = stableKeyForSort(b);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });

  return matches.slice(0, MAX_BIASES).map((m) => m.bias);
}

// =========================
// SNIPPET RETRIEVAL (psy_dialogue_snippets_v1.json + weighted arbitration)
// =========================

function normalizeSnippetItem(raw) {
  // tolerant schema: supports `snippets`, `dialogueSnippets`, etc.
  const s = isObject(raw) ? raw : {};
  return {
    id: safeStr(s.id || s.snippetId || s.key || ""),
    tags: Array.isArray(s.tags) ? s.tags : Array.isArray(s.conceptTags) ? s.conceptTags : [],
    retrievalHints: isObject(s.retrievalHints) ? s.retrievalHints : {},
    text: safeStr(s.text || s.line || s.snippet || ""),
    lines: Array.isArray(s.lines) ? s.lines.map((x) => safeStr(x)).filter(Boolean) : [],
    useWhen: Array.isArray(s.useWhen) ? s.useWhen : [],
    style: safeStr(s.style || ""),
    safety: isObject(s.safety) ? s.safety : {}
  };
}

function scoreSnippetMatch(snippet, inputNorm, tokenSet, seedTerms) {
  let score = 0;

  // direct hint score (strong)
  score += scoreFromHints(snippet.retrievalHints, inputNorm) * 1.0;

  // tag overlap (medium)
  score += scoreTagOverlap(snippet.tags, tokenSet) * 1.0;

  // seed term overlap (weak but helpful): seeds from top theories/biases
  const seeds = Array.isArray(seedTerms) ? seedTerms : [];
  for (const st of seeds) {
    const term = normalizeText(st);
    if (term && inputNorm.includes(term)) score += 1;
  }

  // snippet text overlap (small, prevents weird misses)
  const snText = normalizeText(snippet.text || snippet.lines.join(" "));
  if (snText) {
    // token overlap heuristic: if any meaningful input token appears in snippet
    let hits = 0;
    for (const tok of tokenSet) {
      if (tok.length <= 3) continue;
      if (snText.includes(tok)) hits++;
      if (hits >= 3) break;
    }
    score += Math.min(3, hits); // cap
  }

  // useWhen overlap (weak)
  score += scoreUseWhenOverlap(snippet.useWhen, inputNorm, tokenSet);

  return score;
}

function retrieveRelevantSnippets(text, seedTerms) {
  const inputNorm = normalizeText(text);
  const toks = tokenize(text);
  const tokenSet = new Set(toks);

  // We intentionally load all packs, but only consider those with snippet-like arrays.
  const packs = loadAllPacks();
  const matches = [];

  for (const pack of packs) {
    const arrays = [];

    if (Array.isArray(pack.snippets)) arrays.push(pack.snippets);
    if (Array.isArray(pack.dialogueSnippets)) arrays.push(pack.dialogueSnippets);
    if (Array.isArray(pack.dialogue)) arrays.push(pack.dialogue);

    if (!arrays.length) continue;

    for (const arr of arrays) {
      for (const raw of Array.isArray(arr) ? arr : []) {
        const sn = normalizeSnippetItem(raw);
        if (!sn.id) continue;

        const s0 = scoreSnippetMatch(sn, inputNorm, tokenSet, seedTerms);
        if (s0 <= 0) continue;

        const weighted = applyPackWeight(s0, pack);

        matches.push({
          packId: safeStr(pack.packId),
          id: sn.id,
          itemId: sn.id,
          snippet: sn,
          score: weighted
        });
      }
    }
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ak = stableKeyForSort(a);
    const bk = stableKeyForSort(b);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });

  return matches.slice(0, MAX_SNIPPETS).map((m) => m.snippet);
}

// =========================
// FACE EXAMPLES RETRIEVAL (psy_face_examples_v1.json + weighted arbitration)
// =========================

function normalizeFaceExample(raw) {
  const e = isObject(raw) ? raw : {};
  return {
    id: safeStr(e.id || e.exampleId || e.key || ""),
    conceptTags: Array.isArray(e.conceptTags) ? e.conceptTags : Array.isArray(e.tags) ? e.tags : [],
    useWhen: Array.isArray(e.useWhen) ? e.useWhen : [],
    microTakeaway: safeStr(e.microTakeaway || ""),
    scene: isObject(e.scene) ? e.scene : {},
    safety: isObject(e.safety) ? e.safety : {}
  };
}

function faceExampleOneLine(ex) {
  const sc = isObject(ex.scene) ? ex.scene : {};
  const setting = safeStr(sc.setting || "").trim();
  const trigger = safeStr(sc.trigger || "").trim();
  const result = safeStr(sc.result || "").trim();

  // deterministic compression
  const bits = [];
  if (setting) bits.push(setting);
  if (trigger) bits.push(trigger);
  if (result) bits.push(result);

  return bits.join(" ").replace(/\s+/g, " ").trim();
}

function scoreFaceExampleMatch(ex, inputNorm, tokenSet, seedTerms) {
  let score = 0;

  // tag overlap is primary
  score += scoreTagOverlap(ex.conceptTags, tokenSet) * 1.2;

  // seed terms (from selected theories/biases)
  const seeds = Array.isArray(seedTerms) ? seedTerms : [];
  for (const st of seeds) {
    const term = normalizeText(st);
    if (term && inputNorm.includes(term)) score += 1;
  }

  // weak overlap from scene content (only one-line to avoid heavy parsing)
  const line = normalizeText(faceExampleOneLine(ex));
  if (line) {
    let hits = 0;
    for (const tok of tokenSet) {
      if (tok.length <= 3) continue;
      if (line.includes(tok)) hits++;
      if (hits >= 3) break;
    }
    score += Math.min(3, hits);
  }

  // useWhen overlap (weak)
  score += scoreUseWhenOverlap(ex.useWhen, inputNorm, tokenSet);

  // takeaway overlap (weak)
  const tk = normalizeText(ex.microTakeaway);
  if (tk) {
    let hits = 0;
    for (const tok of tokenSet) {
      if (tok.length <= 3) continue;
      if (tk.includes(tok)) hits++;
      if (hits >= 2) break;
    }
    score += Math.min(2, hits);
  }

  return score;
}

function retrieveRelevantFaceExamples(text, seedTerms) {
  const inputNorm = normalizeText(text);
  const toks = tokenize(text);
  const tokenSet = new Set(toks);

  const packs = loadAllPacks();
  const matches = [];

  for (const pack of packs) {
    const arrays = [];
    if (Array.isArray(pack.examples)) arrays.push(pack.examples);
    if (Array.isArray(pack.faceExamples)) arrays.push(pack.faceExamples);

    if (!arrays.length) continue;

    for (const arr of arrays) {
      for (const raw of Array.isArray(arr) ? arr : []) {
        const ex = normalizeFaceExample(raw);
        if (!ex.id) continue;

        const s0 = scoreFaceExampleMatch(ex, inputNorm, tokenSet, seedTerms);
        if (s0 <= 0) continue;

        const weighted = applyPackWeight(s0, pack);

        matches.push({
          packId: safeStr(pack.packId),
          id: ex.id,
          itemId: ex.id,
          example: ex,
          score: weighted
        });
      }
    }
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ak = stableKeyForSort(a);
    const bk = stableKeyForSort(b);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });

  return matches.slice(0, MAX_FACE_EXAMPLES).map((m) => m.example);
}

// =========================
// SEED TERMS (theory/bias -> snippet/example cross-boost)
// =========================

function buildSeedTerms(theories, biases) {
  const out = [];

  for (const t of Array.isArray(theories) ? theories : []) {
    const name = safeStr(t.name || t.title || t.id || "");
    if (name) out.push(name);
    const rh = isObject(t.retrievalHints) ? t.retrievalHints : {};
    for (const k of Array.isArray(rh.keywords) ? rh.keywords : []) out.push(k);
    for (const p of Array.isArray(rh.phrases) ? rh.phrases : []) out.push(p);
  }

  for (const b of Array.isArray(biases) ? biases : []) {
    const name = safeStr(b.name || b.title || b.id || "");
    if (name) out.push(name);
    const rh = isObject(b.retrievalHints) ? b.retrievalHints : {};
    for (const k of Array.isArray(rh.keywords) ? rh.keywords : []) out.push(k);
    for (const p of Array.isArray(rh.phrases) ? rh.phrases : []) out.push(p);
  }

  return uniq(out, 64);
}

// =========================
// PUBLIC API
// =========================

/**
 * queryPsychology(text, opts?)
 *
 * opts (optional, backward-compatible):
 * {
 *   includeSnippets: boolean (default true)
 *   includeFaceExamples: boolean (default true)
 * }
 *
 * Returns:
 * {
 *   safety: { detected, mode, signal },
 *   theories: [...],
 *   biases: [...],
 *   snippets: [...],
 *   faceExamples: [...]
 * }
 */
function queryPsychology(text, opts) {
  const o = isObject(opts) ? opts : {};
  const includeSnippets = o.includeSnippets !== false;
  const includeFaceExamples = o.includeFaceExamples !== false;

  const safety = detectSafetySignals(text);

  // If safety triggers a non-clinical restriction mode, we still allow retrieval,
  // but Marion/Law should decide whether to use it. This module stays retrieval-only.

  const theories = retrieveRelevantTheories(text);
  const biases = retrieveRelevantBiases(text);

  const seedTerms = buildSeedTerms(theories, biases);

  const snippets = includeSnippets ? retrieveRelevantSnippets(text, seedTerms) : [];
  const faceExamples = includeFaceExamples ? retrieveRelevantFaceExamples(text, seedTerms) : [];

  return {
    safety,
    theories,
    biases,
    snippets,
    faceExamples
  };
}

module.exports = {
  queryPsychology,

  // safety
  detectSafetySignals,

  // core retrieval
  retrieveRelevantTheories,
  retrieveRelevantBiases,
  retrieveRelevantSnippets,
  retrieveRelevantFaceExamples,

  // utilities (for deterministic tests)
  loadPack,
  loadAllPacks,
  loadPackById,
  PACK_WEIGHTS
};
