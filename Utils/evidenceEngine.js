/**
 * evidenceEngine.js
 * OPINTEL v1.0.0
 *
 * Purpose:
 * - Normalize evidence from orchestrator, Marion, SiteBridge, memory windows, and domain packs
 * - Score and rank evidence
 * - Resolve conflicts safely
 * - Produce one coherent evidence model for downstream response planning
 *
 * Design goals:
 * - Hardened, fail-open
 * - No external dependencies
 * - Compatible with CommonJS ecosystems
 * - Does not mutate input
 */

"use strict";

const VERSION = "evidenceEngine.opintel.v1.0.0";

const DEFAULTS = Object.freeze({
  maxEvidenceItems: 12,
  memoryWeightBoost: 0.14,
  routeConfidenceWeight: 0.18,
  unresolvedAskBoost: 0.16,
  marionBoost: 0.12,
  siteBoost: 0.08,
  domainBoost: 0.1,
  contradictionPenalty: 0.22,
  ambiguityPenalty: 0.12,
  minimumScore: 0.08
});

function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asArray(v) {
  return Array.isArray(v) ? v.slice() : [];
}

function str(v) {
  return typeof v === "string" ? v.trim() : "";
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function lower(v) {
  return str(v).toLowerCase();
}

function shallowClone(obj) {
  return isObject(obj) ? { ...obj } : {};
}

function safeTextHash(input) {
  const s = lower(input);
  if (!s) return "";
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return String(h >>> 0);
}

function normalizeSourceKind(kind) {
  const k = lower(kind);
  if (!k) return "unknown";
  if (k.includes("marion")) return "marion";
  if (k.includes("site")) return "site";
  if (k.includes("memory")) return "memory";
  if (k.includes("domain")) return "domain";
  if (k.includes("orch")) return "orchestrator";
  return k;
}

function inferWeightFromKind(kind, cfg) {
  switch (normalizeSourceKind(kind)) {
    case "memory":
      return cfg.memoryWeightBoost;
    case "marion":
      return cfg.marionBoost;
    case "site":
      return cfg.siteBoost;
    case "domain":
      return cfg.domainBoost;
    default:
      return 0;
  }
}

function normalizeEvidenceItem(item, sourceMeta = {}, cfg = DEFAULTS) {
  const obj = isObject(item) ? item : {};
  const source = normalizeSourceKind(obj.source || sourceMeta.source || sourceMeta.kind || "unknown");
  const text = str(obj.text || obj.summary || obj.content || obj.snippet || obj.reply || "");
  const title = str(obj.title || obj.label || "");
  const score = clamp(num(obj.score, 0), 0, 1);
  const confidence = clamp(num(obj.confidence, score), 0, 1);
  const routeConfidence = clamp(num(obj.routeConfidence || sourceMeta.routeConfidence, 0), 0, 1);
  const ambiguity = clamp(num(obj.ambiguity || sourceMeta.ambiguity, 0), 0, 1);
  const contradictions = asArray(obj.contradictions);
  const tags = asArray(obj.tags).map(str).filter(Boolean);
  const unresolvedMatch = !!obj.unresolvedMatch;
  const preferenceMatch = !!obj.preferenceMatch;
  const memoryWindowMatch = !!obj.memoryWindowMatch;
  const baseWeight = inferWeightFromKind(source, cfg);

  return {
    id: str(obj.id) || safeTextHash([source, title, text].join("|")),
    source,
    title,
    text,
    score,
    confidence,
    routeConfidence,
    ambiguity,
    contradictions,
    tags,
    unresolvedMatch,
    preferenceMatch,
    memoryWindowMatch,
    metadata: shallowClone(obj.metadata),
    raw: obj,
    _baseWeight: baseWeight
  };
}

function flattenInput(input, cfg = DEFAULTS) {
  const root = isObject(input) ? input : {};
  const bundles = [];

  const pushBundle = (items, meta) => {
    asArray(items).forEach((item) => {
      const ev = normalizeEvidenceItem(item, meta, cfg);
      if (ev.text || ev.title) bundles.push(ev);
    });
  };

  pushBundle(root.evidence, { source: "orchestrator", routeConfidence: root.routeConfidence, ambiguity: root.ambiguity });
  pushBundle(root.orchestratorEvidence, { source: "orchestrator", routeConfidence: root.routeConfidence, ambiguity: root.ambiguity });
  pushBundle(root.marionEvidence, { source: "marion", routeConfidence: root.routeConfidence, ambiguity: root.ambiguity });
  pushBundle(root.siteEvidence, { source: "site", routeConfidence: root.routeConfidence, ambiguity: root.ambiguity });
  pushBundle(root.memoryEvidence, { source: "memory", routeConfidence: root.routeConfidence, ambiguity: root.ambiguity });
  pushBundle(root.domainEvidence, { source: "domain", routeConfidence: root.routeConfidence, ambiguity: root.ambiguity });

  if (isObject(root.pack)) {
    pushBundle(root.pack.evidence, { source: root.pack.source || "orchestrator", routeConfidence: root.pack.routeConfidence, ambiguity: root.pack.ambiguity });
  }

  return bundles;
}

function scoreEvidenceSources(input, options = {}) {
  const cfg = { ...DEFAULTS, ...(isObject(options) ? options : {}) };
  const root = isObject(input) ? input : {};
  const routeConfidence = clamp(num(root.routeConfidence, 0), 0, 1);
  const ambiguity = clamp(num(root.ambiguity, 0), 0, 1);

  return flattenInput(root, cfg).map((item) => {
    let composite = 0;
    composite += item.score * 0.34;
    composite += item.confidence * 0.24;
    composite += item.routeConfidence * cfg.routeConfidenceWeight;
    composite += item._baseWeight;

    if (item.unresolvedMatch) composite += cfg.unresolvedAskBoost;
    if (item.preferenceMatch) composite += 0.08;
    if (item.memoryWindowMatch) composite += 0.06;

    if (item.contradictions.length) composite -= cfg.contradictionPenalty;
    composite -= item.ambiguity * cfg.ambiguityPenalty;
    composite -= ambiguity * 0.05;

    // bias items aligned with strong routing
    composite += routeConfidence * 0.05;

    return {
      ...item,
      finalScore: clamp(composite, 0, 1)
    };
  }).sort((a, b) => b.finalScore - a.finalScore);
}

function resolveEvidenceConflicts(input, options = {}) {
  const cfg = { ...DEFAULTS, ...(isObject(options) ? options : {}) };
  const scored = scoreEvidenceSources(input, cfg);
  const kept = [];
  const dropped = [];
  const seen = new Set();

  for (const item of scored) {
    if (item.finalScore < cfg.minimumScore) {
      dropped.push({ reason: "below_minimum_score", item });
      continue;
    }

    const dedupeKey = safeTextHash([item.source, item.title, item.text].join("|"));
    if (seen.has(dedupeKey)) {
      dropped.push({ reason: "duplicate", item });
      continue;
    }

    // if contradiction exists and a stronger item already exists from same semantic space, drop weaker one
    const conflictsWithExisting = kept.find((k) => {
      if (!k || !item) return false;
      const sameTitle = k.title && item.title && lower(k.title) === lower(item.title);
      const sameHash = safeTextHash(k.text) === safeTextHash(item.text);
      return sameTitle || sameHash;
    });

    if (conflictsWithExisting && item.finalScore <= conflictsWithExisting.finalScore) {
      dropped.push({ reason: "weaker_conflict", item, against: conflictsWithExisting.id });
      continue;
    }

    seen.add(dedupeKey);
    kept.push(item);
    if (kept.length >= cfg.maxEvidenceItems) break;
  }

  return {
    kept,
    dropped,
    conflictCount: dropped.filter((d) => String(d.reason).includes("conflict")).length,
    duplicateCount: dropped.filter((d) => d.reason === "duplicate").length
  };
}

function buildEvidenceModel(input, options = {}) {
  const cfg = { ...DEFAULTS, ...(isObject(options) ? options : {}) };
  const root = isObject(input) ? input : {};
  const resolved = resolveEvidenceConflicts(root, cfg);
  const top = resolved.kept[0] || null;
  const memoryWindow = isObject(root.memoryWindow) ? root.memoryWindow : {};
  const unresolvedAsks = asArray(memoryWindow.unresolvedAsks || root.unresolvedAsks).map(str).filter(Boolean);
  const recentIntents = asArray(memoryWindow.recentIntents || root.recentIntents).map(str).filter(Boolean);

  return {
    ok: true,
    version: VERSION,
    routeConfidence: clamp(num(root.routeConfidence, 0), 0, 1),
    ambiguity: clamp(num(root.ambiguity, 0), 0, 1),
    topEvidence: top,
    rankedEvidence: resolved.kept,
    evidenceSummary: resolved.kept.map((e) => ({
      id: e.id,
      source: e.source,
      title: e.title,
      score: e.finalScore,
      tags: e.tags
    })),
    conflictMeta: {
      conflictCount: resolved.conflictCount,
      duplicateCount: resolved.duplicateCount,
      droppedCount: resolved.dropped.length
    },
    memoryAlignment: {
      unresolvedAsks,
      recentIntents,
      hasMemoryAlignment: resolved.kept.some((e) => e.memoryWindowMatch || e.unresolvedMatch || e.preferenceMatch)
    },
    actionHints: deriveActionHints(resolved.kept, root),
    safeMeta: {
      failOpen: true,
      maxEvidenceItems: cfg.maxEvidenceItems
    }
  };
}

function deriveActionHints(evidenceList, root) {
  const lane = lower(root.lane || root.intent?.lane || "");
  const hints = [];
  if (lane === "music") hints.push("show_year_actions");
  if (lane === "roku") hints.push("show_roku_links");
  if (evidenceList.some((e) => e.source === "site")) hints.push("site_context_ready");
  if (evidenceList.some((e) => e.source === "marion")) hints.push("marion_reasoning_ready");
  if (evidenceList.some((e) => e.unresolvedMatch)) hints.push("resume_unresolved_ask");
  return Array.from(new Set(hints));
}

module.exports = {
  VERSION,
  buildEvidenceModel,
  scoreEvidenceSources,
  resolveEvidenceConflicts
};
