"use strict";

/**
 * utils/knowledge/orchestrator.js
 *
 * Single Evidence Engine:
 *   datasets + six domains + Marion knowledge + memory spine
 *
 * Returns a consolidated Evidence Pack so your chat engine can:
 *  - pick stable answers (loop drop)
 *  - attach evidence + citations
 *  - detect conflicts and resolve by policy
 *  - respect bridge fuse / loop state
 */

const { rank } = require("./policies/sourcePriority");
const { detectDomain, DEFAULT_DOMAINS } = require("./policies/domainRouting");

const DatasetSrc = require("./sources/dataset");
const MemorySrc = require("./sources/memory");
const DomainsSrc = require("./sources/domains");
const MarionSrc = require("./sources/marion");

function safeStr(x){ return x == null ? "" : String(x); }
function isPlainObject(x){
  return !!x && typeof x === "object" && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
}
function nowMs(){ return Date.now(); }
function cap(s, n){ s = safeStr(s); return s.length <= n ? s : s.slice(0, n); }
function shaLite(s){
  s = safeStr(s);
  let h = 2166136261;
  for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h.toString(16);
}
function normalizeClaim(text){
  return safeStr(text).toLowerCase().replace(/\s+/g, " ").trim().slice(0, 400);
}

function evidenceItem({ sourceType, domain, kind, text, answer, score, id, meta, citations }) {
  const t = safeStr(text || answer || "").trim();
  if (!t) return null;
  return {
    sourceType: safeStr(sourceType || "unknown"),
    domain: safeStr(domain || ""),
    kind: safeStr(kind || "snippet"),
    text: t,
    score: Number.isFinite(score) ? score : (score == null ? 0 : Number(score)),
    id: safeStr(id || ""),
    meta: isPlainObject(meta) ? meta : {},
    citations: Array.isArray(citations) ? citations : [],
    claim: normalizeClaim(t),
  };
}

function pickPrimary(evidence, opts) {
  const o = isPlainObject(opts) ? opts : {};
  const preferDataset = o.preferDataset !== false;

  const scored = (evidence || []).map((e) => {
    const pr = rank(e.sourceType);
    const s = Number(e.score || 0) || 0;
    const db = (preferDataset && e.sourceType === "dataset") ? 0.15 : 0;
    const total = (10 - pr) + s + db;
    return { e, pr, total };
  });

  scored.sort((a,b) => (b.total - a.total) || (a.pr - b.pr));
  return scored.length ? scored[0].e : null;
}

function detectConflicts(evidence) {
  const groups = new Map();
  for (const e of (evidence || [])) {
    const k = (e.domain || "global").toLowerCase();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }

  const conflicts = [];
  for (const [k, arr] of groups.entries()) {
    const claims = new Map(); // claim hash -> evidence
    for (const e of arr) {
      if (!e.claim) continue;
      const ch = shaLite(e.claim);
      if (!claims.has(ch)) claims.set(ch, e);
    }
    if (claims.size <= 1) continue;

    const list = Array.from(claims.values());
    const winner = pickPrimary(list, { preferDataset: true });
    const losers = list.filter(x => x !== winner);

    const winnerRank = rank(winner.sourceType);
    const mixed = losers.some(l => rank(l.sourceType) !== winnerRank);
    if (!mixed) continue;

    conflicts.push({
      group: k,
      winner: { sourceType: winner.sourceType, domain: winner.domain, text: cap(winner.text, 220) },
      losers: losers.map(l => ({ sourceType: l.sourceType, domain: l.domain, text: cap(l.text, 220) })),
      resolution: "priority",
    });
  }

  return conflicts;
}

function buildLoopHints(memoryCtx, primary) {
  const m = isPlainObject(memoryCtx) ? memoryCtx : {};
  const loop = isPlainObject(m.loop) ? m.loop : {};
  const bridge = isPlainObject(m.bridge) ? m.bridge : {};
  const hints = [];

  if (bridge.fused) hints.push({ kind: "bridge_fused", reason: safeStr(bridge.fuseReason || "guard"), msLeft: Math.max(0, (bridge.fusedUntil||0) - nowMs()) });
  if ((loop.n || 0) >= 2) hints.push({ kind: "loop_risk", n: loop.n, severity: loop.severity || 0 });
  if (primary && primary.text) hints.push({ kind: "primary_sig", sig: shaLite(primary.text) });

  return hints;
}

