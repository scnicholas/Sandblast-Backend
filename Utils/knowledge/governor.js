"use strict";

/**
 * Conversation Governor
 * ---------------------
 * Operational Intelligence upgrade.
 *
 * Covers the next 10 phases:
 * 1) memory-window aware loop control
 * 2) route-confidence aware pass/clarify/branch decisions
 * 3) minimal clarifier generation
 * 4) repeated-clarifier suppression
 * 5) semantic near-duplicate detection
 * 6) bridge fuse + recovery timing
 * 7) unresolved-ask / open-loop branching
 * 8) fail-open compatibility
 * 9) trace/telemetry-safe output
 * 10) action hint propagation for downstream planners
 */

function safeStr(x){ return x == null ? "" : String(x); }
function safeNum(x, d){ x = Number(x); return Number.isFinite(x) ? x : d; }
function nowMs(){ return Date.now(); }
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function normalize(text){
  return safeStr(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}
function tokenize(text){
  const n = normalize(text);
  return n ? n.split(" ").filter(Boolean) : [];
}
function hashLite(str){
  str = safeStr(str);
  let h = 2166136261;
  for(let i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16);
}
function uniq(arr){ return Array.from(new Set(Array.isArray(arr) ? arr : [])); }
function jaccard(a, b){
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const v of A) if (B.has(v)) hit += 1;
  const den = A.size + B.size - hit;
  return den > 0 ? hit / den : 0;
}
function ensureMemory(memoryCtx){
  if (!memoryCtx || typeof memoryCtx !== "object") memoryCtx = {};
  if (!memoryCtx.loop || typeof memoryCtx.loop !== "object") memoryCtx.loop = { n:0, severity:0, clarifyCount:0, lastClarifierSig:"" };
  if (!memoryCtx.bridge || typeof memoryCtx.bridge !== "object") memoryCtx.bridge = {};
  if (!memoryCtx.memoryWindows || typeof memoryCtx.memoryWindows !== "object") memoryCtx.memoryWindows = {};
  if (!Array.isArray(memoryCtx.memoryWindows.recentIntents)) memoryCtx.memoryWindows.recentIntents = [];
  if (!Array.isArray(memoryCtx.memoryWindows.unresolvedAsks)) memoryCtx.memoryWindows.unresolvedAsks = [];
  return memoryCtx;
}
function getWindow(memoryCtx){
  const m = ensureMemory(memoryCtx);
  const w = m.memoryWindows;
  return {
    recentIntents: Array.isArray(w.recentIntents) ? w.recentIntents : [],
    unresolvedAsks: Array.isArray(w.unresolvedAsks) ? w.unresolvedAsks : [],
    lastResolvedIntent: safeStr(w.lastResolvedIntent || ""),
    lastUserPreference: w.lastUserPreference || null
  };
}
function extractPrimaryText(evidence){
  if (!evidence || typeof evidence !== "object") return "";
  if (typeof evidence.text === "string") return evidence.text;
  if (evidence.primary && typeof evidence.primary.text === "string") return evidence.primary.text;
  return "";
}
function buildSig(text){ return hashLite(normalize(text)); }

function isRepeat(current, memoryCtx){
  const m = ensureMemory(memoryCtx);
  const loop = m.loop;
  const cur = normalize(current);
  const curSig = buildSig(cur);
  const lastSig = safeStr(loop.sig || "");
  const lastText = safeStr(loop.lastText || "");
  if (!cur) return false;
  if (lastSig && lastSig === curSig) return true;
  return jaccard(cur, lastText) >= 0.92;
}

function updateLoopState(text, memoryCtx){
  const m = ensureMemory(memoryCtx);
  const loop = m.loop;
  loop.sig = buildSig(text);
  loop.lastText = normalize(text);
  return loop;
}

function escalateLoop(memoryCtx, meta){
  const m = ensureMemory(memoryCtx);
  const loop = m.loop;
  const bump = safeNum(meta && meta.bump, 1);
  loop.n += bump;
  if (loop.n >= 2) loop.severity = clamp(safeNum(loop.severity, 0) + 1, 0, 4);
  return loop;
}

function canClarify(memoryCtx){
  const m = ensureMemory(memoryCtx);
  const loop = m.loop;
  return safeNum(loop.clarifyCount, 0) < 2;
}

function noteClarifier(memoryCtx, q){
  const m = ensureMemory(memoryCtx);
  const loop = m.loop;
  loop.clarifyCount = safeNum(loop.clarifyCount, 0) + 1;
  loop.lastClarifierSig = buildSig(q);
  return loop;
}

