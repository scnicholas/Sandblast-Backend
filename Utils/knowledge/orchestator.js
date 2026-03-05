"use strict";

/**
 * utils/knowledge/orchestrator.js
 *
 * Operational Intelligence upgrade.
 * Single Evidence Engine:
 *   datasets + six domains + Marion knowledge + memory spine
 *
 * Added without breaking structure:
 * 1) traceId propagation
 * 2) route-confidence hints
 * 3) memory-window evidence normalization
 * 4) bridge fuse respect / recovery
 * 5) source priority with domain bias
 * 6) conflict surfacing
 * 7) action hints for downstream planners
 * 8) fail-open evidence shaping
 * 9) unresolved-ask carryover
 * 10) meta telemetry pack
 */

const { rank } = require("./policies/sourcePriority");
const { detectDomain, DEFAULT_DOMAINS } = require("./policies/domainRouting");

const DatasetSrc = require("./sources/dataset");
const MemorySrc = require("./sources/memory");
const DomainsSrc = require("./sources/domains");
const MarionSrc = require("./sources/marion");

function safeStr(x){ return x == null ? "" : String(x); }
function isPlainObject(x){ return !!x && typeof x === "object" && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null); }
function nowMs(){ return Date.now(); }
function cap(s, n){ s = safeStr(s); return s.length <= n ? s : s.slice(0, n); }
function clamp(n, a, b){ n = Number(n); if (!Number.isFinite(n)) n = a; return Math.max(a, Math.min(b, n)); }
function shaLite(s){ s = safeStr(s); let h = 2166136261; for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return h.toString(16); }
function normalizeClaim(text){ return safeStr(text).toLowerCase().replace(/\s+/g, " ").trim().slice(0, 400); }
function mkTraceId(x){ const seed = safeStr(x || 'orch'); return seed + '_' + Date.now().toString(16) + '_' + Math.random().toString(16).slice(2,8); }

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

function sourceBias(sourceType, routePrimary) {
  const src = safeStr(sourceType || '').toLowerCase();
  const route = safeStr(routePrimary || '').toLowerCase();
  if (src === 'dataset') return 0.15;
  if (src === 'memory' && route) return 0.08;
  if (src === 'domain') return 0.1;
  if (src === 'marion') return 0.06;
  return 0;
}