async function buildEvidencePack(input, opts) {
  const o = isPlainObject(opts) ? opts : {};
  const inp = isPlainObject(input) ? input : {};

  const text = safeStr(inp.text || inp.query || "").trim();
  const sessionId = safeStr(inp.sessionId || inp.sid || "session").slice(0, 180);
  const domainHint = safeStr(inp.domain || inp.domainHint || inp.lane || "");

  const routing = detectDomain(text, domainHint);

  // Ensure datasets loaded (fail-open)
  try { DatasetSrc.ensureLoaded(); } catch (_e) {}

  // 1) Memory
  const mem = MemorySrc.getMemory(sessionId);
  const memoryCtx = mem && mem.ok ? mem.ctx : null;

  // 2) Dataset
  const ds = DatasetSrc.queryDataset(text, { limit: 3 });

  // 3) Domains
  const dom = await DomainsSrc.queryDomains(text, routing, o);

  // 4) Marion (synthesis)
  const packs = { memory: memoryCtx, dataset: (ds && ds.ok) ? ds : null, domains: (dom && dom.ok) ? dom : null };
  const mar = await MarionSrc.queryMarion(text, routing, packs, o);

  // 5) Normalize evidence
  const evidence = [];

  if (memoryCtx) {
    const sum = safeStr(memoryCtx.summary || "");
    const loops = Array.isArray(memoryCtx.openLoops) ? memoryCtx.openLoops : [];
    if (sum) evidence.push(evidenceItem({ sourceType: "memory", domain: routing.primary || "global", kind: "summary", text: sum, score: 0.65 }));
    for (const q of loops.slice(-3)) evidence.push(evidenceItem({ sourceType: "memory", domain: routing.primary || "global", kind: "open_loop", text: String(q), score: 0.55 }));
  }

  if (ds && ds.ok && ds.best) {
    evidence.push(evidenceItem({
      sourceType: "dataset",
      domain: safeStr(ds.best.topic || routing.primary || "dataset"),
      kind: "gold",
      text: safeStr(ds.best.answer || ds.best.text || ""),
      score: ds.confident ? 0.92 : 0.72,
      id: safeStr(ds.best.id || ""),
      meta: { source: ds.best.source || "", scoreRaw: ds.best.score || 0, confident: !!ds.confident },
    }));
  }
  if (ds && ds.ok && Array.isArray(ds.hits)) {
    for (const h of ds.hits.slice(0, 3)) {
      evidence.push(evidenceItem({
        sourceType: "dataset",
        domain: safeStr(h.topic || routing.primary || "dataset"),
        kind: "snippet",
        text: safeStr(h.answer || h.text || ""),
        score: 0.55 + Math.min(0.3, (Number(h.score||0) / 10)),
        id: safeStr(h.id || ""),
        meta: { source: h.source || "", scoreRaw: h.score || 0 },
      }));
    }
  }

  if (dom && dom.ok && Array.isArray(dom.items)) {
    for (const it of dom.items.slice(0, 6)) {
      evidence.push(evidenceItem({
        sourceType: "domain",
        domain: safeStr(it.domain || routing.primary || ""),
        kind: safeStr(it.kind || "snippet"),
        text: safeStr(it.text || it.answer || ""),
        score: Number(it.score || 0.6) || 0.6,
        id: safeStr(it.id || ""),
        meta: isPlainObject(it.meta) ? it.meta : {},
      }));
    }
  }

  if (mar && mar.ok) {
    if (mar.answer) {
      evidence.push(evidenceItem({
        sourceType: "marion",
        domain: routing.primary || "",
        kind: "synthesis",
        text: safeStr(mar.answer),
        score: 0.68,
        citations: Array.isArray(mar.citations) ? mar.citations : [],
      }));
    }
    if (Array.isArray(mar.items)) {
      for (const it of mar.items.slice(0, 5)) {
        evidence.push(evidenceItem({
          sourceType: "marion",
          domain: safeStr(it.domain || routing.primary || ""),
          kind: safeStr(it.kind || "snippet"),
          text: safeStr(it.text || it.answer || ""),
          score: Number(it.score || 0.5) || 0.5,
          id: safeStr(it.id || ""),
          meta: isPlainObject(it.meta) ? it.meta : {},
          citations: Array.isArray(it.citations) ? it.citations : [],
        }));
      }
    }
  }

  const evidenceClean = evidence.filter(Boolean);

  const primary = pickPrimary(evidenceClean, { preferDataset: true });
  const conflicts = detectConflicts(evidenceClean);
  const loopHints = buildLoopHints(memoryCtx, primary);

  return {
    ok: true,
    sessionId,
    routing,
    domainsConfig: DEFAULT_DOMAINS,
    primary,
    evidence: evidenceClean.slice(0, 16),
    conflicts,
    loopHints,
    packs: { memory: memoryCtx || null, dataset: (ds && ds.ok) ? ds : null, domains: (dom && dom.ok) ? dom : null, marion: (mar && mar.ok) ? mar : null },
    meta: {
      ts: nowMs(),
      sources: {
        memory: !!memoryCtx,
        dataset: !!(ds && ds.ok && ds.best),
        domains: !!(dom && dom.ok && (dom.items||[]).length),
        marion: !!(mar && mar.ok && (mar.answer || (mar.items||[]).length)),
      },
    },
  };
}

module.exports = { buildEvidencePack };