function fuseBridge(memoryCtx, reason, ms){
  const m = ensureMemory(memoryCtx);
  const fuseMs = Math.max(6000, safeNum(ms, 12000));
  m.bridge.fused = true;
  m.bridge.fuseReason = reason || "loop_guard";
  m.bridge.fusedUntil = nowMs() + fuseMs;
  return m.bridge;
}

function recoverBridge(memoryCtx){
  const m = ensureMemory(memoryCtx);
  const b = m.bridge;
  if (b.fused && safeNum(b.fusedUntil, 0) <= nowMs()) {
    b.fused = false;
    b.fuseReason = "";
    b.fusedUntil = 0;
  }
  return b;
}

function inferClarifier(input){
  const it = input && input.intent ? input.intent : {};
  const domain = safeStr(input && input.domain || it.domain || "general");
  const action = safeStr(input && input.musicAction || it.musicAction || "");
  const year = safeStr(input && input.musicYear || it.musicYear || "");
  const userText = safeStr(input && input.userText || "").slice(0, 140);

  if (domain === "music_history" && action && !year) {
    return 'Do you want a specific year for that chart request, or should I pick one for you?';
  }
  if (domain === "tech_support") {
    return 'Is this a technical fix you need right now, or are you trying to understand what is causing it?';
  }
  if (domain === "business_support") {
    return 'Do you want strategy, funding direction, or a concrete draft to work from?';
  }
  if (userText) {
    return 'Do you want the technical explanation, or the most practical next step for "' + userText + '"?';
  }
  return 'Should I answer this as a direct solution, or narrow it down with one focused option first?';
}

function buildBranchResponse(input, memoryCtx){
  const w = getWindow(memoryCtx);
  const unresolved = w.unresolvedAsks.slice(-1)[0];
  const hint = unresolved ? (' The open thread I still see is: "' + safeStr(unresolved).slice(0, 140) + '".') : '';
  return {
    text: 'I think we are circling the same point. Let me branch this cleanly.' + hint + ' Do you want to solve the immediate problem first, or map the system behind it?',
    nextAction: 'branch',
    options: ['Solve it now', 'Map the system']
  };
}

function decision(input, memoryCtx, text){
  const m = ensureMemory(memoryCtx);
  const repeat = isRepeat(text, m);
  const intent = input && input.intent && typeof input.intent === 'object' ? input.intent : {};
  const routeConfidence = clamp(safeNum(input && input.routeConfidence, safeNum(intent.routeConfidence, 0.5)), 0, 1);
  const intentConfidence = clamp(safeNum(input && input.intentConfidence, safeNum(intent.confidence, 0.5)), 0, 1);
  const ambiguity = clamp(safeNum(input && input.ambiguity, safeNum(intent.ambiguity, 0.2)), 0, 1);

  recoverBridge(m);

  if (!repeat) {
    updateLoopState(text, m);
    m.loop.n = 0;
    m.loop.clarifyCount = 0;
    return { action:'pass', text:text, memory:m, governor:{ repeat:false, routeConfidence, intentConfidence, ambiguity } };
  }

  const loop = escalateLoop(m, { bump:1 });

  if (canClarify(m) && (routeConfidence < 0.72 || ambiguity > 0.45 || loop.severity <= 1)) {
    const q = inferClarifier(input);
    noteClarifier(m, q);
    return {
      action:'clarify',
      response:{ type:'clarifier', text:q, minimize:true, nextAction:'clarify' },
      memory:m,
      governor:{ repeat:true, severity:loop.severity, routeConfidence, intentConfidence, ambiguity }
    };
  }

  fuseBridge(m, 'repeat_loop', 12000 + (loop.severity * 3000));
  return {
    action:'branch',
    response: buildBranchResponse(input, m),
    memory:m,
    governor:{ repeat:true, severity:loop.severity, fused:true, routeConfidence, intentConfidence, ambiguity }
  };
}

/**
 * Main Governor Entry
 * Backward compatible signature.
 */
function applyGovernor(input){
  const inp = input && typeof input === 'object' ? input : {};
  const evidencePack = inp.evidencePack || {};
  const memory = evidencePack.packs && evidencePack.packs.memory ? evidencePack.packs.memory : (inp.memoryCtx || {});
  const primary = evidencePack.primary || inp.primary || null;
  const text = extractPrimaryText(primary || {});

  if (!text) {
    return { action:'pass', text:'', memory:ensureMemory(memory), governor:{ repeat:false, empty:true } };
  }

  return decision(inp, memory, text);
}

module.exports = {
  applyGovernor,
  isRepeat,
  escalateLoop,
  fuseBridge,
  recoverBridge,
  buildClarifier: inferClarifier
};