function pickPrimary(evidence, opts) {
  const o = isPlainObject(opts) ? opts : {};
  const preferDataset = o.preferDataset !== false;
  const routePrimary = safeStr(o.routePrimary || "");
  const scored = (evidence || []).map((e) => {
    const pr = rank(e.sourceType);
    const s = Number(e.score || 0) || 0;
    const db = (preferDataset && e.sourceType === "dataset") ? 0.15 : 0;
    const rb = sourceBias(e.sourceType, routePrimary);
    const domainBoost = routePrimary && safeStr(e.domain || '').toLowerCase() === routePrimary.toLowerCase() ? 0.12 : 0;
    const total = (10 - pr) + s + db + rb + domainBoost;
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
    const claims = new Map();
    for (const e of arr) {
      if (!e.claim) continue;
      const ch = shaLite(e.claim);
      if (!claims.has(ch)) claims.set(ch, e);
    }
    if (claims.size <= 1) continue;
    const list = Array.from(claims.values());
    const winner = pickPrimary(list, { preferDataset:true, routePrimary:k });
    const losers = list.filter(x => x !== winner);
    const winnerRank = rank(winner.sourceType);
    const mixed = losers.some(l => rank(l.sourceType) !== winnerRank);
    if (!mixed) continue;
    conflicts.push({
      group:k,
      winner:{ sourceType:winner.sourceType, domain:winner.domain, text:cap(winner.text, 220) },
      losers: losers.map(l => ({ sourceType:l.sourceType, domain:l.domain, text:cap(l.text,220) })),
      resolution:'priority'
    });
  }
  return conflicts;
}

function normalizeMemoryWindows(memoryCtx){
  const m = isPlainObject(memoryCtx) ? memoryCtx : {};
  const w = isPlainObject(m.memoryWindows) ? m.memoryWindows : {};
  return {
    recentIntents: Array.isArray(w.recentIntents) ? w.recentIntents.map(x=>safeStr(x)) : [],
    unresolvedAsks: Array.isArray(w.unresolvedAsks) ? w.unresolvedAsks.map(x=>safeStr(x)) : [],
    lastResolvedIntent: safeStr(w.lastResolvedIntent || ''),
    lastUserPreference: isPlainObject(w.lastUserPreference) ? w.lastUserPreference : null
  };
}

function buildLoopHints(memoryCtx, primary) {
  const m = isPlainObject(memoryCtx) ? memoryCtx : {};
  const loop = isPlainObject(m.loop) ? m.loop : {};
  const bridge = isPlainObject(m.bridge) ? m.bridge : {};
  const hints = [];
  if (bridge.fused && Number(bridge.fusedUntil || 0) > nowMs()) hints.push({ kind:'bridge_fused', reason:safeStr(bridge.fuseReason || 'guard'), msLeft:Math.max(0, (bridge.fusedUntil||0)-nowMs()) });
  if ((loop.n || 0) >= 2) hints.push({ kind:'loop_risk', n:loop.n, severity:loop.severity || 0 });
  if (primary && primary.text) hints.push({ kind:'primary_sig', sig:shaLite(primary.text) });
  return hints;
}

function buildActionHints(routing, memoryWindow, primary){
  const hints = [];
  const rp = safeStr(routing && routing.primary || '').toLowerCase();
  if (rp === 'music' || rp === 'music_history') hints.push({ type:'lane', value:'music' });
  if (rp === 'tv') hints.push({ type:'lane', value:'tv' });
  if (rp === 'radio' || rp === 'nova') hints.push({ type:'lane', value:'radio' });
  if (memoryWindow.lastUserPreference && memoryWindow.lastUserPreference.year) hints.push({ type:'year', value:safeStr(memoryWindow.lastUserPreference.year) });
  if (primary && /news canada/i.test(primary.text || '')) hints.push({ type:'link', value:'news_canada' });
  return hints;
}

async function buildEvidencePack(input, opts) {
  const o = isPlainObject(opts) ? opts : {};
  const inp = isPlainObject(input) ? input : {};

  const text = safeStr(inp.text || inp.query || '').trim();
  const sessionId = safeStr(inp.sessionId || inp.sid || 'session').slice(0, 180);
  const domainHint = safeStr(inp.domain || inp.domainHint || inp.lane || '');
  const traceId = safeStr(inp.traceId || o.traceId || mkTraceId('evidence'));
  const routeConfidence = clamp(inp.routeConfidence || o.routeConfidence || 0.5, 0, 1);

  const routing = detectDomain(text, domainHint);

  try { DatasetSrc.ensureLoaded(); } catch (_e) {}

  const mem = MemorySrc.getMemory(sessionId);
  const memoryCtx = mem && mem.ok ? mem.ctx : null;
  const memoryWindow = normalizeMemoryWindows(memoryCtx);

  const ds = DatasetSrc.queryDataset(text, { limit: 3 });
  const dom = await DomainsSrc.queryDomains(text, routing, o);
  const packs = { memory: memoryCtx, dataset:(ds && ds.ok) ? ds : null, domains:(dom && dom.ok) ? dom : null };
  const mar = await MarionSrc.queryMarion(text, routing, packs, o);

  const evidence = [];

  if (memoryCtx) {
    const sum = safeStr(memoryCtx.summary || '');
    const loops = Array.isArray(memoryCtx.openLoops) ? memoryCtx.openLoops : [];
    if (sum) evidence.push(evidenceItem({ sourceType:'memory', domain:routing.primary || 'global', kind:'summary', text:sum, score:0.65, meta:{traceId} }));
    for (const q of loops.slice(-3)) evidence.push(evidenceItem({ sourceType:'memory', domain:routing.primary || 'global', kind:'open_loop', text:String(q), score:0.55, meta:{traceId} }));
    for (const q of memoryWindow.unresolvedAsks.slice(-2)) evidence.push(evidenceItem({ sourceType:'memory', domain:routing.primary || 'global', kind:'unresolved_ask', text:String(q), score:0.58, meta:{traceId} }));
    if (memoryWindow.lastResolvedIntent) evidence.push(evidenceItem({ sourceType:'memory', domain:routing.primary || 'global', kind:'last_resolved_intent', text:memoryWindow.lastResolvedIntent, score:0.42, meta:{traceId} }));
  }

  if (ds && ds.ok && ds.best) {
    evidence.push(evidenceItem({
      sourceType:'dataset', domain:safeStr(ds.best.topic || routing.primary || 'dataset'), kind:'gold', text:safeStr(ds.best.answer || ds.best.text || ''),
      score: ds.confident ? 0.92 : 0.72, id:safeStr(ds.best.id || ''), meta:{ source:ds.best.source || '', scoreRaw:ds.best.score || 0, confident:!!ds.confident, traceId }
    }));
  }
  if (ds && ds.ok && Array.isArray(ds.hits)) {
    for (const h of ds.hits.slice(0, 3)) {
      evidence.push(evidenceItem({ sourceType:'dataset', domain:safeStr(h.topic || routing.primary || 'dataset'), kind:'snippet', text:safeStr(h.answer || h.text || ''), score:0.55 + Math.min(0.3, (Number(h.score||0) / 10)), id:safeStr(h.id || ''), meta:{ source:h.source || '', scoreRaw:h.score || 0, traceId } }));
    }
  }

  if (dom && dom.ok && Array.isArray(dom.items)) {
    for (const it of dom.items.slice(0, 6)) {
      evidence.push(evidenceItem({ sourceType:'domain', domain:safeStr(it.domain || routing.primary || ''), kind:safeStr(it.kind || 'snippet'), text:safeStr(it.text || it.answer || ''), score:Number(it.score || 0.6) || 0.6, id:safeStr(it.id || ''), meta:Object.assign({}, isPlainObject(it.meta) ? it.meta : {}, { traceId }) }));
    }
  }

  if (mar && mar.ok) {
    if (mar.answer) evidence.push(evidenceItem({ sourceType:'marion', domain:routing.primary || '', kind:'synthesis', text:safeStr(mar.answer), score:0.68, citations:Array.isArray(mar.citations)?mar.citations:[], meta:{traceId} }));
    if (Array.isArray(mar.items)) {
      for (const it of mar.items.slice(0, 5)) {
        evidence.push(evidenceItem({ sourceType:'marion', domain:safeStr(it.domain || routing.primary || ''), kind:safeStr(it.kind || 'snippet'), text:safeStr(it.text || it.answer || ''), score:Number(it.score || 0.5) || 0.5, id:safeStr(it.id || ''), meta:Object.assign({}, isPlainObject(it.meta) ? it.meta : {}, { traceId }), citations:Array.isArray(it.citations)?it.citations:[] }));
      }
    }
  }

  const evidenceClean = evidence.filter(Boolean);
  const primary = pickPrimary(evidenceClean, { preferDataset:true, routePrimary:routing.primary || '' });
  const conflicts = detectConflicts(evidenceClean);
  const loopHints = buildLoopHints(memoryCtx, primary);
  const actionHints = buildActionHints(routing, memoryWindow, primary);

  return {
    ok:true,
    sessionId,
    traceId,
    routing,
    domainsConfig: DEFAULT_DOMAINS,
    routeConfidence,
    primary,
    evidence: evidenceClean.slice(0, 16),
    conflicts,
    loopHints,
    actionHints,
    packs:{ memory:memoryCtx || null, dataset:(ds && ds.ok) ? ds : null, domains:(dom && dom.ok) ? dom : null, marion:(mar && mar.ok) ? mar : null },
    meta:{
      ts: nowMs(),
      traceId,
      sources:{
        memory: !!memoryCtx,
        dataset: !!(ds && ds.ok && ds.best),
        domains: !!(dom && dom.ok && (dom.items||[]).length),
        marion: !!(mar && mar.ok && (mar.answer || (mar.items||[]).length))
      },
      memoryWindow:{
        recentIntents: memoryWindow.recentIntents.slice(-5),
        unresolvedAsks: memoryWindow.unresolvedAsks.slice(-3),
        lastResolvedIntent: memoryWindow.lastResolvedIntent,
        lastUserPreference: memoryWindow.lastUserPreference || null
      },
      gapRefinements:{ failOpen:true, conflictSurface:true, bridgeFuseAware:true, actionHints:true }
    }
  };
}

module.exports = { buildEvidencePack };
